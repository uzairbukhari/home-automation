"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, BarChart3, PiggyBank, Plug, Settings, LogOut, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Live", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/devices", label: "Devices", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav
      className={cn(
        "shrink-0 z-40",
        "fixed bottom-0 inset-x-0 flex items-center justify-around gap-1 px-2 py-2",
        "border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-0)_85%,transparent)] backdrop-blur-xl",
        "md:static md:flex-col md:justify-start md:w-[72px] md:h-screen md:sticky md:top-0",
        "md:border-t-0 md:border-r md:py-4 md:gap-2"
      )}
    >
      <div className="hidden md:flex flex-col items-center gap-1 pb-6">
        <div
          className="rounded-xl p-2.5 text-[var(--hud-accent)]"
          style={{
            backgroundColor: "color-mix(in srgb, var(--hud-accent) 14%, transparent)",
            boxShadow: "0 0 18px -4px var(--hud-accent)",
          }}
        >
          <Sun size={18} />
        </div>
      </div>

      <div className="flex md:flex-col items-center gap-1 md:gap-2 flex-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "relative flex flex-col md:flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 md:w-14 md:h-14 text-[10px] font-medium transition-colors font-display tracking-wide",
                active
                  ? "text-[var(--hud-accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
              )}
              style={
                active
                  ? {
                      backgroundColor: "color-mix(in srgb, var(--hud-accent) 14%, transparent)",
                      boxShadow: "0 0 20px -8px var(--hud-accent)",
                    }
                  : undefined
              }
            >
              {active && (
                <span
                  className="hidden md:block absolute -left-2 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full"
                  style={{ backgroundColor: "var(--hud-accent)", boxShadow: "0 0 8px var(--hud-accent)" }}
                />
              )}
              <Icon size={18} />
              <span className="uppercase text-[9px]">{label}</span>
            </Link>
          );
        })}
      </div>

      <button
        onClick={logout}
        title="Sign out"
        className="hidden md:flex flex-col items-center justify-center gap-1 rounded-xl w-14 h-14 text-[10px] font-display uppercase text-[var(--text-muted)] hover:text-[var(--status-critical)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <LogOut size={18} />
        Exit
      </button>
    </nav>
  );
}
