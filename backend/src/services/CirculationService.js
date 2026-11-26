export class CirculationService {
  #repository;
  #storage;
  constructor(repository, storage) {
    this.#repository = repository;
    this.#storage = storage;
  }
  borrow(user, data, key) {
    return this.#repository.rpc("borrow_book", {
      p_actor: user.id,
      p_student: data.student_id ?? user.id,
      p_book: data.book_id,
      p_key: key,
    });
  }
  returnBook(user, id, data, key) {
    return this.#repository.rpc("return_book", {
      p_actor: user.id,
      p_loan: id,
      p_condition: data.condition,
      p_key: key,
    });
  }
  reserve(user, data, key) {
    return this.#repository.rpc("reserve_book", {
      p_actor: user.id,
      p_book: data.book_id,
      p_key: key,
    });
  }
  cancel(user, id) {
    return this.#repository.rpc("cancel_reservation", {
      p_actor: user.id,
      p_reservation: id,
    });
  }
  async loans(query, studentId) {
    const result = await this.#repository.loans(query, studentId);
    const books = await this.#storage.decorate(
      result.items.map((item) => item.copy.book),
    );
    return {
      ...result,
      items: result.items.map((item, i) => ({
        ...item,
        copy: { ...item.copy, book: books[i] },
        overdue:
          item.status === "ACTIVE" && new Date(item.due_at) <= new Date(),
        returned_overdue: Boolean(
          item.returned_at &&
          new Date(item.returned_at) > new Date(item.due_at),
        ),
      })),
    };
  }
  async reservations(query, studentId, bookId) {
    const result = await this.#repository.reservations(
      query,
      studentId,
      bookId,
    );
    const books = await this.#storage.decorate(
      result.items.map((item) => item.book),
    );
    return {
      ...result,
      items: result.items.map((item, i) => ({ ...item, book: books[i] })),
    };
  }
}
