import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, BookOpen } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../hooks/useResource";
import { api, queryString } from "../../lib/api";
import {
  PageHeading,
  ResourceState,
  Pagination,
  Field,
  FormError,
} from "../../components/ui/Common";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { LoanTable } from "./LoanTable";
import CheckoutForm from "./CheckoutForm";

export default function LoansPage({ history = false }) {
  const { user } = useAuth();
  const admin = user.role === "LIBRARIAN";
  const [params] = useSearchParams();
  const [status, setStatus] = useState(
    history ? "RETURNED" : params.get("status") || "ACTIVE",
  );
  const [page, setPage] = useState(1);
  const resource = useResource(
    `${admin ? "/loans" : "/me/loans"}${queryString({ status, page, page_size: 10 })}`,
  );
  const policy = useResource("/settings");
  const [checkout, setCheckout] = useState(
    Boolean(admin && params.get("book")),
  );
  const [returning, setReturning] = useState(null);
  return (
    <>
      <PageHeading
        eyebrow={
          admin
            ? "KEEP THE NEXT CHAPTER MOVING"
            : history
              ? "THE CHAPTERS YOU’VE FINISHED"
              : "A LITTLE TIME WITH A GOOD BOOK"
        }
        title={
          admin
            ? "Checkouts & returns"
            : history
              ? "Your reading history"
              : "My borrowed books"
        }
        description={
          admin
            ? "Manage borrowing, record returns, and keep due dates in view."
            : history
              ? "Every book leaves a little something behind."
              : "Keep your books close and your due dates closer."
        }
      >
        {admin ? (
          <button className="button primary" onClick={() => setCheckout(true)}>
            <Plus size={18} />
            New checkout
          </button>
        ) : (
          <Link className="button secondary" to="/app/catalog">
            <BookOpen size={17} />
            Explore books
          </Link>
        )}
      </PageHeading>
      <section className="panel">
        <div className="tab-bar" role="group" aria-label="Filter loans">
          {(history
            ? [
                ["RETURNED", "Returned"],
                ["LOST", "Lost / resolved"],
                ["", "All history"],
              ]
            : admin
              ? [
                  ["ACTIVE", "On loan"],
                  ["OVERDUE", "Overdue"],
                  ["RETURNED", "Returned"],
                  ["", "All records"],
                ]
              : [
                  ["ACTIVE", "On my shelf"],
                  ["OVERDUE", "Overdue"],
                ]
          ).map(([value, title]) => (
            <button
              className={status === value ? "active" : ""}
              key={value}
              aria-pressed={status === value}
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
          <LoanTable
            items={resource.data?.items}
            admin={admin}
            history={history || status === "RETURNED" || status === ""}
            onReturn={admin ? setReturning : undefined}
            timezone={policy.data?.timezone}
          />
        </ResourceState>
        <Pagination data={resource.data} onChange={setPage} />
      </section>
      {checkout && (
        <CheckoutForm
          initialBook={params.get("book") || ""}
          initialStudent={params.get("student") || ""}
          onClose={() => setCheckout(false)}
          onSaved={() => {
            setCheckout(false);
            resource.reload();
          }}
        />
      )}
      {returning && (
        <ReturnForm
          loan={returning}
          onClose={() => setReturning(null)}
          onSaved={() => {
            setReturning(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
function ReturnForm({ loan, onClose, onSaved }) {
  const [condition, setCondition] = useState("GOOD");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/loans/${loan.id}/return`, {
        method: "POST",
        body: { condition },
        idempotent: true,
      });
      toast("Return recorded. Any waiting reservation has been processed.");
      onSaved();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title="Process book return" onClose={pending ? () => {} : onClose}>
      <form onSubmit={submit}>
        <div className="form-book-summary">
          <strong>{loan.copy.book.title}</strong>
          <p>
            {loan.student.profile.full_name} · {loan.copy.barcode}
          </p>
        </div>
        <Field label="Condition on return">
          <select
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
          >
            <option value="NEW">Like new</option>
            <option value="GOOD">Good</option>
            <option value="WORN">Worn but usable</option>
            <option value="DAMAGED">Damaged — remove from circulation</option>
            <option value="LOST">Lost — close loan and mark copy lost</option>
          </select>
        </Field>
        <p className="form-hint">
          Usable copies will be allocated to the next eligible reservation, or
          returned to the shelf.
        </p>
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
            {pending ? "Processing…" : "Confirm return"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
