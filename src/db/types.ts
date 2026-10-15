import type { Generated } from "kysely";

export interface Database {
  processed_locations: {
    id: Generated<bigint>;
    raw_telemetry_id: bigint;
    vehicle_id: string;
    route_id: string | null;
    snapped_position: string;
    deviation_distance: number;
    processing_method: string;
    processing_version: string;
    confidence: number;
    processed_at: Generated<Date>;
  };
  raw_telemetry: {
    id: Generated<bigint>;
    vehicle_id: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    captured_at: Date;
  };
  routes: {
    id: Generated<string>;
    vehicle_id: string;
    status: string;
    planned_path: string;
    created_at: Generated<Date>;
  };
  vehicles: {
    id: Generated<string>;
    license_plate: string;
    status: string;
    created_at: Generated<Date>;
  };
}
