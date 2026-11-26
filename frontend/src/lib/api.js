let accessToken = null;
const retryKeys = new Map();
export const setAccessToken = (token) => {
  accessToken = token;
  if (!token) retryKeys.clear();
};
export class ApiError extends Error {
  constructor(error, status) {
    super(error?.message ?? "The request could not be completed.");
    this.code = error?.code;
    this.issues = error?.issues;
    this.status = status;
  }
}
export async function api(
  path,
  { method = "GET", body, signal, idempotent = false, key, raw = false } = {},
) {
  const headers = { Accept: "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const fingerprint = `${method}:${path}:${body ? JSON.stringify(body) : ""}`;
  if (idempotent) {
    headers["Idempotency-Key"] =
      key ?? retryKeys.get(fingerprint) ?? crypto.randomUUID();
    retryKeys.set(fingerprint, headers["Idempotency-Key"]);
  }
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_API_URL || "/api/v1"}${path}`,
      {
        method,
        headers,
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
        signal,
      },
    );
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      {
        code: "NETWORK_ERROR",
        message:
          "We could not reach the library. Check your connection and try again.",
      },
      0,
    );
  }
  if (raw && response.ok) return response;
  const result = await response.json().catch(() => ({}));
  if (
    idempotent &&
    (response.ok || (response.status >= 400 && response.status < 500))
  )
    retryKeys.delete(fingerprint);
  if (!response.ok) throw new ApiError(result.error, response.status);
  return result.data;
}
export function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== "" && value !== undefined && value !== null)
      params.set(key, value);
  const string = params.toString();
  return string ? `?${string}` : "";
}
