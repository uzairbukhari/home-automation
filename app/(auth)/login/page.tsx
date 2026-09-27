"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sun } from "lucide-react";
import { HudBackground } from "@/components/hud/hud-background";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed.");
        return;
      }
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass-card w-full max-w-sm p-8 flex flex-col gap-5"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-full p-2.5 bg-[var(--series-4)]/15 text-[var(--series-4)]">
          <Sun size={22} />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold uppercase tracking-wide text-[var(--text-primary)]">
            Solar Dashboard
          </h1>
          <p className="text-sm text-[var(--text-muted)]">Sign in to continue</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm text-[var(--text-secondary)]">
          Password
        </label>
        <input
          id="password"
          name="password"
          autoComplete="current-password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--series-1)]"
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="rounded-lg bg-[var(--series-1)] text-white py-2.5 font-medium disabled:opacity-50 transition"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <HudBackground />
      <main className="flex-1 flex items-center justify-center p-6">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
