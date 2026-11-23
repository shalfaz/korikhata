import type { Metadata } from "next";
import AuthProvider from "@/components/providers/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "KoriKhata (কড়িখাতা) — Simple Business Ledger & Cashflow",
  description:
    "Ultra-simple multi-tenant financial ledger for business owners. Track daily income, expenses, dues (বাকি খাতা), receipts, and real-time profit & loss without an accountant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
