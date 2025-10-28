import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listReviews,
  createReview,
  updateReview,
  deleteReview,
  loginUser,
  registerUser,
  logoutUser,
  setAuthToken,
  getAuthToken,
  checkApiReady,
} from "./api";

const TYPES = ["place", "food", "movie", "book", "product"];
const nowISO = () => new Date().toISOString();
const USER_STORAGE_KEY = "revume_user";
const THEME_STORAGE_KEY = "revume_theme";
const STARTUP_ERROR_CODES = ["502", "503", "504", "522", "524"];

function isLikelyBootingError(error) {
  if (!error) return false;
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (!message) return false;
  if (error?.name === "TypeError") return true;
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout")
  ) {
    return true;
  }
  return STARTUP_ERROR_CODES.some(code => message.includes(`http ${code}`));
}

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // ignore storage issues
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function loadStoredUser() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUser(user) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (user) {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (e.g. private mode)
  }
}

function Stars({ value }) {
  const n = Math.max(1, Math.min(5, Number(value || 0)));
  return (
    <span className="rating" aria-label={`rating ${n} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <i key={i} className={`bi ${i < n ? "bi-star-fill" : "bi-star"}`} />
      ))}
    </span>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [term, setTerm] = useState("");
  const [type, setType] = useState("");
  const [sortBy, setSortBy] = useState("updated");
  const [activeCat, setActiveCat] = useState("");
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [token, setTokenState] = useState(() => getAuthToken());
  const [user, setUser] = useState(() => loadStoredUser());
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [apiStatus, setApiStatus] = useState("idle");
  const apiCheckInFlight = useRef(false);
  const refreshRetryRef = useRef(null);

  const applyAuth = useCallback(result => {
    if (result && result.token && result.user) {
      setAuthToken(result.token);
      setTokenState(result.token);
      setUser(result.user);
      storeUser(result.user);
      setApiStatus("ready");
    } else {
      setAuthToken("");
      setTokenState("");
      setUser(null);
      storeUser(null);
      setRows([]);
      setEditing(null);
      setTerm("");
      setType("");
      setSortBy("updated");
      setActiveCat("");
      setViewing(null);
      setApiStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.dataset.theme = theme;
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    } catch {
      // ignore storage issues
    }
  }, [theme]);

  useEffect(() => () => {
    if (refreshRetryRef.current) {
      clearTimeout(refreshRetryRef.current);
    }
  }, []);

  const waitForApi = useCallback(async () => {
    if (apiCheckInFlight.current) {
      return false;
    }
    apiCheckInFlight.current = true;
    setApiStatus(status => (status === "booting" ? status : "booting"));
    try {
      const attempts = 12;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const ready = await checkApiReady();
        if (ready) {
          setApiStatus("ready");
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, attempt < 3 ? 1000 : 1500));
      }
      setApiStatus("error");
      return false;
    } finally {
      apiCheckInFlight.current = false;
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(curr => (curr === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ready = await checkApiReady();
      if (cancelled) return;
      if (!ready) {
        await waitForApi();
      } else {
        setApiStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [waitForApi]);

  const refresh = useCallback(async () => {
    if (!token) {
      setRows([]);
      setViewing(null);
      setApiStatus("idle");
      return;
    }
    try {
      const data = await listReviews();
      setRows(Array.isArray(data) ? data : []);
      setApiStatus("ready");
    } catch (err) {
      const message = String(err?.message ?? "");
      if (message.includes("401")) {
        applyAuth(null);
      } else {
        if (isLikelyBootingError(err)) {
          const warmed = await waitForApi();
          if (warmed && token) {
            if (refreshRetryRef.current) {
              clearTimeout(refreshRetryRef.current);
            }
            refreshRetryRef.current = setTimeout(() => {
              refreshRetryRef.current = null;
              refresh();
            }, 300);
          }
        } else {
          setApiStatus("error");
          console.error(err);
        }
      }
    }
  }, [token, applyAuth, waitForApi]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!viewing) return;
    const next = rows.find(r => r.id === viewing.id);
    if (next && next !== viewing) {
      setViewing(next);
    }
    if (!next) {
      setViewing(null);
    }
  }, [rows, viewing]);

  const authenticated = Boolean(token);
  const themeIsDark = theme === "dark";
  const themeIcon = themeIsDark ? "bi-sun" : "bi-moon";
  const themeLabel = themeIsDark ? "Switch to light mode" : "Switch to dark mode";
  const setAuthField = key => e => setAuthForm(s => ({ ...s, [key]: e.target.value }));
  const showApiBanner = apiStatus === "booting" || apiStatus === "error";
  const apiBanner = showApiBanner ? (
    <div className="container mt-3">
      <div className={`api-status-banner ${apiStatus}`}>
        <i className={`bi ${apiStatus === "booting" ? "bi-hourglass-split" : "bi-exclamation-triangle"} me-2`}></i>
        <span>
          {apiStatus === "booting"
            ? "Hang tight! The RevuMe API is waking up. Cold starts can take about 20 to 40 seconds."
            : "We cannot reach the RevuMe API right now. Please retry in a few seconds."}
        </span>
      </div>
    </div>
  ) : null;

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const payload = {
      email: authForm.email.trim().toLowerCase(),
      password: authForm.password,
    };
    if (!payload.email || !payload.password) {
      setAuthError("Email and password are required.");
      return;
    }
    setAuthError("");
    setAuthBusy(true);
    try {
      const action = authMode === "login" ? loginUser : registerUser;
      const response = await action(payload);
      applyAuth(response);
      setAuthForm({ email: "", password: "" });
    } catch (err) {
      const message = String(err?.message ?? "");
      let detail = "";
      const jsonStart = message.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const parsed = JSON.parse(message.slice(jsonStart));
          if (parsed?.detail) {
            detail = Array.isArray(parsed.detail) ? parsed.detail[0]?.msg || parsed.detail[0] : parsed.detail;
          }
        } catch {
          // ignore parse failure
        }
      }
      const cleaned = detail || message.replace(/^HTTP\s+\d+\s+[A-Za-z ]+\s+-\s*/i, "").trim();
      if (isLikelyBootingError(err)) {
        setAuthError("Warming up the RevuMe servers... this can take up to a minute if they've been idle.");
        waitForApi();
      } else {
        setAuthError(cleaned || "Unable to process request.");
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutUser();
    } catch (err) {
      console.warn("Logout failed", err);
    } finally {
      applyAuth(null);
    }
  }

  const handleDelete = useCallback(async review => {
    if (!review?.id) return;
    // Confirm with the user before deleting, matching previous behavior.
    if (!confirm("Delete this review?")) return;
    try {
      await deleteReview(review.id);
      setViewing(curr => (curr?.id === review.id ? null : curr));
      refresh();
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("401")) {
        alert("Your session expired. Please sign in again.");
        applyAuth(null);
      } else if (isLikelyBootingError(err)) {
        waitForApi();
        alert("Warming up the RevuMe API. Please try again in a few seconds.");
      } else {
        alert(msg);
      }
    }
  }, [refresh, applyAuth, waitForApi]);

  const categories = useMemo(() => {
    const s = new Set();
    rows.forEach(r =>
      (r.category || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean)
        .forEach(c => s.add(c))
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const t = term.toLowerCase();
    let out = rows.filter(r => {
      const blob = `${r.title || ""} ${r.notes || ""} ${r.address || ""} ${r.category || ""} ${r.website || ""}`.toLowerCase();
      const okTerm = t ? blob.includes(t) : true;
      const okType = type ? r.type === type : true;
      const okCat = activeCat
        ? (r.category || "")
            .toLowerCase()
            .split(",")
            .map(s => s.trim())
            .includes(activeCat.toLowerCase())
        : true;
      return okTerm && okType && okCat;
    });
    out.sort((a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "date") return (b.date || "").localeCompare(a.date || "");
      return (b.updated || "").localeCompare(a.updated || "");
    });
    return out;
  }, [rows, term, type, sortBy, activeCat]);

  if (!authenticated) {
    return (
      <div className="auth-screen">
        <nav className="navbar navbar-expand navbar-light py-2 shadow-sm sticky-top">
          <div className="container">
            <a className="navbar-brand d-flex align-items-center" href="#">
              <i className="bi bi-cup-hot me-2 text-warning"></i>
              <span className="brand fw-bold">RevuMe</span>
            </a>
            <div className="ms-auto d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm d-flex align-items-center gap-1"
                onClick={toggleTheme}
                aria-label={themeLabel}
                title={themeLabel}
              >
                <i className={`bi ${themeIcon}`}></i>
                <span className="d-none d-md-inline">{themeIsDark ? "Light" : "Dark"} mode</span>
              </button>
              <button
                type="button"
                className="btn btn-link auth-switch text-decoration-none"
                onClick={() => {
                  setAuthMode(m => (m === "login" ? "register" : "login"));
                  setAuthError("");
                }}
              >
                {authMode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
              </button>
            </div>
          </div>
        </nav>

        {apiBanner}

        <main className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-6 col-lg-4">
              <div className="auth-card p-4">
                <h4 className="brand text-center mb-3">
                  {authMode === "login" ? "Welcome back" : "Create your RevuMe account"}
                </h4>
                <p className="text-center small mb-4 text-muted">
                  {authMode === "login"
                    ? "Sign in to access the reviews you have saved for yourself."
                    : "Register to keep private reviews for places, food, movies, books, and more."}
                </p>
                {authError && (
                  <div className="alert alert-danger py-2">{authError}</div>
                )}
                <form onSubmit={handleAuthSubmit} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small text-uppercase text-secondary">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      autoComplete="email"
                      value={authForm.email}
                      onChange={setAuthField("email")}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="form-label small text-uppercase text-secondary">Password</label>
                    <input
                      type="password"
                      className="form-control"
                      autoComplete={authMode === "login" ? "current-password" : "new-password"}
                      value={authForm.password}
                      onChange={setAuthField("password")}
                      placeholder="At least 6 characters"
                    />
                  </div>
                  <button className="btn btn-accent" type="submit" disabled={authBusy}>
                    {authBusy ? "Working..." : authMode === "login" ? "Sign in" : "Sign up"}
                  </button>
                </form>
                <div className="text-center mt-3">
                  <button
                    type="button"
                    className="btn btn-link text-decoration-none auth-switch small"
                    onClick={() => {
                      setAuthMode(m => (m === "login" ? "register" : "login"));
                      setAuthError("");
                    }}
                  >
                    {authMode === "login" ? "Create an account" : "Already have an account? Sign in"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      {/* Top bar */}
      <nav className="navbar navbar-expand navbar-light py-2 shadow-sm sticky-top">
        <div className="container">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <i className="bi bi-cup-hot me-2 text-warning"></i>
            <span className="brand fw-bold">RevuMe</span>
          </a>
          <div className="ms-auto d-flex gap-2 align-items-center flex-wrap justify-content-end">
            <button
              type="button"
              className="btn btn-ghost btn-sm d-flex align-items-center gap-1"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
            >
              <i className={`bi ${themeIcon}`}></i>
              <span className="d-none d-md-inline">{themeIsDark ? "Light" : "Dark"} mode</span>
            </button>
            {user?.email && <span className="small text-secondary d-none d-sm-inline">{user.email}</span>}
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right me-1"></i>Logout
            </button>
            <button className="btn btn-accent btn-sm" onClick={() => setEditing({})}>
              <i className="bi bi-plus-lg me-1"></i>Add
            </button>
          </div>
        </div>
      </nav>

      {apiBanner}

      {/* Filters */}
      <div className="filter-bar border-bottom py-2">
        <div className="container">
          <div className="row g-2 align-items-center">
            <div className="col-12 col-md-6 col-lg-5">
              <input
                className="form-control form-control-sm"
                placeholder="Search title, notes, address"
                value={term}
                onChange={e => setTerm(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-3 col-lg-3">
              <select
                className="form-select form-select-sm"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="">All Types</option>
                {TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3 col-lg-3">
              <select
                className="form-select form-select-sm"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="updated">Sort by Updated</option>
                <option value="rating">Sort by Rating</option>
                <option value="title">Sort by Title</option>
                <option value="date">Sort by Date</option>
              </select>
            </div>
          </div>

          <div className="row mt-2 g-2 align-items-center">
            <div className="col-12 col-md-9 d-flex flex-wrap gap-1">
              <button
                className={`btn btn-sm ${activeCat ? "btn-ghost" : "btn-accent"}`}
                onClick={() => setActiveCat("")}
              >
                All
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  className={`btn btn-sm ${activeCat === c ? "btn-accent" : "btn-ghost"}`}
                  onClick={() => setActiveCat(activeCat === c ? "" : c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="col-12 col-md-3 text-md-end">
              <button
                className="btn btn-ghost btn-sm w-100 w-md-auto"
                onClick={() => {
                  setTerm("");
                  setType("");
                  setSortBy("updated");
                  setActiveCat("");
                }}
              >
                <i className="bi bi-x-circle me-1"></i>Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <main className="container py-3">
        {filtered.length === 0 ? (
          <div className="empty-state rounded-3 p-4 text-center mt-4">
            <div className="display-6">☕</div>
            <h5 className="mt-2">No reviews yet</h5>
            <p className="mb-3 text-secondary">
              Add your first review to keep notes on places, movies, food, and more.
            </p>
            <button className="btn btn-accent" onClick={() => setEditing({})}>
              <i className="bi bi-plus-lg me-1"></i>New Review
            </button>
          </div>
        ) : (
          <div className="row g-3">
            {filtered.map(r => (
              <div key={r.id} className="col-12 col-sm-6 col-lg-4 col-xl-3">
                <div className="review-card card h-100">
                  <div className="review-card-stars">
                    <Stars value={r.rating} />
                  </div>
                  <div className="review-card-photo-wrap">
                    <img
                      className="review-card-photo"
                      alt={r.title || "review photo"}
                      src={
                        r.photoDataUrl ||
                        `https://picsum.photos/seed/${encodeURIComponent(r.title || r.id)}/600/400`
                      }
                    />
                  </div>
                  <div className="card-body">
                    <div className="review-card-header d-flex align-items-center gap-2 flex-wrap">
                      <span className="tag-pill text-uppercase small">{r.type}</span>
                      <span className="chip">{r.category || "Uncategorized"}</span>
                    </div>
                    <h5 className="card-title mb-1 title">{r.title}</h5>
                    {r.address && <p className="mb-2 small text-secondary">{r.address}</p>}
                    <div className="review-card-actions">
                      <button
                        className="btn btn-accent btn-sm"
                        onClick={() => setViewing(r)}
                        aria-label="View review details"
                      >
                        <i className="bi bi-eye"></i>
                        <span className="d-none d-md-inline ms-1">View</span>
                      </button>
                      {r.address && (
                        <a
                          className="btn btn-ghost btn-sm"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            r.address
                          )}`}
                          aria-label="Open location in Google Maps"
                        >
                          <i className="bi bi-geo-alt"></i>
                          <span className="d-none d-md-inline ms-1">Maps</span>
                        </a>
                      )}
                      {r.website && (
                        <a
                          className="btn btn-ghost btn-sm"
                          target="_blank"
                          rel="noreferrer"
                          href={r.website}
                          aria-label="Open related website"
                        >
                          <i className="bi bi-link-45deg"></i>
                          <span className="d-none d-md-inline ms-1">Website</span>
                        </a>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditing(r)}
                        aria-label="Edit review"
                      >
                        <i className="bi bi-pencil"></i>
                        <span className="d-none d-md-inline ms-1">Edit</span>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={() => handleDelete(r)}
                        aria-label="Delete review"
                      >
                        <i className="bi bi-trash"></i>
                        <span className="d-none d-md-inline ms-1">Delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="review-card-meta text-secondary small">
                    Updated {new Date(r.updated || r.created || Date.now()).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {viewing && (
        <ReviewDetail
          review={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onDelete={() => handleDelete(viewing)}
        />
      )}

      {editing !== null && (
        <Editor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onAuthError={() => applyAuth(null)}
        />
      )}
    </div>
  );
}

function ReviewDetail({ review, onClose, onEdit, onDelete }) {
  if (!review) return null;
  const updatedStamp = review.updated || review.created || Date.now();
  const updatedText = new Date(updatedStamp).toLocaleString();
  return (
    <div className="review-detail-backdrop" role="dialog" aria-modal="true">
      <div className="review-detail-card">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="tag-pill text-uppercase small">{review.type}</span>
              <span className="chip">{review.category || "Uncategorized"}</span>
            </div>
            <h2 className="mb-1 title">{review.title}</h2>
            <div className="d-flex align-items-center gap-2 text-secondary small">
              <Stars value={review.rating} />
              <span>{updatedText}</span>
            </div>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              <i className="bi bi-x-lg me-1"></i>Close
            </button>
            <button type="button" className="btn btn-accent btn-sm" onClick={onEdit}>
              <i className="bi bi-pencil-square me-1"></i>Edit
            </button>
            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={onDelete}>
              <i className="bi bi-trash3 me-1"></i>Delete
            </button>
          </div>
        </div>
        <img
          className="review-detail-photo"
          alt={review.title || "review photo"}
          src={
            review.photoDataUrl ||
            `https://picsum.photos/seed/${encodeURIComponent(review.title || review.id)}/800/500`
          }
        />
        {review.address && <p className="mt-3 mb-1 text-secondary">{review.address}</p>}
        {review.website && (
          <p className="mb-3">
            <a className="btn btn-ghost btn-sm" href={review.website} target="_blank" rel="noreferrer">
              <i className="bi bi-link-45deg me-1"></i>Website
            </a>
          </p>
        )}
        <div className="review-detail-notes">
          {review.notes ? review.notes : <span className="text-secondary">No description provided.</span>}
        </div>
      </div>
    </div>
  );
}

