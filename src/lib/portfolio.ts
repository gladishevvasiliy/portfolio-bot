import crypto from "node:crypto";
import { sql } from "@/lib/db";

export type PortfolioItemStatus = "draft" | "published" | "archived";
export type ConversationStep = "awaiting_photos" | "awaiting_title" | "awaiting_description" | "awaiting_size" | "awaiting_price";

export type PortfolioItemRecord = {
  id: string;
  title: string;
  description: string;
  size: string;
  price_cents: number;
  currency: string;
  status: PortfolioItemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type PortfolioImageRecord = {
  id: string;
  item_id: string;
  blob_url: string;
  source: string;
  telegram_file_id: string | null;
  alt: string | null;
  sort_order: number;
  created_at: string;
};

export type ConversationRecord = {
  chat_id: string;
  admin_id: string;
  item_id: string | null;
  step: ConversationStep;
  updated_at: string;
};

export async function createDraftItem() {
  const id = crypto.randomUUID();
  const rows = await sql`
    insert into portfolio_items (id, status, currency, sort_order)
    values (${id}, 'draft', 'RUB', extract(epoch from now())::int)
    returning *;
  `;
  return (rows as PortfolioItemRecord[])[0];
}

export async function createOrReplaceConversation(params: {
  chatId: string;
  adminId: string;
  itemId: string;
  step: ConversationStep;
}) {
  const rows = await sql`
    insert into bot_conversations (chat_id, admin_id, item_id, step)
    values (${params.chatId}::bigint, ${params.adminId}::bigint, ${params.itemId}, ${params.step})
    on conflict (chat_id) do update
      set admin_id = excluded.admin_id,
          item_id = excluded.item_id,
          step = excluded.step,
          updated_at = now()
    returning *;
  `;
  return (rows as ConversationRecord[])[0];
}

export async function getConversation(chatId: string) {
  const rows = await sql`
    select * from bot_conversations where chat_id = ${chatId}::bigint limit 1;
  `;
  return (rows as ConversationRecord[])[0] ?? null;
}

export async function clearConversation(chatId: string) {
  await sql`delete from bot_conversations where chat_id = ${chatId}::bigint;`;
}

export async function updateItem(id: string, patch: Partial<Pick<PortfolioItemRecord, "title" | "description" | "size" | "price_cents" | "currency" | "status">>) {
  const rows = await sql`
    update portfolio_items
    set title = coalesce(${patch.title ?? null}, title),
        description = coalesce(${patch.description ?? null}, description),
        size = coalesce(${patch.size ?? null}, size),
        price_cents = coalesce(${patch.price_cents ?? null}, price_cents),
        currency = coalesce(${patch.currency ?? null}, currency),
        status = coalesce(${patch.status ?? null}, status),
        updated_at = now()
    where id = ${id}
    returning *;
  `;
  return ((rows as PortfolioItemRecord[])[0]) ?? null;
}

export async function getItem(id: string) {
  const rows = await sql`
    select * from portfolio_items where id = ${id} limit 1;
  `;
  return (rows as PortfolioItemRecord[])[0] ?? null;
}

export async function getPublishedItems() {
  return (await sql`
    select * from portfolio_items
    where status = 'published'
    order by coalesce(published_at, created_at) desc, sort_order desc;
  `) as PortfolioItemRecord[];
}

export async function addImage(params: {
  itemId: string;
  blobUrl: string;
  source: string;
  telegramFileId?: string;
  alt?: string;
}) {
  const rows = await sql`
    insert into portfolio_item_images (id, item_id, blob_url, source, telegram_file_id, alt, sort_order)
    values (
      ${crypto.randomUUID()},
      ${params.itemId},
      ${params.blobUrl},
      ${params.source},
      ${params.telegramFileId ?? null},
      ${params.alt ?? null},
      coalesce((select max(sort_order) + 1 from portfolio_item_images where item_id = ${params.itemId}), 0)
    )
    returning *;
  `;
  return (rows as PortfolioImageRecord[])[0];
}

export async function getImagesByItemIds(itemIds: string[]) {
  if (itemIds.length === 0) return [];
  return (await sql`
    select * from portfolio_item_images
    where item_id = any(${itemIds}::text[])
    order by item_id asc, sort_order asc, created_at asc;
  `) as PortfolioImageRecord[];
}

export async function publishItem(itemId: string) {
  const rows = await sql`
    update portfolio_items
    set status = 'published',
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = ${itemId}
    returning *;
  `;
  return (rows as PortfolioItemRecord[])[0] ?? null;
}

export function parsePriceToCents(input: string) {
  const normalized = input
    .trim()
    .replace(/\s+/g, "")
    .replace(/₽/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}
