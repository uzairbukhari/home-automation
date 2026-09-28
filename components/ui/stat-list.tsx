import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: ReactNode;
}

/** Two-column key/value grid, each row separated by a hairline above it. */
export function StatList({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4", className)}>
      {items.map((item) => (
        <div key={item.label} className="border-t border-[var(--border)] py-3 min-w-0">
          <dt className="text-xs text-[var(--text-muted)]">{item.label}</dt>
          <dd className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--text-primary)] truncate">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
