import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BookOpen,
  Bookmark,
  Pencil,
  Archive,
  RotateCcw,
  LibraryBig,
  Upload,
  Trash2,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import { useToast } from "../../components/ui/Toast";
import { ResourceState, PageHeading, Status } from "../../components/ui/Common";
import { ConfirmDialog } from "../../components/ui/Modal";
import { BookCover } from "./BookCard";
import BookForm from "./BookForm";
import CopyManager from "../inventory/CopyManager";

export default function BookDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = user.role === "LIBRARIAN";
  const resource = useResource(`/books/${id}`);
  const book = resource.data;
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  async function perform() {
    setPending(true);
    try {
      if (confirm === "borrow")
        await api("/loans", {
          method: "POST",
          body: { book_id: id },
          idempotent: true,
        });
      else if (confirm === "reserve")
        await api("/reservations", {
          method: "POST",
          body: { book_id: id },
          idempotent: true,
        });
      else if (confirm === "remove-cover")
        await api(`/books/${id}/cover`, { method: "DELETE" });
      else if (confirm === "restore")
        await api(`/books/${id}/restore`, { method: "POST" });
      else await api(`/books/${id}`, { method: "DELETE" });
      toast(
        {
          borrow: "Book borrowed. Find your due date in My borrowed books.",
          reserve: "You’ve joined the waiting list.",
          archive: "Book archived.",
          restore: "Book restored.",
          "remove-cover": "Book cover removed.",
        }[confirm],
      );
      setConfirm(null);
      resource.reload();
    } catch (error) {
      toast(error.message, "error");
      setConfirm(null);
      resource.reload();
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link className="text-link back-link" to="/app/catalog">
        Back to the collection
      </Link>
      <ResourceState resource={resource}>
        {book && (
          <>
            <PageHeading
              eyebrow={book.category}
              title="A closer look"
              description="A new perspective, one page at a time."
            >
              {admin && (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      setConfirm(book.archived_at ? "restore" : "archive")
                    }
                  >
                    {book.archived_at ? (
                      <RotateCcw size={17} />
                    ) : (
                      <Archive size={17} />
                    )}
                    {book.archived_at ? "Restore book" : "Archive book"}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={17} />
                    Edit details
                  </button>
                </>
              )}
            </PageHeading>
            <section className="book-detail panel">
              <div className="detail-cover">
                <BookCover book={book} />
                {admin && book.cover_path && (
                  <button
                    className="text-button danger-text"
                    onClick={() => setConfirm("remove-cover")}
                  >
                    <Trash2 size={15} />
                    Remove cover
                  </button>
                )}
              </div>
              <div className="detail-content">
                <div className="detail-tags">
                  <span className="category-pill">{book.category}</span>
                  <Status
                    value={
                      book.archived_at
                        ? "ARCHIVED"
                        : book.available_copies
                          ? "AVAILABLE"
                          : "WAITING"
                    }
                  >
                    {book.archived_at
                      ? "Archived"
                      : book.available_copies
                        ? "Available to borrow"
                        : "Currently unavailable"}
                  </Status>
                </div>
                <h1>{book.title}</h1>
                <p className="detail-author">
                  by {book.authors.map((author) => author.name).join(", ")}
                </p>
                <p className="detail-description">
                  {book.description ||
                    "No description has been added for this title yet."}
                </p>
                <dl className="book-metadata">
                  <div>
                    <dt>ISBN</dt>
                    <dd>{book.isbn || "Not assigned"}</dd>
                  </div>
                  <div>
                    <dt>Publisher</dt>
                    <dd>{book.publisher || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Published</dt>
                    <dd>{book.publication_year || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{book.category}</dd>
                  </div>
                </dl>
                <div className="availability-summary">
                  <LibraryBig size={24} strokeWidth={1.4} />
                  <div>
                    <strong>{book.available_copies} copies available</strong>
                    <span>
                      {book.total_copies} total · {book.borrowed_copies}{" "}
                      borrowed · {book.reserved_copies} reserved
                    </span>
                  </div>
                </div>
                {!admin && !book.archived_at && (
                  <div className="detail-actions">
                    {book.available_copies ? (
                      <button
                        className="button primary"
                        onClick={() => setConfirm("borrow")}
                      >
                        <BookOpen size={18} />
                        Borrow this book
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        onClick={() => setConfirm("reserve")}
                      >
                        <Bookmark size={18} />
                        Join the waiting list
                      </button>
                    )}
                    <span>Library borrowing policies apply.</span>
                  </div>
                )}
                {admin && (
                  <Link
                    className="button secondary"
                    to={`/app/circulation?book=${id}`}
                  >
                    Process a checkout
                  </Link>
                )}
              </div>
            </section>
            {admin && <CopyManager bookId={id} onChanged={resource.reload} />}
          </>
        )}
      </ResourceState>
      {editing && (
        <BookForm
          book={book}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            resource.reload();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={
            {
              borrow: "Borrow this book?",
              reserve: "Join the waiting list?",
              archive: "Archive this book?",
              restore: "Restore this book?",
              "remove-cover": "Remove the cover?",
            }[confirm]
          }
          message={
            confirm === "borrow"
              ? "Your borrowing eligibility and the latest copy availability will be checked before checkout."
              : confirm === "reserve"
                ? "We’ll notify you when a copy is ready. You can cancel your reservation at any time before collection."
                : confirm === "archive"
                  ? "The book will leave the active catalog. Its history will be preserved. Active loans and reservations must be closed first."
                  : "This change will be recorded in the library activity log."
          }
          confirmLabel={
            {
              borrow: "Confirm borrowing",
              reserve: "Join waiting list",
              archive: "Archive book",
              restore: "Restore book",
              "remove-cover": "Remove cover",
            }[confirm]
          }
          onClose={() => setConfirm(null)}
          onConfirm={perform}
          pending={pending}
          danger={confirm === "archive" || confirm === "remove-cover"}
        />
      )}
    </>
  );
}
