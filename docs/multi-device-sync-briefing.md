# Multi-device sync architecture — briefing & evaluation

**Status:** **shipped — the design of record.** Merged to `main`; §7 (deployment)
and §8 (module structure) describe what the repo actually does, not a proposal.
**Evaluated:** 2026-07-21 (originally on `claude/multi-device-sync-arch-armp11`,
since merged).

§§1–6 are kept as-is: they are the evaluation that produced the decision, not a
description of the system. §7 and §8 carry a **Shipped** note recording where the
implementation differs from what was written here.

This document frames the problem of getting dashboard data onto multiple devices
(k8s, MacBook, iPhone), explains how the candidate foundations work, and rates
them against _our_ requirements. It exists to answer one question honestly:
**is it worth adopting a sync stack (Electric, Turso, …) instead of the
traditional backend-plus-API we already know how to build?**

---

## 1. The use case

We want the personal dashboard to be available on three surfaces with three
different collection needs:

| Surface         | Role                     | Constraint                                                                                                                   |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **k8s (cloud)** | Always-on collector      | Best home for JMAP (holds a push stream open 24/7) and Toggl (plain HTTP). Reachable from anywhere.                          |
| **MacBook**     | Local collector + client | **MoneyMoney can only run here** — it drives the MoneyMoney app over `osascript`/JXA under macOS TCC. Intermittently online. |
| **iPhone**      | Client only              | Must show a _complete_ dashboard **even when the MacBook is offline.**                                                       |

Everything else about the app stays as it is today (see `AGENTS.md`): a calm,
single-screen, single-user dashboard. React 19 SPA, a Node "collector" exposing
a tiny tRPC API, `node:sqlite` durable store, source adapters for JMAP /
MoneyMoney / Toggl, and an Electron shell spike.

### Data that moves

- **Collected metrics** (machine-generated): inbox unread/total per account,
  bank review backlog (a single integer, by design), Toggl hours, plus
  day-bucketed history `samples`.
- **User assertions** (human-generated): `rent_done` / `tax_done` events,
  `settings` patches.

### The write-conflict surface is almost empty

This is the single most important fact for the evaluation, and it is easy to
miss:

- **Every collected metric has exactly one producer.** JMAP and Toggl are
  produced only by the cloud collector; MoneyMoney only by the Mac. No two
  devices ever write the same metric.
- **User assertions are append-only events**, tapped from whichever device the
  human is holding. There is one human. Two devices are essentially never
  writing the same row at the same instant.

So the concurrent-multi-writer conflict problem — the thing most sync engines
are built to solve, and the thing they market hardest — **is a problem we do not
have.** Any evaluation that scores tools on conflict handling is scoring them on
a dimension that is nearly irrelevant to us.

---

## 2. Requirements

**Functional**

- F1. Phone shows a complete, current dashboard while the MacBook is offline.
- F2. MoneyMoney backlog collected on the Mac reaches the phone.
- F3. Live-ish updates (JMAP push should feel near-instant on all surfaces).
- F4. User assertions (`rent_done`/`tax_done`/`settings`) from any device take
  effect everywhere.
- F5. Day-bucketed history survives and is shared across devices.

**Non-functional / constraints**

- N1. **Single user.** No multi-tenant auth, no fan-out to millions. Fan-out
  scaling is a non-goal.
- N2. **Privacy by reduction.** The codebase deliberately minimizes what leaves
  a machine (MoneyMoney returns _one integer_, not transactions). A foundation
  that wants our rows in a **third-party-hosted** database is in tension with
  this principle; a foundation we self-host in our own k8s is not.
- N3. **Small surface, low write rate.** A handful of metrics, a few taps a
  week. Throughput and write latency are irrelevant.
- N4. **We already own ~80% of the traditional pieces:** tRPC contract, an SSE
  transport in the collector, a SQLite store, source adapters, a pure
  `domain/` derivation layer, and an Electron shell. Adoption cost must be
  judged against how much of that we would keep vs. throw away.
- N5. **New cost regardless of choice:** today the collector listens on loopback
  with no auth. The moment it serves a phone over the internet we inherit
  **auth + transport security + a public ingress** — this is true for _every_
  option below and should not be charged to any one of them.

**The crux, stated plainly**

Our topology is **hub-and-spoke data collection**, not collaboration. There
_must_ be a durable store in the cloud that holds the last-known value of every
metric — including the MoneyMoney integer pushed up from the Mac — so the phone
can read it when the Mac is gone. Given that, every architecture reduces to the
same shape:

```
  [Mac collector] --push--> [durable cloud hub] <--read/subscribe-- [iPhone]
       (MoneyMoney)              (k8s)                                 |
  [Cloud collector] --write-->     ^                                   |
       (JMAP, Toggl)               +---------- read/subscribe ---------+
                                              [Mac client / Electron]
```

The only question is **what technology plays the role of "hub + the two arrows,"**
and whether a sync engine buys us enough on those arrows to justify its cost.

---

## 3. How the candidates work

### 3.0 Traditional stack (our default, the baseline)

