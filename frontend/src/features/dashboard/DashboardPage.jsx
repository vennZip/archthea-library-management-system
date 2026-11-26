import { Link } from "react-router-dom";
import {
  BookOpen,
  BookMarked,
  Bookmark,
  LibraryBig,
  Clock3,
  Users,
  Plus,
  RotateCcw,
  Sparkles,
  CalendarDays,
  CircleAlert,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../hooks/useResource";
import {
  PageHeading,
  ResourceState,
  StatCard,
  EmptyState,
  Status,
} from "../../components/ui/Common";
import { date, dueLabel, label, number } from "../../lib/format";
import { BookCard } from "../catalog/BookCard";
import { LoanTable } from "../loans/LoanTable";
import { BorrowingChart } from "../reports/BorrowingChart";

function PanelHeading({ title, description, to, linkText = "View all" }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {linkText}
        </Link>
      )}
    </div>
  );
}
export default function DashboardPage() {
  const { user } = useAuth();
  const admin = user.role === "LIBRARIAN";
  const resource = useResource(`/dashboard/${admin ? "admin" : "student"}`);
  const firstName = user.full_name.split(" ")[0];
  return (
    <>
      <PageHeading
        eyebrow={
          admin ? "THE LIBRARY AT A GLANCE" : "YOUR PERSONAL READING SPACE"
        }
        title={`Welcome back, ${firstName}.`}
        description={
          admin
            ? "A thoughtful space for a well-run library."
            : "A good day to discover something new."
        }
      >
        <span className="date-chip">
          <CalendarDays size={16} />
          {date(new Date(), resource.data?.eligibility?.policy.timezone)}
        </span>
      </PageHeading>
      <ResourceState resource={resource}>
        {resource.data &&
          (admin ? (
            <AdminDashboard data={resource.data} />
          ) : (
            <StudentDashboard data={resource.data} />
          ))}
      </ResourceState>
    </>
  );
}
function StudentDashboard({ data }) {
  const policy = data.eligibility.policy;
  const dueSoon = data.loans.filter(
    (loan) =>
      new Date(loan.due_at) >= new Date() &&
      new Date(loan.due_at) <= new Date(Date.now() + 7 * 86400000),
  ).length;
  return (
    <>
      <section className="welcome-banner">
        <div>
          <span className="eyebrow">MAKE ROOM FOR DISCOVERY</span>
          <h2>
            One good book.
            <br />
            <em>Endless possibilities.</em>
          </h2>
          <p>Your next chapter is waiting in the collection.</p>
          <Link className="button cream small" to="/app/catalog">
            <BookOpen size={17} />
            Find your next read
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-circle" />
          <div className="welcome-book">
            <BookOpen size={56} strokeWidth={0.9} />
            <span>
              STAY
              <br />
              <em>curious.</em>
            </span>
          </div>
          <span className="welcome-spark">✦</span>
        </div>
      </section>
      <div className="stats-grid">
        <StatCard
          label="Books on loan"
          value={data.loans.length}
          detail={`Of your ${policy.max_books}-book borrowing allowance`}
          icon={BookMarked}
        />
        <StatCard
          label="Due within 7 days"
          value={dueSoon}
          detail="A little reminder to plan ahead"
          icon={Clock3}
          tone="gold"
        />
        <StatCard
          label="Active reservations"
          value={data.reservations.length}
          detail={`${policy.max_reservations} reservations allowed`}
          icon={Bookmark}
          tone="blue"
        />
        <StatCard
          label="Titles available"
          value={data.available_titles}
          detail="Ready for your next discovery"
          icon={LibraryBig}
          tone="rose"
        />
      </div>
      {!data.eligibility.eligible && (
        <div className="inline-notice">
          <CircleAlert size={20} />
          <div>
            <strong>Before your next checkout</strong>
            <p>{data.eligibility.reasons.join(" · ")}</p>
          </div>
        </div>
      )}
      <div className="dashboard-columns">
        <section className="panel">
          <PanelHeading
            title="Currently on your shelf"
            description="Your borrowed books and upcoming due dates."
            to="/app/loans"
          />
          <LoanTable
            items={[...data.loans]
              .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
              .slice(0, 3)}
            timezone={policy.timezone}
          />
        </section>
        <section className="panel">
          <PanelHeading
            title="Your place in line"
            description="Good things are worth waiting for."
            to="/app/reservations"
          />
          {data.reservations.length ? (
            <div className="reservation-preview">
              {data.reservations.slice(0, 3).map((item) => (
                <div key={item.id}>
                  <span className="queue-number">
                    {item.status === "READY_FOR_PICKUP" ? (
                      <Bookmark size={20} />
                    ) : (
                      `#${item.queue_position}`
                    )}
                  </span>
                  <div>
                    <Link to={`/app/catalog/${item.book.id}`}>
                      {item.book.title}
                    </Link>
                    <p>
                      {item.status === "READY_FOR_PICKUP"
                        ? `Collect by ${date(item.expires_at, policy.timezone, true)}`
                        : "Waiting for an available copy"}
                    </p>
                    <Status value={item.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No reservations yet"
              message="When a book is on loan, save your place in its waiting list."
            />
          )}
        </section>
      </div>
      <section className="recommendations">
        <PanelHeading
          title="Well-loved in your library"
          description="A little inspiration for your next chapter."
          to="/app/catalog?sort=popular"
          linkText="Explore the collection"
        />
        {data.popular.length ? (
          <div className="book-grid">
            {data.popular.map((book) => (
              <BookCard book={book} key={book.id} />
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              title="New discoveries are on their way"
              message="Your librarian is preparing the collection."
            />
          </div>
        )}
      </section>
      <section className="panel">
        <PanelHeading
          title="Recently returned"
          description="A few chapters from your reading story."
          to="/app/history"
        />
        <LoanTable items={data.history} history timezone={policy.timezone} />
      </section>
    </>
  );
}
function AdminDashboard({ data }) {
  const s = data.summary;
  return (
    <>
      <div className="admin-intro-strip">
        <span className="intro-icon">
          <LibraryBig size={24} strokeWidth={1.4} />
        </span>
        <div>
          <strong>A library in good hands.</strong>
          <p>Keep the collection moving and your community reading.</p>
        </div>
        <Link className="button primary small" to="/app/circulation">
          <Plus size={16} />
          New checkout
        </Link>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Books in collection"
          value={s.books}
          detail={`${number(s.copies)} physical copies`}
          icon={LibraryBig}
        />
        <StatCard
          label="Currently borrowed"
          value={s.borrowed}
          detail={`${number(s.available)} copies available`}
          icon={BookMarked}
          tone="blue"
        />
        <StatCard
          label="Registered students"
          value={s.students}
          detail="Your library community"
          icon={Users}
          tone="gold"
        />
        <StatCard
          label="Overdue books"
          value={s.overdue}
          detail={
            s.overdue
              ? "Ready for your attention"
              : "All active loans are on track"
          }
          icon={Clock3}
          tone="rose"
        />
      </div>
      <div className="dashboard-columns chart-columns">
        <section className="panel">
          <PanelHeading
            title="The rhythm of your library"
            description="Borrowing and returns over the last six months."
            to="/app/reports"
            linkText="View reports"
          />
          <BorrowingChart data={data.monthly} />
        </section>
        <section className="panel quick-actions">
          <PanelHeading
            title="A few useful shortcuts"
            description="Keep your library moving."
          />
          <Link to="/app/catalog?add=true">
            <span>
              <Plus size={21} />
            </span>
            <div>
              <strong>Add to the collection</strong>
              <p>A new title, a new possibility.</p>
            </div>
          </Link>
          <Link to="/app/circulation">
            <span>
              <RotateCcw size={21} />
            </span>
            <div>
              <strong>Checkouts & returns</strong>
              <p>Put the next chapter in motion.</p>
            </div>
          </Link>
          <Link to="/app/students">
            <span>
              <Users size={21} />
            </span>
            <div>
              <strong>Welcome a student</strong>
              <p>Grow your reading community.</p>
            </div>
          </Link>
          <div className="quick-reservations">
            <Bookmark size={19} />
            <span>
              <strong>{number(s.reservations)}</strong> active reservations
            </span>
          </div>
        </section>
      </div>
      <section className="panel">
        <PanelHeading
          title="Needs a little attention"
          description="Outstanding books past their due date."
          to="/app/circulation?status=OVERDUE"
          linkText="Manage overdue books"
        />
        <LoanTable items={data.overdue} admin />
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <PanelHeading
            title="Recent library activity"
            description="The latest chapters behind the scenes."
            to="/app/activity"
          />
          {data.activity.length ? (
            <div className="activity-list">
              {data.activity.map((item) => (
                <div key={item.id}>
                  <span className="activity-icon">
                    <BookOpen size={17} />
                  </span>
                  <div>
                    <strong>{label(item.action)}</strong>
                    <p>{item.actor?.full_name || "Library system"}</p>
                  </div>
                  <time>{date(item.created_at, undefined, true)}</time>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="A fresh activity log"
              message="Library activity will appear here."
            />
          )}
        </section>
        <section className="panel">
          <PanelHeading
            title="Readers waiting for a chapter"
            description="Current reservations and pickup holds."
            to="/app/reservations"
          />
          {data.reservations.length ? (
            <div className="reservation-preview">
              {data.reservations.map((item) => (
                <div key={item.id}>
                  <span className="queue-number">
                    {item.status === "WAITING" ? (
                      `#${item.queue_position}`
                    ) : (
                      <Bookmark size={20} />
                    )}
                  </span>
                  <div>
                    <Link to={`/app/catalog/${item.book.id}`}>
                      {item.book.title}
                    </Link>
                    <p>{item.student.profile.full_name}</p>
                    <Status value={item.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No one is waiting"
              message="New reservations will appear here."
            />
          )}
        </section>
      </div>
    </>
  );
}
