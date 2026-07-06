/**
 * Minimal Server-Sent Events framing parser (WHATWG SSE, as used by JMAP push —
 * RFC 8620 §7.3). Feed it decoded text chunks; it buffers partial frames across
 * chunk boundaries and returns complete events. We only care about `event` and
 * `data`; `id`/`retry` are ignored, and comment lines (`:` prefix, e.g. proxy
 * keep-alives) are skipped. Node has no global `EventSource`, and a native one
 * couldn't send the Bearer header anyway, so we parse the stream ourselves.
 */
export interface SseEvent {
  event: string;
  data: string;
}

export class SseParser {
  private buffer = "";
  private eventType = "";
  private dataLines: string[] = [];

  /** Feed one decoded chunk; returns any events completed by it (often none). */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let nl: number;
    // Lines end in \n or \r\n; only dispatch on lines we've fully received.
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      const done = this.consumeLine(line);
      if (done) out.push(done);
    }
    return out;
  }

  private consumeLine(line: string): SseEvent | null {
    if (line === "") {
      // Blank line dispatches the buffered event (unless it's empty).
      if (this.dataLines.length === 0) {
        this.eventType = "";
        return null;
      }
      const ev: SseEvent = { event: this.eventType || "message", data: this.dataLines.join("\n") };
      this.eventType = "";
      this.dataLines = [];
      return ev;
    }
    if (line.startsWith(":")) return null; // comment / keep-alive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.eventType = value;
    else if (field === "data") this.dataLines.push(value);
    // id/retry are irrelevant to us.
    return null;
  }
}
