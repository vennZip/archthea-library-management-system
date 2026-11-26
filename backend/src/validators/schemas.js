import { z } from "zod";

const text = (max) => z.string().trim().min(1).max(max);
export const uuid = z.uuid();
export const idParams = z.object({ id: uuid });
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(12),
});
export const catalogQuery = pageQuery
  .extend({
    q: z.string().trim().max(160).optional(),
    category_id: uuid.optional(),
    availability: z.enum(["available", "unavailable"]).optional(),
    sort: z.enum(["title", "newest", "year", "popular"]).default("title"),
    year_from: z.coerce.number().int().min(1000).max(2200).optional(),
    year_to: z.coerce.number().int().min(1000).max(2200).optional(),
    archived: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .refine(
    (data) =>
      !data.year_from || !data.year_to || data.year_from <= data.year_to,
    {
      message: "The start year must not exceed the end year.",
      path: ["year_from"],
    },
  );

function validIsbn(value) {
  if (!value) return true;
  if (/^\d{13}$/.test(value))
    return (
      [...value].reduce(
        (sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1),
        0,
      ) %
        10 ===
      0
    );
  return (
    /^\d{9}[\dX]$/.test(value) &&
    [...value].reduce(
      (sum, digit, i) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - i),
      0,
    ) %
      11 ===
      0
  );
}
export const bookBody = z
  .object({
    title: text(240),
    isbn: z
      .string()
      .trim()
      .transform((value) => value.replace(/[-\s]/g, "").toUpperCase())
      .refine(validIsbn, "Enter a valid ISBN-10 or ISBN-13.")
      .nullable()
      .optional(),
    category_id: uuid,
    publisher_id: uuid.nullable().optional(),
    publication_year: z
      .number()
      .int()
      .min(1000)
      .max(2200)
      .nullable()
      .optional(),
    description: z.string().trim().max(10000).default(""),
    author_ids: z
      .array(uuid)
      .min(1)
      .max(20)
      .refine(
        (values) => new Set(values).size === values.length,
        "Do not repeat an author.",
      ),
    initial_copies: z.number().int().min(0).max(100).default(0),
  })
  .strict();
export const condition = z.enum(["NEW", "GOOD", "WORN", "DAMAGED", "LOST"]);
export const copyBody = z
  .object({
    barcode: text(80).optional(),
    status: z.enum(["AVAILABLE", "DAMAGED", "LOST", "MAINTENANCE"]).optional(),
    condition: condition.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export const borrowBody = z
  .object({ book_id: uuid, student_id: uuid.optional() })
  .strict();
export const reservationBody = z.object({ book_id: uuid }).strict();
export const returnBody = z
  .object({ condition: condition.default("GOOD") })
  .strict();
export const keyHeaders = z.object({ "idempotency-key": uuid });
export const loanQuery = pageQuery.extend({
  status: z.enum(["ACTIVE", "RETURNED", "LOST", "OVERDUE"]).optional(),
  student_id: uuid.optional(),
});
export const reservationQuery = pageQuery.extend({
  status: z
    .enum([
      "ACTIVE",
      "WAITING",
      "READY_FOR_PICKUP",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
    ])
    .optional(),
});
export const referenceBody = z.object({ name: text(100) }).strict();
export const studentBody = z
  .object({
    full_name: text(120).min(2),
    student_number: text(40).min(2),
    program: z.string().trim().max(160).default(""),
    year_level: z.number().int().min(1).max(12).nullable().optional(),
    email: z.email().max(254),
  })
  .strict();
export const studentPatch = studentBody
  .omit({ email: true })
  .partial()
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    borrowing_restricted: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one change.",
  );
export const studentQuery = pageQuery.extend({
  q: z.string().trim().max(120).optional(),
});
export const notificationQuery = pageQuery.extend({
  unread: z.enum(["true", "false"]).optional(),
});
export const ownProfileBody = z
  .object({ full_name: text(120).min(2) })
  .strict();
export const settingsBody = z
  .object({
    max_books: z.number().int().min(1).max(50),
    loan_days: z.number().int().min(1).max(365),
    max_reservations: z.number().int().min(1).max(50),
    collection_hours: z.number().int().min(1).max(720),
    restrict_overdue: z.boolean(),
    timezone: text(100),
  })
  .strict();
