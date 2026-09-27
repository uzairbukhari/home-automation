import { getSettings, getLatestIngestRunBySource, getBackfillState } from "@/lib/queries";
import { SettingsForm } from "@/components/settings-form";
import { IngestPanel } from "@/components/ingest-panel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, latestRuns, backfill] = await Promise.all([
    getSettings(),
    getLatestIngestRunBySource(["dess", "tuya"]),
    getBackfillState(),
  ]);
  const runs = Array.from(latestRuns.values());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-[var(--text-primary)]">Settings</h1>
        <p className="font-readout text-xs text-[var(--text-muted)]">
          Tariff, system details, and data pipeline health
        </p>
      </header>

      <IngestPanel
        runs={runs.map((r) => ({
          source: r.source,
          startedAt: r.startedAt.toISOString(),
          ok: r.ok,
          durationMs: r.durationMs,
          rows: r.rows,
          error: r.error,
        }))}
        backfill={backfill.map((b) => ({
          source: b.source,
          cursorDate: b.cursorDate,
          doneAt: b.doneAt ? b.doneAt.toISOString() : null,
          lastError: b.lastError,
        }))}
      />

      <SettingsForm initial={settings} />
    </div>
  );
}
