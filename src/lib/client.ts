export const TOKEN_STORAGE_KEY = "discover_pat";
export class ClientError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem(TOKEN_STORAGE_KEY)
      : null;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(token ? { "x-github-token": token } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ClientError("networkError");
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ClientError(
      !response.ok &&
        /1102|Worker exceeded (?:CPU time|resource) limit/i.test(text)
        ? "resourceLimited"
        : "serverError",
    );
  }
  if (!response.ok)
    throw new ClientError(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "serverError",
    );
  return data as T;
}
export function post<T>(url: string, body: unknown) {
  return api<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export function errorCode(error: unknown) {
  return error instanceof ClientError ? error.code : "serverError";
}
