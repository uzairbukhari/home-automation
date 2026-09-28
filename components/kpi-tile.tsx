import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Big bold number followed by a small muted unit, e.g. "224.00 kWh". */
export function Value({ value, unit, className }: { value: ReactNode; unit?: string; className?: string }) {
  return (
    <span className={cn("font-bold tabular-nums tracking-tight text-[var(--text-primary)]", className)}>
      {value}
      {unit && <span className="ml-1 text-[0.45em] font-semibold tracking-normal text-[var(--text-muted)]">{unit}</span>}
    </span>
  );
}

/**
 * Metric card. Default: tinted icon square on the left, label, value, caption.
 * `hero`: tall card with a colored dot top-right and the value centered.
 */
export function KpiTile({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  accent = "var(--series-1)",
  variant = "default",
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: string;
  variant?: "default" | "hero";
  children?: ReactNode;
}) {
  if (variant === "hero") {
    return (
      <div className="card flex flex-col justify-between gap-6 p-5 md:p-6 min-h-[180px] lg:min-h-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] text-[var(--text-secondary)]">{label}</span>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
        </div>
        <Value value={value} unit={unit} className="text-4xl md:text-[40px]" />
        {sub ? <span className="text-xs text-[var(--text-muted)]">{sub}</span> : <span />}
      </div>
    );
  }

  return (
    <div className="tile flex gap-3.5 p-4 md:p-5 min-w-0">
      {Icon && (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}
        >
          <Icon size={17} />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
        <Value value={value} unit={unit} className="text-2xl md:text-[26px] leading-tight" />
        {sub && <span className="text-xs leading-snug text-[var(--text-muted)]">{sub}</span>}
        {children}
      </div>
    </div>
  );
}
