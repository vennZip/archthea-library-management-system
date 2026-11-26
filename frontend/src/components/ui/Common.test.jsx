import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination, ErrorState, ResourceState } from "./Common";

describe("data feedback", () => {
  it("bounds pagination and announces the current range", async () => {
    const change = vi.fn();
    render(
      <Pagination
        data={{ page: 1, page_size: 10, total: 21 }}
        onChange={change}
      />,
    );
    expect(screen.getByText("Showing 1–10 of 21")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(change).toHaveBeenCalledWith(2);
  });
  it("exposes a retry action for loading errors", async () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error("Offline")} onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Offline");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("shows a loading state without presenting stale data", () => {
    render(
      <ResourceState resource={{ loading: true }}>
        <p>Stale record</p>
      </ResourceState>,
    );
    expect(screen.getByRole("status")).toHaveAccessibleName("Loading content");
    expect(screen.queryByText("Stale record")).not.toBeInTheDocument();
  });
});
