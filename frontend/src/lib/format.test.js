import { describe, expect, it, vi } from "vitest";
import { date, dueLabel, initials } from "./format";

describe("library presentation", () => {
  it("formats dates in the configured library timezone", () => {
    expect(date("2026-11-24T20:00:00Z", "Asia/Singapore")).toContain("25");
    expect(date(null)).toBe("—");
  });
  it("describes due dates relative to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
    expect(dueLabel("2026-11-24T00:00:00Z")).toBe("1 day overdue");
    expect(dueLabel("2026-11-24T23:00:00Z")).toBe("Overdue");
    expect(dueLabel("2026-11-26T00:00:00Z")).toBe("Due in 1 day");
    vi.useRealTimers();
  });
  it("creates readable account initials", () => {
    expect(initials("Christian Reyes")).toBe("CR");
  });
});
