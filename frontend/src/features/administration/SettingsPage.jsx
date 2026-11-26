import { useState } from "react";
import { Link } from "react-router-dom";
import { Settings2, ShieldCheck, BookOpen, Tags } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  Field,
  FormError,
} from "../../components/ui/Common";
import { useToast } from "../../components/ui/Toast";

export default function SettingsPage() {
  const resource = useResource("/settings");
  return (
    <>
      <PageHeading
        eyebrow="A LIBRARY THAT WORKS FOR YOUR COMMUNITY"
        title="Library settings"
        description="Set clear borrowing rules and keep your collection moving."
      />
      <ResourceState resource={resource}>
        {resource.data && (
          <SettingsForm
            key={resource.data.updated_at}
            policy={resource.data}
            onSaved={resource.reload}
          />
        )}
      </ResourceState>
      <section className="panel settings-link">
        <span className="feature-icon">
          <Tags size={24} />
        </span>
        <div>
          <h2>Organize the collection</h2>
          <p>Manage your book categories, authors, and publishers.</p>
        </div>
        <Link className="button secondary" to="/app/reference-data">
          Manage catalog details
        </Link>
      </section>
    </>
  );
}
function SettingsForm({ policy, onSaved }) {
  const [form, setForm] = useState(
    Object.fromEntries(
      [
        "max_books",
        "loan_days",
        "max_reservations",
        "collection_hours",
        "restrict_overdue",
        "timezone",
      ].map((key) => [key, policy[key]]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const change = (event) =>
    setForm((previous) => ({
      ...previous,
      [event.target.name]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.type === "number"
            ? Number(event.target.value)
            : event.target.value,
    }));
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/settings", { method: "PATCH", body: form });
      toast("Library policies updated. Existing loan due dates are unchanged.");
      onSaved();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <h2>Borrowing & reservations</h2>
          <p>Changes apply to future transactions and allocations.</p>
        </div>
        <Settings2 size={21} />
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="Maximum borrowed books"
            hint="Per student, from 1 to 50."
          >
            <input
              name="max_books"
              type="number"
              min={1}
              max={50}
              required
              value={form.max_books}
              onChange={change}
            />
          </Field>
          <Field label="Borrowing period in days" hint="From 1 to 365 days.">
            <input
              name="loan_days"
              type="number"
              min={1}
              max={365}
              required
              value={form.loan_days}
              onChange={change}
            />
          </Field>
          <Field
            label="Maximum active reservations"
            hint="Per student, from 1 to 50."
          >
            <input
              name="max_reservations"
              type="number"
              min={1}
              max={50}
              required
              value={form.max_reservations}
              onChange={change}
            />
          </Field>
          <Field
            label="Pickup period in hours"
            hint="From 1 to 720 hours after allocation."
          >
            <input
              name="collection_hours"
              type="number"
              min={1}
              max={720}
              required
              value={form.collection_hours}
              onChange={change}
            />
          </Field>
          <Field
            label="Library timezone"
            hint="An IANA timezone, such as Asia/Singapore."
          >
            <input
              name="timezone"
              required
              list="library-timezones"
              value={form.timezone}
              onChange={change}
            />
            <datalist id="library-timezones">
              <option value="Asia/Singapore" />
              <option value="Asia/Manila" />
              <option value="UTC" />
            </datalist>
          </Field>
        </div>
        <div className="policy-toggle">
          <div>
            <strong>Restrict accounts with overdue books</strong>
            <p>
              Students must return overdue books before borrowing or reserving
              again.
            </p>
          </div>
          <label className="switch">
            <input
              aria-label="Restrict overdue accounts"
              name="restrict_overdue"
              type="checkbox"
              checked={form.restrict_overdue}
              onChange={change}
            />
            <span />
          </label>
        </div>
        <FormError error={error} />
        <div className="form-actions">
          <span className="form-hint">
            <ShieldCheck size={15} /> Policy changes are recorded in the
            activity log.
          </span>
          <button className="button primary" disabled={pending}>
            {pending ? "Saving…" : "Save library policies"}
          </button>
        </div>
      </form>
    </section>
  );
}
