import { useState } from "react";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  Field,
  FormError,
} from "../../components/ui/Common";
import { DataTable } from "../../components/ui/DataTable";
import { Modal, ConfirmDialog } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";

export default function ReferencePage() {
  const [tab, setTab] = useState("categories");
  const resource = useResource(`/${tab}`);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const singular = {
    categories: "category",
    authors: "author",
    publishers: "publisher",
  }[tab];
  async function remove() {
    setPending(true);
    try {
      await api(`/${tab}/${deleting.id}`, { method: "DELETE" });
      toast(`${singular[0].toUpperCase() + singular.slice(1)} deleted.`);
      setDeleting(null);
      resource.reload();
    } catch (error) {
      toast(error.message, "error");
      setDeleting(null);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="THE FOUNDATIONS OF YOUR COLLECTION"
        title="Catalog details"
        description="Keep categories, authors, and publishers consistent across your library."
      >
        <button className="button primary" onClick={() => setEditing({})}>
          <Plus size={18} />
          Add {singular}
        </button>
      </PageHeading>
      <section className="panel">
        <div className="tab-bar" role="group" aria-label="Reference type">
          {["categories", "authors", "publishers"].map((value) => (
            <button
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              key={value}
              onClick={() => setTab(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <ResourceState resource={resource}>
          <DataTable
            rows={resource.data}
            emptyTitle={`No ${tab} yet`}
            emptyMessage={`Add your first ${singular} to organize your collection.`}
            columns={[
              {
                key: "name",
                title: "Name",
                render: (item) => <strong>{item.name}</strong>,
              },
              {
                key: "actions",
                title: "Actions",
                render: (item) => (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => setEditing(item)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </ResourceState>
      </section>
      {editing && (
        <ReferenceForm
          entity={tab}
          item={editing}
          singular={singular}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            resource.reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete this ${singular}?`}
          message={`“${deleting.name}” can be deleted only if no book references it.`}
          confirmLabel="Delete record"
          danger
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
function ReferenceForm({ entity, item, singular, onClose, onSaved }) {
  const [name, setName] = useState(item.name || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/${entity}${item.id ? `/${item.id}` : ""}`, {
        method: item.id ? "PATCH" : "POST",
        body: { name },
      });
      toast("Catalog details saved.");
      onSaved();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={`${item.id ? "Edit" : "Add"} ${singular}`}
      onClose={pending ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Field label="Name">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
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
            {pending ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
