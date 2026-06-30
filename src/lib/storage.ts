import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { env } from "@/lib/env";

export type StoredAsset = {
  url: string;
  kind: "blob" | "local";
};

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function storeImage(bytes: Uint8Array, originalName: string): Promise<StoredAsset> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(
      `portfolio/${crypto.randomUUID()}-${safeFileName(originalName)}`,
      Buffer.from(bytes),
      {
        access: "public",
        contentType: "image/jpeg",
        token: env.BLOB_READ_WRITE_TOKEN,
      },
    );
    return { url: blob.url, kind: "blob" };
  }

  const uploadDir = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `${crypto.randomUUID()}-${safeFileName(originalName)}`;
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, bytes);
  return { url: `/api/uploads/${encodeURIComponent(fileName)}`, kind: "local" };
}
