import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { AppError } from "../models/AppError.js";

export class StorageService {
  #repository;
  constructor(repository) {
    this.#repository = repository;
  }
  get bucket() {
    return this.#repository.client.storage.from("book-covers");
  }
  async decorate(books) {
    const paths = [
      ...new Set(books.map((book) => book.cover_path).filter(Boolean)),
    ];
    if (!paths.length)
      return books.map((book) => ({ ...book, cover_url: null }));
    const { data, error } = await this.bucket.createSignedUrls(paths, 3600);
    if (error) throw new AppError("Cover signing failed.");
    const urls = new Map(data.map((item) => [item.path, item.signedUrl]));
    return books.map((book) => ({
      ...book,
      cover_url: urls.get(book.cover_path) ?? null,
    }));
  }
  async upload(actor, bookId, file) {
    if (!file)
      throw new AppError("Choose an image to upload.", {
        status: 422,
        code: "FILE_REQUIRED",
      });
    let type;
    try {
      type = await fileTypeFromBuffer(file.buffer);
    } catch {
      throw new AppError("This file is not a valid image.", {
        status: 422,
        code: "INVALID_FILE_TYPE",
      });
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(type?.mime))
      throw new AppError("Use a JPEG, PNG or WebP image.", {
        status: 422,
        code: "INVALID_FILE_TYPE",
      });
    let buffer;
    try {
      buffer = await sharp(file.buffer, {
        limitInputPixels: 40000000,
        animated: false,
      })
        .rotate()
        .resize({
          width: 1000,
          height: 1500,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(
        "This image could not be read. Choose another image.",
        { status: 422, code: "INVALID_IMAGE" },
      );
    }
    const book = await this.#repository.book(bookId);
    const path = `${bookId}/${randomUUID()}.webp`;
    const { error } = await this.bucket.upload(path, buffer, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error) throw new AppError("Cover upload failed.");
    try {
      await this.#repository.rpc("set_book_cover", {
        p_actor: actor,
        p_id: bookId,
        p_path: path,
      });
    } catch (error) {
      await this.bucket.remove([path]);
      throw error;
    }
    if (book.cover_path) await this.bucket.remove([book.cover_path]);
    return (await this.decorate([{ ...book, cover_path: path }]))[0];
  }
  async remove(actor, bookId) {
    const book = await this.#repository.book(bookId);
    const updated = await this.#repository.rpc("set_book_cover", {
      p_actor: actor,
      p_id: bookId,
      p_path: null,
    });
    if (book.cover_path) await this.bucket.remove([book.cover_path]);
    return updated;
  }
}
