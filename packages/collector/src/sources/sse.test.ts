import { describe, expect, it } from "vitest";
import { SseParser } from "./sse.ts";

describe("SseParser", () => {
  it("parses a complete event", () => {
    const p = new SseParser();
    expect(p.push('event: state\ndata: {"x":1}\n\n')).toEqual([
      { event: "state", data: '{"x":1}' },
    ]);
  });

  it("reassembles an event split across chunks", () => {
    const p = new SseParser();
    expect(p.push("event: sta")).toEqual([]);
    expect(p.push("te\ndata: hi")).toEqual([]);
    expect(p.push("\n\n")).toEqual([{ event: "state", data: "hi" }]);
  });

  it("joins multi-line data with newlines and strips one leading space", () => {
    const p = new SseParser();
    expect(p.push("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });

  it("skips comment keep-alives and handles CRLF line endings", () => {
    const p = new SseParser();
    expect(p.push(": ping\r\ndata: hi\r\n\r\n")).toEqual([{ event: "message", data: "hi" }]);
  });

  it("emits multiple events from one chunk and ignores a blank trailing frame", () => {
    const p = new SseParser();
    expect(p.push("data: 1\n\ndata: 2\n\n\n")).toEqual([
      { event: "message", data: "1" },
      { event: "message", data: "2" },
    ]);
  });
});
