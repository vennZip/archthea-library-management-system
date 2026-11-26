import { useState } from "react";
import { Plus, Pencil, Archive } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import { useToast } from "../../components/ui/Toast";
import {
  ResourceState,
  Status,
  Pagination,
  Field,
  FormError,
} from "../../components/ui/Common";
import { DataTable } from "../../components/ui/DataTable";
import { Modal, ConfirmDialog } from "../../components/ui/Modal";
import { label, date } from "../../lib/format";

export default function CopyManager({ bookId, onChanged }) {
  const [page, setPage] = useState(1);
  const resource = useResource(
    `/books/${bookId}/copies?page=${page}&page_size=10`,
  );
  const [editing, setEditing] = useState(null);
  const [retiring, setRetiring] = useState(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  function refresh() {
    resource.reload();
    onChanged?.();
  }
  async function retire() {
    setPending(true);
    try {
      await api(`/copies/${retiring.id}`, { method: "DELETE" });
      toast("Copy retired. Its history has been preserved.");
      setRetiring(null);
      refresh();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel copy-manager">
      <div className="panel-heading">
        <div>
          <h2>Every copy, accounted for</h2>
          <p>Manage barcodes, conditions, and inventory availability.</p>
        </div>
        <button
          className="button secondary small"
          onClick={() => setEditing({})}
        >
          <Plus size={17} />
          Add copy
        </button>
      </div>
      <ResourceState resource={resource}>
        <DataTable
          rows={resource.data?.items}
          emptyTitle="No physical copies yet"
          emptyMessage="Add a copy to make this title available for borrowing."
          columns={[
            {
              key: "barcode",
              title: "Barcode",
              render: (copy) => (
                <strong className="monospace">{copy.barcode}</strong>
              ),
            },
            {
              key: "status",
              title: "Status",
              render: (copy) => <Status value={copy.status} />,
            },
            {
              key: "condition",
              title: "Condition",
              render: (copy) => label(copy.condition),
            },
            {
              key: "notes",
              title: "Notes",
              render: (copy) => (
                <span className="table-note">{copy.notes || "—"}</span>
              ),
            },
            {
              key: "created_at",
              title: "Added",
              render: (copy) => date(copy.created_at),
            },
            {
              key: "actions",
              title: "Actions",
              render: (copy) => (
                <div className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit copy ${copy.barcode}`}
                    title={
                      ["BORROWED", "RESERVED"].includes(copy.status)
                        ? "Process the loan or reservation first"
                        : "Edit copy"
                    }
                    disabled={["BORROWED", "RESERVED"].includes(copy.status)}
                    onClick={() => setEditing(copy)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Retire copy ${copy.barcode}`}
                    disabled={["BORROWED", "RESERVED"].includes(copy.status)}
                    onClick={() => setRetiring(copy)}
                  >
                    <Archive size={16} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </ResourceState>
      <Pagination data={resource.data} onChange={setPage} />
      {editing && (
        <CopyForm
          bookId={bookId}
          copy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {retiring && (
        <ConfirmDialog
          title="Retire this copy?"
          message={`${retiring.barcode} will leave active inventory. Previous loan records will remain available.`}
          confirmLabel="Retire copy"
          danger
          pending={pending}
          onClose={() => setRetiring(null)}
          onConfirm={retire}
        />
      )}
    </section>
  );
}
function CopyForm({ bookId, copy, onClose, onSaved }) {
  const [form, setForm] = useState({
    barcode: copy.barcode || "",
    status: copy.status || "AVAILABLE",
    condition: copy.condition || "GOOD",
    notes: copy.notes || "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  function change(event) {
    const { name, value } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "status" && ["DAMAGED", "LOST"].includes(value)
        ? { condition: value }
        : {}),
    }));
  }
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = { ...form };
      if (!body.barcode) delete body.barcode;
      await api(copy.id ? `/copies/${copy.id}` : `/books/${bookId}/copies`, {
        method: copy.id ? "PATCH" : "POST",
        body,
      });
      toast(copy.id ? "Copy updated." : "Copy added to inventory.");
      onSaved();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={copy.id ? "Edit physical copy" : "Add a physical copy"}
      onClose={pending ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Field
          label="Barcode"
          hint={
            copy.id
              ? "Unique across the library."
              : "Leave blank to generate a unique barcode."
          }
        >
          <input
            name="barcode"
            value={form.barcode}
            maxLength={80}
            required={Boolean(copy.id)}
            onChange={change}
          />
        </Field>
        <div className="form-grid">
          <Field label="Status">
            <select name="status" value={form.status} onChange={change}>
              {["AVAILABLE", "DAMAGED", "LOST", "MAINTENANCE"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select name="condition" value={form.condition} onChange={change}>
              {["NEW", "GOOD", "WORN", "DAMAGED", "LOST"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Staff notes">
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            value={form.notes}
            onChange={change}
          />
        </Field>
        <FormError error={error} />
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "Saving…" : "Save copy"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
