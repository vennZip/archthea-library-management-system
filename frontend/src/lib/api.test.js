import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setAccessToken } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});
describe("mutation retries", () => {
  it("retains the idempotency key after a lost response and rotates it after success", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: "loan" } }),
      });
    vi.stubGlobal("fetch", fetch);
    const options = {
      method: "POST",
      body: { book_id: "book" },
      idempotent: true,
    };
    await expect(api("/loans", options)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    await api("/loans", options);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      fetch.mock.calls[1][1].headers["Idempotency-Key"],
    );
    await api("/loans", options);
    expect(fetch.mock.calls[2][1].headers["Idempotency-Key"]).not.toBe(
      fetch.mock.calls[1][1].headers["Idempotency-Key"],
    );
  });
});
