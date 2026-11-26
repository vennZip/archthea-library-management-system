import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  SlidersHorizontal,
  LayoutGrid,
  List,
  LibraryBig,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useResource, useDebounced } from "../../hooks/useResource";
import { queryString } from "../../lib/api";
import {
  PageHeading,
  SearchInput,
  ResourceState,
  EmptyState,
  Pagination,
  Field,
} from "../../components/ui/Common";
import { BookCard } from "./BookCard";
import BookForm from "./BookForm";

export default function CatalogPage({ inventory = false }) {
  const { user } = useAuth();
  const admin = user.role === "LIBRARIAN";
  const [params] = useSearchParams();
  const incomingSearch = params.get("q") || "";
  const [search, setSearch] = useState(incomingSearch);
  const q = useDebounced(search);
  const [filters, setFilters] = useState({
    category_id: "",
    availability: "",
    sort: params.get("sort") === "popular" ? "popular" : "title",
    year_from: "",
    year_to: "",
    archived: false,
  });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [listView, setListView] = useState(inventory);
  const [adding, setAdding] = useState(admin && params.get("add") === "true");
  const categories = useResource("/categories");
  const books = useResource(
    `/books${queryString({ ...filters, archived: filters.archived ? "true" : undefined, q, page, page_size: 12 })}`,
  );
  useEffect(() => {
    setSearch(incomingSearch);
    setPage(1);
  }, [incomingSearch]);
  function filter(event) {
    setFilters((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
    setPage(1);
  }
  return (
    <>
      <PageHeading
        eyebrow={inventory ? "EVERY COPY COUNTS" : "A WORLD BETWEEN COVERS"}
        title={inventory ? "Book inventory" : "Explore the collection"}
        description={
          inventory
            ? "Keep every copy accounted for, from shelf to student."
            : "Find a familiar favorite. Discover something unexpected."
        }
      >
        {admin && (
          <>
            <Link className="button secondary" to="/app/reference-data">
              Catalog details
            </Link>
            <button className="button primary" onClick={() => setAdding(true)}>
              <Plus size={18} />
              Add book
            </button>
          </>
        )}
      </PageHeading>
      {!inventory && (
        <div className="catalog-banner">
          <div>
            <span className="eyebrow">FOLLOW YOUR CURIOSITY</span>
            <h2>
              Your next great read
              <br />
              could be right here.
            </h2>
            <p>A fresh perspective is always worth finding.</p>
          </div>
          <div className="banner-bookmarks" aria-hidden="true">
            <BookOpenArt />
          </div>
        </div>
      )}
      <div className="catalog-controls">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search title, author, or ISBN…"
          label="Search books"
        />
        <div className="control-actions">
          <button
            className={`button secondary ${showFilters ? "selected" : ""}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((value) => !value)}
          >
            <SlidersHorizontal size={17} />
            Filters
          </button>
          <select
            aria-label="Sort books"
            name="sort"
            value={filters.sort}
            onChange={filter}
          >
            <option value="title">Title, A–Z</option>
            <option value="newest">Recently added</option>
            <option value="popular">Most borrowed</option>
            <option value="year">Publication year</option>
          </select>
          <div className="view-switch">
            <button
              className={`icon-button ${!listView ? "selected" : ""}`}
              aria-label="Grid view"
              aria-pressed={!listView}
              onClick={() => setListView(false)}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              className={`icon-button ${listView ? "selected" : ""}`}
              aria-label="List view"
              aria-pressed={listView}
              onClick={() => setListView(true)}
            >
              <List size={19} />
            </button>
          </div>
        </div>
      </div>
      {showFilters && (
        <div className="filter-panel">
          <Field label="Category">
            <select
              name="category_id"
              value={filters.category_id}
              onChange={filter}
            >
              <option value="">All categories</option>
              {categories.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Availability">
            <select
              name="availability"
              value={filters.availability}
              onChange={filter}
            >
              <option value="">All books</option>
              <option value="available">Available now</option>
              <option value="unavailable">Currently unavailable</option>
            </select>
          </Field>
          <Field label="Published from">
            <input
              name="year_from"
              aria-label="Published from"
              type="number"
              min={1000}
              max={2200}
              value={filters.year_from}
              onChange={filter}
            />
          </Field>
          <Field label="Published through">
            <input
              name="year_to"
              aria-label="Published through"
              type="number"
              min={1000}
              max={2200}
              value={filters.year_to}
              onChange={filter}
            />
          </Field>
          {admin && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={filters.archived}
                onChange={(event) => {
                  setFilters((previous) => ({
                    ...previous,
                    archived: event.target.checked,
                  }));
                  setPage(1);
                }}
              />
              Archived books
            </label>
          )}
          <button
            className="text-button"
            onClick={() => {
              setFilters({
                category_id: "",
                availability: "",
                sort: "title",
                year_from: "",
                year_to: "",
                archived: false,
              });
              setSearch("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="results-heading">
        <h2>
          {filters.archived
            ? "Archived collection"
            : inventory
              ? "Inventory collection"
              : "All books"}
          <span>{books.data?.total ?? "…"}</span>
        </h2>
        <span>
          {search ? `Results for “${search}”` : "A good place to begin"}
        </span>
      </div>
      <ResourceState resource={books} cards>
        {books.data?.items.length ? (
          <div className={`book-grid ${listView ? "list-view" : ""}`}>
            {books.data.items.map((book) => (
              <BookCard book={book} key={book.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={LibraryBig}
            title={
              search || filters.category_id
                ? "No books found"
                : "Your collection starts here"
            }
            message={
              search || filters.category_id
                ? "Try another search or adjust your filters."
                : admin
                  ? "Add your first book to open a world of possibilities."
                  : "Your librarian is preparing the collection. Check back soon."
            }
            action={
              admin &&
              !search && (
                <button
                  className="button primary"
                  onClick={() => setAdding(true)}
                >
                  <Plus size={17} />
                  Add a book
                </button>
              )
            }
          />
        )}
      </ResourceState>
      <Pagination data={books.data} onChange={setPage} />
      {adding && (
        <BookForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            books.reload();
          }}
        />
      )}
    </>
  );
}
function BookOpenArt() {
  return (
    <>
      <div />
      <div />
      <div />
      <span>
        <LibraryBig size={62} strokeWidth={0.7} />
      </span>
    </>
  );
}
