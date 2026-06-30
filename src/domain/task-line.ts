/**
 * View model for the text-status line shared by the Mietbuchhaltung and
 * Firmenbelege cards: a sentence with one emphasized, colored middle part.
 * `done` marks the calm/green state (badge instead of an action button).
 */
export interface TaskLineView {
  done: boolean;
  linePre: string;
  lineEm: string;
  lineEmColor: string;
  linePost: string;
  /** de-DE last-done date, or "—" when never done. */
  last: string;
}

/** German day word: "Tag" (1) vs dative "Tagen" — used after "in"/"vor". */
export function tageDative(n: number): string {
  return n === 1 ? '1 Tag' : `${n} Tagen`;
}

/** German day word: "Tag" (1) vs nominative "Tage" — used before "fällig". */
export function tageNominative(n: number): string {
  return n === 1 ? '1 Tag' : `${n} Tage`;
}
