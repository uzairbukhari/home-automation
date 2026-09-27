import { AlertTriangle, AlertOctagon, Info, ShieldCheck } from "lucide-react";
import type { AlertItem, AlertSeverity } from "@/lib/types";

const SEVERITY_STYLE: Record<AlertSeverity, { color: string; icon: typeof Info }> = {
  critical: { color: "var(--status-critical)", icon: AlertOctagon },
  warning: { color: "var(--status-warning)", icon: AlertTriangle },
  info: { color: "var(--series-1)", icon: Info },
};

export function AlertFeed({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-2">
        <ShieldCheck size={16} className="text-[var(--status-good)]" />
        All systems nominal.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => {
        const { color, icon: Icon } = SEVERITY_STYLE[a.severity];
        return (
          <li
            key={a.id}
            className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 border-l-2"
            style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}
          >
            <Icon size={15} style={{ color }} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{a.title}</p>
              <p className="text-xs text-[var(--text-muted)]">{a.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
