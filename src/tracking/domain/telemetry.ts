export interface TelemetryInput {
  vehicleId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
}

export interface TelemetryResult {
  rawTelemetryId: bigint;
  processedLocationId?: bigint;
  deviationDistance?: number;
  processedPosition?: {
    latitude: number;
    longitude: number;
    processedAt: string;
  };
}
