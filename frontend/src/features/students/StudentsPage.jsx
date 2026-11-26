import { useState } from "react";
import { Plus, Pencil, UserRound, ShieldCheck, Mail } from "lucide-react";
import { useResource, useDebounced } from "../../hooks/useResource";
import { api, queryString } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  Status,
  Pagination,
  SearchInput,
  Field,
  FormError,
} from "../../components/ui/Common";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { initials } from "../../lib/format";
import { LoanTable } from "../loans/LoanTable";

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const resource = useResource(
    `/students${queryString({ q, page, page_size: 10 })}`,
  );
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  return (
    <>
      <PageHeading
        eyebrow="A COMMUNITY OF CURIOUS MINDS"
        title="Your library community"
        description="Welcome readers, manage accounts, and support their next discovery."
      >
        <button className="button primary" onClick={() => setEditing({})}>
          <Plus size={18} />
          Register student
        </button>
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search students by name…"
            label="Search students"
          />
          <span className="muted">
            {resource.data?.total ?? "…"} registered students
          </span>
        </div>
        <ResourceState resource={resource}>
          <DataTable
            rows={resource.data?.items}
            emptyTitle="Your community starts here"
            emptyMessage="Register a student to welcome them to the library."
            columns={[
              {
                key: "name",
                title: "Student",
                render: (student) => (
                  <button
                    className="person-button"
                    onClick={() => setSelected(student)}
                  >
                    <span className="avatar">
                      {initials(student.profile.full_name)}
                    </span>
                    <span>
                      <strong>{student.profile.full_name}</strong>
                      <small>{student.student_number}</small>
                    </span>
                  </button>
                ),
              },
              {
                key: "program",
                title: "Program",
                render: (student) => student.program || "Not specified",
              },
              {
                key: "year_level",
                title: "Year",
                render: (student) => student.year_level || "—",
              },
              {
                key: "status",
                title: "Account",
                render: (student) => <Status value={student.profile.status} />,
              },
              {
                key: "eligibility",
                title: "Restrictions",
                render: (student) =>
                  student.borrowing_restricted ? (
                    <Status value="RESTRICTED">Borrowing restricted</Status>
                  ) : (
                    <span className="muted">No manual restriction</span>
                  ),
              },
              {
                key: "actions",
                title: "Actions",
                render: (student) => (
                  <div className="row-actions">
                    <button
                      className="button secondary small"
                      onClick={() => setSelected(student)}
                    >
                      View activity
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${student.profile.full_name}`}
                      onClick={() => setEditing(student)}
                    >
                      <Pencil size={17} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </ResourceState>
        <Pagination data={resource.data} onChange={setPage} />
      </section>
      {editing && (
        <StudentForm
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            resource.reload();
          }}
        />
      )}
      {selected && (
        <StudentActivity student={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
function StudentForm({ student, onClose, onSaved }) {
  const isNew = !student.id;
  const [form, setForm] = useState({
    full_name: student.profile?.full_name || "",
    student_number: student.student_number || "",
    email: "",
    program: student.program || "",
    year_level: student.year_level || "",
    status: student.profile?.status || "ACTIVE",
    borrowing_restricted: student.borrowing_restricted || false,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const change = (event) =>
    setForm((previous) => ({
      ...previous,
      [event.target.name]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value,
    }));
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body = {
      ...form,
      year_level: form.year_level ? Number(form.year_level) : null,
    };
    if (isNew) {
      delete body.status;
      delete body.borrowing_restricted;
    } else delete body.email;
    try {
      const result = await api(
        isNew ? "/students" : `/students/${student.id}`,
        { method: isNew ? "POST" : "PATCH", body },
      );
      toast(
        isNew
          ? result.email_sent
            ? "Student registered. A password setup email has been sent."
            : "Student registered. Email delivery failed; ask the student to use Forgot password."
          : "Student account updated.",
        isNew && !result.email_sent ? "error" : "success",
      );
      onSaved();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={isNew ? "Welcome a new student" : "Edit student account"}
      onClose={pending ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Field label="Full name">
          <input
            name="full_name"
            required
            minLength={2}
            maxLength={120}
            value={form.full_name}
            onChange={change}
            autoComplete="name"
          />
        </Field>
        <div className="form-grid">
          <Field label="Student number">
            <input
              name="student_number"
              required
              minLength={2}
              maxLength={40}
              value={form.student_number}
              onChange={change}
            />
          </Field>
          <Field label="Year level">
            <input
              name="year_level"
              type="number"
              min={1}
              max={12}
              value={form.year_level}
              onChange={change}
            />
          </Field>
        </div>
        {isNew && (
          <Field
            label="Email address"
            hint="The student will receive a link to choose a password."
          >
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              value={form.email}
              onChange={change}
              autoComplete="email"
            />
          </Field>
        )}
        <Field label="Program or course">
          <input
            name="program"
            maxLength={160}
            value={form.program}
            onChange={change}
          />
        </Field>
        {!isNew && (
          <>
            <Field label="Account status">
              <select name="status" value={form.status} onChange={change}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <label className="checkbox-field">
              <input
                name="borrowing_restricted"
                type="checkbox"
                checked={form.borrowing_restricted}
                onChange={change}
              />
              Restrict borrowing and reservations
            </label>
            <p className="form-hint">
              Deactivating or restricting an account cancels active reservations
              and releases held copies. Existing loans remain on record.
            </p>
          </>
        )}
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
            {pending ? "Saving…" : isNew ? "Register student" : "Save account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function StudentActivity({ student, onClose }) {
  const [page, setPage] = useState(1);
  const loans = useResource(
    `/loans?student_id=${student.id}&page_size=5&page=${page}`,
  );
  const eligibility = useResource(`/students/${student.id}/eligibility`);
  const detail = useResource(`/students/${student.id}`);
  return (
    <Modal title={student.profile.full_name} onClose={onClose} wide>
      <div className="student-detail-intro">
        <span className="avatar large">
          {initials(student.profile.full_name)}
        </span>
        <div>
          <strong>{student.student_number}</strong>
          <p>
            {student.program || "Program not specified"}
            {student.year_level ? ` · Year ${student.year_level}` : ""}
          </p>
          {detail.data?.email && <p>{detail.data.email}</p>}
        </div>
        <Status value={student.profile.status} />
      </div>
      <ResourceState resource={eligibility}>
        {eligibility.data && (
          <div
            className={`eligibility-note ${eligibility.data.eligible ? "" : "restricted"}`}
          >
            <strong>
              {eligibility.data.eligible
                ? "Eligible to borrow"
                : eligibility.data.reasons.join(" · ")}
            </strong>
            <span>
              {eligibility.data.active_loans} active loans ·{" "}
              {eligibility.data.overdue_loans} overdue ·{" "}
              {eligibility.data.active_reservations} reservations
            </span>
          </div>
        )}
      </ResourceState>
      <h3 className="subheading">Borrowing activity</h3>
      <ResourceState resource={loans}>
        <LoanTable
          items={loans.data?.items}
          history
          timezone={eligibility.data?.policy.timezone}
        />
      </ResourceState>
      <Pagination data={loans.data} onChange={setPage} />
    </Modal>
  );
}
