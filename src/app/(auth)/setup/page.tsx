"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  User,
} from "lucide-react";

export default function PlatformSetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [setupKeyConfigured, setSetupKeyConfigured] = useState(true);

  const [setupKey, setSetupKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setInitialized(Boolean(data.initialized));
        if (typeof data.setupKeyConfigured === "boolean") {
          setSetupKeyConfigured(data.setupKeyConfigured);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupKey: setupKey.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Setup failed.");
      }

      router.push("/login?setup=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete setup.");
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (initialized) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#0A192F]">
            Platform Already Initialized
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            A Platform Super Admin account already exists. Sign in via the
            Platform Admin login tab.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-[#0284C7] py-2.5 text-sm font-medium text-white hover:bg-[#0369A1]"
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0A192F] text-[#38BDF8]">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#0A192F]">
            Platform Super Admin Setup
          </h2>
          <p className="text-xs text-slate-500">
            One-time initialization protected by your server setup key
          </p>
        </div>
      </div>

      {!setupKeyConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <code>PLATFORM_SETUP_KEY</code> is not set in <code>.env.local</code>.
          Add it and restart the server before continuing.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Platform Setup Key
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              autoComplete="off"
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              placeholder="Enter PLATFORM_SETUP_KEY from .env.local"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Full name
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Platform Owner"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Root admin email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@korikhata.com"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Master password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !setupKeyConfigured}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0A192F] py-2.5 text-sm font-medium text-white transition hover:bg-[#112240] disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Initialize Platform Admin
        </button>
      </form>
    </div>
  );
}
