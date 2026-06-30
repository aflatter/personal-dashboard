# Persönliches Dashboard

A calm, single-screen personal dashboard that surfaces a handful of recurring
"is this taken care of?" facts, grouped into three life-area columns —
**Persönlich**, **tevim GmbH**, **Immobilien**. All copy and number/date
formatting is German (de-DE).

Widgets: two inboxes (Posteingang, with a two-series trend chart + week delta),
the Spaßkonto bank backlog, the Mietbuchhaltung and Firmenbelege day-counters,
and an Arbeitszeit hours breakdown.

> This first milestone runs on **seeded mock data** persisted to
> `localStorage`. Real integrations (IMAP/Exchange, MoneyMoney, time-tracking)
> are intentionally out of scope — see `Data layer` below.

## Toolchain

- **[devenv.sh](https://devenv.sh)** manages system dependencies. It pins
  **Node.js 24** from nixpkgs (`devenv.nix`). This is the single owner of the
  runtime.
- **[Vite+](https://viteplus.dev)** (`vp`) is the build/test/lint toolchain,
  added as a local dev dependency and driven through `npm` scripts.
  - Vite+'s **env feature is disabled**: its environment manager (`vp env`) can
    install and shim a Node runtime globally, but here **devenv owns Node**, so
    we run Vite+ in system-first mode. If you have Vite+ installed globally,
    run `vp env off` once to prefer your system/devenv Node; because we only use
    Vite+ as a local dependency invoked via devenv's Node, managed mode never
    engages regardless.
- **[Base UI](https://base-ui.com)** (`@base-ui/react`) provides the unstyled
  foundational components (Button, Popover, Switch, NumberField).
- **React 19 + TypeScript**, styled with **Tailwind CSS v4** (design tokens live
  in `src/index.css` under `@theme`).

## Getting started

```bash
devenv shell      # Node 24 from nixpkgs (or use your own modern Node)
npm install
npm run dev        # vp dev  — http://localhost:5173
```

### Scripts

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | `vp dev` — dev server                 |
| `npm run build`     | `vp build` — production build         |
| `npm run preview`   | `vp preview` — serve the build        |
| `npm test`          | `vp test` — domain unit tests (Vitest)|
| `npm run lint`      | `vp lint` — oxlint                     |
| `npm run typecheck` | `tsc --noEmit`                         |

## Architecture

Visual/presentational components are kept separate from logic, with a pure
domain model at the core:

```
src/
  domain/        Pure TypeScript — the domain model. No React.
                 entities (types.ts) + derivations (inbox, counter, rent, tax,
                 bank, hours) + de-DE formatting. Fully unit-tested.
  store/         useDashboard hook: seeded state, localStorage, actions
                 (sync, markRent/Tax/Bank, settings) + a React context.
  components/
    ui/          Presentational only — props in, no store/derivations.
    *.tsx        Container cards: read the store, call domain fns, render ui/.
```

- **Presentational** components (`components/ui/*`) import only React and domain
  _types_ — never the store or derivation functions.
- **Container** components (`InboxCard`, `BankCard`, `RentCard`, `TaxCard`,
  `HoursCard`, …) read the store via `useDashboardStore()`, run domain
  functions, and hand plain props to the presentational layer.
- Functional components and composition throughout — no inheritance.

### Data layer

State is seeded mock data (`store/seed.ts`, mirroring the design prototype) and
persisted to `localStorage`. To wire real sources, replace the data behind
`useDashboard` (and the `sync`/`mark*` actions):

- **Inboxes** — IMAP (personal) / Exchange (work); pull `total` + `unread` and
  append a daily snapshot for the trend.
- **Bank** — MoneyMoney's reviewed-transaction state.
- **Hours** — the time-tracking system of record, grouped client → project.
- **Rent / tax** — manual self-reported tasks; the actions set `lastDoneAt`.

## Design notes

- Built from the Claude Design handoff. Where `SPEC.md` and the final
  prototype HTML disagreed (the day-counters), the **prototype** is the source
  of truth: rent/tax render as **text-status cards** (no progress rings).
- Hours use the de-DE decimal comma (`18,5 h`), per the handoff's "de-DE
  formatting throughout" principle.
- Configurable via the header ⚙ settings: due-soon / overdue thresholds and
  whether the clock shows seconds.
