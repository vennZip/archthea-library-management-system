import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useResource } from "../../hooks/useResource";
import { Modal } from "../../components/ui/Modal";
import {
  Field,
  FormError,
  ErrorState,
  Skeleton,
} from "../../components/ui/Common";
import { useToast } from "../../components/ui/Toast";

export default function BookForm({ book, onClose, onSaved }) {
  const categories = useResource("/categories");
  const authors = useResource("/authors");
  const publishers = useResource("/publishers");
  const [form, setForm] = useState({
    title: book?.title || "",
    isbn: book?.isbn || "",
    category_id: book?.category_id || "",
    publisher_id: book?.publisher_id || "",
    publication_year: book?.publication_year || "",
    description: book?.description || "",
    author_ids: book?.authors?.map((author) => author.id) || [],
    initial_copies: 1,
  });
  const [cover, setCover] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const change = (event) =>
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = {
        ...form,
        isbn: form.isbn || null,
        publisher_id: form.publisher_id || null,
        publication_year: form.publication_year
          ? Number(form.publication_year)
          : null,
        initial_copies: book ? 0 : Number(form.initial_copies),
      };
      if (!data.author_ids.length)
        throw new Error("Select at least one author.");
      const saved = await api(book ? `/books/${book.id}` : "/books", {
        method: book ? "PATCH" : "POST",
        body: data,
      });
      if (cover) {
        const upload = new FormData();
        upload.append("cover", cover);
        try {
          await api(`/books/${saved.id}/cover`, {
            method: "POST",
            body: upload,
          });
        } catch (error) {
          toast(
            `Book saved, but the cover could not be uploaded: ${error.message}`,
            "error",
          );
          onSaved(saved);
          return;
        }
      }
      toast(book ? "Book details updated." : "Book added to the collection.");
      onSaved(saved);
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  const resourceError = categories.error || authors.error || publishers.error;
  return (
    <Modal
      title={book ? "Edit book details" : "Add to the collection"}
      onClose={pending ? () => {} : onClose}
      wide
    >
      {resourceError ? (
        <ErrorState
          error={resourceError}
          onRetry={() => {
            categories.reload();
            authors.reload();
            publishers.reload();
          }}
        />
      ) : categories.loading || authors.loading || publishers.loading ? (
        <Skeleton />
      ) : !categories.data?.length || !authors.data?.length ? (
        <div className="empty-state">
          <h3>Add your catalog foundations first</h3>
          <p>Create a category and an author before adding your first book.</p>
          <Link
            className="button primary"
            to="/app/reference-data"
            onClick={onClose}
          >
            Manage catalog details
          </Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Book title" className="field span-2">
              <input
                name="title"
                required
                maxLength={240}
                value={form.title}
                onChange={change}
              />
            </Field>
            <Field label="ISBN" hint="ISBN-10 or ISBN-13; optional.">
              <input
                name="isbn"
                maxLength={24}
                value={form.isbn}
                onChange={change}
              />
            </Field>
            <Field label="Category">
              <select
                name="category_id"
                required
                value={form.category_id}
                onChange={change}
              >
                <option value="">Select a category</option>
                {categories.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Authors"
              hint="Hold Ctrl or Command to choose more than one."
              className="field span-2"
            >
              <select
                multiple
                required
                size={Math.min(4, authors.data.length)}
                value={form.author_ids}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    author_ids: [...event.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  }))
                }
              >
                {authors.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Publisher">
              <select
                name="publisher_id"
                value={form.publisher_id}
                onChange={change}
              >
                <option value="">Not specified</option>
                {publishers.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Publication year">
              <input
                type="number"
                name="publication_year"
                min={1000}
                max={2200}
                value={form.publication_year}
                onChange={change}
              />
            </Field>
            <Field label="Description" className="field span-2">
              <textarea
                name="description"
                rows={4}
                maxLength={10000}
                value={form.description}
                onChange={change}
              />
            </Field>
            {!book && (
              <Field
                label="Initial copies"
                hint="Each copy receives a unique barcode."
              >
                <input
                  type="number"
                  name="initial_copies"
                  min={0}
                  max={100}
                  required
                  value={form.initial_copies}
                  onChange={change}
                />
              </Field>
            )}
            <Field label="Book cover" hint="JPEG, PNG or WebP, up to 5 MB.">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setCover(event.target.files?.[0] || null)}
              />
            </Field>
          </div>
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
              {pending ? "Saving…" : book ? "Save changes" : "Add book"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
