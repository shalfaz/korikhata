import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IBranch extends Document {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  code: string;
  address?: string;
  managerId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema = new Schema<IBranch>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "companyId is required for multi-tenant isolation"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Branch or District name is required"],
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: [true, "Branch code is required"],
      uppercase: true,
      trim: true,
      maxlength: 30,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    managerId: {
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

BranchSchema.index({ companyId: 1, code: 1 }, { unique: true });
BranchSchema.index({ companyId: 1, isActive: 1, name: 1 });

export const Branch: Model<IBranch> =
  mongoose.models.Branch || mongoose.model<IBranch>("Branch", BranchSchema);

export default Branch;
