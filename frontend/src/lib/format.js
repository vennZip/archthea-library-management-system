export function date(value, timezone = "Asia/Singapore", withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
export const number = (value) => new Intl.NumberFormat("en").format(value ?? 0);
export const initials = (name) =>
  name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "A";
export const label = (value) =>
  value
    ?.toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (text) => text.toUpperCase()) || "—";
export function dueLabel(value) {
  const difference = new Date(value) - new Date();
  if (difference < 0) {
    const daysLate = Math.floor(Math.abs(difference) / 86400000);
    return daysLate
      ? `${daysLate} ${daysLate === 1 ? "day" : "days"} overdue`
      : "Overdue";
  }
  if (difference < 86400000) return "Due today";
  const days = Math.ceil(difference / 86400000);
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}
