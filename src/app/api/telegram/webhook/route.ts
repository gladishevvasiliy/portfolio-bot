import { env, isAdminTelegramId } from "@/lib/env";
import { handleTelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const update = await request.json();
  const candidateId =
    update?.message?.from?.id ??
    update?.callback_query?.from?.id;

  if (candidateId !== undefined && !isAdminTelegramId(candidateId)) {
    return Response.json({ ok: true, skipped: true });
  }

  await handleTelegramUpdate(update);
  return Response.json({ ok: true });
}
