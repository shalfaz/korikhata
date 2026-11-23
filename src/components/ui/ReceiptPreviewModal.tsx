"use client";

import { ExternalLink } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface ReceiptPreviewModalProps {
  receiptUrl: string | null;
  caption?: string;
  onClose: () => void;
}

export default function ReceiptPreviewModal({
  receiptUrl,
  caption,
  onClose,
}: ReceiptPreviewModalProps) {
  return (
    <Modal
      open={Boolean(receiptUrl)}
      onClose={onClose}
      title="Receipt / Cash Memo"
      subtitle={caption || "Uploaded voucher preview"}
      maxWidthClass="max-w-2xl"
    >
      {receiptUrl && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptUrl}
              alt="Receipt voucher"
              className="mx-auto max-h-[65vh] w-auto object-contain"
            />
          </div>
          <div className="flex justify-end">
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0369A1]"
            >
              <ExternalLink className="h-4 w-4" />
              Open Full Image
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
