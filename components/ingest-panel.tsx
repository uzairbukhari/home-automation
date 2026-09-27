"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { HudPanel } from "@/components/hud/hud-panel";
import { StatusLed } from "@/components/hud/status-led";

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
    <HudPanel
      title="Ingestion health"
      icon={RefreshCw}
      action={
        <button
          onClick={runBackfillNow}
          disabled={pending}
          className="rounded-lg bg-[var(--surface-2)] hover:bg-[color-mix(in_srgb,var(--hud-accent)_18%,var(--surface-2))] border border-[var(--border)] px-3 py-1.5 text-xs font-readout text-[var(--text-secondary)] disabled:opacity-50 transition-colors"
        >
          {pending ? "Running…" : "Run backfill now"}
        </button>
      }
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {["dess", "tuya"].map((source) => {
          const run = latestBySource.get(source);
          return (
            <div key={source} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <StatusLed status={run == null ? "idle" : run.ok ? "good" : "critical"} />
                <span className="text-sm font-medium text-[var(--text-primary)] uppercase">{source}</span>
              </div>
              <div className="text-right">
                <p className="font-readout text-xs text-[var(--text-secondary)]">
                  {/* Explicit locale + options: server (Node) and client (browser) default
                      locales can differ and produce different strings for the same Date,
                      which is a hydration mismatch — pin both to the same format. */}
                  {run ? new Date(run.startedAt).toLocaleTimeString("en-US", { hour12: false }) : "never"}
                </p>
                {run && !run.ok && <p className="text-[10px] text-[var(--status-critical)] max-w-[180px] truncate">{run.error}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Backfill progress</h3>
        {backfill.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Not started yet.</p>
        ) : (
          backfill.map((b) => (
            <div key={b.source} className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)] uppercase">{b.source}</span>
              <span className="font-readout text-[var(--text-primary)]">
                {b.doneAt ? "Complete" : b.cursorDate ? `At ${b.cursorDate}` : "Pending"}
                {b.lastError && <span className="text-[var(--status-warning)]"> · stopped (see error)</span>}
              </span>
            </div>
          ))
        )}
      </div>

      {message && <p className="text-xs text-[var(--text-muted)]">{message}</p>}
    </HudPanel>
  );
}
