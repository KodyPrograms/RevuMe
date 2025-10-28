const BASE = import.meta.env.VITE_API_BASE || "https://revume-api.onrender.com";
const TOKEN_STORAGE_KEY = "revume_token";

let authToken = "";

function loadStoredToken() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

authToken = loadStoredToken();

export function getAuthToken() {
  return authToken || loadStoredToken();
}

export function setAuthToken(token) {
  authToken = token || "";
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      if (authToken) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors such as private browsing
    }
  }
}

async function http(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = authToken;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const registerUser = payload =>
  http("/api/register", { method: "POST", body: JSON.stringify(payload) });

export const loginUser = payload =>
  http("/api/login", { method: "POST", body: JSON.stringify(payload) });

export const logoutUser = () => http("/api/logout", { method: "POST" });

export const listReviews  = () => http("/api/reviews");
export const createReview = payload =>
  http("/api/reviews", { method: "POST", body: JSON.stringify(payload) });
export const updateReview = (id, payload) =>
  http(`/api/reviews/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteReview = id =>
  http(`/api/reviews/${id}`, { method: "DELETE" });

export async function checkApiReady() {
  try {
    const res = await fetch(`${BASE}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
