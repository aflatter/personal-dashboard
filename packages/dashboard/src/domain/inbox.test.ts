import { describe, expect, it } from "vitest";
import { buildFlow, buildSeries, inboxView } from "./inbox";
import type { Inbox } from "./types";

function makeInbox(partial: Partial<Inbox>): Inbox {
  return {
    account: "work",
    email: "alex@tevim.com",
    protocol: "Exchange",
    total: 0,
    unread: 0,
    history: [],
    totalHistory: [],
    receivedHistory: [],
    processedHistory: [],
    ...partial,
  };
}

describe("buildSeries", () => {
  it("centers a single point and scales to max", () => {
    const s = buildSeries([5], 10);
    expect(s.ex).toBe(165); // (2 + 328) / 2
    expect(s.ey).toBe(33); // 56 - (5/10)*(56-10)
  });

  it("spans the full plot width for multiple points", () => {
    const s = buildSeries([0, 10], 10);
    expect(s.line.startsWith("2,56")).toBe(true);
    expect(s.ex).toBe(328);
    expect(s.ey).toBe(10);
  });
});

describe("buildFlow", () => {
  it("diverges received (up) and processed (down) from a shared midline", () => {
    const flow = buildFlow([10, 5], [4, 8]);
    expect(flow.max).toBe(10); // largest value across both series
    // received bars sit above the midline (y + h reaches the midline)...
    for (const b of flow.received) expect(b.y + b.h).toBeCloseTo(flow.mid, 5);
    // ...processed bars start at the midline and drop below it.
    for (const b of flow.processed) expect(b.y).toBe(flow.mid);
    // the full-height bar (value === max) reaches the top of its half.
    expect(flow.received[0].h).toBeGreaterThan(flow.received[1].h);
  });

  it("handles empty series without dividing by zero", () => {
    const flow = buildFlow([], []);
    expect(flow.received).toEqual([]);
    expect(flow.processed).toEqual([]);
    expect(flow.max).toBe(1);
  });
});

describe("inboxView", () => {
  const inbox = makeInbox({
    total: 138,
    unread: 23,
    history: [22, 26, 21, 28, 24, 23, 27, 25, 29, 24, 23],
    totalHistory: [132, 136, 130, 138, 134, 133, 137, 135, 140, 138, 138],
    receivedHistory: [12, 15, 9, 14],
    processedHistory: [10, 13, 11, 12],
  });

  it("rounds axisMax up to the next 10 across total and totalHistory", () => {
    expect(inboxView(inbox).axisMax).toBe(140); // max series value is 140
  });

  it("surfaces today's received/processed as the latest flow points", () => {
    const view = inboxView(inbox);
    expect(view.received).toBe(14);
    expect(view.processed).toBe(12);
  });

  it("computes the week delta vs ~7 days ago (index len-8)", () => {
    const view = inboxView(inbox);
    expect(view.delta).toBe(-5); // 23 now − 28 at index 3
    expect(view.hasDelta).toBe(true);
    expect(view.deltaDirection).toBe("down");
  });

  it('marks a rising trend "up" and hides a flat delta', () => {
    const rising = inboxView(
      makeInbox({ total: 50, unread: 30, history: [20, 1, 1, 1, 1, 1, 1, 30], totalHistory: [50] }),
    );
    expect(rising.delta).toBe(10);
    expect(rising.deltaDirection).toBe("up");

    const flat = inboxView(
      makeInbox({ total: 10, unread: 5, history: [5, 9, 9, 9, 9, 9, 9, 5], totalHistory: [10] }),
    );
    expect(flat.hasDelta).toBe(false);
    expect(flat.deltaDirection).toBe("flat");
  });
});
