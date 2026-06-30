import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

export const sql = neon(env.DATABASE_URL);
