// Per-client colors for the Arbeitszeit widget — a presentation concern.
// The domain reports a client index + per-project tint level; we turn that into a color.

/** Base colors cycled per client. */
const CLIENT_COLORS = ["#6E84CC", "#4F9E86", "#C2925A"] as const;

/** Mix a "#rrggbb" hex toward white by fraction `t` (0..1) → "rgb(r, g, b)". */
export function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Clamp: tintLevel can push t past 1 for clients with many projects.
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * t)));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * The color for a client's project/segment: the client's base color mixed toward
 * white by `tintLevel × 32%` (tintLevel 0 = the base color, used for the swatch).
 */
export function clientTint(clientIndex: number, tintLevel: number): string {
  const base = CLIENT_COLORS[clientIndex % CLIENT_COLORS.length];
  return lighten(base, tintLevel * 0.32);
}
