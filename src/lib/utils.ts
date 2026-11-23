import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names cleanly.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as Bangladeshi Taka (BDT) using the South Asian numbering format.
 * Example: 12500 -> "৳ 12,500", -4500 -> "-৳ 4,500"
 */
export function formatBDT(amount: number, showDecimals = false): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const isNegative = safeAmount < 0;
  const absolute = Math.abs(safeAmount);

  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(absolute);

  return `${isNegative ? "-" : ""}৳ ${formatted}`;
}

/**
 * Formats a Date or ISO string to readable short date: "22 Nov 2026"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Formats a Date or ISO string to date + time: "22 Nov 2026, 09:15 PM"
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Returns YYYY-MM-DD in local time for HTML <input type="date" />
 */
export function toDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generates a URL-safe unique slug from a company name.
 */
export function generateCompanySlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "company"}-${suffix}`;
}

/**
 * Normalizes Bangladeshi or international phone numbers for WhatsApp wa.me links.
 */
export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("01") && digits.length === 11) return `88${digits}`;
  if (digits.startsWith("1") && digits.length === 10) return `880${digits}`;
  return digits;
}

/**
 * Builds a 1-click WhatsApp payment reminder URL with a polite Bangla + English message.
 */
export function generateWhatsAppReminderUrl(
  phone: string,
  customerName: string,
  dueAmount: number,
  companyName: string
): string {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const formattedDue = formatBDT(dueAmount);

  const message = [
    `আসসালামু আলাইকুম ${customerName},`,
    ``,
    `${companyName}-এর পক্ষ থেকে বিনীত অনুরোধ: আপনার বর্তমান বকেয়া (Due) পরিমাণ ${formattedDue}।`,
    `সুবিধামতো সময়ে পরিশোধ করলে আমরা কৃতজ্ঞ থাকব।`,
    ``,
    `Friendly reminder from ${companyName}: Your current outstanding balance is ${formattedDue}. Please settle at your convenience.`,
    ``,
    `ধন্যবাদ / Thank you!`,
  ].join("\n");

  const encoded = encodeURIComponent(message);
  return normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}
