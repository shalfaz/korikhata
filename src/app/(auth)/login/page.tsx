"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Building2, Loader2, Lock, Shield, User } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl") || "/";
  const callbackUrl = rawCallbackUrl.startsWith("/") ? rawCallbackUrl : "/";
  const setupDone = searchParams.get("setup") === "1";

  const [mode, setMode] = useState<"company" | "platform">("company");
  const [companyCode, setCompanyCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        companyCode: mode === "platform" ? "PLATFORM" : companyCode.trim().toUpperCase(),
        identifier: identifier.trim(),
        password,
        redirect: false,
      });

      if (!result || result.error || !result.ok) {
        setError(result?.error || "Invalid credentials.");
        setLoading(false);
        return;
      }

      window.location.assign(
        mode === "platform" ? "/platform-admin" : callbackUrl
      );
    } catch {
      setError("Unable to sign in right now. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#0A192F]">
          {mode === "platform" ? "Platform Admin Sign-In" : "Organization Sign-In"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {mode === "platform"
            ? "Sign in with your KoriKhata root administrator credentials."
            : "Enter your Company Code and Employee ID or Email."}
        </p>
      </div>

      {setupDone && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Platform Super Admin initialized. Switch to Platform Admin Sign-In below.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === "company" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Company Code
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                placeholder="e.g., SHILPALAY or LOOKLIFY"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium uppercase tracking-wide text-slate-900 placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 outline-none transition focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">
            {mode === "platform" ? "Admin Email" : "Employee ID or Email"}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={
                mode === "platform"
                  ? "admin@korikhata.com"
                  : "SHL-DHK-01 or name@company.com"
              }
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
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
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0284C7] py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#0369A1] disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "platform" ? "Open Platform Portal" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "company" ? "platform" : "company");
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 font-medium text-slate-500 transition hover:text-[#0A192F]"
        >
          <Shield className="h-3.5 w-3.5 text-[#0284C7]" />
          {mode === "company" ? "Platform Admin login" : "Back to Company login"}
        </button>

        <Link
          href="/register"
          className="font-medium text-[#0284C7] hover:underline"
        >
          Onboard company
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
