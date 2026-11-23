import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const CONTACT_ROLES = ["CUSTOMER", "SUPPLIER", "BOTH"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const DUE_DIRECTIONS = ["RECEIVABLE", "PAYABLE"] as const;
export type DueDirection = (typeof DUE_DIRECTIONS)[number];

export const DUE_ENTRY_TYPES = [
  "DUE_ADDED",
  "PAYMENT_RECEIVED",
  "PAYMENT_MADE",
] as const;
export type DueEntryType = (typeof DUE_ENTRY_TYPES)[number];

export interface IDueHistoryEntry {
  _id?: Types.ObjectId;
  entryType: DueEntryType;
  direction: DueDirection;
  amount: number;
  date: Date;
  note?: string;
  transactionId?: Types.ObjectId;
  recordedBy: Types.ObjectId;
}

export interface IContact extends Document {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  role: ContactRole;
  /** Total amount this contact currently owes the company (আমরা পাবো / Receivable) */
  receivableBalance: number;
  /** Total amount the company currently owes this contact (আমরা দেবো / Payable) */
  payableBalance: number;
  /** Optional target date for next payment reminder */
  nextDueDate?: Date;
  dueHistory: IDueHistoryEntry[];
  lastActivityAt: Date;
  notes?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DueHistoryEntrySchema = new Schema<IDueHistoryEntry>(
  {
    entryType: {
      type: String,
      enum: DUE_ENTRY_TYPES,
      required: true,
    },
    direction: {
      type: String,
      enum: DUE_DIRECTIONS,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than zero"],
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: true }
);

const ContactSchema = new Schema<IContact>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "companyId is required for multi-tenant isolation"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Contact name is required"],
      trim: true,
      maxlength: 120,
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
    role: {
      type: String,
      enum: CONTACT_ROLES,
      default: "CUSTOMER",
      required: true,
    },
    receivableBalance: {
      type: Number,
      default: 0,
      min: [0, "Receivable balance cannot be negative"],
    },
    payableBalance: {
      type: Number,
      default: 0,
      min: [0, "Payable balance cannot be negative"],
    },
    nextDueDate: {
      type: Date,
    },
    dueHistory: {
      type: [DueHistoryEntrySchema],
      default: [],
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
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

// Compound multi-tenant indexes for fast Baki Khata (Dues) queries & search
ContactSchema.index({ companyId: 1, isActive: 1, name: 1 });
ContactSchema.index({ companyId: 1, phone: 1 });
ContactSchema.index({ companyId: 1, isActive: 1, receivableBalance: -1 });
ContactSchema.index({ companyId: 1, isActive: 1, payableBalance: -1 });
ContactSchema.index({ companyId: 1, isActive: 1, lastActivityAt: -1 });

export const Contact: Model<IContact> =
  mongoose.models.Contact || mongoose.model<IContact>("Contact", ContactSchema);

export default Contact;
