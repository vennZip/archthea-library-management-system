import { AppError } from "../models/AppError.js";

export class AccountService {
  #repository;
  #redirectUrl;
  constructor(repository, redirectUrl) {
    this.#repository = repository;
    this.#redirectUrl = redirectUrl;
  }
  async detail(id) {
    const student = await this.#repository.student(id);
    const { data, error } =
      await this.#repository.client.auth.admin.getUserById(id);
    if (error) throw new AppError("Could not load account details.");
    return { ...student, email: data.user.email };
  }
  async register(actor, data) {
    const auth = this.#repository.client.auth.admin;
    // createUser only succeeds for a new Auth identity, so compensation can never
    // delete a pre-existing user's identity. No passwords are generated or stored.
    const { data: created, error } = await auth.createUser({
      email: data.email,
      email_confirm: false,
      user_metadata: { full_name: data.full_name },
    });
    if (error) {
      if (["email_exists", "user_already_exists"].includes(error.code))
        throw new AppError(
          "This email already has an account. Contact the administrator if registration was interrupted.",
          { status: 409, code: "EMAIL_EXISTS" },
        );
      throw new AppError("Account provisioning failed.");
    }
    let student;
    try {
      const { email, ...profile } = data;
      student = await this.#repository.rpc("save_student", {
        p_actor: actor.id,
        p_id: created.user.id,
        p_data: profile,
        p_create: true,
      });
    } catch (error) {
      const { error: cleanupError } = await auth.deleteUser(created.user.id);
      if (cleanupError)
        console.error(
          JSON.stringify({
            code: "PROVISIONING_CLEANUP_REQUIRED",
            user_id: created.user.id,
          }),
        );
      throw error;
    }
    // Recovery email lets the newly created student choose their own password.
    // Profile creation is already durable; an email failure is explicitly returned.
    const { error: emailError } =
      await this.#repository.client.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${this.#redirectUrl}/reset-password`,
      });
    return { ...student, email_sent: !emailError };
  }
  async eligibility(id) {
    const [student, policy, active, overdue, reservations] = await Promise.all([
      this.#repository.student(id),
      this.#repository.settings(),
      this.#repository.count("borrow_transactions", [
        ["eq", "student_id", id],
        ["eq", "status", "ACTIVE"],
      ]),
      this.#repository.count("borrow_transactions", [
        ["eq", "student_id", id],
        ["eq", "status", "ACTIVE"],
        ["lte", "due_at", new Date().toISOString()],
      ]),
      this.#repository.count("reservations", [
        ["eq", "student_id", id],
        ["in", "status", ["WAITING", "READY_FOR_PICKUP"]],
      ]),
    ]);
    const reasons = [];
    if (student.profile.status !== "ACTIVE") reasons.push("Account inactive");
    if (student.borrowing_restricted) reasons.push("Borrowing restricted");
    if (active >= policy.max_books) reasons.push("Borrowing limit reached");
    if (policy.restrict_overdue && overdue)
      reasons.push("Outstanding overdue books");
    return {
      eligible: reasons.length === 0,
      reasons,
      active_loans: active,
      overdue_loans: overdue,
      active_reservations: reservations,
      remaining_loans: Math.max(0, policy.max_books - active),
      policy,
    };
  }
}
