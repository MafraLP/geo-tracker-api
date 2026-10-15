import Fastify from "fastify";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";

import { registerDevelopmentAuthRoutes } from "./auth/routes";
import { config } from "./config";
import { db } from "./db/client";
import { RuntimeMetrics } from "./observability/metrics";
import { VehicleChannelManager } from "./realtime/vehicle-channel-manager";
import { registerRealtimeRoutes } from "./realtime/routes";
import type { DatabaseConnection } from "./tracking/application/ingest-telemetry";
import { registerTrackingRoutes } from "./tracking/http/routes";

export function buildApp(
  database: DatabaseConnection = db,
  channels = new VehicleChannelManager(),
  metrics = new RuntimeMetrics()
) {
  const app = Fastify({ logger: true });

  app.register(swagger, {
    openapi: {
      info: {
        title: "GeoTracker API",
        description: "Real-time, PostGIS-backed telemetry API for last-mile delivery operations.",
        version: "1.0.0"
      },
      tags: [
        { name: "Telemetry", description: "Authenticated vehicle telemetry ingestion." },
        { name: "Development", description: "Development-only utilities. Disabled in production." }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "M2M JWT with vehicle_id and role claims."
          }
        }
      }
    }
  });
  app.register(swaggerUi, { routePrefix: "/docs" });
  app.register(jwt, { secret: config.jwtSecret });
  app.register(websocket);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/metrics", async (_, reply) =>
    reply.header("content-type", "text/plain; version=0.0.4").send(metrics.render(channels.connectionCount()))
  );
  app.register(registerDevelopmentAuthRoutes);
  app.register(async (instance) => registerTrackingRoutes(instance, database, channels, metrics));
  app.register(async (instance) => registerRealtimeRoutes(instance, channels));

  app.setErrorHandler((error, request, reply) => {
    if ((error as { validation?: unknown }).validation) {
      metrics.recordValidationFailure();
      return reply.code(400).send({ error: "Bad Request", message: "Invalid request payload" });
    }

    if ((error as { code?: string }).code === "23503") {
      return reply.code(404).send({ error: "Not Found", message: "Vehicle not found" });
    }

    metrics.recordFailure();
    request.log.error(error);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  return app;
}