- **Cloud (k8s):** the collector we already have, plus a durable store
  (keep `node:sqlite`, or move to Postgres if we want). It runs JMAP + Toggl,
  serves the SPA, and exposes the tRPC API. Add one mutation, e.g.
  `pushBankBacklog`, for the Mac to call.
- **Mac (Electron):** runs the MoneyMoney source only; on each collection it
  calls the cloud mutation to push the integer up. It also _subscribes_ (SSE) so
  settings changed on the phone reach its thresholds.
- **Phone:** loads the SPA from the cloud, reads via tRPC `state`, gets live
  updates via the SSE transport we already have.
- **Offline Mac:** the hub still holds the last MoneyMoney value; the phone is
  unaffected. ✅ F1.
- **Schema evolution:** we own both ends of a typed contract (tRPC + zod). The
  SPA is served by the backend, so backend+web deploy together — near-zero
  version skew. The Electron app and a cached phone tab can lag; that is the
  only skew to manage, and it is the _same_ skew every option has.
- **Rollout:** ordinary k8s rolling deploy; SPA ships with the backend; Electron
  auto-update is out-of-band (we need an updater regardless).

What we keep maintaining: the read/serve API and the live-update transport.
What we already handle and would keep: source adapters, derivations, store.

### 3.1 Electric (`electric.ax`) — read-path sync for Postgres

- **Source of truth:** your **Postgres**. Electric is a service that tails
  Postgres's logical replication stream.
- **Shapes:** the core primitive — a partial replica of a table defined by a
  `WHERE` clause. Clients subscribe to Shapes and receive rows over an **HTTP**
  API that is CDN-friendly (built for massive read fan-out).
- **Read path only.** Electric syncs data _out_ of Postgres to clients. It does
  **not** handle writes. _"Writes go through your existing API — REST, GraphQL,
  RPC, whatever you already have."_
- **Client storage:** a shape log the client materializes (optionally into
  PGlite, or just into app state).
- **Schema:** you own Postgres migrations; additive columns flow through Shapes;
  clients tolerate additive change well.
- **Infra to run:** Postgres **+** the Electric service, both in k8s.

What it buys _us_: it replaces our hand-rolled SSE + polling + cache with a
robust, offline-capable, reactive **read** path. That is exactly one of our two
arrows. It does **not** remove the write API (the Mac push and the user
assertions still go through our own endpoints), and it forces a move to
Postgres.

### 3.2 Turso — SQLite everywhere, embedded replicas + offline sync

- **Model:** SQLite (libSQL / the Rust "Turso" rewrite) on **every** node. A
  cloud database is the hub; each device holds an **embedded replica** kept in
  sync by calling `.sync()` (manually or periodically).
- **Offline writes (public beta):** a replica accepts writes offline and syncs
  them up later. Default conflict strategy is **Last-Push-Wins** at row level
  ("the version pushed last wins, regardless of local commit time"), with an
  API for discard / rebase / custom resolution.
- **Read-your-writes:** the writer sees its own write immediately; others see it
  after their next `.sync()`.
- **Schema:** SQLite schema applied to the cloud, pulled by replicas.
- **Maturity caveats (stated by Turso):** offline sync is **beta, "not yet
  recommended for production."** Row versioning "stores complete copies of
  entire rows," causing memory overhead in write-heavy cases; the conflict API
  is "subject to change."

Fit notes for us: this maps beautifully onto our existing `node:sqlite` store
and our near-empty conflict surface — Last-Push-Wins is _fine_ when producers
are partitioned and events are append-only, so Turso's weakest area is a
non-issue for us. **The catch is the iPhone.** Embedded replicas are a native /
server-side feature; there is no clean way to run a syncing libSQL replica
inside **mobile Safari**. Turso's model wants a native app or a device-side
process. If the phone is a _web_ client, Turso's headline mechanism doesn't
reach it without a server in front — which defeats the point.

### 3.3 Zero (Rocicorp) — full-stack reactive sync for the web

- **Model:** Postgres-backed. `zero-cache` runs in the cloud, keeps a SQLite
  replica of (the syncable subset of) Postgres via WAL, and pushes updates to
  clients. `zero-client` links into the app, holds recently-used rows, and
  answers queries with **ZQL**.
- **Writes ARE handled** (unlike Electric) via **custom mutators** routed
  through `zero-cache` to Postgres — so, done fully, **no hand-written data
  endpoints.**
- **Schema:** expand / migrate / contract. On connect the client sends its
  schema; `zero-cache` **rejects incompatible clients** with a version handshake
  — clean skew handling.
- **Maturity:** reached 1.0 in mid-2026 — young but stable-tracked.
- **Infra:** Postgres **+** `zero-cache`.

Fit notes: Zero is **web-first**, so the **iPhone-as-mobile-web story is good**
(better than Turso). It genuinely removes endpoints. But it is a general-purpose,
interactive read/write engine aimed at apps with lots of both — heavier than a
single-user, low-write dashboard warrants, and it means adopting ZQL + its schema
system wholesale.

### 3.4 PowerSync — Postgres/Mongo ⟷ SQLite, bidirectional

- **Model:** source DB (Postgres/Mongo) in the cloud; **client-side SQLite**;
  the PowerSync Service replicates server→client via CDC.
