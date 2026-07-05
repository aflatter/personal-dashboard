import type { InboxAccount, SourceId } from "../contract.ts";
import type { Poll, Source } from "./port.ts";

// JMAP for Mail (RFC 8621) against Fastmail. The server maintains per-mailbox
// unread/total counts, so a single Mailbox/get gives both numbers — no message
// enumeration, no IMAP. Docs: https://www.fastmail.com/dev/
const SESSION_URL = "https://api.fastmail.com/jmap/session";
const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const CORE_CAPABILITY = "urn:ietf:params:jmap:core";

type TokenField = "fastmailTokenPersonal" | "fastmailTokenWork";

interface Session {
  apiUrl: string;
  accountId: string;
  email: string;
}

async function openSession(token: string): Promise<Session> {
  const res = await fetch(SESSION_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`JMAP session HTTP ${res.status}`);
  // VERIFY against a live session: `username` is the login email; the mail
  // account id is under primaryAccounts[mail capability].
  const body = (await res.json()) as {
    apiUrl: string;
    username: string;
    primaryAccounts: Record<string, string>;
  };
  const accountId = body.primaryAccounts[MAIL_CAPABILITY];
  if (!accountId) throw new Error("JMAP: no mail account");
  return { apiUrl: body.apiUrl, accountId, email: body.username };
}

async function inboxCounts(
  session: Session,
  token: string,
): Promise<{ unread: number; total: number }> {
  const res = await fetch(session.apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
      { list: Array<{ role: string | null; unreadEmails: number; totalEmails: number }> },
      string,
    ][];
  };
  const inbox = body.methodResponses[0]?.[1]?.list.find((m) => m.role === "inbox");
  if (!inbox) throw new Error("JMAP: no inbox mailbox");
  return { unread: inbox.unreadEmails, total: inbox.totalEmails };
}

/** One inbox source per Fastmail account (personal/work differ only by token). */
export function jmapInbox(id: SourceId, account: InboxAccount, tokenField: TokenField): Source {
  return {
    id,
    historyMetrics: ["unread", "total"],
    ready: (secrets) => Boolean(secrets[tokenField]),
    poll: async (secrets): Promise<Poll> => {
      const token = secrets[tokenField]!;
      const session = await openSession(token);
      const { unread, total } = await inboxCounts(session, token);
      return {
        metrics: { unread, total },
        snapshot: { account, email: session.email, protocol: "JMAP", unread, total },
      };
    },
  };
}
