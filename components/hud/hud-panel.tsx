import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusLed, type LedStatus } from "./status-led";

/**
 * Base HUD instrument panel: glass surface + optional glowing corner
 * brackets + title bar with a status LED. Used as the outer wrapper for
 * most dashboard cards, replacing bare `.glass-card` divs.
 */
export function HudPanel({
  title,
  icon: Icon,
  status,
  frame = true,
  scan = false,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  status?: LedStatus;
  frame?: boolean;
  scan?: boolean;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("glass-card relative overflow-hidden", frame && "hud-frame", className)}>
      {scan && <div className="hud-scan" aria-hidden />}
      {(title || status) && (
        <div className="relative flex items-center justify-between gap-2 px-4 pt-3.5 pb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon size={14} className="text-[var(--hud-accent)] shrink-0" />}
            {title && (
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] truncate">
                {title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {action}
            {status && <StatusLed status={status} />}
          </div>
        </div>
      )}
      <div className={cn("relative p-4", bodyClassName)}>{children}</div>
    </div>
  );
}
