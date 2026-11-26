import { Router } from "express";
import multer from "multer";
import { authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as schema from "../validators/schemas.js";
import { libraryControllers } from "../controllers/libraryControllers.js";

export function apiRouter(services, authentication) {
  const router = Router();
  const c = libraryControllers(services);
  const admin = authorize("LIBRARIAN");
  const student = authorize("STUDENT");
  const id = validate({ params: schema.idParams });
  const page = validate({ query: schema.pageQuery });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  router.use(authentication);

  router.get("/me", c.me);
  router.patch("/me", validate({ body: schema.ownProfileBody }), c.updateMe);
  router.get("/dashboard/student", student, c.studentDashboard);
  router.get("/dashboard/admin", admin, c.adminDashboard);

  router.get("/books", validate({ query: schema.catalogQuery }), c.books);
  router.post("/books", admin, validate({ body: schema.bookBody }), c.saveBook);
  router.get("/books/:id", id, c.book);
  router.patch(
    "/books/:id",
    admin,
    id,
    validate({ body: schema.bookBody }),
    c.saveBook,
  );
  router.delete("/books/:id", admin, id, c.archiveBook);
  router.post("/books/:id/restore", admin, id, c.restoreBook);
  router.post(
    "/books/:id/cover",
    admin,
    id,
    upload.single("cover"),
    c.uploadCover,
  );
  router.delete("/books/:id/cover", admin, id, c.deleteCover);
  router.get("/books/:id/copies", admin, id, page, c.copies);
  router.post(
    "/books/:id/copies",
    admin,
    id,
    validate({ body: schema.copyBody }),
    c.addCopy,
  );
  router.patch(
    "/copies/:id",
    admin,
    id,
    validate({ body: schema.copyBody }),
    c.editCopy,
  );
  router.delete("/copies/:id", admin, id, c.retireCopy);
  router.get(
    "/books/:id/queue",
    admin,
    id,
    validate({ query: schema.reservationQuery }),
    c.queue,
  );

  for (const entity of ["categories", "authors", "publishers"]) {
    router.get(`/${entity}`, c.references(entity));
    router.post(
      `/${entity}`,
      admin,
      validate({ body: schema.referenceBody }),
      c.saveReference(entity),
    );
    router.patch(
      `/${entity}/:id`,
      admin,
      id,
      validate({ body: schema.referenceBody }),
      c.saveReference(entity),
    );
    router.delete(`/${entity}/:id`, admin, id, c.deleteReference(entity));
  }

  router.get(
    "/me/loans",
    student,
    validate({ query: schema.loanQuery }),
    c.ownLoans,
  );
  router.get("/loans", admin, validate({ query: schema.loanQuery }), c.loans);
  router.get("/loans/:id", admin, id, c.loan);
  router.post(
    "/loans",
    validate({ body: schema.borrowBody, headers: schema.keyHeaders }),
    c.borrow,
  );
  router.post(
    "/loans/:id/return",
    admin,
    id,
    validate({ body: schema.returnBody, headers: schema.keyHeaders }),
    c.returnBook,
  );
  router.get(
    "/me/reservations",
    student,
    validate({ query: schema.reservationQuery }),
    c.ownReservations,
  );
  router.get(
    "/reservations",
    admin,
    validate({ query: schema.reservationQuery }),
    c.reservations,
  );
  router.post(
    "/reservations",
    student,
    validate({ body: schema.reservationBody, headers: schema.keyHeaders }),
    c.reserve,
  );
  router.post("/reservations/:id/cancel", id, c.cancel);

  router.get(
    "/students",
    admin,
    validate({ query: schema.studentQuery }),
    c.students,
  );
  router.post(
    "/students",
    admin,
    validate({ body: schema.studentBody }),
    c.register,
  );
  router.get("/students/:id", admin, id, c.student);
  router.patch(
    "/students/:id",
    admin,
    id,
    validate({ body: schema.studentPatch }),
    c.editStudent,
  );
  router.get("/students/:id/eligibility", admin, id, c.eligibility);

  router.get(
    "/notifications",
    validate({ query: schema.notificationQuery }),
    c.notifications,
  );
  router.patch("/notifications/:id/read", id, c.readNotifications);
  router.post("/notifications/read-all", c.readNotifications);
  router.get("/settings", c.settings);
  router.patch(
    "/settings",
    admin,
    validate({ body: schema.settingsBody }),
    c.saveSettings,
  );
  router.get("/audit-logs", admin, page, c.audit);

  router.get("/reports", admin, c.report());
  for (const [path, section] of Object.entries({
    summary: "summary",
    trends: "monthly",
    "popular-books": "popular_books",
    "active-borrowers": "active_borrowers",
    categories: "categories",
    returns: "monthly",
  })) {
    router.get(`/reports/${path}`, admin, c.report(section));
  }
  router.get("/reports/export", admin, c.export);
  return router;
}
