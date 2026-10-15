import { sql } from "kysely";
import WebSocket from "ws";

import { closeDatabase, db } from "../db/client";

const vehicleId = "22222222-2222-2222-2222-222222222222";
const baseUrl = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

interface TokenResponse {
  token: string;
}

interface PositionEvent {
  type: string;
  vehicleId: string;
  processedLocationId: string;
  latitude: number;
  longitude: number;
  deviationDistance: number;
  processedAt: string;
}

async function mintToken(role: "viewer" | "tracker"): Promise<string> {
  const response = await fetch(`${baseUrl}/development/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vehicleId, role })
  });

  if (!response.ok) throw new Error(`Could not mint ${role} token (${response.status})`);
  return (await response.json() as TokenResponse).token;
}

async function connectViewer(token: string): Promise<{ socket: WebSocket; event: Promise<PositionEvent> }> {
  const socket = new WebSocket(`ws://127.0.0.1:${process.env.PORT ?? 3000}/ws/telemetry?vehicleId=${vehicleId}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  const event = new Promise<PositionEvent>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for broadcast")), 5_000);

    socket.once("open", () => console.log("  ✓ Viewer WebSocket authenticated and subscribed"));
    socket.once("message", (message) => {
      clearTimeout(timeout);
      resolve(JSON.parse(message.toString()) as PositionEvent);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return { socket, event };
}

async function main(): Promise<void> {
  console.log("\nGeoTracker — JWT + WebSocket realtime demo\n");

  await sql`
    INSERT INTO vehicles (id, license_plate)
    VALUES (${vehicleId}, 'DEMO-RT-001')
    ON CONFLICT (id) DO NOTHING
  `.execute(db);
  await sql`
    INSERT INTO routes (vehicle_id, status, planned_path)
    SELECT ${vehicleId}, 'in_progress', ST_GeomFromText('LINESTRING(-46.635 -23.55, -46.63 -23.55)', 4326)
    WHERE NOT EXISTS (
      SELECT 1 FROM routes WHERE vehicle_id = ${vehicleId} AND status = 'in_progress'
    )
  `.execute(db);
  console.log("  ✓ Demo vehicle and active route ready");

  const viewerToken = await mintToken("viewer");
  const { socket, event } = await connectViewer(viewerToken);
  const trackerToken = await mintToken("tracker");

  const response = await fetch(`${baseUrl}/telemetry`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${trackerToken}`
    },
    body: JSON.stringify({
      vehicleId,
      latitude: -23.551,
      longitude: -46.632,
      accuracy: 8,
      capturedAt: new Date().toISOString()
    })
  });

  if (!response.ok) throw new Error(`Telemetry ingestion failed (${response.status}): ${await response.text()}`);
  console.log("  ✓ Tracker telemetry accepted and committed");

  const broadcast = await event;
  socket.close();

  console.log("\n  Broadcast received (processed coordinates only):");
  console.table({
    event: broadcast.type,
    vehicleId: broadcast.vehicleId,
    latitude: broadcast.latitude,
    longitude: broadcast.longitude,
    deviationMeters: broadcast.deviationDistance.toFixed(2),
    processedAt: broadcast.processedAt
  });
  console.log("  ✓ End-to-end realtime flow verified\n");
}

main()
  .catch((error: unknown) => {
    console.error("  ✗ Demo failed", error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
