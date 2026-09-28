import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "good" | "warn" | "bad" | "neutral";

const TONES: Record<PillTone, string> = {
  good: "bg-[#12301f] border-[#2b6b45] text-[#9cf7c6]",
  warn: "bg-[#2e2612] border-[#6b5a2b] text-[#f8d35a]",
  bad: "bg-[#331a1c] border-[#6b3337] text-[#f5b1ab]",
  neutral: "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]",
};

/** Soft status / legend / count pill. Pass `dot` for a colored legend marker. */
export function Pill({
  tone = "neutral",
  dot,
  icon,
  className,
  children,
}: {
  tone?: PillTone;
  dot?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs leading-none",
        TONES[tone],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}
