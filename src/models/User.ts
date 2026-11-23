import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const COMPANY_ROLES = [
  "COMPANY_SUPER_ADMIN",
  "HQ_ADMIN",
  "BRANCH_ADMIN",
  "BRANCH_MANAGER",
  "EMPLOYEE",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const ROLE_RANK: Record<CompanyRole, number> = {
  COMPANY_SUPER_ADMIN: 5,
  HQ_ADMIN: 4,
  BRANCH_ADMIN: 3,
  BRANCH_MANAGER: 2,
  EMPLOYEE: 1,
};

export const PLATFORM_ROLES = ["ROOT_OWNER", "PLATFORM_ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const AUTH_PROVIDERS = ["credentials"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  employeeCode?: string;
  passwordHash?: string;
  image?: string;
  phone?: string;
  authProvider: AuthProvider;
  isPlatformAdmin: boolean;
  platformRole?: PlatformRole;
  companyId?: Types.ObjectId;
  branchId?: Types.ObjectId;
  role: CompanyRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    employeeCode: {
      type: String,
      uppercase: true,
      trim: true,
      maxlength: 40,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    image: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: "credentials",
    },
    isPlatformAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    platformRole: {
      type: String,
      enum: PLATFORM_ROLES,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
    role: {
      type: String,
      enum: COMPANY_ROLES,
      default: "EMPLOYEE",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ companyId: 1, isActive: 1, role: 1 });
UserSchema.index({ companyId: 1, branchId: 1, isActive: 1 });
UserSchema.index(
  { companyId: 1, employeeCode: 1 },
  { unique: true, sparse: true }
);

// Guard against stale Mongoose model enum cache during Next.js hot-reloads
if (mongoose.models.User) {
  const cachedRolePath = mongoose.models.User.schema.path("role") as
    | { enumValues?: string[] }
    | undefined;
  const cachedEnums = cachedRolePath?.enumValues || [];
  if (
    !cachedEnums.includes("HQ_ADMIN") ||
    !cachedEnums.includes("BRANCH_ADMIN")
  ) {
    delete mongoose.models.User;
  }
}

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
