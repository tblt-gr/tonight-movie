import type { ApiError, ApiErrorCode } from "@/lib/types";

export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }

  toBody(): ApiError {
    return { error: { code: this.code, message: this.message } };
  }
}
