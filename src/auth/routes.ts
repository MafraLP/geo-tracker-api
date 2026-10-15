import type { FastifyInstance } from "fastify";

import { config } from "../config";
import type { MachineToken } from "./token";

const developmentTokenSchema = {
  tags: ["Development"],
  summary: "Issue a development M2M JWT",
  description: "Available only outside production. The token is scoped to one vehicle and role.",
  body: {
    type: "object",
    additionalProperties: false,
    required: ["vehicleId", "role"],
    properties: {
      vehicleId: { type: "string", format: "uuid" },
      role: { type: "string", enum: ["viewer", "tracker"] }
    }
  },
  response: {
    200: {
      type: "object",
      required: ["token"],
      properties: { token: { type: "string", description: "Signed JWT for development use." } }
    },
    400: {
      type: "object",
      required: ["error", "message"],
      properties: { error: { type: "string" }, message: { type: "string" } }
    }
  }
} as const;

export async function registerDevelopmentAuthRoutes(app: FastifyInstance): Promise<void> {
  if (config.nodeEnv === "production") return;

  app.post<{ Body: { vehicleId: string; role: MachineToken["role"] } }>(
    "/development/tokens",
    { schema: developmentTokenSchema },
    async (request) => ({
      token: await app.jwt.sign({ vehicle_id: request.body.vehicleId, role: request.body.role })
    })
  );
}
