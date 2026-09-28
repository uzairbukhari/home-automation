import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Base dashboard section: flat navy card with an optional eyebrow
 * ("ENERGY FLOW"), a large light title ("Your home, at a glance"), and a
 * right-aligned action slot (pills, segmented controls, search).
 */
export function Panel({
  eyebrow,
  title,
  action,
  id,
  className,
  bodyClassName,
  children,
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const hasHeader = eyebrow || title || action;
  return (
    <section id={id} className={cn("card min-w-0 p-5 md:p-7 scroll-mt-28", className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-5">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            {title && <h2 className="text-xl md:text-2xl font-normal text-[var(--text-primary)]">{title}</h2>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn("min-w-0", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Page-level heading used at the top of Solar / Devices / Settings. */
export function PageHeader({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="text-2xl md:text-3xl font-normal text-[var(--text-primary)]">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-[var(--text-muted)]">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--text-muted)] py-14 text-center">{children}</p>;
}
