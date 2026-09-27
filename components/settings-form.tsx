"use client";

import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import type { TariffSettings } from "@/lib/metrics";
import { HudPanel } from "@/components/hud/hud-panel";

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <Info size={13} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="glass-card max-w-xs px-3 py-2 text-xs text-[var(--text-secondary)] shadow-lg z-50"
          >
            {text}
            <Tooltip.Arrow className="fill-[var(--surface-1)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function SettingsForm({ initial }: { initial: TariffSettings }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setValues(await res.json());
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, key: keyof TariffSettings, unit?: string, hint?: string) {
    const raw = values[key];
    return (
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          {label} {unit && <span className="text-[var(--text-muted)]">({unit})</span>}
          {hint && <HelpTip text={hint} />}
        </span>
        <input
          type="number"
          name={key}
          id={key}
          step="any"
          value={raw ?? ""}
          onChange={(e) =>
            setValues((v) => ({ ...v, [key]: numOrNull(e.target.value) } as TariffSettings))
          }
          className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--series-1)]"
        />
      </label>
    );
  }

  return (
    <HudPanel title="Tariff & system" bodyClassName="max-w-xl">
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">Tariff</h2>
        {field("Flat rate", "flatRatePerKwh", "PKR/kWh")}
        <div className="grid grid-cols-2 gap-4">
          {field("Peak rate", "peakRatePerKwh", "PKR/kWh")}
          {field("Off-peak rate", "offPeakRatePerKwh", "PKR/kWh")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(
            "Peak start hour",
            "peakStartHour",
            "0-23",
            "A window can wrap past midnight, e.g. start 18, end 6, covers 18:00-05:59."
          )}
          {field("Peak end hour", "peakEndHour", "0-23")}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Set a flat rate for a simple tariff, or peak/off-peak + hours for time-of-use billing. Flat rate takes
          priority if both are set.
        </p>
      </section>

      <section className="flex flex-col gap-4 pt-2 border-t border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">System</h2>
        {field("Total system cost", "systemCostPkr", "PKR")}
        <div className="grid grid-cols-2 gap-4">
          {field("Panel capacity", "panelKwp", "kWp")}
          {field("Battery capacity", "batteryKwh", "kWh")}
        </div>
        {field(
          "Grid CO₂ factor",
          "gridCo2KgPerKwh",
          "kg/kWh",
          "How much CO₂ one kWh from the grid produces, for the CO₂-avoided figures on Analytics/Savings. 0.45 is a reasonable default."
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg font-display uppercase tracking-wide text-xs px-4 py-2.5 font-medium disabled:opacity-50 transition-colors"
          style={{
            backgroundColor: "color-mix(in srgb, var(--hud-accent) 20%, transparent)",
            color: "var(--hud-accent)",
            border: "1px solid color-mix(in srgb, var(--hud-accent) 45%, transparent)",
            boxShadow: "0 0 16px -6px var(--hud-accent)",
          }}
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {saved && <span className="text-sm text-[var(--status-good)]">Saved</span>}
      </div>
    </form>
    </HudPanel>
  );
}
