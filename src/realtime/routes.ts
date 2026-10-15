import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { MachineToken } from "../auth/token";
import { VehicleChannelManager } from "./vehicle-channel-manager";

interface SubscriptionQuery {
  vehicleId?: string;
}

export async function registerRealtimeRoutes(app: FastifyInstance, channels: VehicleChannelManager): Promise<void> {
  async function authenticateViewer(
    request: FastifyRequest<{ Querystring: SubscriptionQuery }>,
    reply: FastifyReply
  ): Promise<void> {
    const { vehicleId } = request.query;

    if (!vehicleId) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      const payload = (await request.jwtVerify()) as MachineToken;

      if (payload.role !== "viewer" || payload.vehicle_id !== vehicleId) {
        return reply.code(403).send({ error: "Forbidden" });
      }
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  }

  app.get<{ Querystring: SubscriptionQuery }>(
    "/ws/telemetry",
    { websocket: true, preValidation: [authenticateViewer] },
    (socket, request) => channels.subscribe(request.query.vehicleId as string, socket)
  );
}
