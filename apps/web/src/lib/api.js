// Shared API helper with automatic Authorization bearer token header injection
export async function authFetch(url, options = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("flowline_token") : null;

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
