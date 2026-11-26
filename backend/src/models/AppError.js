export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
  get publicBody() {
    return {
      code: this.code,
      message:
        this.status >= 500
          ? "The service could not complete this request. Please try again."
          : this.message,
    };
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Please sign in again.") {
    super(message, { status: 401, code: "UNAUTHENTICATED" });
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, { status: 403, code: "FORBIDDEN" });
  }
}
export class ValidationError extends AppError {
  #issues;
  constructor(issues) {
    super("Please check the submitted information.", {
      status: 422,
      code: "VALIDATION_ERROR",
    });
    this.#issues = issues;
  }
  get publicBody() {
    return {
      ...super.publicBody,
      issues: this.#issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
}
export class ConfigurationError extends AppError {
  constructor() {
    super("Supabase is not configured.", {
      status: 503,
      code: "SERVICE_NOT_CONFIGURED",
    });
  }
  get publicBody() {
    return {
      code: this.code,
      message:
        "The library connection is not configured yet. Please contact the librarian.",
    };
  }
}
