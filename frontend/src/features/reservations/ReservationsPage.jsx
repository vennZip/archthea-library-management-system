import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, BookOpen } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../hooks/useResource";
import { api, queryString } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  Status,
  Pagination,
} from "../../components/ui/Common";
import { DataTable } from "../../components/ui/DataTable";
import { ConfirmDialog } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { date } from "../../lib/format";

export default function ReservationsPage() {
  const { user } = useAuth();
  const admin = user.role === "LIBRARIAN";
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(false);
  const resource = useResource(
    `${admin ? "/reservations" : "/me/reservations"}${queryString({ status, page, page_size: 10 })}`,
  );
  const settings = useResource("/settings");
  const toast = useToast();
  async function perform() {
    setPending(true);
    try {
      if (selected.action === "borrow")
        await api("/loans", {
          method: "POST",
          body: { book_id: selected.book_id },
          idempotent: true,
        });
      else await api(`/reservations/${selected.id}/cancel`, { method: "POST" });
      toast(
        selected.action === "borrow"
          ? "Reserved book borrowed. Your due date is in My borrowed books."
          : "Reservation cancelled.",
      );
      setSelected(null);
      resource.reload();
    } catch (error) {
      toast(error.message, "error");
      setSelected(null);
      resource.reload();
    } finally {
      setPending(false);
    }
  }
  const columns = [
    {
      key: "book",
      title: "Book",
      render: (item) => (
        <Link className="table-title" to={`/app/catalog/${item.book.id}`}>
          {item.book.title}
        </Link>
      ),
    },
    ...(admin
      ? [
          {
            key: "student",
            title: "Student",
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
      key: "status",
      title: "Status",
      render: (item) => <Status value={item.status} />,
    },
    {
      key: "position",
      title: "Queue",
      render: (item) =>
        item.queue_position ? (
          <span className="queue-badge">#{item.queue_position}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "created_at",
      title: "Requested",
      render: (item) => date(item.created_at, settings.data?.timezone),
    },
    {
      key: "expires_at",
      title: "Collect before",
      render: (item) =>
        item.status === "READY_FOR_PICKUP" ? (
          <strong className="pickup-deadline">
            {date(item.expires_at, settings.data?.timezone, true)}
          </strong>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      title: "Actions",
      render: (item) =>
        ["WAITING", "READY_FOR_PICKUP"].includes(item.status) ? (
          <div className="row-actions">
            {item.status === "READY_FOR_PICKUP" &&
              (admin ? (
                <Link
                  className="button primary small"
                  to={`/app/circulation?book=${item.book_id}&student=${item.student_id}`}
                >
                  Collect
                </Link>
              ) : (
                <button
                  className="button primary small"
                  onClick={() => setSelected({ ...item, action: "borrow" })}
                >
                  Borrow now
                </button>
              ))}
            <button
              className="text-button danger-text"
              onClick={() => setSelected({ ...item, action: "cancel" })}
            >
              Cancel
            </button>
          </div>
        ) : (
          <span className="muted">Closed</span>
        ),
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="GOOD THINGS ARE WORTH WAITING FOR"
        title={admin ? "Reservations & waiting lists" : "Your place in line"}
        description={
          admin
            ? "Track waiting readers, pickup allocations, and collection deadlines."
            : "We’ll let you know when your next chapter is ready."
        }
      >
        {!admin && (
          <Link className="button secondary" to="/app/catalog">
            <BookOpen size={17} />
            Explore books
          </Link>
        )}
      </PageHeading>
      <div className="reservation-info">
        <Bookmark size={23} strokeWidth={1.4} />
        <p>
          Reservations follow the order they were placed. Once a copy is ready,
          you have{" "}
          <strong>
            {settings.data?.collection_hours ?? "the configured number of"}{" "}
            hours
          </strong>{" "}
          to collect it.
        </p>
      </div>
      <section className="panel">
        <div className="tab-bar" role="group" aria-label="Reservation status">
          {[
            ["ACTIVE", "Active"],
            ["WAITING", "Waiting"],
            ["READY_FOR_PICKUP", "Ready to collect"],
            ["COMPLETED", "Completed"],
            ["", "All records"],
          ].map(([value, title]) => (
            <button
              className={status === value ? "active" : ""}
              aria-pressed={status === value}
              key={value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {title}
            </button>
          ))}
        </div>
        <ResourceState resource={resource}>
          <DataTable
            columns={columns}
            rows={resource.data?.items}
            emptyTitle="No reservations here"
            emptyMessage={
              admin
                ? "Reservation activity will appear as students join waiting lists."
                : "Find an unavailable book in the collection to join its waiting list."
            }
          />
        </ResourceState>
        <Pagination data={resource.data} onChange={setPage} />
      </section>
      {selected && (
        <ConfirmDialog
          title={
            selected.action === "borrow"
              ? "Collect your reserved book?"
              : "Cancel this reservation?"
          }
          message={
            selected.action === "borrow"
              ? `Your eligibility will be checked before borrowing ${selected.book.title}.`
              : `Your place in the waiting list for ${selected.book.title} will be released.`
          }
          confirmLabel={
            selected.action === "borrow"
              ? "Confirm borrowing"
              : "Cancel reservation"
          }
          danger={selected.action === "cancel"}
          pending={pending}
          onClose={() => setSelected(null)}
          onConfirm={perform}
        />
      )}
    </>
  );
}
