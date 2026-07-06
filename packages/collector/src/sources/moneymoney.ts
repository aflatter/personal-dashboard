import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BankState } from "../contract.ts";
import type { Poll, Source } from "./port.ts";
import { DAY } from "../time.ts";

const run = promisify(execFile);
const ACCOUNT = process.env.MONEYMONEY_ACCOUNT ?? "Girokonto";

/**
 * JXA that exports the account's recent transactions, parses the plist, and
 * counts the unchecked ones — all inside osascript. Only the integer count is
 * returned, so no transaction data ever crosses into this process. In the export
 * plist each transaction has a boolean `checkmark`; unchecked = `checkmark: false`
 * (verified against a live account: false = still-to-review).
 *
 * argv: [account, fromDate]. Omitting the account would export all accounts.
 */
const COUNT_UNCHECKED = `
ObjC.import('Foundation');
function run(argv) {
  var account = argv[0];
  var fromDate = argv[1];
  var mm = Application('MoneyMoney');
  var params = { fromDate: fromDate, as: 'plist' };
  if (account) params.fromAccount = account;
  var xml = mm.exportTransactions(params);
  var data = $.NSString.alloc.initWithUTF8String(xml).dataUsingEncoding($.NSUTF8StringEncoding);
  var plist = $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(data, 0, null, null);
  var txns = ObjC.deepUnwrap(plist.objectForKey('transactions')) || [];
  return String(txns.filter(function (t) { return t.checkmark === false; }).length);
}
`;

/** Turn a raw osascript stderr into a short, actionable message. */
function mapOsascriptError(stderr: string): string {
  if (/-2720|Locked database/.test(stderr))
    return "MoneyMoney is locked — unlock it and sync again";
  if (/-1743|not authori[sz]ed|not allowed/i.test(stderr))
    return "MoneyMoney control not permitted — grant Automation access in System Settings";
  if (/-600|not running|isn't running/i.test(stderr)) return "MoneyMoney is not running";
  const last = stderr.trim().split("\n").pop() ?? stderr.trim();
  return `MoneyMoney sync failed: ${last.replace(/^execution error:\s*/i, "").trim()}`;
}

/**
 * Bank review backlog from MoneyMoney. Read-only: MoneyMoney owns the
 * checked/unchecked truth; the count falls as items are reviewed there. Requires
 * MoneyMoney running + unlocked and the collector granted macOS Automation (TCC)
 * permission — when it is locked the export throws (`Locked database`), surfacing
 * as `ok:false` while the last-good count stays put.
 *
 * Unlike the HTTP sources this is NOT on the scheduler — it syncs only when the
 * user hits the bank card's sync button (the manual trigger is the opt-in, so the
 * one-off TCC prompt happens exactly when they asked for it, never unattended).
 */
export function moneyMoneyBank(): Source {
  return {
    id: "bank",
    historyMetrics: [],
    ready: () => process.platform === "darwin",
    poll: async (): Promise<Poll> => {
      const from = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
      let stdout: string;
      try {
        ({ stdout } = await run(
          "osascript",
          ["-l", "JavaScript", "-e", COUNT_UNCHECKED, ACCOUNT, from],
          { timeout: 15_000 },
        ));
      } catch (err) {
        // execFile embeds the whole script in its message; distill the osascript
        // error (last line) and map the ones the user can act on.
        const detail = err instanceof Error && "stderr" in err ? String(err.stderr) : String(err);
        throw new Error(mapOsascriptError(detail));
      }
      const unchecked = Number.parseInt(stdout.trim(), 10);
      if (!Number.isFinite(unchecked)) {
        throw new Error(`MoneyMoney: unexpected output ${JSON.stringify(stdout)}`);
      }
      const bank: BankState = { unchecked, syncedAt: Date.now() };
      return { metrics: {}, snapshot: bank };
    },
  };
}
