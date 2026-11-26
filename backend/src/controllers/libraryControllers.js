import { toCsv } from "../utils/csv.js";

const send = (res, data, status = 200) => res.status(status).json({ data });

export function libraryControllers({
  repository,
  catalog,
  circulation,
  storage,
  accounts,
  dashboard,
}) {
  return {
    me: (req, res) => {
      const { client, ...user } = req.user;
      return send(res, user);
    },
    updateMe: async (req, res) =>
      send(
        res,
        await repository.rpc("update_own_profile", {
          p_actor: req.user.id,
          p_name: req.validated.body.full_name,
        }),
      ),
    studentDashboard: async (req, res) =>
      send(res, await dashboard.student(req.user)),
    adminDashboard: async (req, res) =>
      send(res, await dashboard.admin(req.user)),
    books: async (req, res) =>
      send(res, await catalog.list(req.user, req.validated.query)),
    book: async (req, res) =>
      send(res, await catalog.detail(req.user, req.validated.params.id)),
    saveBook: async (req, res) =>
      send(
        res,
        await catalog.save(
          req.user,
          req.validated.params?.id ?? null,
          req.validated.body,
        ),
        req.method === "POST" ? 201 : 200,
      ),
    archiveBook: async (req, res) =>
      send(
        res,
        await repository.rpc("archive_book", {
          p_actor: req.user.id,
          p_id: req.validated.params.id,
          p_archive: true,
        }),
      ),
    restoreBook: async (req, res) =>
      send(
        res,
        await repository.rpc("archive_book", {
          p_actor: req.user.id,
          p_id: req.validated.params.id,
          p_archive: false,
        }),
      ),
    uploadCover: async (req, res) =>
      send(
        res,
        await storage.upload(req.user.id, req.validated.params.id, req.file),
      ),
    deleteCover: async (req, res) =>
      send(res, await storage.remove(req.user.id, req.validated.params.id)),
    copies: async (req, res) =>
      send(
        res,
        await repository.copies(req.validated.params.id, req.validated.query),
      ),
    addCopy: async (req, res) =>
      send(
        res,
        await repository.rpc("manage_copy", {
          p_actor: req.user.id,
          p_book: req.validated.params.id,
          p_id: null,
          p_data: req.validated.body,
          p_retire: false,
        }),
        201,
      ),
    editCopy: async (req, res) =>
      send(
        res,
        await repository.rpc("manage_copy", {
          p_actor: req.user.id,
          p_book: null,
          p_id: req.validated.params.id,
          p_data: req.validated.body,
          p_retire: false,
        }),
      ),
    retireCopy: async (req, res) =>
      send(
        res,
        await repository.rpc("manage_copy", {
          p_actor: req.user.id,
          p_book: null,
          p_id: req.validated.params.id,
          p_data: {},
          p_retire: true,
        }),
      ),
    ownLoans: async (req, res) =>
      send(res, await circulation.loans(req.validated.query, req.user.id)),
    loans: async (req, res) =>
      send(
        res,
        await circulation.loans(
          req.validated.query,
          req.validated.query.student_id,
        ),
      ),
    loan: async (req, res) =>
      send(res, await repository.loan(req.validated.params.id)),
    borrow: async (req, res) =>
      send(
        res,
        await circulation.borrow(
          req.user,
          req.validated.body,
          req.validated.headers["idempotency-key"],
        ),
        201,
      ),
    returnBook: async (req, res) =>
      send(
        res,
        await circulation.returnBook(
          req.user,
          req.validated.params.id,
          req.validated.body,
          req.validated.headers["idempotency-key"],
        ),
      ),
    ownReservations: async (req, res) =>
      send(
        res,
        await circulation.reservations(req.validated.query, req.user.id),
      ),
    reservations: async (req, res) =>
      send(res, await circulation.reservations(req.validated.query)),
    queue: async (req, res) =>
      send(
        res,
        await circulation.reservations(
          req.validated.query,
          undefined,
          req.validated.params.id,
        ),
      ),
    reserve: async (req, res) =>
      send(
        res,
        await circulation.reserve(
          req.user,
          req.validated.body,
          req.validated.headers["idempotency-key"],
        ),
        201,
      ),
    cancel: async (req, res) =>
      send(res, await circulation.cancel(req.user, req.validated.params.id)),
    students: async (req, res) =>
      send(res, await repository.students(req.validated.query)),
    student: async (req, res) =>
      send(res, await accounts.detail(req.validated.params.id)),
    register: async (req, res) =>
      send(res, await accounts.register(req.user, req.validated.body), 201),
    editStudent: async (req, res) =>
      send(
        res,
        await repository.rpc("save_student", {
          p_actor: req.user.id,
          p_id: req.validated.params.id,
          p_data: req.validated.body,
          p_create: false,
        }),
      ),
    eligibility: async (req, res) =>
      send(res, await accounts.eligibility(req.validated.params.id)),
    notifications: async (req, res) =>
      send(
        res,
        await repository.notifications(
          req.user.id,
          req.validated.query,
          req.user.client,
        ),
      ),
    readNotifications: async (req, res) =>
      send(
        res,
        await repository.rpc("read_notifications", {
          p_actor: req.user.id,
          p_id: req.validated.params?.id ?? null,
        }),
      ),
    settings: async (req, res) =>
      send(res, await repository.settings(req.user.client)),
    saveSettings: async (req, res) =>
      send(
        res,
        await repository.rpc("update_settings", {
          p_actor: req.user.id,
          p_data: req.validated.body,
        }),
      ),
    audit: async (req, res) =>
      send(res, await repository.audit(req.validated.query, req.user.client)),
    report: (section) => async (req, res) => {
      const report = await repository.rpc("library_report", {
        p_actor: req.user.id,
      });
      return send(res, section ? report[section] : report);
    },
    export: async (req, res) => {
      const report = await repository.rpc("library_report", {
        p_actor: req.user.id,
      });
      const rows = [
        ...Object.entries(report.summary).map(([metric, count]) => ({
          section: "Summary",
          metric,
          borrowed: count,
          returned: "",
        })),
        ...report.monthly.map((row) => ({
          section: "Monthly",
          metric: row.month,
          borrowed: row.borrowed,
          returned: row.returned,
        })),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="archthea-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(toCsv(rows));
    },
    references: (entity) => async (req, res) =>
      send(res, await repository.references(entity, req.user.client)),
    saveReference: (entity) => async (req, res) =>
      send(
        res,
        await repository.rpc("manage_reference", {
          p_actor: req.user.id,
          p_entity: entity,
          p_id: req.validated.params?.id ?? null,
          p_name: req.validated.body.name,
          p_delete: false,
        }),
        req.method === "POST" ? 201 : 200,
      ),
    deleteReference: (entity) => async (req, res) =>
      send(
        res,
        await repository.rpc("manage_reference", {
          p_actor: req.user.id,
          p_entity: entity,
          p_id: req.validated.params.id,
          p_name: null,
          p_delete: true,
        }),
      ),
  };
}
