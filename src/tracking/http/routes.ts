import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { db } from "../../db/client";
import { ingestTelemetry, type DatabaseConnection } from "../application/ingest-telemetry";
import type { TelemetryInput } from "../domain/telemetry";
import type { MachineToken } from "../../auth/token";
import type { RuntimeMetrics } from "../../observability/metrics";
import type { VehicleChannelManager } from "../../realtime/vehicle-channel-manager";

const telemetrySchema = {
  tags: ["Telemetry"],
  summary: "Ingest vehicle telemetry",
  description: "Requires a tracker M2M JWT whose vehicle_id claim matches body.vehicleId. Raw coordinates are preserved; processed coordinates are broadcast only after commit.",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    additionalProperties: false,
    required: ["vehicleId", "latitude", "longitude", "capturedAt"],
    properties: {
      vehicleId: { type: "string", format: "uuid" },
      latitude: { type: "number", minimum: -90, maximum: 90 },
      longitude: { type: "number", minimum: -180, maximum: 180 },
      accuracy: { type: "number", minimum: 0 },
      capturedAt: { type: "string", format: "date-time" }
    }
  },
  response: {
    201: {
      type: "object",
      required: ["rawTelemetryId"],
      properties: {
        rawTelemetryId: { type: "string" },
        processedLocationId: { type: "string" },
        deviationDistance: { type: "number", description: "Distance from raw point to planned route, in meters." }
      }
    },
    400: {
      type: "object",
      required: ["error", "message"],
      properties: { error: { type: "string" }, message: { type: "string" } }
    },
    401: {
      type: "object",
      required: ["error"],
      properties: { error: { type: "string", example: "Unauthorized" } }
    },
    403: {
      type: "object",
      required: ["error"],
      properties: { error: { type: "string", example: "Forbidden" } }
    },
    404: {
      type: "object",
      required: ["error", "message"],
      properties: { error: { type: "string" }, message: { type: "string" } }
    }
  }
} as const;

export async function registerTrackingRoutes(
  app: FastifyInstance,
  database: DatabaseConnection = db,
  channels?: VehicleChannelManager,
  metrics?: RuntimeMetrics
): Promise<void> {
  app.post<{ Body: TelemetryInput }>("/telemetry", { schema: telemetrySchema, preHandler: [authenticateTracker] }, async (request, reply) => {
    const startedAt = performance.now();
    const result = await ingestTelemetry(database, request.body);
    const processed = Boolean(result.processedLocationId);
    const durationMs = performance.now() - startedAt;

    metrics?.recordIngestion(processed, durationMs);
    request.log.info({ vehicleId: request.body.vehicleId, processed, durationMs }, "Telemetry ingested");

    if (result.processedLocationId && result.processedPosition && result.deviationDistance !== undefined) {
      channels?.publish({
        type: "tracking.position.updated",
        vehicleId: request.body.vehicleId,
        processedLocationId: result.processedLocationId.toString(),
        latitude: result.processedPosition.latitude,
        longitude: result.processedPosition.longitude,
        deviationDistance: result.deviationDistance,
        processedAt: result.processedPosition.processedAt
      });
    }

    return reply.code(201).send({
      rawTelemetryId: result.rawTelemetryId.toString(),
      processedLocationId: result.processedLocationId?.toString(),
      deviationDistance: result.deviationDistance
    });
  });
}

async function authenticateTracker(
  request: FastifyRequest<{ Body: TelemetryInput }>,
  reply: FastifyReply
): Promise<void> {
  let token: MachineToken;

  try {
    token = (await request.jwtVerify()) as MachineToken;
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  if (token.role !== "tracker" || token.vehicle_id !== request.body.vehicleId) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }
}
