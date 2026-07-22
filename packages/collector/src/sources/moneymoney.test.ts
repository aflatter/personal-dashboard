import { describe, expect, it } from "vitest";
import { mapOsascriptError } from "./moneymoney.ts";

describe("mapOsascriptError", () => {
  it("maps a locked database (-2720 or the text) to an unlock hint", () => {
    expect(mapOsascriptError("... error (-2720)")).toBe(
      "MoneyMoney is locked — unlock it and sync again",
    );
    expect(mapOsascriptError("MoneyMoney got an error: Locked database")).toBe(
      "MoneyMoney is locked — unlock it and sync again",
    );
  });

  it("maps a missing Automation grant (-1743 / not authorized) to the TCC hint", () => {
    const want = "MoneyMoney control not permitted — grant Automation access in System Settings";
    expect(mapOsascriptError("execution error: ... (-1743)")).toBe(want);
    expect(mapOsascriptError("Not authorized to send Apple events")).toBe(want);
    // British spelling variant of the regex branch.
    expect(mapOsascriptError("not authorised")).toBe(want);
  });

  it("maps a not-running app (-600 / not running) to the run-it hint", () => {
    expect(mapOsascriptError("... (-600)")).toBe("MoneyMoney is not running");
    expect(mapOsascriptError("Application isn't running")).toBe("MoneyMoney is not running");
  });

  it("falls back to the last stderr line, stripping the execution-error prefix", () => {
    expect(mapOsascriptError("execution error: Weird failure (-9999)")).toBe(
      "MoneyMoney sync failed: Weird failure (-9999)",
    );
  });

  it("maps an empty stderr (osascript killed — timeout on the TCC prompt) to the prompt hint", () => {
    const want = "MoneyMoney did not respond — allow the Automation prompt, then sync again";
    expect(mapOsascriptError("")).toBe(want);
    expect(mapOsascriptError("  \n ")).toBe(want);
    // A timeout kill leaves only the prefix behind, which distils to nothing.
    expect(mapOsascriptError("execution error: ")).toBe(want);
  });

  it("keeps only the last line of a multi-line fallback stderr", () => {
    expect(mapOsascriptError("osascript stack trace\nexecution error: broke")).toBe(
      "MoneyMoney sync failed: broke",
    );
  });
});
