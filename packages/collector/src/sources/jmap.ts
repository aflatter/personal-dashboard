import { Agent } from "undici";
import type { InboxAccount, SourceId } from "../contract.ts";
import type { Poll, Source } from "./port.ts";
import { SseParser } from "./sse.ts";

// JMAP for Mail (RFC 8621) against Fastmail. The server maintains per-mailbox
// unread/total counts, so a single Mailbox/get gives both numbers — no message
// enumeration, no IMAP. Freshness comes from server push (RFC 8620 §7.3): we
// hold an EventSource stream open and re-fetch counts on each StateChange, so
// the live number tracks the mailbox within seconds. Docs: https://www.fastmail.com/dev/
const SESSION_URL = "https://api.fastmail.com/jmap/session";
const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const REQUEST_TIMEOUT_MS = 15_000;

// Push tuning. We subscribe to the two types whose state reflects an inbox
// change — Mailbox (the unread/total counters we read) and Email (arrivals /
// flag flips). A burst of StateChanges (Mailbox + Email fire almost together for
// one email) is coalesced into a single re-fetch.
const PUSH_TYPES = ["Mailbox", "Email"] as const;
const PING_SECONDS = 30; // requested server keep-alive; Fastmail may ignore it
// Fastmail sends no reliable keep-alive, so silence ≠ death and we can't use a
// short idle watchdog. Instead we recycle the stream on a long interval: a
// healthy-but-quiet mailbox just reconnects (cheap, and resyncs on connect),
// while a truly dead half-open socket recovers within this bound. Any real event
// resets the timer, so active mailboxes rarely reach it.
const LIVENESS_TIMEOUT_MS = 10 * 60_000;
const COALESCE_MS = 250;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export interface JmapConfig {
  /** Fastmail API token for one account (personal and work differ only by token). */
  token: string;
}

interface Session {
  apiUrl: string;
  accountId: string;
  email: string;
  /** Push-stream endpoint. Fastmail returns a bare URL; RFC allows a URI-template. */
  eventSourceUrl: string;
}

async function openSession(token: string): Promise<Session> {
  const res = await fetch(SESSION_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`JMAP session HTTP ${res.status}`);
  // `username` is the login email; the mail account id is under
  // primaryAccounts[mail capability] (verified against a live Fastmail session).
  const body = (await res.json()) as {
    apiUrl: string;
    username: string;
    primaryAccounts: Record<string, string>;
    eventSourceUrl: string;
  };
  const accountId = body.primaryAccounts[MAIL_CAPABILITY];
  if (!accountId) throw new Error("JMAP: no mail account");
  return {
    apiUrl: body.apiUrl,
    accountId,
    email: body.username,
    eventSourceUrl: body.eventSourceUrl,
  };
}

interface InboxMailbox {
  id: string;
  unread: number;
  total: number;
}

/** The inbox mailbox's id (for the id query) and its live unread/total counts. */
async function inboxMailbox(session: Session, token: string): Promise<InboxMailbox> {
  const res = await fetch(session.apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [
        [
          "Mailbox/get",
          { accountId: session.accountId, properties: ["role", "unreadEmails", "totalEmails"] },
          "0",
        ],
      ],
    }),
  });
  if (!res.ok) throw new Error(`JMAP Mailbox/get HTTP ${res.status}`);
  const body = (await res.json()) as {
    methodResponses: [
      string,
      {
        list: Array<{ id: string; role: string | null; unreadEmails: number; totalEmails: number }>;
      },
      string,
    ][];
  };
  const inbox = body.methodResponses[0]?.[1]?.list.find((m) => m.role === "inbox");
  if (!inbox) throw new Error("JMAP: no inbox mailbox");
  return { id: inbox.id, unread: inbox.unreadEmails, total: inbox.totalEmails };
}

const PAGE = 256;
// Position-based paging is only well-defined over a stable order, so ask for one
// explicitly rather than relying on the server's default.
const ID_SORT = [{ property: "receivedAt", isAscending: false }];
// A partial id set is indistinguishable from mail having left, so a torn read
// would post phantom departures. Restart instead — but bound it.
const PAGE_ATTEMPTS = 3;

