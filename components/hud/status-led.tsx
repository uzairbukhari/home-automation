export type LedStatus = "good" | "warning" | "critical" | "idle";

const COLORS: Record<LedStatus, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  idle: "var(--text-muted)",
};

/** A small glowing status dot, pulsing unless idle. */
export function StatusLed({ status, pulse = true }: { status: LedStatus; pulse?: boolean }) {
  const color = COLORS[status];
  return (
    <span
      className={pulse && status !== "idle" ? "pulse-dot" : undefined}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "9999px",
        backgroundColor: color,
        boxShadow: `0 0 8px ${color}`,
      }}
      aria-hidden
    />
  );
}
