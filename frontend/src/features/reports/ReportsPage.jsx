import { useState } from "react";
import {
  Download,
  Printer,
  LibraryBig,
  Users,
  BookMarked,
  Bookmark,
  Clock3,
  RotateCcw,
  TriangleAlert,
  Package,
} from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  StatCard,
  EmptyState,
} from "../../components/ui/Common";
import { DataTable } from "../../components/ui/DataTable";
import { useToast } from "../../components/ui/Toast";
import { BorrowingChart } from "./BorrowingChart";
import { number, date } from "../../lib/format";

export default function ReportsPage() {
  const resource = useResource("/reports");
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const report = resource.data;
  async function download() {
    setPending(true);
    try {
      const response = await api("/reports/export?format=csv", { raw: true });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `archthea-report-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="reports-page">
      <PageHeading
        eyebrow="THE STORY BEHIND THE SHELVES"
        title="Reports & insights"
        description="Understand your collection, your readers, and the rhythm of your library."
      >
        <button
          className="button secondary"
          disabled={!report}
          onClick={() => window.print()}
        >
          <Printer size={17} />
          Print / save PDF
        </button>
        <button
          className="button primary"
          disabled={pending || !report}
          onClick={download}
        >
          <Download size={17} />
          {pending ? "Exporting…" : "Export CSV"}
        </button>
      </PageHeading>
      <p className="print-date">
        Archthea Library · Generated {date(new Date(), undefined, true)}
      </p>
      <ResourceState resource={resource}>
        {report && (
          <>
            <div className="stats-grid reports-stats">
              {[
                ["Books", report.summary.books, LibraryBig, "green"],
                ["Physical copies", report.summary.copies, Package, "blue"],
                ["Registered students", report.summary.students, Users, "gold"],
                [
                  "Available copies",
                  report.summary.available,
                  BookMarked,
                  "green",
                ],
                ["Active loans", report.summary.borrowed, BookOpenIcon, "blue"],
                [
                  "Active reservations",
                  report.summary.reservations,
                  Bookmark,
                  "gold",
                ],
                ["Overdue loans", report.summary.overdue, Clock3, "rose"],
                [
                  "Completed returns",
                  report.summary.returned,
                  RotateCcw,
                  "green",
                ],
              ].map(([title, value, Icon, tone]) => (
                <StatCard
                  key={title}
                  label={title}
                  value={value}
                  icon={Icon}
                  tone={tone}
                />
              ))}
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Borrowing & return trends</h2>
                  <p>Monthly activity across the library.</p>
                </div>
              </div>
              <BorrowingChart data={report.monthly} />
              <DataTable
                rows={report.monthly}
                rowKey="month"
                columns={[
                  { key: "month", title: "Month" },
                  { key: "borrowed", title: "Borrowed" },
                  { key: "returned", title: "Returned" },
                ]}
              />
            </section>
            <div className="dashboard-columns">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Most borrowed books</h2>
                    <p>Titles that keep finding new readers.</p>
                  </div>
                </div>
                <DataTable
                  rows={report.popular_books}
                  emptyTitle="The favorites are still taking shape"
                  emptyMessage="Popular titles appear after books are borrowed."
                  columns={[
                    {
                      key: "title",
                      title: "Book",
                      render: (item) => <strong>{item.title}</strong>,
                    },
                    {
                      key: "count",
                      title: "Loans",
                      render: (item) => number(item.count),
                    },
                  ]}
                />
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Most active readers</h2>
                    <p>Your community’s reading champions.</p>
                  </div>
                </div>
                <DataTable
                  rows={report.active_borrowers}
                  emptyTitle="A new reading community"
                  emptyMessage="Borrower activity will appear here."
                  columns={[
                    {
                      key: "full_name",
                      title: "Student",
                      render: (item) => (
                        <div className="table-person">
                          <strong>{item.full_name}</strong>
                          <small>{item.student_number}</small>
                        </div>
                      ),
                    },
                    {
                      key: "count",
                      title: "Loans",
                      render: (item) => number(item.count),
                    },
                  ]}
                />
              </section>
            </div>
            <div className="dashboard-columns">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Curiosity by category</h2>
                    <p>How borrowing is shared across subjects.</p>
                  </div>
                </div>
                {report.categories.length ? (
                  <div className="category-bars">
                    {report.categories.map((item) => (
                      <div key={item.id}>
                        <div>
                          <span>{item.name}</span>
                          <strong>{number(item.count)} loans</strong>
                        </div>
                        <div className="category-track">
                          <span
                            style={{
                              width: `${(Number(item.count) / Math.max(1, ...report.categories.map((row) => Number(row.count)))) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No categories yet"
                    message="Add categories to organize your collection."
                  />
                )}
              </section>
              <section className="panel inventory-report">
                <div className="panel-heading">
                  <div>
                    <h2>Inventory needing attention</h2>
                    <p>Keep the collection in reading condition.</p>
                  </div>
                </div>
                <div>
                  <span>Damaged copies</span>
                  <strong>{number(report.summary.damaged)}</strong>
                </div>
                <div>
                  <span>Lost copies</span>
                  <strong>{number(report.summary.lost)}</strong>
                </div>
                <p className="form-hint">
                  Damaged, lost, and maintenance copies are excluded from
                  borrowing availability.
                </p>
              </section>
            </div>
          </>
        )}
      </ResourceState>
    </div>
  );
}
const BookOpenIcon = BookMarked;
