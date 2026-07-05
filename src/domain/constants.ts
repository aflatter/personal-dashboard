import type { Settings } from "./types";

export const DAY = 86_400_000;

export const DEFAULT_SETTINGS: Settings = {
  overdueThreshold: 21,
  dueSoonThreshold: 7,
  clockSeconds: false,
};
