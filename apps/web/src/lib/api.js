// Shared API helper with automatic Authorization bearer token header injection

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function authFetch(urlOrPath, options = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("flowline_token") : null;

  const url = urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")
    ? urlOrPath
    : `${API_BASE_URL}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
