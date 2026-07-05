import type { TaskLine } from "../../domain";

/** German day word: "1 Tag" vs dative "Tagen" (after "in"/"vor") or nominative "Tage" (before "fällig"). */
function tage(n: number, form: "dative" | "nominative"): string {
  if (n === 1) return "1 Tag";
  return `${n} ${form === "dative" ? "Tagen" : "Tage"}`;
}

/** The status line shared by the Mietbuchhaltung / Firmenbelege cards. */
export function StatusSentence({ line }: { line: TaskLine }) {
  const cls = "text-[13px] text-secondary";
  switch (line.kind) {
    case "calm-since":
      return (
        <div className={cls}>
          Letzter Upload vor{" "}
          <span className="font-semibold text-success">{tage(line.days, "dative")}</span>
        </div>
      );
    case "calm-next-due":
      return (
        <div className={cls}>
          Nächste Fälligkeit in{" "}
          <span className="font-semibold text-success">{tage(line.days, "dative")}</span>
        </div>
      );
    case "due":
      return (
        <div className={cls}>
          <span className="font-semibold text-status-due">{tage(line.days, "nominative")}</span>{" "}
          fällig
        </div>
      );
    case "overdue":
      return (
        <div className={cls}>
          <span className="font-semibold text-status-overdue">{tage(line.days, "nominative")}</span>{" "}
          überfällig
        </div>
      );
  }
}