/** One page of inbox ids, plus the query state it was read at. */
async function inboxIdPage(
  session: Session,
  token: string,
  inboxId: string,
  position: number,
): Promise<{ ids: string[]; queryState?: string }> {
  const res = await fetch(session.apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [
        [
          "Email/query",
          {
            accountId: session.accountId,
            filter: { inMailbox: inboxId },
            sort: ID_SORT,
            position,
            limit: PAGE,
          },
          "0",
        ],
      ],
    }),
  });
  if (!res.ok) throw new Error(`JMAP Email/query HTTP ${res.status}`);
  const [name, args] = (
    (await res.json()) as {
      methodResponses: [string, { ids?: string[]; queryState?: string }, string][];
    }
  ).methodResponses[0];
  if (name !== "Email/query") throw new Error(`JMAP Email/query failed: ${JSON.stringify(args)}`);
  return { ids: args.ids ?? [], queryState: args.queryState };
}

/**
 * Every message id currently in the inbox, paged out of Email/query. The engine
 * diffs this set against the stored one to record each message's arrival and
 * departure (the per-day flow) — a count wouldn't do, we need identities.
 *
 * Correctness here matters more than it looks: a set that is short by one id is
 * read downstream as "that message left the inbox". So we page until a short
 * page (never inferring the end from a `total` the server may omit), and we
 * abandon the read if `queryState` moves under us — mail arriving or leaving
 * mid-page shifts every later position, which would otherwise skip an id.
 */
async function inboxIds(session: Session, token: string, inboxId: string): Promise<string[]> {
  for (let attempt = 1; ; attempt++) {
    const ids: string[] = [];
    let seenState: string | undefined;
    let torn = false;

    for (let position = 0; ; position += PAGE) {
      const { ids: page, queryState } = await inboxIdPage(session, token, inboxId, position);
      // The collection changed between pages — positions no longer line up.
      if (seenState !== undefined && queryState !== seenState) {
        torn = true;
        break;
      }
      seenState = queryState;
      ids.push(...page);
      if (page.length < PAGE) break; // a short page is the last one
    }

    if (!torn) return ids;
    if (attempt >= PAGE_ATTEMPTS) {
      throw new Error("JMAP Email/query: inbox kept changing while paging its ids");
    }
  }
}

/**
 * Build the push URL from the session's eventSourceUrl. Fastmail returns a bare
 * endpoint, so we append the subscription as query params; a spec URI-template
 * (other JMAP servers) is filled by substitution instead (RFC 8620 §7.3).
 */
function pushUrl(eventSourceUrl: string): string {
  if (eventSourceUrl.includes("{")) {
    return eventSourceUrl
      .replace("{types}", encodeURIComponent(PUSH_TYPES.join(",")))
      .replace("{closeafter}", "no")
      .replace("{ping}", String(PING_SECONDS));
  }
  const url = new URL(eventSourceUrl);
  url.searchParams.set("types", PUSH_TYPES.join(","));
  url.searchParams.set("closeafter", "no");
  url.searchParams.set("ping", String(PING_SECONDS));
  return url.toString();
}

/** True if a StateChange payload reports a change to one of our types on our account. */
function affectsInbox(data: string, accountId: string): boolean {
  try {
    const msg = JSON.parse(data) as { changed?: Record<string, Record<string, string>> };
    const changed = msg.changed?.[accountId];
    return changed != null && PUSH_TYPES.some((t) => t in changed);
  } catch {
    return false; // pings and other non-JSON / non-StateChange frames
  }
}

