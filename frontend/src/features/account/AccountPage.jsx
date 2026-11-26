import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Mail, BookOpen, Bookmark, Clock3 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../hooks/useResource";
import { api } from "../../lib/api";
import {
  PageHeading,
  Field,
  FormError,
  Status,
  ResourceState,
} from "../../components/ui/Common";
import { useToast } from "../../components/ui/Toast";
import { initials, date } from "../../lib/format";

export default function AccountPage() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState(user.full_name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const student = user.role === "STUDENT";
  const policy = useResource("/settings");
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { full_name: name } });
      await refreshProfile();
      toast("Your profile has been updated.");
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR OWN CORNER OF THE LIBRARY"
        title="My account"
        description="A few details that help your library feel like yours."
      />
      <div className="account-columns">
        <section className="panel account-profile">
          <span className="avatar extra-large">{initials(user.full_name)}</span>
          <h2>{user.full_name}</h2>
          <p>
            {student
              ? user.student?.student_number
              : user.librarian?.staff_number}
          </p>
          <Status value={user.status} />
          <dl>
            <div>
              <dt>Email address</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Account type</dt>
              <dd>{student ? "Student / borrower" : "Librarian"}</dd>
            </div>
            {student && (
              <>
                <div>
                  <dt>Program</dt>
                  <dd>{user.student?.program || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Year level</dt>
                  <dd>{user.student?.year_level || "Not specified"}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Member since</dt>
              <dd>{date(user.created_at, policy.data?.timezone)}</dd>
            </div>
          </dl>
        </section>
        <div>
          <section className="panel account-form">
            <div className="panel-heading">
              <div>
                <h2>Personal information</h2>
                <p>Keep your name up to date.</p>
              </div>
            </div>
            <form onSubmit={submit}>
              <Field label="Full name">
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field
                label="Email address"
                hint="Contact your librarian to correct account or enrollment details."
              >
                <input type="email" value={user.email} disabled />
              </Field>
              <FormError error={error} />
              <div className="form-actions">
                <button
                  className="button primary"
                  disabled={pending || name.trim() === user.full_name}
                >
                  {pending ? "Saving…" : "Save my details"}
                </button>
              </div>
            </form>
          </section>
          <section className="panel account-security">
            <ShieldCheck size={24} />
            <div>
              <h3>Your account, protected</h3>
              <p>Use a unique password to keep your library account secure.</p>
              <Link className="text-link" to="/reset-password">
                Change my password
              </Link>
            </div>
          </section>
          {student && (
            <section className="panel borrowing-policy">
              <div className="panel-heading">
                <div>
                  <h2>Your borrowing guide</h2>
                  <p>A little clarity for your next checkout.</p>
                </div>
              </div>
              <ResourceState resource={policy}>
                {policy.data && (
                  <>
                    <div>
                      <BookOpen size={19} />
                      <span>
                        Borrow up to{" "}
                        <strong>{policy.data.max_books} books</strong> at a time
                      </span>
                    </div>
                    <div>
                      <Clock3 size={19} />
                      <span>
                        Enjoy each book for{" "}
                        <strong>{policy.data.loan_days} days</strong>
                      </span>
                    </div>
                    <div>
                      <Bookmark size={19} />
                      <span>
                        Keep up to{" "}
                        <strong>
                          {policy.data.max_reservations} reservations
                        </strong>
                      </span>
                    </div>
                    <p className="form-hint">
                      {policy.data.restrict_overdue
                        ? "Overdue books must be returned before new borrowing or reservations."
                        : "Please return books by their due dates so others can enjoy them."}
                      {user.student?.borrowing_restricted
                        ? " Your account currently has a borrowing restriction. Please contact the library."
                        : ""}
                    </p>
                  </>
                )}
              </ResourceState>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
