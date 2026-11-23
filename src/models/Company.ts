import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const WALLET_TYPES = [
  "CASH",
  "BKASH",
  "NAGAD",
  "ROCKET",
  "BANK",
  "OTHER",
] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const SUBSCRIPTION_PLANS = [
  "FREE",
  "STARTER",
  "PRO",
  "ENTERPRISE",
] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const APPROVAL_WORKFLOWS = ["1_STEP", "2_STEP", "3_STEP"] as const;
export type ApprovalWorkflow = (typeof APPROVAL_WORKFLOWS)[number];

export interface ICompanyWallet {
  _id?: Types.ObjectId;
  name: string;
  type: WalletType;
  accountNumber?: string;
  openingBalance: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface ICompanySubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  expiresAt?: Date;
}

export interface ICompany extends Document {
  _id: Types.ObjectId;
  name: string;
  companyCode: string;
  slug: string;
  businessType?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  currencySymbol: string;
  approvalWorkflow: ApprovalWorkflow;
  voucherSequence: number;
  wallets: ICompanyWallet[];
  subscription: ICompanySubscription;
  ownerId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyWalletSchema = new Schema<ICompanyWallet>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    type: {
      type: String,
      enum: WALLET_TYPES,
      required: true,
      default: "CASH",
    },
    accountNumber: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const CompanySubscriptionSchema = new Schema<ICompanySubscription>(
  {
    plan: {
      type: String,
      enum: SUBSCRIPTION_PLANS,
      default: "ENTERPRISE",
      required: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: "ACTIVE",
      required: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  { _id: false }
);

const CompanySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      maxlength: 120,
    },
    companyCode: {
      type: String,
      required: [true, "Unique companyCode is required"],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      maxlength: 30,
    },
    slug: {
      type: String,
      required: [true, "Company slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    businessType: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    currency: {
      type: String,
      default: "BDT",
      uppercase: true,
      trim: true,
    },
    currencySymbol: {
      type: String,
      default: "৳",
      trim: true,
    },
    approvalWorkflow: {
      type: String,
      enum: APPROVAL_WORKFLOWS,
      default: "3_STEP",
      required: true,
    },
    voucherSequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    wallets: {
      type: [CompanyWalletSchema],
      default: () => [
        { name: "Cash in Hand", type: "CASH", openingBalance: 0, isDefault: true, isActive: true },
        { name: "bKash", type: "BKASH", openingBalance: 0, isDefault: false, isActive: true },
        { name: "Nagad", type: "NAGAD", openingBalance: 0, isDefault: false, isActive: true },
        { name: "Bank Account", type: "BANK", openingBalance: 0, isDefault: false, isActive: true },
      ],
    },
    subscription: {
      type: CompanySubscriptionSchema,
      default: () => ({ plan: "ENTERPRISE", status: "ACTIVE" }),
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

CompanySchema.index({ "subscription.status": 1, "subscription.plan": 1 });

export const Company: Model<ICompany> =
  mongoose.models.Company || mongoose.model<ICompany>("Company", CompanySchema);

export default Company;