- **Writes:** the client writes local SQLite; mutations land in an **upload
  queue** and are sent through **your own backend** via a `uploadData()`
  function — so you keep a write backend, but conflict/queueing is managed.
  Server-reconciliation, **Last-Write-Wins by default**, customizable.
- **Offline-first** is the core competency; strong native SDKs (Swift / Kotlin /
  RN / Flutter), web via wasm SQLite.
- **Infra:** Postgres **+** PowerSync Service **+** your write backend.

Fit notes: capable and robust offline-first, good native-iPhone story. But it is
the **most infrastructure** of any option for a single-user app, and — like
Electric — you still run a write backend.

### 3.5 The rest of the landscape (Electric's own alternatives list)

Electric's [alternatives page](https://electric.ax/docs/sync/reference/alternatives)
is not an editorial comparison — it is a **categorized link directory** of ~90
projects with no per-tool commentary. What's useful is the _taxonomy_ it sorts
them into, because it maps cleanly onto our decision:

| Electric's category    | Examples it lists                                                                                                                                                           | Relevance to us                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Real-time and sync** | Ably, Convex, Debezium, Firebase, Litestream, Liveblocks, PartyKit, PowerSync, Sequin, SQLedge, SQLSync, Supabase Realtime, **Turso**, Y-Sweet                              | The sync-engine option — Electric's own camp.                                                  |
| **Embedded databases** | **PGlite**, CozoDB, DuckDB, **libSQL**, **SQLite**, Tonbo                                                                                                                   | The client-side store. We already use SQLite; PGlite is Electric's wasm-Postgres client store. |
| **Local-first**        | Automerge, Ditto, DXOS, Evolu, Fireproof, InstantDB, Jazz, LiveStore, Pocketbase, Pouch, Replicache, RxDB, Triplit, TinyBase, Verdant, cr-sqlite, Watermelon, Yjs, **Zero** | Full frameworks; mostly CRDT/collab-shaped.                                                    |
| **State transfer**     | Apollo (GraphQL), Relay (GraphQL), **tRPC**                                                                                                                                 | **This is our current stack.**                                                                 |
| **Postgres APIs**      | Hasura, PostGraphile, PostgREST                                                                                                                                             | Auto-generated read/write APIs over Postgres.                                                  |

**The single most useful thing on that page:** Electric lists **tRPC** — the exact
thing our collector already uses — under _"State transfer,"_ a sibling category to
its own _"Real-time and sync."_ So the page frames the decision precisely the way
this briefing does: **do we stay in "state transfer" (request/response over a
typed contract — what we have) or move to "real-time and sync"?** Electric isn't
claiming tRPC is wrong; it's naming it as the adjacent category you'd be leaving.

Reading the ~90 projects by whether they fit _us_:

- **CRDT / collaboration frameworks — Yjs, Automerge, Liveblocks, Y-Sweet,
  Jazz, DXOS, Ditto, Evolu, Verdant, Fireproof:** built for concurrent
  multi-writer editing (shared docs, cursors, merges). They solve the conflict
  problem we don't have. **Mismatch.**
- **Local-first DBs / sync frameworks — Replicache, RxDB, WatermelonDB,
  LiveStore, Triplit, TinyBase, SQLSync, cr-sqlite:** varying takes on client DB
  - sync. Replicache/Zero share lineage; RxDB/WatermelonDB are client-DB +
    pluggable sync; Triplit is a full sync-DB. All viable in principle but either
    general-purpose overkill or require rebuilding on their data model. **Possible
    but not compelling** given N3/N4.
- **Hosted sync backends — Convex, InstantDB, Firebase/Firestore, Supabase
  Realtime:** turnkey, but your data lives in **their** cloud. Direct tension
  with **N2 (privacy by reduction)**. **Avoid** unless self-hostable in our k8s.
- **SQLite streaming — Litestream, SQLedge, rqlite, Dqlite:** a genuinely
  lighter middle-ground worth knowing about. Litestream streams a SQLite file
  to object storage for replication/DR; it fits our `node:sqlite` store. But it
  is **one-way** (primary → replica), so it does _not_ solve the Mac→cloud
  **upload** arrow on its own — it can't be the hub for MoneyMoney data. Useful
  for backup/read-replicas, not as the sync backbone.
- **Postgres read/write APIs — Hasura, PostGraphile, PostgREST:** if we ever
  move to Postgres, these auto-generate the CRUD API — an alternative to
  hand-writing tRPC procedures, orthogonal to the sync question.

---

## 4. Answering the specific questions

**"With sync solutions I don't need to maintain API endpoints."**
Partly true, and the split matters:

- **Electric** and **PowerSync** still require you to maintain the **write API**.
  They remove the _read/serve_ API and live transport, not the write path.
- **Zero** (mutators) and **Turso** (direct DB writes) genuinely remove data
  endpoints.
- **But no sync engine removes the collectors.** Something still has to talk
  JMAP, drive MoneyMoney over JXA, and call Toggl. Our "source adapters" — the
  real integration code — stay exactly as they are under every option. What a
  sync engine can retire is the _serving_ layer, which for us is small and
  already written.

