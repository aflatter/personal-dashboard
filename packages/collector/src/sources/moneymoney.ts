import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BankState } from "../contract.ts";
import type { Poll, Source } from "./port.ts";
import { DAY } from "../time.ts";

const run = promisify(execFile);
const ACCOUNT = process.env.MONEYMONEY_ACCOUNT ?? "Spaßkonto";

/**
 * Bank review backlog from MoneyMoney via AppleScript. Read-only: MoneyMoney owns
 * the checked/unchecked truth. There is no scalar "count" command, so we export
 * recent transactions and count the unchecked ones. Requires MoneyMoney running +
 * unlocked and the collector granted macOS Automation (TCC) permission — so it is
 * opt-in via MONEYMONEY=1 to avoid TCC prompts in dev/CI.
 */
export function moneyMoneyBank(): Source {
  return {
    id: "bank",
    historyMetrics: [],
    ready: () => process.env.MONEYMONEY === "1" && process.platform === "darwin",
    poll: async (): Promise<Poll> => {
      const from = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
      const script = `tell application "MoneyMoney" to export transactions from account "${ACCOUNT}" from date "${from}" as "plist"`;
      const { stdout: plistXml } = await run("osascript", ["-e", script], {
        timeout: 15_000,
        maxBuffer: 32_000_000,
      });

      // Convert the plist to JSON with the built-in plutil, then count unchecked.
      const tmp = join(tmpdir(), `mm-${process.pid}-${Date.now()}.plist`);
      await writeFile(tmp, plistXml);
      try {
        await run("plutil", ["-convert", "json", tmp], { timeout: 10_000 });
        const data = JSON.parse(await readFile(tmp, "utf8")) as {
          transactions?: Array<{ checkmark?: string | boolean }>;
        };
        // VERIFY the exact "unchecked" representation in MoneyMoney's plist export.
        const txns = data.transactions ?? [];
        const unchecked = txns.filter(
          (t) => t.checkmark === false || t.checkmark === "unchecked",
        ).length;
        const bank: BankState = { unchecked, lastCheckedAt: null };
        return { metrics: {}, snapshot: bank };
      } finally {
        await unlink(tmp).catch(() => {});
      }
    },
  };
}
