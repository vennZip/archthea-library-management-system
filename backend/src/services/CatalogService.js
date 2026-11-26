import { AppError, ForbiddenError } from "../models/AppError.js";

export class CatalogService {
  #repository;
  #storage;
  constructor(repository, storage) {
    this.#repository = repository;
    this.#storage = storage;
  }
  async list(user, query) {
    if (query.archived && user.role !== "LIBRARIAN") throw new ForbiddenError();
    const result = await this.#repository.catalog(query, user.id);
    return { ...result, items: await this.#storage.decorate(result.items) };
  }
  async detail(user, id) {
    const book = await this.#repository.book(id);
    if (book.archived_at && user.role !== "LIBRARIAN")
      throw new AppError("Book not found.", {
        status: 404,
        code: "BOOK_NOT_FOUND",
      });
    return (await this.#storage.decorate([book]))[0];
  }
  async save(user, id, data) {
    if (id && data.initial_copies)
      throw new AppError(
        "Add copies from inventory when editing an existing book.",
        { status: 422, code: "INVALID_COPY_COUNT" },
      );
    return this.#repository.rpc("save_book", {
      p_actor: user.id,
      p_id: id,
      p_data: data,
    });
  }
}
