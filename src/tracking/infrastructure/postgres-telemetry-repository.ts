import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "../../db/types";
import type { TelemetryInput, TelemetryResult } from "../domain/telemetry";

type DatabaseConnection = Kysely<Database> | Transaction<Database>;

interface ProcessedLocationRow {
  id: bigint;
  deviationDistance: number;
  latitude: number;
  longitude: number;
  processedAt: Date;
}

export class PostgresTelemetryRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async record(input: TelemetryInput): Promise<TelemetryResult> {
    const rawTelemetry = await this.database
      .insertInto("raw_telemetry")
      .values({
        vehicle_id: input.vehicleId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy ?? null,
        captured_at: new Date(input.capturedAt)
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const route = await this.database
      .selectFrom("routes")
      .select(["id", "planned_path"])
      .where("vehicle_id", "=", input.vehicleId)
      .where("status", "=", "in_progress")
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    if (!route) return { rawTelemetryId: rawTelemetry.id };

    const processed = await sql<ProcessedLocationRow>`
      INSERT INTO processed_locations (
        raw_telemetry_id,
        vehicle_id,
        route_id,
        snapped_position,
        deviation_distance
      )
      VALUES (
        ${rawTelemetry.id},
        ${input.vehicleId},
        ${route.id},
        ST_ClosestPoint(
          ${route.planned_path}::geometry,
          ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)
        ),
        ST_Distance(
          ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
          ${route.planned_path}::geography
        )
      )
      RETURNING
        id,
        deviation_distance AS "deviationDistance",
        ST_Y(snapped_position) AS latitude,
        ST_X(snapped_position) AS longitude,
        processed_at AS "processedAt"
    `.execute(this.database);

    const location = processed.rows[0];

    return {
      rawTelemetryId: rawTelemetry.id,
      processedLocationId: location.id,
      deviationDistance: location.deviationDistance,
      processedPosition: {
        latitude: location.latitude,
        longitude: location.longitude,
        processedAt: location.processedAt.toISOString()
      }
    };
  }
}
