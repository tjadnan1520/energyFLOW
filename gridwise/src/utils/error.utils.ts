export class AppError extends Error {
  public readonly statusCode: number;

  public readonly code: string;

  public readonly expose: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    expose = false
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode =
      statusCode;
    this.code = code;
    this.expose = expose;

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

export function isAppError(
  error: unknown
): error is AppError {
  return error instanceof AppError;
}

export function getSafeErrorMessage(
  error: unknown
): string {
  if (isAppError(error)) {
    if (error.expose) {
      return error.message;
    }

    return "Internal server error";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function toPublicError(
  error: unknown
): {
  statusCode: number;
  body: {
    error: string;
    code?: string;
  };
} {
  if (isAppError(error)) {
    return {
      statusCode:
        error.statusCode,
      body: {
        error: error.expose
          ? error.message
          : "Internal server error",

        ...(error.expose
          ? {
              code: error.code,
            }
          : {}),
      },
    };
  }

  return {
    statusCode: 500,

    body: {
      error:
        "Internal server error",
    },
  };
}

export function badRequest(
  message: string,
  code = "BAD_REQUEST"
): AppError {
  return new AppError(
    message,
    400,
    code,
    true
  );
}

export function unprocessableEntity(
  message: string,
  code = "SEMANTIC_VALIDATION_ERROR"
): AppError {
  return new AppError(
    message,
    422,
    code,
    true
  );
}

export function internalError(
  message = "Internal server error"
): AppError {
  return new AppError(
    message,
    500,
    "INTERNAL_ERROR",
    false
  );
}