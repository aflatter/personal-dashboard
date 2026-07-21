import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStaticPath } from "./app-server.ts";

const DIST = "/app/dist";

describe("resolveStaticPath", () => {
  it("maps / to index.html", () => {
    expect(resolveStaticPath(DIST, "/")).toBe(join(DIST, "index.html"));
  });

  it("maps a nested asset path", () => {
    expect(resolveStaticPath(DIST, "/assets/index-abc.js")).toBe(join(DIST, "assets/index-abc.js"));
  });

  it("drops the query string", () => {
    expect(resolveStaticPath(DIST, "/assets/app.css?v=2")).toBe(join(DIST, "assets/app.css"));
  });

  it("never escapes distDir on a traversal attempt", () => {
    for (const attack of ["/../../etc/passwd", "/../secret", "/..%2f..%2fetc"]) {
      expect(resolveStaticPath(DIST, attack).startsWith(DIST)).toBe(true);
    }
  });
});
