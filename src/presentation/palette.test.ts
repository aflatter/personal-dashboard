import { describe, expect, it } from "vitest";
import { clientTint, lighten } from "./palette";

describe("lighten", () => {
  it("returns the base color at t=0 and white at t=1", () => {
    expect(lighten("#6E84CC", 0)).toBe("rgb(110, 132, 204)");
    expect(lighten("#6E84CC", 1)).toBe("rgb(255, 255, 255)");
  });
});

describe("clientTint", () => {
  it("tints a client base color toward white by tintLevel × 32%", () => {
    expect(clientTint(0, 0)).toBe("rgb(110, 132, 204)"); // base #6E84CC
    expect(clientTint(0, 1)).toBe("rgb(156, 171, 220)"); // lightened 0.32
  });

  it("cycles client base colors by index", () => {
    expect(clientTint(3, 0)).toBe(clientTint(0, 0)); // wraps at 3 colors
  });

  it("clamps to white for high tint levels (clients with many projects)", () => {
    // tintLevel 4 → t = 1.28 would overflow 255 without clamping.
    expect(clientTint(0, 4)).toBe("rgb(255, 255, 255)");
  });
});
