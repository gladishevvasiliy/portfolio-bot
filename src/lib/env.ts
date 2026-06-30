export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "placeholder",
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS ?? "",
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR ?? "./data/uploads",
} as const;

export function isAdminTelegramId(id: number | string | undefined) {
  if (id === undefined) return false;
  return env.ADMIN_TELEGRAM_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(String(id));
}