**"What problems does it introduce?"**

1. **More infra in k8s.** Electric / Zero / PowerSync each need **Postgres +
   their own service**, versus one Node process today. Turso needs the least
   (a libSQL hub) but its offline path is beta.
2. **Your DB schema becomes your wire contract.** Today we can reshape server
   internals freely because the tRPC contract is a deliberate seam. With sync,
   rows sync to clients directly; internal schema changes now have client-compat
   consequences.
3. **The assembled `StateResponse` fights the model.** We compute a derived view
   server-side. Sync engines prefer to ship _raw rows_ and derive on the client.
   Good news: we already have a pure `domain/` derivation layer, so moving
   derivations client-side is feasible — but it is real work.
4. **Maturity / lock-in / egress:** Turso offline (beta), Zero (1.0, young),
   Electric (write-path is DIY), hosted options (data leaves our infra).

**"How does schema evolution work?"**
Everyone converges on **expand → migrate → contract** (add backwards-compatible
columns/tables, ship clients, later drop the old). The difference sync
introduces is that **the client is decoupled in time from the server**, so
backwards-compatible/additive migrations become _mandatory_, and you must handle
version skew explicitly:

- **Zero:** schema-version handshake, rejects incompatible clients (cleanest).
- **Electric:** additive columns flow through Shapes; you own Postgres
  migrations.
- **Turso:** schema applied to cloud, pulled by replicas — sharp edges during
  beta.
- **Traditional:** we own a typed contract; backend+SPA deploy together so web
  skew is near-zero; only the Electron app / a stale phone tab can lag — the
  same residual skew every option has.

**"How does a rollout work?"**

- **Traditional:** k8s rolling deploy; SPA ships with the backend (atomic-ish);
  Electron auto-update out-of-band.
- **Sync:** deploy the **expand** migration → deploy the sync service → deploy
  clients → **contract** later. More choreography, and because sync is
  always-on you can't do a hard cutover — you need backwards-compat windows.
  Not harder in steady state, but more moving parts per release.

---

## 5. Ratings

Scored **1 (poor) – 5 (excellent)** _for our specific use case_. Weights reflect
what actually matters to us (single user, privacy, offline phone, existing
assets), **not** general tool quality. A great tool can score low here purely
because it targets problems we don't have.

| Criterion (weight)                                                | Traditional | Electric | Turso  |  Zero  | PowerSync |
| ----------------------------------------------------------------- | :---------: | :------: | :----: | :----: | :-------: |
| **Fits topology** — always-on hub + offline-phone reads (F1) (×3) |      5      |    5     |   4    |   5    |     5     |
| **iPhone as _web_ client** (×3)                                   |      5      |    5     | **2**  |   4    |     3     |
| **Reactive read UX** (F3) (×2)                                    |      3      |    5     |   4    |   5    |     4     |
| **Low infra / ops in k8s** (N1, N3) (×2)                          |      5      |    3     |   4    |   3    |   **2**   |
| **Reuses what we have** (N4) (×3)                                 |      5      |    3     |   4    |   2    |     2     |
| **Privacy / self-hosted, no egress** (N2) (×3)                    |      5      |    5     |   4    |   5    |     5     |
| **Maturity / production-ready** (×2)                              |      5      |    4     | **2**  |   3    |     4     |
| **Removes serving/API burden** (×1)                               |      2      |    3     |   5    |   5    |     3     |
| **Schema evolution ergonomics** (×1)                              |      4      |    4     |   3    |   5    |     4     |
| **Weighted total / 100**                                          |   **89**    |  **80**  | **62** | **72** |  **68**   |

> Conflict resolution is deliberately **omitted** as a criterion: our producers
> are partitioned and our user events are append-only, so it is nearly
> irrelevant. Including it would flatter every sync engine on a dimension we
> never exercise.

### Reading the scores

- **Traditional (89):** highest not because sync is bad, but because we already
  own the pieces, it's the least infra, it keeps data in our k8s, and it treats
  the iPhone as an ordinary web client. Its one weak column — reactive read UX —
  is one we've already partly solved with SSE + the `dashboard-cache-v2` cache.
- **Electric (80):** the most _complementary_ sync engine. It slots into the one
  arrow where the traditional stack is weakest (reactive, offline-capable
  reads) without asking us to rewrite writes. Cost: Postgres + a service, and
  moving derivations client-side. **The natural "later, if we want it" upgrade.**
- **Zero (72):** genuinely removes endpoints and has a good mobile-web story, but
  it's a general-purpose interactive engine — more machine than a single-user,
  low-write dashboard needs, and adopting it is a bigger rewrite (ZQL + schema
  system).
- **PowerSync (68):** robust offline-first with strong native SDKs, but the most
  infra of any option and still needs a write backend — its strengths (heavy
  offline mobile, native apps) aren't our bottleneck.
- **Turso (62):** the most philosophically aligned (SQLite-native, minimal
  infra, matches our store, and our empty conflict surface neutralizes its
  weakest area) — held back by two concrete facts: **offline sync is beta**, and
  **embedded replicas don't reach mobile Safari**. If we ever ship a _native_
  iOS app and Turso's offline path graduates, re-score it upward.

