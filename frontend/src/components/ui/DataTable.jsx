import { EmptyState } from "./Common";

export function DataTable({
  columns,
  rows,
  rowKey = "id",
  emptyTitle = "Nothing here yet",
  emptyMessage = "Records will appear here when available.",
}) {
  if (!rows?.length)
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} data-column={column.key} scope="col">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key} data-column={column.key}>
                  {column.render
                    ? column.render(row)
                    : (row[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
