import { cx } from "./cx";

/** A big mono figure with an inline label, e.g. "12 ungelesen". */
export function StatNumber({
  value,
  label,
  valueColor,
  labelColor,
  valueClassName = "text-[34px]",
  gap = "gap-[7px]",
}: {
  value: number | string;
  label: string;
  valueColor: string;
  labelColor: string;
  valueClassName?: string;
  gap?: string;
}) {
  return (
    <div className={cx("flex items-baseline", gap)}>
      <span
        className={cx("tnum font-semibold tracking-[-0.02em]", valueClassName)}
        style={{ color: valueColor, lineHeight: 0.8 }}
      >
        {value}
      </span>
      <span className="text-[12.5px] font-medium" style={{ color: labelColor }}>
        {label}
      </span>
    </div>
  );
}
