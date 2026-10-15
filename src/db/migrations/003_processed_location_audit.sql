ALTER TABLE processed_locations
  ADD COLUMN route_id uuid REFERENCES routes(id) ON DELETE RESTRICT,
  ADD COLUMN processing_method text NOT NULL DEFAULT 'postgis_closest_point',
  ADD COLUMN processing_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN confidence double precision NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1);

CREATE INDEX routes_in_progress_vehicle_id_idx
  ON routes (vehicle_id, created_at DESC)
  WHERE status = 'in_progress';
