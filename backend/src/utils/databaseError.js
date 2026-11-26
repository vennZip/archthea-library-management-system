import { AppError } from "../models/AppError.js";

const rules = {
  ACCOUNT_INACTIVE: [
    403,
    "This account is inactive. Please contact the library.",
  ],
  FORBIDDEN: [403, "You do not have permission to perform this action."],
  STUDENT_REQUIRED: [403, "This action requires a student account."],
  STUDENT_NOT_FOUND: [404, "Student account not found."],
  BOOK_NOT_FOUND: [404, "Book not found."],
  COPY_NOT_FOUND: [404, "Copy not found."],
  LOAN_NOT_FOUND: [404, "Loan not found."],
  RESERVATION_NOT_FOUND: [404, "Reservation not found."],
  RECORD_NOT_FOUND: [404, "Record not found."],
  BORROWING_RESTRICTED: [
    409,
    "Borrowing is restricted for this account. Please contact the library.",
  ],
  OVERDUE_RESTRICTION: [
    409,
    "Return your overdue books before borrowing or reserving another book.",
  ],
  BORROW_LIMIT_REACHED: [409, "You have reached your borrowing limit."],
  COPY_UNAVAILABLE: [409, "No copy is currently available for you."],
  LOAN_ALREADY_CLOSED: [409, "This loan has already been closed."],
  RESERVATION_EXISTS: [
    409,
    "You already have an active reservation for this book.",
  ],
  RESERVATION_LIMIT_REACHED: [409, "You have reached your reservation limit."],
  BOOK_AVAILABLE: [409, "A copy is available. You can borrow it instead."],
  RESERVATION_CLOSED: [409, "This reservation is already closed."],
  BOOK_HAS_ACTIVITY: [
    409,
    "Close active loans and reservations before archiving this book.",
  ],
  COPY_IN_USE: [
    409,
    "This copy is on loan or allocated to a reservation. Process its return or reservation first.",
  ],
  IDEMPOTENCY_CONFLICT: [
    409,
    "This request key was already used for another operation.",
  ],
  IDEMPOTENCY_KEY_REQUIRED: [
    422,
    "A valid Idempotency-Key header is required.",
  ],
  INVALID_TIMEZONE: [422, "Select a valid IANA timezone."],
  INVALID_COPY_STATUS: [
    422,
    "A damaged or lost copy cannot be marked available. Update its condition first.",
  ],
  INVALID_CONDITION: [422, "Select a valid copy condition."],
};

export function databaseError(error) {
  const rule = rules[error.message];
  if (rule)
    return new AppError(rule[1], { status: rule[0], code: error.message });
  if (error.code === "23505")
    return new AppError("A record with these unique details already exists.", {
      status: 409,
      code: "DUPLICATE_RECORD",
    });
  if (error.code === "23503")
    return new AppError(
      "A related record is missing or this record is still in use.",
      { status: 409, code: "RELATED_RECORD_CONFLICT" },
    );
  if (error.code === "PGRST116")
    return new AppError("Record not found.", {
      status: 404,
      code: "RECORD_NOT_FOUND",
    });
  if (error.code === "42501")
    return new AppError("This operation is not permitted.", {
      status: 403,
      code: "FORBIDDEN",
    });
  if (["23514", "22P02", "22007", "22008"].includes(error.code))
    return new AppError("One or more values are invalid.", {
      status: 422,
      code: "INVALID_VALUE",
    });
  return new AppError("Database operation failed.", { cause: error });
}
