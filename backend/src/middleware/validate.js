import { ValidationError } from "../models/AppError.js";

export const validate = (schemas) => (req, res, next) => {
  req.validated ??= {};
  for (const [source, schema] of Object.entries(schemas)) {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    req.validated[source] = parsed.data;
  }
  next();
};
