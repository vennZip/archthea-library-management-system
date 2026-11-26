import {
  BookOpen,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { label, number } from "../../lib/format";

export function Brand({ light = false, compact = false }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <svg viewBox="0 0 40 44" aria-hidden="true">
        <path
          d="M5 33V17C5 7 12 2 20 2s15 5 15 15v16h-9V18c0-5-2-8-6-8s-6 3-6 8v15Z"
          fill="currentColor"
        />
        <path
          d="M3 40h34"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span>
          archthea<span className="brand-subtitle">THE LIBRARY, CONNECTED</span>
        </span>
      )}
    </span>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function Status({ value, children }) {
  return (
    <span className={`status status-${value?.toLowerCase()}`}>
      {children || label(value)}
    </span>
  );
}
export function EmptyState({
  title = "A fresh chapter awaits",
  message = "There is nothing here yet.",
  action,
  icon: Icon = BookOpen,
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert size={24} />
      <div>
        <h3>We couldn’t load this page</h3>
        <p>{error?.message || "Please try again."}</p>
      </div>
      {onRetry && (
        <button className="button secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Skeleton({ cards = false }) {
  return (
    <div
      className={cards ? "book-grid" : "skeleton-stack"}
      role="status"
      aria-label="Loading content"
    >
      {Array.from({ length: cards ? 8 : 3 }, (_, i) => (
        <div
          className={`skeleton ${cards ? "skeleton-card" : "skeleton-row"}`}
          key={i}
        />
      ))}
    </div>
  );
}
export function ResourceState({ resource, children, cards = false }) {
  if (resource.loading) return <Skeleton cards={cards} />;
  if (resource.error)
    return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return children;
}
export function Pagination({ data, onChange }) {
  if (!data || data.total <= data.page_size) return null;
  const pages = Math.ceil(data.total / data.page_size);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>
        Showing {number((data.page - 1) * data.page_size + 1)}–
        {number(Math.min(data.page * data.page_size, data.total))} of{" "}
        {number(data.total)}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {data.page} / {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={data.page >= pages}
          onClick={() => onChange(data.page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search the collection…",
  label: accessibleLabel = "Search",
}) {
  return (
    <div className="search-input">
      <Search size={19} />
      <input
        aria-label={accessibleLabel}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function StatCard({
  label: title,
  value,
  icon: Icon,
  detail,
  tone = "green",
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">
          <Icon size={19} strokeWidth={1.7} />
        </span>
      </div>
      <strong>{number(value)}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
export function Field({ label: title, children, hint, ...props }) {
  return (
    <label className="field" {...props}>
      <span>{title}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      {error.message}
      {error.issues?.length > 0 && (
        <ul>
          {error.issues.map((issue, index) => (
            <li key={index}>
              {issue.field}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
