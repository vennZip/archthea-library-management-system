import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

const coverColors = [
  "#345b50",
  "#865235",
  "#556377",
  "#666341",
  "#754954",
  "#3e6268",
  "#795e35",
];
export function BookCover({ book, small = false }) {
  const hash = [...(book.id || book.title || "")].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return (
    <div
      className={`book-cover ${small ? "small-cover" : ""}`}
      style={{ "--cover-color": coverColors[hash % coverColors.length] }}
    >
      {book.cover_url ? (
        <img
          src={book.cover_url}
          alt={`Cover of ${book.title}`}
          loading="lazy"
        />
      ) : (
        <div className="typographic-cover">
          <span className="cover-publisher">
            {book.publisher || "ARCHTHEA COLLECTION"}
          </span>
          <strong>{book.title}</strong>
          <span className="cover-motif">
            <BookOpen size={46} strokeWidth={0.7} />
          </span>
          <span className="cover-author">
            {book.authors?.map((author) => author.name).join(" · ") ||
              "Library collection"}
          </span>
        </div>
      )}
    </div>
  );
}
export function BookCard({ book }) {
  return (
    <article className="book-card">
      <Link
        className="book-card-cover"
        to={`/app/catalog/${book.id}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        <BookCover book={book} />
        <span
          className={`availability-tag ${book.available_copies ? "" : "unavailable"}`}
        >
          {book.available_copies ? "Available" : "On loan / unavailable"}
        </span>
      </Link>
      <div className="book-card-info">
        <span className="book-category">{book.category}</span>
        <h3>
          <Link to={`/app/catalog/${book.id}`}>{book.title}</Link>
        </h3>
        <p>{book.authors?.map((author) => author.name).join(", ")}</p>
        <div className="book-card-bottom">
          <span>
            {book.available_copies} of {book.total_copies} available
          </span>
          <BookOpen size={16} strokeWidth={1.5} />
        </div>
      </div>
    </article>
  );
}