---

## 6. Recommendation

**Build the traditional stack now; keep Electric on the shelf as a targeted,
reversible upgrade for the read path.**

Rationale:

1. Our problem is **hub-and-spoke collection**, not collaboration. The sync
   engines' headline benefits — multi-writer conflict resolution and CDN-scale
   read fan-out — solve problems we don't have (N1, empty conflict surface).
2. The instinct in the prompt — _"Electron pushes updates to backend"_ — is
   **exactly right** for the Mac→hub arrow, and **no sync engine removes that
   push**; they just wrap it. The thing worth adding to that instinct is the
   **reverse arrow**: the Mac should also _subscribe_ to the hub (SSE), so a
   settings change on the phone reaches the Mac collector's thresholds. Once you
   draw both arrows, the design is complete and boring — which is the goal for a
   calm single-user dashboard.
3. We already have tRPC, SSE, a SQLite store, the source adapters, a pure
   derivation layer, and an Electron shell. The traditional stack is ~80% built;
   the sync options each ask us to trade some of that for infra we'd then run
   forever.
4. The genuinely new cost — **auth + public ingress** for phone access (N5) —
   is owed no matter what we pick, so it doesn't tip the decision.

**When to revisit:** adopt **Electric** for the read path _only if_ the live,
offline-capable reactive read UX on the phone becomes a felt need that SSE + the
local cache can't satisfy — it's additive and doesn't force us to rewrite
writes. Reconsider **Turso** only if we ship a **native** iOS app _and_ its
offline sync leaves beta. Treat hosted sync backends (Convex/Instant/Firebase)
as out of bounds while "privacy by reduction" is a design principle.

### Concrete next steps for the traditional path

1. Promote the collector to a k8s deployment running JMAP + Toggl, backed by the
   existing `node:sqlite` store on a persistent volume.
2. Put it behind **Tailscale** instead of a public ingress (see §7) — the tailnet
   is the auth, so the N5 cost is paid with zero app-side credentials.
3. Add a `pushBankBacklog` mutation; have the Mac Electron agent run the
   MoneyMoney source (triggered locally) and push on each collection.
4. Point the iPhone at the hub's SPA (installable PWA over `ts.net` HTTPS); it
   reads `state` and subscribes for live updates; the `dashboard-cache-v2` cache
   covers the cold-load/offline gap.

The full deployment design is in **§7**.

---

## 7. Deployment architecture

This section records the deployment design we settled on for the **traditional
stack** (the §6 recommendation). It is private-by-construction: no public
ingress, no app-side auth code, no CI runner, no standalone registry.

> **Shipped.** This is live. The manifests are in `deploy/k8s/` (namespace →
> PVC → Deployment → Service → Ingress), the image build is the repo-root
> `Dockerfile`, and the workflow is the `justfile` (`build`/`push`/`deploy`/
> `secrets`/`smoke`); see `deploy/README.md`. The URL is
> `https://personal-dashboard.braid-stargazer.ts.net` — read the diagrams'
> `collector.<tailnet>` as that host. `just smoke` (`/health` → 204 over HTTPS,
> valid cert, tailnet-only) passes.
>
> Where the implementation differs from the sketch above:
>
> - **No Pulumi in the app repo.** §7.5/§7.6 assumed Pulumi stack references and
>   `pulumi up`. In practice the app side is plain YAML plus `kubectl`, and the
>   five platform constants are frozen literals (see `deploy/README.md`); Pulumi
>   stayed on the platform side only.
> - **Secrets are 1Password → `secretspec` → k8s `Secret`**, not 1Password →
>   Pulumi: `just secrets` runs `deploy/apply-secrets.sh` under `secretspec run`,
>   passing values to `kubectl` on stdin only. In the pod the backend reads them
>   from **environment variables** (`secretsFromEnv`), so no secretspec and no
>   1Password provider ship inside the container.
> - **The `tailscale.com/expose` annotation became an `Ingress`** with
>   `ingressClassName: tailscale` (+ `tailscale.com/hostname` and
>   `tailscale.com/tags`) — same delegation, still zero Tailscale credentials in
>   this repo.
> - **Not yet shipped:** the PWA manifest + service worker listed in §7.5. The
>   SPA is served same-origin over tailnet HTTPS and is reachable from the phone,
>   but there is no web app manifest in the repo.

### 7.1 Target topology — everything on the tailnet

```
                    ┌─── tailnet (WireGuard mesh, MagicDNS) ───┐
                    │                                          │
  [iPhone]──────────┤   https://collector.<tailnet>.ts.net    ├──────[MacBook]
  Tailscale iOS     │              ▲         ▲                 │   Tailscale macOS
  installable PWA   │              │ state   │ state           │   Electron app:
  reads + subscribes│      ┌───────┴─────────┴───────┐         │   - main: MoneyMoney
  (works when Mac   │      │  k3s: collector (pod)    │  push   │     agent (osascript),
   is offline)      │      │  JMAP + Toggl + SQLite   │◄────────┼──   pushes backlog up
                    │      │  + serves built SPA      │  (up)   │   - renderer: loads
                    │      │  Tailscale operator      │         │     the PWA from backend
                    │      │  exposes Service→tailnet │         │
                    │      └──────────────────────────┘         │
                    └──────────────────────────────────────────┘
  No public ingress. Tailscale ACLs = auth. ts.net cert = valid HTTPS for the PWA.
  Data flow is uniform: the Mac pushes up; every client reads down. No reverse channel.
```

