export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function unauthorized(message = "Authentication is required"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}
