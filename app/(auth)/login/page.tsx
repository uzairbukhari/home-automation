"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hexagon } from "lucide-react";

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
      // Only ever redirect same-origin: "next" is attacker-controlled query
      // input (a crafted /login?next=https://evil.com or //evil.com link),
      // so anything but a plain in-app path ("/" and not "//…") is rejected
      // to prevent an open-redirect phishing vector post-login.
      const rawNext = searchParams.get("next");
      const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card w-full max-w-sm p-8 flex flex-col gap-6"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-[#2b5566] bg-[linear-gradient(145deg,#12324a,#0c1d30)] text-[var(--accent)]">
          <Hexagon size={26} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Photon Home</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Sign in to your energy dashboard</p>
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
          className="h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] px-3.5 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="h-11 rounded-xl bg-[var(--accent)] font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
