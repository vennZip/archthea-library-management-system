export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [headers, ...rows.map((row) => headers.map((header) => row[header]))]
      .map((row) => row.map(escape).join(","))
      .join("\r\n")
  );
}
