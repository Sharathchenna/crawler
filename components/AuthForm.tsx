"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="hero-glow mx-auto mt-24 w-full max-w-sm rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)] p-6"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      {children}
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState(mode === "login" ? "demo@hoard.local" : "");
  const [password, setPassword] = useState(mode === "login" ? "password" : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        router.push("/library");
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Is it running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Hoard</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        {mode === "login" ? "Welcome back. Your library kept everything." : "Save anything as Markdown. Start hoarding."}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-[var(--text-body)]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-[var(--text-body)]">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-[var(--red)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-[6px] bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hi)] hover:shadow-[0_0_16px_var(--accent-glow)] disabled:opacity-50"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-[13px] text-[var(--text-muted)]">
        {mode === "login" ? (
          <>No account? <Link href="/signup" className="text-[var(--text)] underline">Sign up</Link></>
        ) : (
          <>Have an account? <Link href="/login" className="text-[var(--text)] underline">Sign in</Link></>
        )}
      </p>
      {mode === "login" && (
        <p className="mt-2 font-mono text-[11px] text-[var(--text-faint)]">demo: demo@hoard.local / password</p>
      )}
    </Card>
  );
}
