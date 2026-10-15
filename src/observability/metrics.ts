export class RuntimeMetrics {
  private ingestions = 0;
  private processedIngestions = 0;
  private validationFailures = 0;
  private failures = 0;
  private readonly processingDurations: number[] = [];

  recordIngestion(processed: boolean, durationMs: number): void {
    this.ingestions += 1;
    if (processed) this.processedIngestions += 1;
    this.processingDurations.push(durationMs);
  }

  recordValidationFailure(): void {
    this.validationFailures += 1;
  }

  recordFailure(): void {
    this.failures += 1;
  }

  render(websocketConnections: number): string {
    const durationSum = this.processingDurations.reduce((sum, duration) => sum + duration, 0);

    return [
      "# HELP geo_tracker_telemetry_ingestions_total Accepted telemetry events.",
      "# TYPE geo_tracker_telemetry_ingestions_total counter",
      `geo_tracker_telemetry_ingestions_total ${this.ingestions}`,
      "# HELP geo_tracker_telemetry_processed_total Telemetry events with an active route.",
      "# TYPE geo_tracker_telemetry_processed_total counter",
      `geo_tracker_telemetry_processed_total ${this.processedIngestions}`,
      "# HELP geo_tracker_telemetry_validation_failures_total Rejected invalid telemetry requests.",
      "# TYPE geo_tracker_telemetry_validation_failures_total counter",
      `geo_tracker_telemetry_validation_failures_total ${this.validationFailures}`,
      "# HELP geo_tracker_failures_total Unhandled request failures.",
      "# TYPE geo_tracker_failures_total counter",
      `geo_tracker_failures_total ${this.failures}`,
      "# HELP geo_tracker_processing_duration_ms Telemetry processing duration in milliseconds.",
      "# TYPE geo_tracker_processing_duration_ms summary",
      `geo_tracker_processing_duration_ms_count ${this.processingDurations.length}`,
      `geo_tracker_processing_duration_ms_sum ${durationSum}`,
      "# HELP geo_tracker_websocket_connections Active vehicle-scoped WebSocket connections.",
      "# TYPE geo_tracker_websocket_connections gauge",
      `geo_tracker_websocket_connections ${websocketConnections}`,
      ""
    ].join("\n");
  }
}
