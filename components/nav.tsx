"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Hexagon, LogOut, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/solar", label: "Solar" },
  { href: "/devices", label: "Devices" },
];

export function Nav({ dessOk, tuyaOk }: { dessOk: boolean | null; tuyaOk: boolean | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const status =
    dessOk === false || tuyaOk === false ? (
      <Pill tone="bad">{dessOk === false ? "DessMonitor offline" : "Tuya offline"}</Pill>
    ) : dessOk ? (
      <Pill tone="good">DessMonitor live</Pill>
    ) : (
      <Pill tone="warn">Awaiting data</Pill>
    );

  const tabs = LINKS.map(({ href, label }) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-full items-center px-1 text-[15px] font-medium transition-colors whitespace-nowrap",
          active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        )}
      >
        {label}
        {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-0)_88%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] md:h-[84px] max-w-[1480px] items-center justify-between gap-6 px-4 md:px-12">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <span className="grid size-10 md:size-11 shrink-0 place-items-center rounded-xl border border-[#2b5566] bg-[linear-gradient(145deg,#12324a,#0c1d30)] text-[var(--accent)]">
            <Hexagon size={20} strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold leading-tight text-[var(--text-primary)]">Photon Home</span>
            <span className="block truncate text-[13px] text-[var(--text-muted)]">Islamabad · Hybrid system</span>
          </span>
        </Link>

        <nav className="hidden md:flex h-full items-stretch gap-8">{tabs}</nav>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex">{status}</span>
          <Link
            href="/settings"
            title="Settings"
            aria-label="Settings"
            className={cn(
              "grid size-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]",
              pathname.startsWith("/settings") && "border-[var(--accent)] text-[var(--accent)]"
            )}
          >
            <SlidersHorizontal size={17} />
          </Link>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="group grid size-10 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-3)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--status-critical)]"
          >
            <span className="group-hover:hidden">PH</span>
            <LogOut size={15} className="hidden group-hover:block text-[var(--status-critical)]" />
          </button>
        </div>
      </div>

      <nav className="no-scrollbar flex h-11 items-stretch gap-6 overflow-x-auto border-t border-[var(--border)] px-4 md:hidden">
        {tabs}
      </nav>
    </header>
  );
}
