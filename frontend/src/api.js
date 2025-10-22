const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5174";

async function http(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const listReviews  = () => http("/api/reviews");
export const createReview = (p) => http("/api/reviews", { method: "POST", body: JSON.stringify(p) });
export const updateReview = (id, p) => http(`/api/reviews/${id}`, { method: "PUT", body: JSON.stringify(p) });
export const deleteReview = (id) => http(`/api/reviews/${id}`, { method: "DELETE" });
