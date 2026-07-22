// Public surface of the acquisition library. `@dash/collector` is the shared,
// embeddable core: source adapters + the registry that gates them from secrets +
// the data-shape contract. It holds no store, no HTTP server, no tRPC — the
// backend (`@dash/backend`) and the Mac agent both embed it. Prefer the narrow
// subpath exports (./contract, ./registry, ./bank, ./secrets, ./sources/*) in
// code that only needs one slice; this barrel is the convenience surface.
//
// Bundled consumers should NOT use this barrel: it reaches every source, so the
// Mac agent pulling `./bank` through here would carry JMAP + Toggl + undici.

export * from "./bank.ts";
export * from "./contract.ts";
export * from "./registry.ts";
export * from "./secrets.ts";
export type { Poll, Source } from "./sources/port.ts";
