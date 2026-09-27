import { cn } from "@/lib/utils";

/** Horizontal segmented meter (e.g. load %, DoD, capacity factor) with a glowing fill. */
export function SegmentBar({
  percent,
  color = "var(--series-1)",
  segments = 20,
  className,
}: {
  percent: number;
  color?: string;
  segments?: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const litCount = Math.round((clamped / 100) * segments);

  return (
    <div className={cn("flex gap-[3px]", className)} role="img" aria-label={`${Math.round(clamped)}%`}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="h-2 flex-1 rounded-[1px] transition-colors duration-300"
          style={
            i < litCount
              ? { backgroundColor: color, boxShadow: `0 0 4px ${color}` }
              : { backgroundColor: "var(--surface-2)" }
          }
        />
      ))}
    </div>
  );
}
