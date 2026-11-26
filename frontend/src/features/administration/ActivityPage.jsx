import { useState } from "react";
import { useResource } from "../../hooks/useResource";
import {
  PageHeading,
  ResourceState,
  Pagination,
  Status,
} from "../../components/ui/Common";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { date, label } from "../../lib/format";

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const resource = useResource(`/audit-logs?page=${page}&page_size=15`);
  const policy = useResource("/settings");
  return (
    <>
      <PageHeading
        eyebrow="EVERY CHANGE HAS A STORY"
        title="Library activity"
        description="A reliable record of administrative changes and circulation activity."
      />
      <section className="panel">
        <ResourceState resource={resource}>
          <DataTable
            rows={resource.data?.items}
            emptyTitle="No activity recorded yet"
            emptyMessage="Changes to books, accounts, policies, and circulation will be recorded here."
            columns={[
              {
                key: "action",
                title: "Activity",
                render: (item) => <strong>{label(item.action)}</strong>,
              },
              {
                key: "actor",
                title: "Performed by",
                render: (item) => item.actor?.full_name || "Library system",
              },
              {
                key: "entity_type",
                title: "Record type",
                render: (item) => label(item.entity_type),
              },
              {
                key: "created_at",
                title: "When",
                render: (item) =>
                  date(item.created_at, policy.data?.timezone, true),
              },
              {
                key: "details",
                title: "Details",
                render: (item) => (
                  <button
                    className="button secondary small"
                    onClick={() => setSelected(item)}
                  >
                    View details
                  </button>
                ),
              },
            ]}
          />
        </ResourceState>
        <Pagination data={resource.data} onChange={setPage} />
      </section>
      {selected && (
        <Modal title={label(selected.action)} onClose={() => setSelected(null)}>
          <p className="muted">
            {date(selected.created_at, policy.data?.timezone, true)} ·{" "}
            {selected.actor?.full_name || "Library system"}
          </p>
          <dl className="audit-details">
            <dt>Record identifier</dt>
            <dd>{selected.entity_id || "Library settings"}</dd>
          </dl>
          <pre className="json-details">
            {JSON.stringify(selected.details, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
}
