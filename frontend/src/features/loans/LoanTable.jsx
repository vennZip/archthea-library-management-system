import { Link } from "react-router-dom";
import { DataTable } from "../../components/ui/DataTable";
import { Status } from "../../components/ui/Common";
import { date, dueLabel } from "../../lib/format";
import { BookCover } from "../catalog/BookCard";

export function LoanTable({
  items,
  admin = false,
  history = false,
  onReturn,
  timezone,
}) {
  const columns = [
    {
      key: "book",
      title: "Book",
      render: (item) => (
        <div className="table-book">
          <BookCover book={item.copy.book} small />
          <div>
            <Link to={`/app/catalog/${item.copy.book.id}`}>
              {item.copy.book.title}
            </Link>
            <small>{item.copy.barcode}</small>
          </div>
        </div>
      ),
    },
    ...(admin
      ? [
          {
            key: "student",
            title: "Borrower",
            render: (item) => (
              <div className="table-person">
                <strong>{item.student.profile.full_name}</strong>
                <small>{item.student.student_number}</small>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "borrowed_at",
      title: "Borrowed",
      render: (item) => date(item.borrowed_at, timezone),
    },
    {
      key: "due_at",
      title: "Due date",
      render: (item) => (
        <div className={item.overdue ? "danger-text" : ""}>
          {date(item.due_at, timezone)}
          {item.status === "ACTIVE" && (
            <small className="cell-detail">{dueLabel(item.due_at)}</small>
          )}
        </div>
      ),
    },
    ...(history
      ? [
          {
            key: "returned_at",
            title: "Returned",
            render: (item) => date(item.returned_at, timezone),
          },
        ]
      : []),
    {
      key: "status",
      title: "Status",
      render: (item) => (
        <>
          <Status value={item.overdue ? "OVERDUE" : item.status} />
          {item.returned_overdue && (
            <small className="cell-detail danger-text">Returned late</small>
          )}
        </>
      ),
    },
    ...(onReturn
      ? [
          {
            key: "actions",
            title: "Action",
            render: (item) =>
              item.status === "ACTIVE" ? (
                <button
                  className="button secondary small"
                  onClick={() => onReturn(item)}
                >
                  Process return
                </button>
              ) : (
                <span className="muted">Closed</span>
              ),
          },
        ]
      : []),
  ];
  return (
    <div className={!admin && !history ? "compact-loan-table" : undefined}>
      <DataTable
        columns={columns}
        rows={items}
        emptyTitle={
          history ? "Your reading story starts here" : "No books on loan"
        }
        emptyMessage={
          history
            ? "Returned books will appear here with their borrowing history."
            : admin
              ? "Active library loans will appear here."
              : "Explore the collection and find a book to spend some time with."
        }
      />
    </div>
  );
}
