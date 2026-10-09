// Shared with browser-only filter parsing; no server logging/runtime dependency.
export class AppError extends Error {
  retryAfter?: number;
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
