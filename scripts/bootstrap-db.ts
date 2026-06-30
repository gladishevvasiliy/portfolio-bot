import { neon } from "@neondatabase/serverless";
import { env } from "../src/lib/env";

const sql = neon(env.DATABASE_URL);

async function main() {
  await sql`
    create table if not exists portfolio_items (
      id text primary key,
      title text not null default '',
      description text not null default '',
      size text not null default '',
      price_cents integer not null default 0,
      currency text not null default 'USD',
      status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      published_at timestamptz
    );
  `;
  await sql`
    create table if not exists portfolio_item_images (
      id text primary key,
      item_id text not null references portfolio_items(id) on delete cascade,
      blob_url text not null,
      source text not null default 'telegram',
      telegram_file_id text,
      alt text,
      sort_order integer not null default 0,
      created_at timestamptz not null default now()
    );
  `;
  await sql`
    create table if not exists bot_conversations (
      chat_id bigint primary key,
      admin_id bigint not null,
      item_id text references portfolio_items(id) on delete set null,
      step text not null,
      updated_at timestamptz not null default now()
    );
  `;
  await sql`
    create index if not exists portfolio_items_status_created_at_idx
      on portfolio_items (status, created_at desc);
  `;
  await sql`
    create index if not exists portfolio_item_images_item_id_sort_order_idx
      on portfolio_item_images (item_id, sort_order asc);
  `;
  console.log("Database schema is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
