// The Mac push agent: collects Mac-only sources (currently the MoneyMoney bank
// backlog) locally and pushes them to the backend. Runs in the Electron main
// process; the Electron shell wires `refresh` to an IPC handler and supplies the
// backend URL + loaded secrets. No store, no server — push-only.

export { createBankAgent } from "./bank-agent.ts";
export type { BankAgent, BankAgentDeps, RefreshResult } from "./bank-agent.ts";
export { bankCollector } from "./collect.ts";
export type { BankBacklog } from "./collect.ts";
export { bankPusher } from "./push.ts";
