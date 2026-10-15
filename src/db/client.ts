import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { config } from "../config";
import type { Database } from "./types";

// Kysely keeps PostGIS SQL explicit and typed, without hiding spatial functions behind an incomplete ORM abstraction.
const pool = new Pool(config.db);

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool })
});

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
