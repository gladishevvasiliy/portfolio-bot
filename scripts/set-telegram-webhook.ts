import { env } from "../src/lib/env";

async function main() {
  const webhookUrl = new URL("/api/telegram/webhook", env.PUBLIC_APP_URL).toString();
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set webhook: ${response.status} ${await response.text()}`);
  }

  console.log(await response.json());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
