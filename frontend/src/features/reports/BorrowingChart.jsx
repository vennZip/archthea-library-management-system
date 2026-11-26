import { number } from "../../lib/format";

export function BorrowingChart({ data = [], compact = false }) {
  const rows = data.slice(-6);
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [Number(row.borrowed), Number(row.returned)]),
  );
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  return (
    <div className={`borrowing-chart ${compact ? "compact" : ""}`}>
      <div className="chart-legend">
        <span>
          <i />
          Borrowed
        </span>
        <span>
          <i />
          Returned
        </span>
      </div>
      <svg
        viewBox="0 0 640 230"
        role="img"
        aria-label="Books borrowed and returned over the last six months"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1="38"
              x2="627"
              y1={184 - i * 40}
              y2={184 - i * 40}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
            <text
              x="26"
              y={188 - i * 40}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="11"
            >
              {number(step * i)}
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const x = 70 + i * 96;
          const borrowedHeight = (Number(row.borrowed) / top) * 160;
          const returnedHeight = (Number(row.returned) / top) * 160;
          return (
            <g key={row.month}>
              <title>
                {row.month}: {row.borrowed} borrowed, {row.returned} returned
              </title>
              <rect
                x={x}
                y={184 - borrowedHeight}
                width="22"
                height={borrowedHeight}
                rx="4"
                fill="var(--chart-borrowed)"
              />
              <rect
                x={x + 28}
                y={184 - returnedHeight}
                width="22"
                height={returnedHeight}
                rx="4"
                fill="var(--chart-returned)"
              />
              <text
                x={x + 25}
                y="211"
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="12"
              >
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${row.month}-01T00:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
      {rows.every((row) => !Number(row.borrowed) && !Number(row.returned)) && (
        <p className="chart-empty">
          Borrowing activity will appear as your library grows.
        </p>
      )}
    </div>
  );
}
