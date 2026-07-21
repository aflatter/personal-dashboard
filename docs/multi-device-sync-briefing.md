# Multi-device sync architecture — briefing & evaluation

**Status:** decision briefing · **Date:** 2026-07-21 · **Branch:** `claude/multi-device-sync-arch-armp11`

This document frames the problem of getting dashboard data onto multiple devices
(k8s, MacBook, iPhone), explains how the candidate foundations work, and rates
them against *our* requirements. It exists to answer one question honestly:
**is it worth adopting a sync stack (Electric, Turso, …) instead of the
traditional backend-plus-API we already know how to build?**

---

## 1. The use case

We want the personal dashboard to be available on three surfaces with three
different collection needs:

| Surface | Role | Constraint |
|---|---|---|
| **k8s (cloud)** | Always-on collector | Best home for JMAP (holds a push stream open 24/7) and Toggl (plain HTTP). Reachable from anywhere. |
| **MacBook** | Local collector + client | **MoneyMoney can only run here** — it drives the MoneyMoney app over `osascript`/JXA under macOS TCC. Intermittently online. |
| **iPhone** | Client only | Must show a *complete* dashboard **even when the MacBook is offline.** |

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
  a machine (MoneyMoney returns *one integer*, not transactions). A foundation
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
  **auth + transport security + a public ingress** — this is true for *every*
  option below and should not be charged to any one of them.

**The crux, stated plainly**

Our topology is **hub-and-spoke data collection**, not collaboration. There
*must* be a durable store in the cloud that holds the last-known value of every
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
  calls the cloud mutation to push the integer up. It also *subscribes* (SSE) so
  settings changed on the phone reach its thresholds.
- **Phone:** loads the SPA from the cloud, reads via tRPC `state`, gets live
  updates via the SSE transport we already have.
- **Offline Mac:** the hub still holds the last MoneyMoney value; the phone is
  unaffected. ✅ F1.
- **Schema evolution:** we own both ends of a typed contract (tRPC + zod). The
  SPA is served by the backend, so backend+web deploy together — near-zero
  version skew. The Electron app and a cached phone tab can lag; that is the
  only skew to manage, and it is the *same* skew every option has.
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
- **Read path only.** Electric syncs data *out* of Postgres to clients. It does
  **not** handle writes. *"Writes go through your existing API — REST, GraphQL,
  RPC, whatever you already have."*
- **Client storage:** a shape log the client materializes (optionally into
  PGlite, or just into app state).
- **Schema:** you own Postgres migrations; additive columns flow through Shapes;
  clients tolerate additive change well.
- **Infra to run:** Postgres **+** the Electric service, both in k8s.

What it buys *us*: it replaces our hand-rolled SSE + polling + cache with a
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
and our near-empty conflict surface — Last-Push-Wins is *fine* when producers
are partitioned and events are append-only, so Turso's weakest area is a
non-issue for us. **The catch is the iPhone.** Embedded replicas are a native /
server-side feature; there is no clean way to run a syncing libSQL replica
inside **mobile Safari**. Turso's model wants a native app or a device-side
process. If the phone is a *web* client, Turso's headline mechanism doesn't
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

### 3.5 The rest of the landscape (from Electric's "alternatives")

Grouped by why they do or don't fit us:

- **CRDT / collaboration frameworks — Yjs, Automerge, Liveblocks, Y-Sweet,
  Jazz, DXOS, Ditto:** built for concurrent multi-writer editing (shared docs,
  cursors, merges). They solve the conflict problem we don't have. **Mismatch.**
- **Local-first DBs / sync frameworks — Replicache, RxDB, WatermelonDB,
  LiveStore, Triplit, SQLSync, cr-sqlite:** varying takes on client DB + sync.
  Replicache/Zero share lineage; RxDB/WatermelonDB are client-DB + pluggable
  sync; Triplit is a full sync-DB. All viable in principle but either
  general-purpose overkill or require rebuilding on their data model. **Possible
  but not compelling** given N3/N4.
- **Hosted sync backends — Convex, InstantDB, Firebase/Firestore, Supabase
  Realtime:** turnkey, but your data lives in **their** cloud. Direct tension
  with **N2 (privacy by reduction)**. **Avoid** unless self-hostable in our k8s.

---

## 4. Answering the specific questions

**"With sync solutions I don't need to maintain API endpoints."**
Partly true, and the split matters:

- **Electric** and **PowerSync** still require you to maintain the **write API**.
  They remove the *read/serve* API and live transport, not the write path.
- **Zero** (mutators) and **Turso** (direct DB writes) genuinely remove data
  endpoints.
- **But no sync engine removes the collectors.** Something still has to talk
  JMAP, drive MoneyMoney over JXA, and call Toggl. Our "source adapters" — the
  real integration code — stay exactly as they are under every option. What a
  sync engine can retire is the *serving* layer, which for us is small and
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
   server-side. Sync engines prefer to ship *raw rows* and derive on the client.
   Good news: we already have a pure `domain/` derivation layer, so moving
   derivations client-side is feasible — but it is real work.
