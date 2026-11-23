import { ApprovalStatus, ApprovalWorkflow, CompanyRole, WalletType } from "@/models";

export interface CategoryOption {
  value: string;
  label: string;
  bn: string;
}

export const INCOME_CATEGORIES: CategoryOption[] = [
  { value: "Product Sales", label: "Product Sales", bn: "পণ্য বিক্রয়" },
  { value: "Service Revenue", label: "Service Revenue", bn: "সেবা আয়" },
  { value: "Due Collection", label: "Due Collection", bn: "বাকি আদায়" },
  { value: "Online Order", label: "Online Order", bn: "অনলাইন অর্ডার" },
  { value: "Commission", label: "Commission", bn: "কমিশন" },
  { value: "Capital Injection", label: "Owner Capital", bn: "মূলধন জমা" },
  { value: "Other Income", label: "Other Income", bn: "অন্যান্য আয়" },
];

export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { value: "Inventory & Stock", label: "Inventory & Stock", bn: "মালামাল ক্রয়" },
  { value: "Supplier Payment", label: "Supplier Payment", bn: "সাপ্লায়ার পেমেন্ট" },
  { value: "Office / Shop Rent", label: "Office / Shop Rent", bn: "দোকান/অফিস ভাড়া" },
  { value: "Staff Salary", label: "Staff Salary", bn: "বেতন ও ভাতা" },
  { value: "Utilities & Internet", label: "Utilities & Internet", bn: "বিদ্যুৎ ও ইন্টারনেট" },
  { value: "Marketing & Ads", label: "Marketing & Ads", bn: "মার্কেটিং ও বিজ্ঞাপন" },
  { value: "Delivery & Transport", label: "Delivery & Transport", bn: "ডেলিভারি ও যাতায়াত" },
  { value: "Packaging", label: "Packaging", bn: "প্যাকেজিং" },
  { value: "Maintenance", label: "Maintenance", bn: "মেরামত" },
  { value: "Other Expense", label: "Other Expense", bn: "অন্যান্য ব্যয়" },
];

export const ROLE_LABELS: Record<
  CompanyRole,
  { label: string; shortLabel: string; description: string }
> = {
  COMPANY_SUPER_ADMIN: {
    label: "Company Super Admin (MD)",
    shortLabel: "Super Admin",
    description:
      "Full company governance, create branches & officers, final transaction approval, company-wide P&L",
  },
  HQ_ADMIN_OFFICER: {
    label: "HQ Admin Officer",
    shortLabel: "HQ Officer",
    description:
      "Head office checker: verify branch-approved entries, audit receipts, manage contacts & reports",
  },
  BRANCH_MANAGER: {
    label: "Branch / District Manager",
    shortLabel: "Branch Manager",
    description:
      "Manage assigned branch staff, approve or reject branch employee entries, view branch metrics",
  },
  EMPLOYEE: {
    label: "Employee / Field Staff",
    shortLabel: "Employee",
    description:
      "Submit daily income & expense entries with receipts and track personal approval status",
  },
};

export const APPROVAL_STATUS_LABELS: Record<
  ApprovalStatus,
  { label: string; tone: "amber" | "sky" | "indigo" | "emerald" | "rose" }
> = {
  PENDING_MANAGER: { label: "Pending Manager", tone: "amber" },
  PENDING_HQ: { label: "Pending HQ Audit", tone: "sky" },
  PENDING_FINAL: { label: "Pending Final Approval", tone: "indigo" },
  FINAL_APPROVED: { label: "Approved", tone: "emerald" },
  REJECTED: { label: "Rejected", tone: "rose" },
};

export const WORKFLOW_LABELS: Record<
  ApprovalWorkflow,
  { label: string; description: string }
> = {
  "1_STEP": {
    label: "1-Step (Direct Final)",
    description: "Employee → Company Super Admin",
  },
  "2_STEP": {
    label: "2-Step (Branch → Final)",
    description: "Employee → Branch Manager → Company Super Admin",
  },
  "3_STEP": {
    label: "3-Step (Full Maker-Checker)",
    description:
      "Employee → Branch Manager → HQ Admin Officer → Company Super Admin",
  },
};

export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  CASH: "Cash",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BANK: "Bank Account",
  OTHER: "Other",
};
