import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { sql } from "kysely";

import { closeDatabase, db } from "./client";

const migrationsDirectory = join(process.cwd(), "src", "db", "migrations");

async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const filename of files) {
    const applied = await sql<{ filename: string }>`
      SELECT filename FROM schema_migrations WHERE filename = ${filename}
    `.execute(db);

    if (applied.rows.length > 0) continue;

    const migration = await readFile(join(migrationsDirectory, filename), "utf8");

    await db.transaction().execute(async (trx) => {
      await sql.raw(migration).execute(trx);
      await sql`INSERT INTO schema_migrations (filename) VALUES (${filename})`.execute(trx);
    });

    console.log(`Applied ${filename}`);
  }
}

migrate()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
