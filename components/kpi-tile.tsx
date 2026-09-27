import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = "var(--series-1)",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: string;
}) {
  return (
    <div
      className="glass-card relative overflow-hidden p-4 flex flex-col gap-2 min-w-0"
      style={{ "--tile-glow": `color-mix(in srgb, ${accent} 70%, transparent)` } as CSSProperties}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.8 }}
      />
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {label}
        </span>
        {Icon && (
          <span
            className="rounded-full p-1.5"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`,
              color: accent,
              filter: `drop-shadow(0 0 5px color-mix(in srgb, ${accent} 55%, transparent))`,
            }}
          >
            <Icon size={14} />
          </span>
        )}
      </div>
      <span className={cn("font-readout text-2xl font-semibold tabular-nums text-[var(--text-primary)] truncate")}>
        {value}
      </span>
      {sub && <span className="text-xs text-[var(--text-secondary)]">{sub}</span>}
    </div>
  );
}