/** Read the SSE stream to completion, firing `onChange` on each relevant StateChange. */
async function consume(
  body: ReadableStream<Uint8Array>,
  accountId: string,
  onChange: () => void,
  controller: AbortController,
  onHealthy: () => void,
  onStale: () => void,
): Promise<void> {
  const parser = new SseParser();
  const decoder = new TextDecoder();
  // Liveness backstop: if no bytes arrive for LIVENESS_TIMEOUT_MS, assume the
  // socket is dead (or just stale) and abort to force a reconnect+resync from the
  // outer loop. Any received byte re-arms it. `onStale` marks this as an expected
  // recycle so the outer loop doesn't log it as an error.
  let idle: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      onStale();
      controller.abort();
    }, LIVENESS_TIMEOUT_MS);
  };
  arm();
  try {
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      arm();
      onHealthy();
      for (const ev of parser.push(decoder.decode(chunk, { stream: true }))) {
        if (affectsInbox(ev.data, accountId)) onChange();
      }
    }
  } finally {
    clearTimeout(idle);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Hold a JMAP push stream open for one account, reconnecting with exponential
 * backoff on any drop. Self-contained and fault-isolated: it swallows its own
 * errors (logging, then retrying) so a dead stream never escapes to the caller.
 * Returns a stop function that tears the loop down.
 */
function startPush(token: string, id: SourceId, onChange: () => void): () => void {
  let stopped = false;
  let controller = new AbortController();
  let coalesce: ReturnType<typeof setTimeout> | undefined;

  // Collapse a burst of StateChanges into one re-fetch of the counts.
  const trigger = () => {
    clearTimeout(coalesce);
    coalesce = setTimeout(onChange, COALESCE_MS);
  };

  const run = async () => {
    let backoff = BASE_BACKOFF_MS;
    while (!stopped) {
      let stale = false;
      // A connection pool dedicated to this stream and thrown away on every
      // reconnect, so the stream's socket never enters the pool the polls share.
      // A push stream can die silently — no FIN arrives, because Fastmail sends
      // no reliable keep-alive (see LIVENESS_TIMEOUT_MS) and an idle flow gets
      // dropped in transit. Left in a shared keep-alive pool that corpse is
      // handed to the next request, which then writes into a dead socket and
      // hangs until its timeout — permanently, since nothing evicts it. Scoping
      // it here means the socket dies with the Agent instead.
      //
      // bodyTimeout: 0 because SSE is legitimately idle for long stretches;
      // undici's 5-minute default would kill a healthy-but-quiet stream, and
      // staleness is already handled by the liveness backstop in `consume`.
      const dispatcher = new Agent({
        connections: 1,
        headersTimeout: REQUEST_TIMEOUT_MS,
        bodyTimeout: 0,
      });
      try {
        const session = await openSession(token);
        controller = new AbortController();
        const res = await fetch(pushUrl(session.eventSourceUrl), {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
          // @types/node ships its own copy of undici's types, so the Agent we
          // construct is nominally a different Dispatcher than global fetch's
          // RequestInit declares — identical at runtime, two type identities.
          dispatcher: dispatcher as unknown as RequestInit["dispatcher"],
        });
        if (!res.ok || !res.body) throw new Error(`JMAP eventsource HTTP ${res.status}`);
        // Connected: resync once (a change may have landed while we were down),
        // and reset backoff only once the stream proves live (first byte).
        trigger();
        await consume(
          res.body,
          session.accountId,
          trigger,
          controller,
          () => {
            backoff = BASE_BACKOFF_MS;
          },
          () => {
            stale = true;
          },
        );
      } catch (err) {
        // A stale-recycle abort throws too, but it's expected — don't cry wolf.
        if (stopped) break;
        if (!stale) console.warn(`source ${id}: push stream error (${errMsg(err)}); reconnecting`);
      } finally {
        // Runs on every exit path (including the `break`s): closes this stream's
        // socket outright, so nothing survives to be reused by a later request.
        await dispatcher.destroy();
      }
      if (stopped) break;
      await sleep(backoff, controller.signal);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  };
  void run();

  return () => {
    stopped = true;
    clearTimeout(coalesce);
    controller.abort();
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One inbox source per Fastmail account, closed over its own token. */
export function jmapInbox(id: SourceId, account: InboxAccount, cfg: JmapConfig): Source {
  return {
    id,
    historyMetrics: ["unread", "total"],
    poll: async (): Promise<Poll> => {
      const session = await openSession(cfg.token);
      const { id, unread, total } = await inboxMailbox(session, cfg.token);
      const inboxMembers = await inboxIds(session, cfg.token, id);
      return {
        metrics: { unread, total },
        snapshot: { account, email: session.email, protocol: "JMAP", unread, total },
        inboxMembers,
      };
    },
    watch: (onChange) => startPush(cfg.token, id, onChange),
  };
}
