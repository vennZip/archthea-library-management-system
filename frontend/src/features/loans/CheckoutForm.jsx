import { useState } from "react";
import { useResource, useDebounced } from "../../hooks/useResource";
import { api, queryString } from "../../lib/api";
import { Modal } from "../../components/ui/Modal";
import { Field, FormError, SearchInput } from "../../components/ui/Common";
import { useToast } from "../../components/ui/Toast";

export default function CheckoutForm({
  initialBook = "",
  initialStudent = "",
  onClose,
  onSaved,
}) {
  const [studentSearch, setStudentSearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [studentId, setStudentId] = useState(initialStudent);
  const [bookId, setBookId] = useState(initialBook);
  const students = useResource(
    `/students${queryString({ q: useDebounced(studentSearch), page_size: 50 })}`,
  );
  const books = useResource(
    `/books${queryString({ q: useDebounced(bookSearch), page_size: 50 })}`,
  );
  const selectedBook = useResource(
    initialBook ? `/books/${initialBook}` : null,
  );
  const selectedStudent = useResource(
    initialStudent ? `/students/${initialStudent}` : null,
  );
  const eligibility = useResource(
    studentId ? `/students/${studentId}/eligibility` : null,
  );
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/loans", {
        method: "POST",
        body: { student_id: studentId, book_id: bookId },
        idempotent: true,
      });
      toast("Checkout recorded. The student has been notified.");
      onSaved();
    } catch (error) {
      setError(error);
      eligibility.reload();
      books.reload();
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title="Process a new checkout"
      onClose={pending ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Field label="Find a student">
          <input
            type="search"
            placeholder="Search by student name"
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
          />
        </Field>
        <Field label="Borrower">
          <select
            required
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">
              {students.loading ? "Loading students…" : "Select a student"}
            </option>
            {initialStudent &&
              selectedStudent.data &&
              !students.data?.items.some(
                (student) => student.id === initialStudent,
              ) && (
                <option value={initialStudent}>
                  {selectedStudent.data.profile.full_name} ·{" "}
                  {selectedStudent.data.student_number}
                </option>
              )}
            {students.data?.items.map((student) => (
              <option value={student.id} key={student.id}>
                {student.profile.full_name} · {student.student_number}
              </option>
            ))}
          </select>
        </Field>
        {eligibility.data && (
          <div
            className={`eligibility-note ${eligibility.data.eligible ? "" : "restricted"}`}
          >
            <strong>
              {eligibility.data.eligible
                ? "Eligible to borrow"
                : "Checkout restricted"}
            </strong>
            <span>
              {eligibility.data.eligible
                ? `${eligibility.data.remaining_loans} slots available · ${eligibility.data.policy.loan_days}-day loan period`
                : eligibility.data.reasons.join(" · ")}
            </span>
          </div>
        )}
        <Field label="Find a book">
          <input
            type="search"
            placeholder="Search title, author, or ISBN"
            value={bookSearch}
            onChange={(event) => setBookSearch(event.target.value)}
          />
        </Field>
        <Field label="Book">
          <select
            required
            value={bookId}
            onChange={(event) => setBookId(event.target.value)}
          >
            <option value="">
              {books.loading ? "Loading books…" : "Select a book"}
            </option>
            {initialBook &&
              selectedBook.data &&
              !books.data?.items.some((book) => book.id === initialBook) && (
                <option value={initialBook}>{selectedBook.data.title}</option>
              )}
            {books.data?.items.map((book) => (
              <option value={book.id} key={book.id}>
                {book.title} · {book.available_copies} available
              </option>
            ))}
          </select>
        </Field>
        <p className="form-hint">
          Existing pickup holds and the latest inventory are checked at
          checkout.
        </p>
        <FormError
          error={error || students.error || books.error || eligibility.error}
        />
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={
              pending || !studentId || !bookId || !eligibility.data?.eligible
            }
          >
            {pending ? "Processing…" : "Confirm checkout"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
