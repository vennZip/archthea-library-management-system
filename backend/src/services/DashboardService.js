export class DashboardService {
  #repository;
  #circulation;
  #catalog;
  #accounts;
  constructor(repository, circulation, catalog, accounts) {
    this.#repository = repository;
    this.#circulation = circulation;
    this.#catalog = catalog;
    this.#accounts = accounts;
  }
  async student(user) {
    const [eligibility, loans, reservations, history, popular, available] =
      await Promise.all([
        this.#accounts.eligibility(user.id),
        this.#circulation.loans(
          { status: "ACTIVE", page: 1, page_size: 50 },
          user.id,
        ),
        this.#circulation.reservations(
          { status: "ACTIVE", page: 1, page_size: 50 },
          user.id,
        ),
        this.#circulation.loans(
          { status: "RETURNED", page: 1, page_size: 5 },
          user.id,
        ),
        this.#catalog.list(user, { sort: "popular", page: 1, page_size: 4 }),
        this.#repository.count("catalog", [
          ["is", "archived_at", null],
          ["gt", "available_copies", 0],
        ]),
      ]);
    return {
      eligibility,
      loans: loans.items,
      reservations: reservations.items,
      history: history.items,
      popular: popular.items,
      available_titles: available,
    };
  }
  async admin(user) {
    const [report, activity, overdue, reservations] = await Promise.all([
      this.#repository.rpc("library_report", { p_actor: user.id }),
      this.#repository.audit({ page: 1, page_size: 6 }, user.client),
      this.#circulation.loans({ status: "OVERDUE", page: 1, page_size: 5 }),
      this.#circulation.reservations({
        status: "ACTIVE",
        page: 1,
        page_size: 5,
      }),
    ]);
    return {
      ...report,
      activity: activity.items,
      overdue: overdue.items,
      reservations: reservations.items,
    };
  }
}
