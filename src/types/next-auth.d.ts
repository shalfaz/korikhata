import { DefaultSession, DefaultUser } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";
import { ApprovalWorkflow } from "@/models/Company";
import { CompanyRole, PlatformRole } from "@/models/User";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      employeeCode: string | null;
      image?: string | null;
      isPlatformAdmin: boolean;
      platformRole: PlatformRole | null;
      companyId: string | null;
      companyCode: string | null;
      companyName: string | null;
      approvalWorkflow: ApprovalWorkflow | null;
      branchId: string | null;
      branchName: string | null;
      role: CompanyRole;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    isPlatformAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    employeeCode: string | null;
    isPlatformAdmin: boolean;
    platformRole: PlatformRole | null;
    companyId: string | null;
    companyCode: string | null;
    companyName: string | null;
    approvalWorkflow: ApprovalWorkflow | null;
    branchId: string | null;
    branchName: string | null;
    role: CompanyRole;
  }
}
