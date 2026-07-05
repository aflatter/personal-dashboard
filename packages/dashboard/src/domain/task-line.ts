/**
 * Semantic state shared by the Mietbuchhaltung and Firmenbelege cards. The domain
 * decides *which* state applies and the relevant day count; the view turns this
 * into the German sentence and tone color (see the `StatusSentence` component).
 */
export type TaskStatusKind =
  /** Calm: time since the task was last done (e.g. "Letzter Upload vor …"). */
  | "calm-since"
  /** Calm: time until the next due date (e.g. "Nächste Fälligkeit in …"). */
  | "calm-next-due"
  /** Due but within grace / thresholds. */
  | "due"
  /** Past the grace window / overdue threshold. */
  | "overdue";

export interface TaskLine {
  kind: TaskStatusKind;
  /** The day count relevant to `kind` (since done, until due, or past due). */
  days: number;
  /** Calm/green states render a badge instead of an action button. */
  done: boolean;
  /** Last-done timestamp, or null when never done. */
  doneAt: number | null;
}
