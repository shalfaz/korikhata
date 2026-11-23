import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { WALLET_TYPES, WalletType } from "./Company";
import { COMPANY_ROLES, CompanyRole } from "./User";

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const APPROVAL_STATUSES = [
  "PENDING_MANAGER",
  "PENDING_HQ",
  "PENDING_FINAL",
  "FINAL_APPROVED",
  "REJECTED",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_ACTIONS = ["SUBMITTED", "APPROVED", "REJECTED"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export interface ITransactionWallet {
  walletId?: Types.ObjectId;
  name: string;
  type: WalletType;
}

export interface ITransactionReceipt {
  url: string;
  publicId: string;
  format?: string;
  bytes?: number;
}

export interface IApprovalHistoryEntry {
  _id?: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  role: CompanyRole;
  action: ApprovalAction;
  note?: string;
  timestamp: Date;
}

export interface ITransaction extends Document {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  branchId?: Types.ObjectId;
  voucherNo?: string;
  referenceNo?: string;
  type: TransactionType;
  amount: number;
  category: string;
  wallet: ITransactionWallet;
  destinationWallet?: ITransactionWallet;
  date: Date;
  note?: string;
  contactId?: Types.ObjectId;
  receipt?: ITransactionReceipt;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  approvalHistory: IApprovalHistoryEntry[];
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionWalletSchema = new Schema<ITransactionWallet>(
  {
    walletId: {
      type: Schema.Types.ObjectId,
    },
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
  },
  { _id: false }
);

const TransactionReceiptSchema = new Schema<ITransactionReceipt>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    format: {
      type: String,
      trim: true,
    },
    bytes: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }
);

const ApprovalHistoryEntrySchema = new Schema<IApprovalHistoryEntry>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: COMPANY_ROLES,
      required: true,
    },
    action: {
      type: String,
      enum: APPROVAL_ACTIONS,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: true }
);

const TransactionSchema = new Schema<ITransaction>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "companyId is required for multi-tenant isolation"],
      index: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
    voucherNo: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 40,
      index: true,
    },
    referenceNo: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: [true, "Transaction type is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than zero"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      maxlength: 80,
    },
    wallet: {
      type: TransactionWalletSchema,
      required: [true, "Wallet information is required"],
    },
    destinationWallet: {
      type: TransactionWalletSchema,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
    },
    receipt: {
      type: TransactionReceiptSchema,
    },
    approvalStatus: {
      type: String,
      enum: APPROVAL_STATUSES,
      default: "PENDING_MANAGER",
      required: true,
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    approvalHistory: {
      type: [ApprovalHistoryEntrySchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ companyId: 1, isDeleted: 1, approvalStatus: 1, date: -1 });
TransactionSchema.index({ companyId: 1, branchId: 1, isDeleted: 1, approvalStatus: 1, date: -1 });
TransactionSchema.index({ companyId: 1, createdBy: 1, isDeleted: 1, date: -1 });
TransactionSchema.index({ companyId: 1, isDeleted: 1, type: 1, date: -1 });

// Guard against stale Mongoose model enum cache during Next.js hot-reloads
if (mongoose.models.Transaction) {
  const cachedTypePath = mongoose.models.Transaction.schema.path("type") as
    | { enumValues?: string[] }
    | undefined;
  if (!cachedTypePath?.enumValues?.includes("TRANSFER")) {
    delete mongoose.models.Transaction;
  }
}

export const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);

export default Transaction;
