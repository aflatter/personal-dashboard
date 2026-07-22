# Persönliches Dashboard

A calm, single-screen personal dashboard that answers a handful of recurring
"is this taken care of?" questions, grouped into three life-area columns —
**Persönlich**, **tevim GmbH**, **Immobilien**. All copy, number and date
formatting is German (de-DE); the code is English throughout.

Widgets: two inboxes (Posteingang, with a two-series trend chart + week delta),
the bank review backlog, the **Mietbuchhaltung** and **Firmenbelege · Finanzamt**
day-counters, and an **Arbeitszeit** breakdown of this month's billed hours by
client → project.

The data is real. An always-on Node backend collects from Fastmail (JMAP),
Toggl and MoneyMoney, keeps day-bucketed history in `node:sqlite`, and serves
the SPA a typed tRPC API. (A fresh database is seeded once on first boot so the
UI has something to render before the first poll lands.)

## Packages

A pnpm workspace, split by role:

| Package           | What it is                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dash/collector` | **Acquisition library** — source adapters (JMAP/Fastmail, MoneyMoney, Toggl) behind a common `Source` port, the registry that configures them from secrets, the data contract, the secrets loader. No HTTP, no store. |
| `@dash/backend`   | **The always-on service** — SQLite store, state assembly, day-bucket sampler, polling scheduler, tRPC router, and (in prod) the built SPA served same-origin.                                                         |
| `@dash/dashboard` | **The SPA** — React 19 + Vite + Tailwind v4, a typed tRPC client. The backend's `AppRouter` _is_ the contract; no hand-written wire types.                                                                            |
| `@dash/agent`     | **The Mac push agent** (library) — embeds `@dash/collector` for the MoneyMoney source and pushes the collected backlog to the backend's `pushBankBacklog`.                                                            |

Plus `apps/desktop-electron/` — the macOS app, a workspace package like the
others (`pnpm-workspace.yaml` covers `apps/*`). It serves nothing and owns no
data: the main process is the **push agent** (it embeds `@dash/agent` to read
MoneyMoney locally and POST the backlog to the backend), and the renderer is a
thin loader for the SPA the backend already serves.

The collector/backend split exists so the Mac agent can embed one source without
dragging in the store, the scheduler and the tRPC server. See
`docs/multi-device-sync-briefing.md` §8.

## Running locally

```bash
devenv shell      # Node 26 (nodejs-slim) + pnpm + secretspec + just + kubectl
pnpm install
devenv up         # backend on :4319, dashboard on :5173
```

`devenv up` starts both processes: the backend waits for its `/health` probe,
then the Vite dev server comes up and proxies `/api` → the backend. Ports are
allocated upward from their base so parallel git worktrees don't collide.

`pnpm dev` runs only the SPA; it expects a backend at `COLLECTOR_URL`
(default `http://127.0.0.1:4319`).

### Scripts

| Script           | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | `vp dev packages/dashboard` — SPA dev server       |
| `pnpm build`     | `vp build packages/dashboard` — production build   |
| `pnpm preview`   | `vp preview packages/dashboard` — serve the build  |
| `pnpm test`      | `vp run -r test` — Vitest across packages          |
| `pnpm lint`      | `vp lint` — oxlint                                 |
| `pnpm format`    | `vp format` — oxfmt                                |
| `pnpm typecheck` | `vp run -r typecheck` — `tsc --noEmit` per package |

## Secrets

Secrets are declared in `secretspec.toml` and resolved at boot from 1Password
via the `secretspec` Node SDK (`packages/collector/src/secrets.ts`) — nothing
else touches the vault. One-time setup: `secretspec config`, then create a
1Password item per declared secret.

Three profiles, one per deployable — `app` (the Mac agent's
`MONEYMONEY_ACCOUNT`), `backend` (the Fastmail and Toggl runtime credentials),
and `deploy` (the Forgejo pull token, never loaded at runtime). There is
deliberately no `default` profile; select one with `SECRETSPEC_PROFILE`.

Sources degrade gracefully: a source whose secret is missing is simply skipped,
and a failing poll marks only that source not-ok while the rest keep serving.

## Deployment

The backend runs in **k3s**, reachable **only** over Tailscale (no public
ingress) at `https://personal-dashboard.braid-stargazer.ts.net` — the tailnet is
the authentication, so there is no app-level auth. The image is built on the Mac
(OrbStack, `--platform linux/amd64`) and pushed to a Forgejo registry at
`forgejo.tev.im`.

```sh
just deploy      # build → push → apply deploy/k8s/ → roll the Deployment
just smoke       # GET <url>/health → 204 over HTTPS
```

In the cluster the backend reads its secrets from environment variables injected
by a k8s Secret, so no secretspec and no 1Password provider ship inside the pod.
Full instructions: `deploy/README.md`.

## Where to look next

- **`AGENTS.md`** — the working contract: architecture boundaries, design
  principles, conventions. Read this before changing code.
- **`docs/multi-device-sync-briefing.md`** — the design of record for the
  multi-device architecture (§7 deployment, §8 module structure).
- **`docs/riffstack-infra-briefing.md`** — the platform-side handoff (Tailscale
  operator, ACL, storage class) and the frozen constants it fixed.
