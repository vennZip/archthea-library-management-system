import { randomUUID } from "node:crypto";
import { AppError } from "../models/AppError.js";

export function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let safe =
    error instanceof AppError
      ? error
      : new AppError("Unexpected error.", { cause: error });
  if (error.type === "entity.parse.failed")
    safe = new AppError("Request body must be valid JSON.", {
      status: 400,
      code: "INVALID_JSON",
    });
  if (error.type === "entity.too.large" || error.code === "LIMIT_FILE_SIZE")
    safe = new AppError("The submitted file or request is too large.", {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  if (error.code === "LIMIT_UNEXPECTED_FILE")
    safe = new AppError("Upload one file using the cover field.", {
      status: 422,
      code: "INVALID_UPLOAD",
    });
  if (safe.status >= 500 && process.env.NODE_ENV !== "test")
    console.error(
      JSON.stringify({
        request_id: req.id,
        code: safe.code,
        error_type: error.name,
      }),
    );
  res
    .status(safe.status)
    .json({ error: { ...safe.publicBody, request_id: req.id } });
}