### 7.2 The refresh rule (why there is no reverse channel)

Collection triggers split by _where the data can physically be collected_:

- **Cloud-collectable sources — JMAP, Toggl:** run always-on in k3s. The cloud
  has the access, so these are **refreshable on demand from any device** through
  the backend (e.g. the phone can still refresh the inbox).
- **Mac-only source — MoneyMoney:** requires `osascript`/JXA under macOS TCC, so
  it is collected by the Electron agent and **triggered at the Mac** (a local
  button, and/or on launch/focus while MoneyMoney is unlocked). Other devices see
  the **last-known** value, read-only.

Because the only Mac-bound action is triggered locally, the agent is
**push-only/outbound** — it never subscribes for commands. This deletes the
bidirectional control path entirely. A local refresh still propagates everywhere:
agent collects → `pushBankBacklog` → cloud updates snapshot/samples → cloud
pushes new state to all subscribers (phone included). Only the _trigger_ is
Mac-local; the _value_ still lands on the phone seconds later. When the Mac is
offline, the phone simply shows the last-known backlog until the Mac returns.

### 7.3 The Mac has two roles, one app

The Electron app hosts both, cleanly separated:

- **Main process = the agent.** Runs the MoneyMoney source with system access;
  POSTs results to the collector over the tailnet. Push-only.
- **Renderer = a thin PWA loader.** Loads the _same_ SPA from the backend as the
  phone (so the Mac UI auto-updates with every deploy) and subscribes to state
  like any client. The only device-specific branch in the SPA: a preload bridge
  (`window.dashboardAgent`) is present in Electron → the "refresh bank" control
  is enabled and wired via IPC to the main process; absent on the phone → the
  control is hidden. Everything else is identical across devices.

The UI is optional (you could drop Electron and view the PWA in a browser); the
**native agent is not** — MoneyMoney can only be collected by a native Mac
process.

### 7.4 Tailscale: the platform / app boundary

Tailscale has two very different surfaces, split across the two repos:

- **The ACL policy file is platform-level and cannot be sliced per-app.** It is a
  single tailnet-wide document (tag declarations, `tagOwners`, grants); editing
  it is the all-or-nothing `policy file` OAuth scope. It lives in the **infra
  repo**.
- **Exposure delegates through the operator, so the app repo holds _zero_
  Tailscale credentials.** The infra repo installs the Tailscale K8s operator
  once, with an OAuth client scoped to `devices:core` + `auth_keys` **restricted
  to `tag:k8s-operator`**. The app then exposes the collector by writing a single
  `tailscale.com/expose: "true"` annotation (or an Ingress) on its Service — the
  operator, using _its_ credential, provisions the tailnet device. No admin token
  ever enters the app stack.

