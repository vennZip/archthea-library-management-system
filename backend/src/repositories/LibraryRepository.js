import { BaseRepository } from "./BaseRepository.js";
import { ConfigurationError } from "../models/AppError.js";

const loanSelect =
  "*, copy:book_copies!inner(id,barcode,book:books!inner(id,title,cover_path)), student:student_profiles!inner(student_number,profile:profiles!inner(id,full_name))";
const reservationSelect =
  "*, book:books!inner(id,title,cover_path), student:student_profiles!inner(student_number,profile:profiles!inner(id,full_name))";
const windowOf = ({ page = 1, page_size = 12 }) => [
  (page - 1) * page_size,
  page * page_size - 1,
];
const pageResult = (result, query) => ({
  items: result.data,
  total: result.count ?? result.data.length,
  page: query.page ?? 1,
  page_size: query.page_size ?? 12,
});

export class LibraryRepository extends BaseRepository {
  #client;
  constructor(client) {
    super();
    this.#client = client;
  }
  get client() {
    if (!this.#client) throw new ConfigurationError();
    return this.#client;
  }
  async rpc(name, args = {}) {
    return (await this.execute(this.client.rpc(name, args))).data;
  }
  async profile(id, scopedClient = this.client) {
    const { data } = await this.execute(
      scopedClient
        .from("profiles")
        .select("*,student:student_profiles(*),librarian:librarian_profiles(*)")
        .eq("id", id)
        .single(),
    );
    return data;
  }
  async catalog(query = {}, actorId) {
    return this.rpc("search_catalog", { p_actor: actorId, p_query: query });
  }
  async book(id) {
    return (
      await this.execute(
        this.client.from("catalog").select("*").eq("id", id).single(),
      )
    ).data;
  }
  async references(table, scopedClient) {
    return (
      await this.execute(scopedClient.from(table).select("*").order("name"))
    ).data;
  }
  async copies(book, query) {
    const result = await this.execute(
      this.client
        .from("book_copies")
        .select("*", { count: "exact" })
        .eq("book_id", book)
        .is("retired_at", null)
        .order("created_at")
        .range(...windowOf(query)),
    );
    return pageResult(result, query);
  }
  async loans(query, studentId) {
    let request = this.client
      .from("borrow_transactions")
      .select(loanSelect, { count: "exact" });
    if (studentId) request = request.eq("student_id", studentId);
    if (query.status === "OVERDUE")
      request = request
        .eq("status", "ACTIVE")
        .lte("due_at", new Date().toISOString());
    else if (query.status) request = request.eq("status", query.status);
    return pageResult(
      await this.execute(
        request
          .order("borrowed_at", { ascending: false })
          .range(...windowOf(query)),
      ),
      query,
    );
  }
  async loan(id) {
    return (
      await this.execute(
        this.client
          .from("borrow_transactions")
          .select(loanSelect)
          .eq("id", id)
          .single(),
      )
    ).data;
  }
  async reservations(query, studentId, bookId) {
    let request = this.client
      .from("reservations")
      .select(reservationSelect, { count: "exact" });
    if (studentId) request = request.eq("student_id", studentId);
    if (bookId) request = request.eq("book_id", bookId);
    if (query.status === "ACTIVE")
      request = request.in("status", ["WAITING", "READY_FOR_PICKUP"]);
    else if (query.status) request = request.eq("status", query.status);
    const result = await this.execute(
      request
        .order("created_at", { ascending: Boolean(bookId) })
        .order("id")
        .range(...windowOf(query)),
    );
    // Count all preceding waiting rows, including those owned by other users.
    // Only the numeric position is returned to a student, never another student's identity.
    const items = await Promise.all(
      result.data.map(async (item) => {
        let queue_position = null;
        if (item.status === "WAITING") {
          const { count } = await this.execute(
            this.client
              .from("reservations")
              .select("id", { count: "exact", head: true })
              .eq("book_id", item.book_id)
              .eq("status", "WAITING")
              .or(
                `created_at.lt.${item.created_at},and(created_at.eq.${item.created_at},id.lte.${item.id})`,
              ),
          );
          queue_position = count;
        }
        return { ...item, queue_position };
      }),
    );
    return pageResult({ ...result, data: items }, query);
  }
  async students(query) {
    let request = this.client
      .from("student_profiles")
      .select("*,profile:profiles!inner(*)", { count: "exact" });
    if (query.q)
      request = request.ilike(
        "profile.full_name",
        `%${query.q.replace(/[%_]/g, "")}%`,
      );
    return pageResult(
      await this.execute(
        request.order("student_number").range(...windowOf(query)),
      ),
      query,
    );
  }
  async student(id) {
    return (
      await this.execute(
        this.client
          .from("student_profiles")
          .select("*,profile:profiles!inner(*)")
          .eq("id", id)
          .single(),
      )
    ).data;
  }
  async settings(scopedClient = this.client) {
    return (
      await this.execute(
        scopedClient
          .from("library_settings")
          .select("*")
          .eq("id", true)
          .single(),
      )
    ).data;
  }
  async notifications(id, query, scopedClient) {
    let request = scopedClient
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", id);
    if (query.unread === "true") request = request.is("read_at", null);
    return pageResult(
      await this.execute(
        request
          .order("created_at", { ascending: false })
          .range(...windowOf(query)),
      ),
      query,
    );
  }
  async audit(query, scopedClient) {
    return pageResult(
      await this.execute(
        scopedClient
          .from("audit_logs")
          .select("*,actor:profiles(full_name)", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(...windowOf(query)),
      ),
      query,
    );
  }
  async count(table, filters = []) {
    let request = this.client
      .from(table)
      .select("*", { count: "exact", head: true });
    for (const [method, column, value] of filters)
      request = request[method](column, value);
    return (await this.execute(request)).count ?? 0;
  }
}
