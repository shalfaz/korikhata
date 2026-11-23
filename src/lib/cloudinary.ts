import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

let isConfigured = false;

function ensureCloudinaryConfigured() {
  if (isConfigured) return;

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary credentials are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.local."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  isConfigured = true;
}

export interface UploadedReceiptResult {
  secure_url: string;
  public_id: string;
  format: string;
  bytes: number;
}

/**
 * Uploads a receipt/cash memo buffer to Cloudinary scoped under the company's folder.
 */
export async function uploadReceiptBuffer(
  buffer: Buffer,
  companyId: string,
  mimeType: string
): Promise<UploadedReceiptResult> {
  ensureCloudinaryConfigured();

  const baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || "korikhata/receipts";
  const folder = `${baseFolder}/${companyId}`;
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const result: UploadApiResponse = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    transformation: [
      { width: 1600, height: 1600, crop: "limit" },
      { quality: "auto:good", fetch_format: "auto" },
    ],
  });

  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    format: result.format,
    bytes: result.bytes,
  };
}

export { cloudinary };
