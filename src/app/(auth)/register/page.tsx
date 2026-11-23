import Link from "next/link";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";

export default function RegisterDisabledPage() {
  return (
    <div className="space-y-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-[#0284C7]">
        <Building2 className="h-5 w-5" />
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#0A192F]">
          Enterprise Onboarding Only
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Public self-signup is disabled on KoriKhata. To onboard your
          organization with branch governance and multi-level approval
          workflows, please contact the{" "}
          <span className="font-medium text-slate-700">
            KoriKhata Platform Administrator
          </span>{" "}
          to receive your unique Company Code and MD credentials.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0284C7]" />
          <p>
            Are you the platform owner setting up KoriKhata for the first time?{" "}
            <Link
              href="/setup"
              className="font-medium text-[#0284C7] hover:underline"
            >
              Initialize Platform Super Admin →
            </Link>
          </p>
        </div>
      </div>

      <Link
        href="/login"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0284C7] py-2.5 text-sm font-medium text-white transition hover:bg-[#0369A1]"
      >
        <ArrowLeft className="h-4 w-4" />
        Return to Sign In
      </Link>
    </div>
  );
}