The only cross-boundary coupling is one ACL grant ("my user devices may reach the
collector's tag"), which can be a tag-_pattern_ grant made once so future
services need no further ACL edits.

> **Caveat:** OAuth tag-restriction has live rough edges (tags dropped on client
> creation; a minted token carrying all of the client's tags — tailscale/tailscale
> #10702, #19945). Mitigation: **one OAuth client / auth key per consumer, each
> with a single tag** — don't rely on tag-scoping to partition _within_ a shared
> client.

### 7.5 Responsibility split

| Concern                                                               | Infra / platform repo | App (personal-dashboard) repo |
| --------------------------------------------------------------------- | :-------------------: | :---------------------------: |
| Tailscale ACL: tags, `tagOwners`, grants, autoApprovers               |          ✅           |               —               |
| Tailnet toggles: MagicDNS + HTTPS certs (for the PWA)                 |          ✅           |               —               |
| Tailscale operator + its scoped OAuth client (1Password→Pulumi)       |          ✅           |               —               |
| k3s storage class, the collector's PVC, backups                       |          ✅           |    declares a volume mount    |
| Namespace                                                             |          ✅           |    consumes via stack ref     |
| Collector `Deployment` / `Service`                                    |           —           |              ✅               |
| `tailscale.com/expose` annotation on the Service                      |           —           |         ✅ (no creds)         |
| App `Secret` (Fastmail + Toggl only), 1Password→Pulumi                |           —           |              ✅               |
| `Dockerfile` + build/push to Forgejo                                  |           —           |              ✅               |
| Collector serving built SPA static assets (reuse Electron-shell path) |           —           |              ✅               |
| PWA manifest + service worker                                         |           —           |              ✅               |
| Electron agent: MoneyMoney push + local-trigger IPC                   |           —           |              ✅               |

The seam is a handful of **Pulumi stack references** the app reads from the
platform (tailnet domain, approved tag, storage class, registry host). Secrets on
both sides come from **1Password via Pulumi**, matching the existing infra setup.
MoneyMoney's secret never enters the cluster — it stays on the Mac — which is
consistent with the codebase's privacy-by-reduction principle.

### 7.6 Build & release — no runner, no standalone registry

- **Registry:** Forgejo's **built-in OCI registry** (public cert, so k3s/containerd
  pulls it with just a standard `imagePullSecret` — no `registries.yaml` CA
  wrangling). Using it as a registry needs **no Forgejo Actions runner** — that is
  only for CI automation.
- **Build:** a plain `Dockerfile` (`node:26-slim` + source + `pnpm install --prod`;
  the app runs TypeScript via Node's runtime type-stripping, so there is no TS
  build step — only the SPA's `vite build`). Built on the Mac with **OrbStack**,
  using **`--platform linux/amd64`** because the cluster is x86_64 and the Mac is
  arm64.
- **Deploy:** a manual `just`/Make target — `build → push → pulumi up` — run by
  hand. Deterministic, zero new services. (A Forgejo Actions runner is a later
  nice-to-have; stakpak is an ops/debugging helper, not a release gate — it is an
  AI DevOps agent, not a CI runner or a registry.)
- **Nix option, deferred:** a `devenv`/`dockerTools` image would be more
  reproducible but adds pnpm→Nix packaging friction; if adopted, build it on the
  **Linux host** (native x86_64), never via the macOS QEMU `linux-builder`.

### 7.7 The collector is a stateful singleton

The collector holds a SQLite file **and** a long-lived JMAP push stream, so it is
**one replica** with **`strategy: Recreate`** on a **ReadWriteOnce** volume — never
two pods on the same DB file. Redeploys have a few seconds of downtime, covered by
the phone's `dashboard-cache-v2` cache. (k3s persistence specifics — storage class,
node affinity if multi-node, and backups — are owned by the infra agent and
deferred; there is no critical data yet.) One app change is required regardless:
the collector must **serve the built SPA static assets same-origin** in prod, which
reuses the serving path already built for the Electron shell.

### 7.8 Deferred / open items

- k3s persistence details (storage class, node affinity, backups) — infra agent.
- Operator vs. sidecar — **decided: operator** (app holds no Tailscale creds).
- Whether Forgejo shares the k3s host (affects only build/push locality).
- Nix-built container — deferred; plain Dockerfile first.

---

## 8. Module structure

The deployment split (backend vs. Mac agent) forces a module split, because
otherwise the agent bundles the whole backend just to run one source. This
section records the target package layout.

> **Shipped.** The split is done: `@dash/collector` (acquisition only),
> `@dash/backend` (store, state, sampler, scheduler, tRPC router, `bank.ts`'s
> `pushBankBacklog`), `@dash/dashboard`, and the Mac agent — which did earn its
> own package and tests, so it is **`@dash/agent`** rather than living inside the
> Electron main process.
>
> Two details differ from the §8.3 table:
>
> - **`sources/sse.ts` stayed in `@dash/collector`.** It is the SSE _framing
>   parser_ for the JMAP push stream — acquisition, not serving.
> - **SPA serving landed as `backend/src/app-server.ts`** (`withSpa`: `/health`
>   and `/api/*` to the backend, everything else the built SPA), with
>   `backend/src/host.ts` (`createHostListener`) as the single entry for
>   in-process embedders. The container and the Electron shell mount the same
>   server.

### 8.1 The problem with today's `collector`

`@dash/collector` currently fuses two concerns under one name:

1. **Acquisition** — source adapters (`sources/`), `registry`, the `Source` port,
   `contract` types. _"Fetch data from external systems."_ Genuinely **shared**:
   the backend embeds JMAP + Toggl, the Mac agent embeds MoneyMoney.
2. **Serving** — store, state assembly, sampling, scheduler, tRPC router, SSE,
   and (new in prod) serving the built SPA. **Backend-only**, and the part that
   mis-fits the name — a _collector_ should not serve a frontend.

The Electron agent must **not** bundle the serving half. Today, importing
`@dash/collector` for MoneyMoney drags in the SQLite store, the tRPC server, and
the scheduler. Splitting keeps the agent lean — it isn't cosmetic.

### 8.2 Target packages

| Package           | Role                                                                                                                                                                                 | Depends on                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `@dash/collector` | **Acquisition library.** Source adapters + `Source` port + `registry` + `contract` types + `secrets`. No HTTP, no store, no server.                                                  | —                                               |
| `@dash/backend`   | **The backend deployable.** Store, state assembly, sampling, scheduler, tRPC router, SSE, serves the built SPA, handles `pushBankBacklog`. This is the thing that serves a frontend. | `@dash/collector`                               |
| `@dash/dashboard` | The SPA (unchanged). Served by `@dash/backend` in prod; loaded from the backend in Electron.                                                                                         | `@dash/backend` (types only, via `AppRouter`)   |
| Mac agent         | Composes a collector with **only** MoneyMoney + a push client. Lives in the Electron main process (promote to `@dash/agent` only if it earns its own tests).                         | `@dash/collector`, `@dash/backend` (types only) |

So `collector` keeps its name, scoped to what it actually does — it collects. The
backend gets its own honest name.

> **Terminology note:** §§1–7 call the always-on service "the collector" — its
> name in the app today. Post-split, that running deployable is `@dash/backend`,
> which _embeds_ `@dash/collector` (JMAP + Toggl) for acquisition. Read "the
> collector (pod)" in §7 as "the backend."

### 8.3 What moves where (from today's `collector/`)

| Stays in `@dash/collector` (acquire)               | Moves to `@dash/backend` (serve)             |
| -------------------------------------------------- | -------------------------------------------- |
| `sources/` (jmap, moneymoney, toggl)               | `store/db.ts`                                |
| `registry.ts`                                      | `state.ts`, `seed.ts`, `sampling/`           |
| `contract.ts` (shared types)                       | `router.ts`, `trpc.ts`, `sources/sse.ts`     |
| `secrets.ts`, `sources/port.ts`, the `Source` port | `scheduler.ts`, `main.ts`                    |
|                                                    | + new: static SPA serving, `pushBankBacklog` |

Two migrations encode the underlying principle — **`collector` owns _mechanism_
(how to fetch a source); the caller owns _policy_ (when to fetch):**

- **`scheduler.ts` → `@dash/backend`.** The backend polls on a schedule; the Mac
  agent's **local trigger** replaces the scheduler on the Mac side. Same sources,
  different policy — so policy leaves the shared library.
- **`sync.ts` (single-flight bank sync) → the agent.** On-demand MoneyMoney now
  happens Mac-side; the backend only receives the push.

### 8.4 Dependency graph (a DAG, no cycles)

```
contract/types ─┬─► @dash/collector ─► @dash/backend ─┬─► @dash/dashboard (type-only client)
                │                                      └─► Mac agent (type-only push client)
                └─► (agent also embeds @dash/collector for the MoneyMoney source)
```

Both the dashboard and the agent are just **tRPC clients** of the backend — the
dashboard reads state, the agent pushes bank data. This is symmetric and already
how the dashboard works today.

This split is really just **promoting the existing lint-enforced `sources/`
boundary up to a package boundary** — the same isolation discipline, now enforced
by the module graph instead of a lint rule.

---

## Sources

- ElectricSQL — read-path sync, Shapes, write path via your own API:
  [electric.ax/sync](https://electric.ax/sync/),
  [electric.ax v1.1 storage engine](https://electric.ax/blog/2025/08/13/electricsql-v1.1-released),
  [write patterns](https://queryplane.com/docs/blog/write-patterns-for-electricsql)
- Turso — embedded replicas & offline sync:
  [embedded replicas intro](https://docs.turso.tech/features/embedded-replicas/introduction),
  [offline writes](https://turso.tech/blog/introducing-offline-writes-for-turso),
  [offline sync beta](https://turso.tech/blog/turso-offline-sync-public-beta),
  [single-writer / concurrent writes](https://turso.tech/blog/beyond-the-single-writer-limitation-with-tursos-concurrent-writes)
- Zero (Rocicorp) — zero-cache, schema handshake, mutators:
  [zero-schema](https://zero.rocicorp.dev/docs/zero-schema),
  [when to use](https://zero.rocicorp.dev/docs/when-to-use),
  [Zero 1.0 (InfoQ)](https://www.infoq.com/news/2026/06/zero-version-1/)
- PowerSync — Postgres⟷SQLite, upload queue, conflict resolution:
  [philosophy](https://docs.powersync.com/overview/powersync-philosophy),
  [custom conflict resolution](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts/custom-conflict-resolution),
  [v1.0 intro](https://powersync.com/blog/introducing-powersync-v1-0-postgres-sqlite-sync-layer)
- Electric's alternatives page — a categorized link directory of ~90 projects
  (no per-tool commentary), which lists tRPC under "State transfer" and its own
  camp under "Real-time and sync":
  [electric.ax/docs/sync/reference/alternatives](https://electric.ax/docs/sync/reference/alternatives)

Deployment (§7):

- Tailscale K8s operator — expose Services to the tailnet, not the public net:
  [operator](https://tailscale.com/docs/kubernetes-operator),
  [ingress](https://tailscale.com/docs/kubernetes-operator/ingress),
  [install / OAuth client scopes + tags](https://tailscale.com/docs/kubernetes-operator/install-operator)
- Tailscale OAuth clients — scopes, tag restriction, and the known rough edges:
  [OAuth clients](https://tailscale.com/docs/features/oauth-clients),
  [tag-restriction FR #10702](https://github.com/tailscale/tailscale/issues/10702),
  [tags dropped on creation #19945](https://github.com/tailscale/tailscale/issues/19945)
- Forgejo built-in container registry (no runner needed to use it):
  [container registry](https://forgejo.org/docs/latest/user/packages/container/)
- devenv containers + macOS needs a remote Linux builder:
  [devenv containers](https://devenv.sh/containers/),
  [nix-darwin linux-builder](https://nixcademy.com/posts/macos-linux-builder/)
- stakpak — an open-source AI DevOps agent (not a CI runner / registry):
  [stakpak/agent](https://github.com/stakpak/agent)
