import { databaseError } from "../utils/databaseError.js";

export class BaseRepository {
  async execute(query) {
    const result = await query;
    if (result.error) throw databaseError(result.error);
    return result;
  }
  async rpc() {
    throw new Error("Repository implementations must implement rpc().");
  }
}
