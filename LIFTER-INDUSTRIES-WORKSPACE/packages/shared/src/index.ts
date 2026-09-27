export function createSuccess<T>(data: T, message: string, requestId: string) {
  return { success: true as const, data, message, requestId };
}

export function createFailure(code: string, message: string, requestId: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details === undefined ? {} : { details }) },
    requestId,
  };
}

export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error("Duration must use seconds, minutes, hours, or days");
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return amount * factor;
}

export { permissionDefinitions, permissionKeys, permissionAllows } from "./permissions.js";
