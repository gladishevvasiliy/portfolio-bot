import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: filePathParts } = await params;
  const fileName = filePathParts.join("/");
  const uploadDir = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  const fullPath = path.join(uploadDir, fileName);
  const file = await fs.readFile(fullPath).catch(() => null);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(file, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
