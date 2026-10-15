import type { Kysely, Transaction } from "kysely";

import type { Database } from "../../db/types";
import type { TelemetryInput, TelemetryResult } from "../domain/telemetry";
import { PostgresTelemetryRepository } from "../infrastructure/postgres-telemetry-repository";

export type DatabaseConnection = Kysely<Database> | Transaction<Database>;

export async function ingestTelemetry(
  database: DatabaseConnection,
  input: TelemetryInput
): Promise<TelemetryResult> {
  if (database.isTransaction) {
    return new PostgresTelemetryRepository(database).record(input);
  }

  return database.transaction().execute(async (transaction) => {
    const repository = new PostgresTelemetryRepository(transaction);
    return repository.record(input);
  });
}
