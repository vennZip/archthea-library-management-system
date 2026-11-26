import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BookOpen, Bookmark, CheckCheck, Clock3 } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  EmptyState,
  Pagination,
} from "../../components/ui/Common";
import { useToast } from "../../components/ui/Toast";
import { date } from "../../lib/format";

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [pending, setPending] = useState(false);
  const resource = useResource(
    `/notifications?page=${page}&page_size=12${unread ? "&unread=true" : ""}`,
  );
  const policy = useResource("/settings");
  const toast = useToast();
  async function markRead(id) {
    setPending(true);
    try {
      await api(id ? `/notifications/${id}/read` : "/notifications/read-all", {
        method: id ? "PATCH" : "POST",
      });
      resource.reload();
      if (!id) toast("All notifications marked as read.");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE HELP STAYING ON TRACK"
        title="Your library updates"
        description="Borrowing confirmations, gentle reminders, and good news from the waiting list."
      >
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => markRead()}
        >
          <CheckCheck size={17} />
          Mark all as read
        </button>
      </PageHeading>
      <section className="panel">
        <div className="tab-bar" role="group" aria-label="Notification filter">
          <button
            className={!unread ? "active" : ""}
            aria-pressed={!unread}
            onClick={() => {
              setUnread(false);
              setPage(1);
            }}
          >
            All updates
          </button>
          <button
            className={unread ? "active" : ""}
            aria-pressed={unread}
            onClick={() => {
              setUnread(true);
              setPage(1);
            }}
          >
            Unread
          </button>
        </div>
        <ResourceState resource={resource}>
          {resource.data?.items.length ? (
            <div className="notification-list">
              {resource.data.items.map((item) => {
                const reservation =
                  item.type.includes("RESERVATION") ||
                  item.type.includes("PICKUP");
                const reminder =
                  item.type.includes("OVERDUE") ||
                  item.type.includes("DUE_SOON");
                const Icon = reservation
                  ? Bookmark
                  : reminder
                    ? Clock3
                    : BookOpen;
                return (
                  <article
                    className={item.read_at ? "" : "unread"}
                    key={item.id}
                  >
                    <span
                      className={`notification-icon ${reminder ? "warning" : ""}`}
                    >
                      <Icon size={22} strokeWidth={1.5} />
                    </span>
                    <div>
                      <h3>
                        {item.title}
                        {!item.read_at && (
                          <span className="unread-dot" aria-label="Unread" />
                        )}
                      </h3>
                      <p>{item.message}</p>
                      <div className="notification-meta">
                        <time>
                          {date(item.created_at, policy.data?.timezone, true)}
                        </time>
                        <Link
                          to={reservation ? "/app/reservations" : "/app/loans"}
                        >
                          View {reservation ? "reservations" : "borrowed books"}
                        </Link>
                      </div>
                    </div>
                    {!item.read_at && (
                      <button
                        className="icon-button"
                        disabled={pending}
                        aria-label={`Mark ${item.title} as read`}
                        onClick={() => markRead(item.id)}
                      >
                        <CheckCheck size={18} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Bell}
              title={unread ? "You’re all caught up" : "A quiet moment"}
              message={
                unread
                  ? "You have no unread library updates."
                  : "Your borrowing updates and reminders will appear here."
              }
            />
          )}
        </ResourceState>
        <Pagination data={resource.data} onChange={setPage} />
      </section>
    </>
  );
}
