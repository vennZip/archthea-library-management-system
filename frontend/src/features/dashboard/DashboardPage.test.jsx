import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { full_name: "Test Reader", role: "STUDENT" } }),
}));
vi.mock("../../hooks/useResource", () => ({
  useResource: () => ({
    loading: false,
    error: null,
    data: {
      eligibility: {
        eligible: true,
        reasons: [],
        policy: {
          max_books: 3,
          max_reservations: 3,
          timezone: "Asia/Singapore",
        },
      },
      loans: [-1, 24, 240].map((hours, i) => ({
        id: String(i),
        status: "ACTIVE",
        borrowed_at: "2026-11-01T00:00:00Z",
        due_at: new Date(Date.now() + hours * 3600000).toISOString(),
        copy: {
          barcode: `COPY-${i}`,
          book: { id: String(i), title: `Book ${i}` },
        },
      })),
      reservations: [],
      history: [],
      popular: [],
      available_titles: 0,
    },
  }),
}));

describe("student due-date summary", () => {
  it("counts upcoming loans without including books already overdue", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    const card = screen.getByText("Due within 7 days").closest("article");
    expect(within(card).getByText("1", { exact: true })).toBeInTheDocument();
  });
});
