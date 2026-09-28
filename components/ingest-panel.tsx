"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";

const SOURCE_LABELS: Record<string, string> = { dess: "DessMonitor", tuya: "Tuya Cloud" };

export interface IngestRunRow {
  source: string;
  startedAt: string;
  ok: boolean;
  durationMs: number;
  rows: number;
  error: string | null;
}

export interface BackfillStateRow {
  source: string;
  cursorDate: string | null;
  doneAt: string | null;
  lastError: string | null;
}

export function IngestPanel({ runs, backfill }: { runs: IngestRunRow[]; backfill: BackfillStateRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const latestBySource = new Map<string, IngestRunRow>();
  for (const r of runs) if (!latestBySource.has(r.source)) latestBySource.set(r.source, r);

  function runBackfillNow() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/backfill", { method: "POST" });
        if (!res.ok) throw new Error("request failed");
        setMessage("Advanced backfill — refreshing…");
        router.refresh();
      } catch {
        setMessage("Backfill request failed.");
      }
    });
  }

  return (
    <Panel
      eyebrow="Connections"
      title="Data sources"
      action={
        <button
          onClick={runBackfillNow}
          disabled={pending}
          className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
          {pending ? "Running…" : "Run backfill now"}
        </button>
      }
      bodyClassName="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {["dess", "tuya"].map((source) => {
          const run = latestBySource.get(source);
          return (
            <div key={source} className="tile flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] font-semibold text-[var(--text-primary)]">{SOURCE_LABELS[source] ?? source}</span>
                <Pill tone={run == null ? "neutral" : run.ok ? "good" : "bad"} className="w-fit">
                  {run == null ? "No data yet" : run.ok ? "Connected" : "Failing"}
                </Pill>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-muted)]">Last poll</p>
                <p className="text-sm tabular-nums text-[var(--text-secondary)]">
                  {/* Explicit locale + options: server (Node) and client (browser) default
                      locales can differ and produce different strings for the same Date,
                      which is a hydration mismatch — pin both to the same format. */}
                  {run ? new Date(run.startedAt).toLocaleTimeString("en-US", { hour12: false }) : "never"}
                </p>
                {run && !run.ok && <p className="text-[11px] text-[var(--status-critical)] max-w-[200px] truncate" title={run.error ?? undefined}>{run.error}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">History backfill</h3>
        {backfill.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Not started yet.</p>
        ) : (
          backfill.map((b) => (
            <div key={b.source} className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm">
              <span className="text-[var(--text-secondary)]">{SOURCE_LABELS[b.source] ?? b.source}</span>
              <span className="tabular-nums text-[var(--text-primary)]">
                {b.doneAt ? "Complete" : b.cursorDate ? `At ${b.cursorDate}` : "Pending"}
                {b.lastError && <span className="text-[var(--status-warning)]"> · stopped (see error)</span>}
              </span>
            </div>
          ))
        )}
      </div>

      {message && <p className="text-xs text-[var(--text-muted)]">{message}</p>}
    </Panel>
  );
}
