interface SocketConnection {
  readonly OPEN: number;
  readyState: number;
  send(payload: string): void;
  on(event: "close", listener: () => void): void;
}

export interface PositionBroadcast {
  type: "tracking.position.updated";
  vehicleId: string;
  processedLocationId: string;
  latitude: number;
  longitude: number;
  deviationDistance: number;
  processedAt: string;
}

export class VehicleChannelManager {
  private readonly channels = new Map<string, Set<SocketConnection>>();

  subscribe(vehicleId: string, socket: SocketConnection): void {
    const channel = this.channels.get(vehicleId) ?? new Set<SocketConnection>();
    channel.add(socket);
    this.channels.set(vehicleId, channel);

    socket.on("close", () => {
      channel.delete(socket);
      if (channel.size === 0) this.channels.delete(vehicleId);
    });
  }

  publish(event: PositionBroadcast): void {
    const payload = JSON.stringify(event);

    for (const socket of this.channels.get(event.vehicleId) ?? []) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }

  connectionCount(): number {
    return [...this.channels.values()].reduce((count, channel) => count + channel.size, 0);
  }
}
