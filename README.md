# Portfolio Bot

Telegram bot + public portfolio site.

## What it does

- You send photos to the bot.
- The bot asks for `title`, `description`, `size`, and `price`.
- The item is saved to Postgres.
- The public page renders all published items in order.

## Stack

- Next.js on Vercel
- Neon Postgres
- Vercel Blob for images, with a local filesystem fallback for development

## Environment

Copy `.env.example` to `.env.local` and fill:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `PUBLIC_APP_URL`
- `ADMIN_TELEGRAM_IDS`

Optional:

- `TELEGRAM_WEBHOOK_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `LOCAL_UPLOAD_DIR`

## Local development

```bash
npm install
npm run bootstrap:db
npm run dev
```

## Telegram webhook

Set the webhook to:

`POST https://your-domain/api/telegram/webhook`

If `TELEGRAM_WEBHOOK_SECRET` is set, Telegram should send the matching `X-Telegram-Bot-Api-Secret-Token` header.