function Editor({ initial, onClose, onSaved, onAuthError = () => {} }) {
  const [form, setForm] = useState({
    id: initial.id,
    title: initial.title || "",
    type: initial.type || "place",
    category: initial.category || "",
    rating: initial.rating || 3,
    address: initial.address || "",
    website: initial.website || "",
    date: initial.date || "",
    notes: initial.notes || "",
    photoDataUrl: initial.photoDataUrl || ""
  });

  const setField = k => e => setForm(s => ({ ...s, [k]: e.target.value }));
  function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setForm(s => ({ ...s, photoDataUrl: r.result }));
    r.readAsDataURL(f);
  }

  async function submit(e) {
    e.preventDefault();
    const payload = { ...form, rating: Number(form.rating), updated: nowISO() };
    try {
      if (form.id) {
        await updateReview(form.id, payload);
      } else {
        // add created now to help backends that do not stamp it
        payload.created = nowISO();
        await createReview(payload);
      }
      onSaved();
    } catch (err) {
      const message = String(err?.message ?? "");
      if (message.includes("401")) {
        alert("Your session expired. Please sign in again.");
        onAuthError();
      } else {
        alert(message);
      }
    }
  }

  return (
    <div
      className="offcanvas offcanvas-bottom show editor-offcanvas"
      style={{ visibility: "visible", height: "86vh" }}
    >
      <div className="offcanvas-header">
        <h5 className="offcanvas-title brand">
          {form.id ? "Edit Review" : "New Review"}
        </h5>
        <button type="button" className="btn-close" onClick={onClose}></button>
      </div>
      <div className="offcanvas-body pt-0">
        <form onSubmit={submit}>
          <div className="row g-2">
            <div className="col-8">
              <label className="form-label small">Title</label>
              <input className="form-control" value={form.title} onChange={setField("title")} required />
            </div>
            <div className="col-4">
              <label className="form-label small">Type</label>
              <select className="form-select" value={form.type} onChange={setField("type")}>
                {TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-8">
              <label className="form-label small">Category</label>
              <input className="form-control" value={form.category} onChange={setField("category")} />
            </div>
            <div className="col-4">
              <label className="form-label small">Rating</label>
              <select className="form-select" value={form.rating} onChange={setField("rating")}>
                {[5, 4, 3, 2, 1].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label small">Address or Where to find</label>
              <input className="form-control" value={form.address} onChange={setField("address")} />
            </div>
            <div className="col-12">
              <label className="form-label small">Website or Link</label>
              <input className="form-control" value={form.website} onChange={setField("website")} />
            </div>
            <div className="col-12">
              <label className="form-label small">Visited or Watched On</label>
              <input type="date" className="form-control" value={form.date} onChange={setField("date")} />
            </div>
            <div className="col-12">
              <label className="form-label small">Notes</label>
              <textarea className="form-control" rows="4" value={form.notes} onChange={setField("notes")} />
            </div>
            <div className="col-12">
              <label className="form-label small">Photo (optional)</label>
              <input type="file" accept="image/*" className="form-control" onChange={onFile} />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-accent" type="submit">
              <i className="bi bi-check2 me-1"></i>Save
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
