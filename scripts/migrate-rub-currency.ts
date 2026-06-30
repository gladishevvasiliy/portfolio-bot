import { neon } from "@neondatabase/serverless";
import { env } from "../src/lib/env";

const sql = neon(env.DATABASE_URL);

async function main() {
  await sql`
    update portfolio_items
    set currency = 'RUB',
        updated_at = now()
    where currency is distinct from 'RUB';
  `;
  console.log("Portfolio item currencies are set to RUB.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
