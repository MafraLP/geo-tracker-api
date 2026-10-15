import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "kysely";

import { buildApp } from "../src/app";
import { closeDatabase, db } from "../src/db/client";
import { VehicleChannelManager } from "../src/realtime/vehicle-channel-manager";

test.after(async () => closeDatabase());

test("rejects telemetry without a tracker token", async () => {
  const app = buildApp();
  await app.ready();

  const response = await app.inject({
    method: "POST",
    url: "/telemetry",
    payload: {
      vehicleId: "11111111-1111-1111-1111-111111111111",
      latitude: -23.551,
      longitude: -46.632,
      capturedAt: "2026-10-15T12:00:00.000Z"
    }
  });
  await app.close();

  assert.equal(response.statusCode, 401);
});

test("returns not found for an authenticated unknown vehicle", async () => {
  const app = buildApp();
  await app.ready();
  const vehicleId = crypto.randomUUID();
  const token = await app.jwt.sign({ vehicle_id: vehicleId, role: "tracker" });

  const response = await app.inject({
    method: "POST",
    url: "/telemetry",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      vehicleId,
      latitude: -23.551,
      longitude: -46.632,
      capturedAt: "2026-10-15T12:00:00.000Z"
    }
  });
  await app.close();

  assert.equal(response.statusCode, 404);
});

test("exposes Prometheus-compatible runtime metrics", async () => {
  const app = buildApp();
  await app.ready();

  const response = await app.inject({ method: "GET", url: "/metrics" });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /geo_tracker_telemetry_ingestions_total 0/);
  assert.match(response.body, /geo_tracker_websocket_connections 0/);
});

test("stores raw telemetry and snaps it to the active route", async () => {
  const rollback = new Error("rollback test transaction");

  await assert.rejects(
    db.transaction().execute(async (transaction) => {
      const vehicle = await transaction
        .insertInto("vehicles")
        .values({ license_plate: `TEST-${crypto.randomUUID().slice(0, 8)}`, status: "active" })
        .returning("id")
        .executeTakeFirstOrThrow();

      await sql`
        INSERT INTO routes (vehicle_id, status, planned_path)
        VALUES (
          ${vehicle.id},
          'in_progress',
          ST_GeomFromText('LINESTRING(-46.635 -23.55, -46.63 -23.55)', 4326)
        )
      `.execute(transaction);

      const channels = new VehicleChannelManager();
      const app = buildApp(transaction, channels);
      await app.ready();
      const messages: string[] = [];
      channels.subscribe(vehicle.id, {
        OPEN: 1,
        readyState: 1,
        send: (payload) => messages.push(payload),
        on: () => undefined
      });
      const token = await app.jwt.sign({ vehicle_id: vehicle.id, role: "tracker" });
      const response = await app.inject({
        method: "POST",
        url: "/telemetry",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          vehicleId: vehicle.id,
          latitude: -23.551,
          longitude: -46.632,
          accuracy: 8,
          capturedAt: "2026-10-15T12:00:00.000Z"
        }
      });
      await app.close();

      assert.equal(response.statusCode, 201);
      const result = response.json() as {
        rawTelemetryId: string;
        processedLocationId?: string;
        deviationDistance?: number;
      };
      assert.ok(BigInt(result.rawTelemetryId) > 0n);
      assert.ok(result.processedLocationId);
      assert.ok((result.deviationDistance ?? 0) > 100);
      const broadcast = JSON.parse(messages[0]) as Record<string, unknown>;
      assert.equal(broadcast.type, "tracking.position.updated");
      assert.equal(broadcast.vehicleId, vehicle.id);
      assert.equal(broadcast.processedLocationId, result.processedLocationId);
      assert.equal(broadcast.latitude, -23.55);
      assert.equal(broadcast.longitude, -46.632);
      assert.equal(broadcast.deviationDistance, result.deviationDistance);
      assert.ok(Date.parse(broadcast.processedAt as string));

      const raw = await transaction
        .selectFrom("raw_telemetry")
        .select(["latitude", "longitude"])
        .where("id", "=", BigInt(result.rawTelemetryId))
        .executeTakeFirstOrThrow();

      assert.deepEqual(raw, { latitude: -23.551, longitude: -46.632 });
      throw rollback;
    }),
    rollback
  );
});

test("stores raw telemetry without processing when no route is active", async () => {
  const rollback = new Error("rollback test transaction");

  await assert.rejects(
    db.transaction().execute(async (transaction) => {
      const vehicle = await transaction
        .insertInto("vehicles")
        .values({ license_plate: `TEST-${crypto.randomUUID().slice(0, 8)}`, status: "active" })
        .returning("id")
        .executeTakeFirstOrThrow();

      const app = buildApp(transaction);
      await app.ready();
      const token = await app.jwt.sign({ vehicle_id: vehicle.id, role: "tracker" });
      const response = await app.inject({
        method: "POST",
        url: "/telemetry",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          vehicleId: vehicle.id,
          latitude: -23.551,
          longitude: -46.632,
          capturedAt: "2026-10-15T12:00:00.000Z"
        }
      });
      await app.close();

      assert.equal(response.statusCode, 201);
      const result = response.json() as { rawTelemetryId: string; processedLocationId?: string };
      assert.ok(BigInt(result.rawTelemetryId) > 0n);
      assert.equal(result.processedLocationId, undefined);
      throw rollback;
    }),
    rollback
  );
});