4. **Maturity / lock-in / egress:** Turso offline (beta), Zero (1.0, young),
   Electric (write-path is DIY), hosted options (data leaves our infra).

**"How does schema evolution work?"**
Everyone converges on **expand → migrate → contract** (add backwards-compatible
columns/tables, ship clients, later drop the old). The difference sync
introduces is that **the client is decoupled in time from the server**, so
backwards-compatible/additive migrations become *mandatory*, and you must handle
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

Scored **1 (poor) – 5 (excellent)** *for our specific use case*. Weights reflect
what actually matters to us (single user, privacy, offline phone, existing
assets), **not** general tool quality. A great tool can score low here purely
because it targets problems we don't have.

| Criterion (weight) | Traditional | Electric | Turso | Zero | PowerSync |
|---|:--:|:--:|:--:|:--:|:--:|
| **Fits topology** — always-on hub + offline-phone reads (F1) (×3) | 5 | 5 | 4 | 5 | 5 |
| **iPhone as *web* client** (×3) | 5 | 5 | **2** | 4 | 3 |
| **Reactive read UX** (F3) (×2) | 3 | 5 | 4 | 5 | 4 |
| **Low infra / ops in k8s** (N1, N3) (×2) | 5 | 3 | 4 | 3 | **2** |
| **Reuses what we have** (N4) (×3) | 5 | 3 | 4 | 2 | 2 |
| **Privacy / self-hosted, no egress** (N2) (×3) | 5 | 5 | 4 | 5 | 5 |
| **Maturity / production-ready** (×2) | 5 | 4 | **2** | 3 | 4 |
| **Removes serving/API burden** (×1) | 2 | 3 | 5 | 5 | 3 |
| **Schema evolution ergonomics** (×1) | 4 | 4 | 3 | 5 | 4 |
| **Weighted total / 100** | **89** | **80** | **62** | **72** | **68** |

> Conflict resolution is deliberately **omitted** as a criterion: our producers
> are partitioned and our user events are append-only, so it is nearly
> irrelevant. Including it would flatter every sync engine on a dimension we
> never exercise.

### Reading the scores

- **Traditional (89):** highest not because sync is bad, but because we already
  own the pieces, it's the least infra, it keeps data in our k8s, and it treats
  the iPhone as an ordinary web client. Its one weak column — reactive read UX —
  is one we've already partly solved with SSE + the `dashboard-cache-v2` cache.
- **Electric (80):** the most *complementary* sync engine. It slots into the one
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
  **embedded replicas don't reach mobile Safari**. If we ever ship a *native*
  iOS app and Turso's offline path graduates, re-score it upward.

---

## 6. Recommendation

**Build the traditional stack now; keep Electric on the shelf as a targeted,
reversible upgrade for the read path.**

Rationale:

1. Our problem is **hub-and-spoke collection**, not collaboration. The sync
   engines' headline benefits — multi-writer conflict resolution and CDN-scale
   read fan-out — solve problems we don't have (N1, empty conflict surface).
2. The instinct in the prompt — *"Electron pushes updates to backend"* — is
   **exactly right** for the Mac→hub arrow, and **no sync engine removes that
   push**; they just wrap it. The thing worth adding to that instinct is the
   **reverse arrow**: the Mac should also *subscribe* to the hub (SSE), so a
   settings change on the phone reaches the Mac collector's thresholds. Once you
   draw both arrows, the design is complete and boring — which is the goal for a
   calm single-user dashboard.
3. We already have tRPC, SSE, a SQLite store, the source adapters, a pure
   derivation layer, and an Electron shell. The traditional stack is ~80% built;
   the sync options each ask us to trade some of that for infra we'd then run
   forever.
4. The genuinely new cost — **auth + public ingress** for phone access (N5) —
   is owed no matter what we pick, so it doesn't tip the decision.

**When to revisit:** adopt **Electric** for the read path *only if* the live,
offline-capable reactive read UX on the phone becomes a felt need that SSE + the
local cache can't satisfy — it's additive and doesn't force us to rewrite
writes. Reconsider **Turso** only if we ship a **native** iOS app *and* its
offline sync leaves beta. Treat hosted sync backends (Convex/Instant/Firebase)
as out of bounds while "privacy by reduction" is a design principle.

### Concrete next steps for the traditional path

1. Promote the collector to a k8s deployment running JMAP + Toggl, backed by a
   durable store (keep `node:sqlite`, or Postgres if we want room to grow).
2. Add auth + TLS ingress in front of the collector (the N5 cost, unavoidable).
3. Add a `pushBankBacklog` mutation; have the Mac Electron agent run the
   MoneyMoney source and push on each collection.
4. Have the Mac agent **subscribe** to the hub (reuse the existing SSE
   transport) so it receives settings/threshold changes.
5. Point the iPhone at the hub's SPA; it reads `state` and subscribes over SSE;
   the `dashboard-cache-v2` cache covers the cold-load/offline gap.

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
- Electric's own comparison of alternatives (referenced by the prompt):
  `https://electric.ax/docs/sync/reference/alternatives`
