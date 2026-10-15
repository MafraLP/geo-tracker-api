CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_plate varchar(16) NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  planned_path geometry(LineString, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routes_planned_path_has_multiple_points CHECK (ST_NPoints(planned_path) >= 2)
);

CREATE INDEX routes_planned_path_gist_idx ON routes USING GIST (planned_path);
CREATE INDEX routes_vehicle_id_created_at_idx ON routes (vehicle_id, created_at DESC);

CREATE TABLE raw_telemetry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy double precision CHECK (accuracy >= 0),
  captured_at timestamptz NOT NULL
);

CREATE INDEX raw_telemetry_vehicle_id_captured_at_idx ON raw_telemetry (vehicle_id, captured_at DESC);

ALTER TABLE raw_telemetry
  ADD CONSTRAINT raw_telemetry_id_vehicle_id_key UNIQUE (id, vehicle_id);

CREATE FUNCTION reject_raw_telemetry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'raw_telemetry is append-only';
END;
$$;

CREATE TRIGGER raw_telemetry_append_only
BEFORE UPDATE OR DELETE ON raw_telemetry
FOR EACH ROW EXECUTE FUNCTION reject_raw_telemetry_mutation();

CREATE TABLE processed_locations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_telemetry_id bigint NOT NULL,
  vehicle_id uuid NOT NULL,
  snapped_position geometry(Point, 4326) NOT NULL,
  deviation_distance double precision NOT NULL CHECK (deviation_distance >= 0),
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processed_locations_raw_telemetry_vehicle_fkey
    FOREIGN KEY (raw_telemetry_id, vehicle_id)
    REFERENCES raw_telemetry (id, vehicle_id)
    ON DELETE RESTRICT
);

CREATE INDEX processed_locations_snapped_position_gist_idx
  ON processed_locations USING GIST (snapped_position);
CREATE INDEX processed_locations_vehicle_id_processed_at_idx
  ON processed_locations (vehicle_id, processed_at DESC);
