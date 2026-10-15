export type MachineRole = "viewer" | "tracker";

export interface MachineToken {
  vehicle_id: string;
  role: MachineRole;
}
