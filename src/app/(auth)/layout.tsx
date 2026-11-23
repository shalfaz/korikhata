import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Minimalist Deep Navy Brand Panel (Desktop) */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[#0A192F] p-12 text-white lg:flex">
        {/* Subtle atmospheric glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 size-105 rounded-full bg-[#0284C7]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[#38BDF8]/10 blur-3xl" />

        {/* Subtle geometric ledger grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Brand Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0284C7] text-lg font-bold text-white shadow-xs">
            ৳
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            KoriKhata
          </span>
        </div>

        {/* Concise 2-line Headline + Subtle Abstract Ledger Accent */}
        <div className="relative z-10 max-w-md space-y-8">
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white">
            Clear daily accounts,
            <br />
            <span className="text-[#38BDF8]">zero complexity.</span>
          </h1>

          {/* Minimalist abstract ledger lines */}
          <div className="w-72 rounded-xl border border-white/8 bg-white/3 p-4 backdrop-blur-xs">
            <div className="flex items-center justify-between border-b border-white/7 pb-2.5">
              <div className="h-2 w-20 rounded-full bg-white/20" />
              <div className="h-2 w-12 rounded-full bg-[#38BDF8]/50" />
            </div>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                  <div className="h-1.5 w-24 rounded-full bg-white/15" />
                </div>
                <div className="h-1.5 w-14 rounded-full bg-emerald-400/40" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]/80" />
                  <div className="h-1.5 w-28 rounded-full bg-white/15" />
                </div>
                <div className="h-1.5 w-10 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70" />
                  <div className="h-1.5 w-16 rounded-full bg-white/15" />
                </div>
                <div className="h-1.5 w-12 rounded-full bg-white/15" />
              </div>
            </div>
          </div>
        </div>

        {/* Minimal Footer */}
        <p className="relative z-10 text-xs text-slate-400/80">
          © {new Date().getFullYear()} KoriKhata
        </p>
      </div>

      {/* Right Auth Form Panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        {/* Mobile Brand Header */}
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0284C7] text-base font-bold text-white">
            ৳
          </div>
          <span className="text-base font-semibold tracking-tight text-[#0A192F]">
            KoriKhata
          </span>
        </div>

        <div className="w-full max-w-100 rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}
