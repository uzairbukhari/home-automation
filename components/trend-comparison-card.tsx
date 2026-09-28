import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatKwh } from "@/lib/utils";
import type { trendComparison } from "@/lib/metrics";

type TrendResult = ReturnType<typeof trendComparison>;

function ChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct == null) {
    return (
      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
        <Minus size={12} />—
      </span>
    );
  }
  const up = changePct > 0;
  const color = up ? "var(--status-good)" : changePct < 0 ? "var(--status-critical)" : "var(--text-muted)";
  const Icon = up ? TrendingUp : changePct < 0 ? TrendingDown : Minus;
  return (
    <span className="flex items-center gap-1 text-xs font-medium tabular-nums" style={{ color }}>
      <Icon size={12} />
      {Math.abs(changePct * 100).toFixed(0)}%
    </span>
  );
}

function StatRow({ label, current, previous, changePct }: { label: string; current: number; previous: number; changePct: number | null }) {
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_90px] items-center gap-3 py-2.5">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatKwh(current, 1)}</span>
        <ChangeBadge changePct={changePct} />
      </div>
      <span className="hidden sm:inline text-right text-xs text-[var(--text-muted)] tabular-nums">
        vs {formatKwh(previous, 1)}
      </span>
    </div>
  );
}

export function TrendComparisonCard({ title, result }: { title: string; result: TrendResult }) {
  return (
    <div className="tile flex flex-col gap-3 p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        <StatRow
          label="Produced"
          current={result.current.pvKwh}
          previous={result.previous.pvKwh}
          changePct={result.changePct.pvKwh}
        />
        <StatRow
          label="Consumed"
          current={result.current.loadKwh}
          previous={result.previous.loadKwh}
          changePct={result.changePct.loadKwh}
        />
        <StatRow
          label="Grid imported"
          current={result.current.gridImportKwh}
          previous={result.previous.gridImportKwh}
          changePct={result.changePct.gridImportKwh}
        />
      </div>
    </div>
  );
}
