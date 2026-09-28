"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeviceCard, categoryInfo, type DeviceCardData } from "@/components/device-card";

/** Searchable, room-filterable grid of device cards. */
export function DeviceGrid({ devices }: { devices: DeviceCardData[] }) {
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState<string | null>(null);

  const rooms = useMemo(
    () => Array.from(new Set(devices.map((d) => d.room ?? "Unassigned"))).sort(),
    [devices]
  );

  const q = query.trim().toLowerCase();
  const visible = devices.filter((d) => {
    const deviceRoom = d.room ?? "Unassigned";
    if (room && deviceRoom !== room) return false;
    if (!q) return true;
    return [d.name, deviceRoom, categoryInfo(d.category).label].some((s) => s.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {[null, ...rooms].map((r) => (
            <button
              key={r ?? "all"}
              onClick={() => setRoom(r)}
              className={cn(
                "shrink-0 rounded-xl border px-3.5 py-2 text-sm transition-colors",
                room === r
                  ? "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              {r ?? "All rooms"}
            </button>
          ))}
        </div>
        <label className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 focus-within:border-[var(--accent)] md:w-[300px]">
          <Search size={16} className="shrink-0 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices or rooms"
            className="w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-muted)]">No devices match.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}
    </div>
  );
}
