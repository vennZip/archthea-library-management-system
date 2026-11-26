import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { AccountService } from "../src/services/AccountService.js";
import { CatalogService } from "../src/services/CatalogService.js";
import { StorageService } from "../src/services/StorageService.js";
import { LibraryRepository } from "../src/repositories/LibraryRepository.js";

describe("account provisioning", () => {
  const input = {
    full_name: "New Student",
    student_number: "2026-001",
    email: "student@test.invalid",
  };
  function setup() {
    const admin = {
      createUser: vi.fn(async () => ({ data: { user: { id: "new-user" } } })),
      deleteUser: vi.fn(async () => ({})),
    };
    const reset = vi.fn(async () => ({}));
    const repository = {
      client: { auth: { admin, resetPasswordForEmail: reset } },
      rpc: vi.fn(async () => ({ id: "new-user" })),
    };
    return {
      admin,
      reset,
      repository,
      service: new AccountService(repository, "http://localhost:5173"),
    };
  }
  it("never stores or generates a password and sends a setup email", async () => {
    const { service, admin, repository } = setup();
    expect((await service.register({ id: "admin" }, input)).email_sent).toBe(
      true,
    );
    expect(admin.createUser.mock.calls[0][0]).not.toHaveProperty("password");
    expect(repository.rpc.mock.calls[0][1].p_data).not.toHaveProperty("email");
  });
  it("compensates a newly created identity when profile persistence fails", async () => {
    const { service, admin, repository } = setup();
    repository.rpc.mockRejectedValueOnce(new Error("write failed"));
    await expect(service.register({ id: "admin" }, input)).rejects.toThrow(
      "write failed",
    );
    expect(admin.deleteUser).toHaveBeenCalledWith("new-user");
  });
  it("never deletes an existing identity on duplicate email", async () => {
    const { service, admin } = setup();
    admin.createUser.mockResolvedValueOnce({ error: { code: "email_exists" } });
    await expect(
      service.register({ id: "admin" }, input),
    ).rejects.toMatchObject({ status: 409 });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
  it("preserves a registered account when email delivery fails", async () => {
    const { service, admin, reset } = setup();
    reset.mockResolvedValueOnce({ error: { code: "smtp_error" } });
    expect((await service.register({ id: "admin" }, input)).email_sent).toBe(
      false,
    );
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe("catalog and storage boundaries", () => {
  it("prevents students from reading archived records", async () => {
    const service = new CatalogService(
      { book: async () => ({ archived_at: "2026-01-01" }) },
      {},
    );
    await expect(
      service.detail({ role: "STUDENT" }, "book"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.list({ role: "STUDENT" }, { archived: true }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("fails closed when the database is not configured", async () => {
    await expect(
      new LibraryRepository(null).rpc("anything"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects disguised SVG and unreadable image uploads", async () => {
    const service = new StorageService({});
    await expect(
      service.upload("admin", "book", {
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        mimetype: "image/png",
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });
    const invalidJpeg = Buffer.concat([
      Buffer.from([255, 216, 255, 224]),
      Buffer.alloc(100),
    ]);
    await expect(
      service.upload("admin", "book", { buffer: invalidJpeg }),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("re-encodes images and cleans up a failed metadata write", async () => {
    const bucket = {
      upload: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({})),
    };
    const repository = {
      client: { storage: { from: () => bucket } },
      book: async () => ({ id: "book" }),
      rpc: vi.fn(async () => {
        throw new Error("write failed");
      }),
    };
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    await expect(
      new StorageService(repository).upload("admin", "book", { buffer }),
    ).rejects.toThrow("write failed");
    expect(bucket.upload.mock.calls[0][0]).toMatch(/^book\/.*\.webp$/);
    expect(bucket.remove).toHaveBeenCalledOnce();
  });
});
