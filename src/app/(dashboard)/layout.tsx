import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.isPlatformAdmin) {
    redirect("/platform-admin");
  }

  if (!session.user.companyId) {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
