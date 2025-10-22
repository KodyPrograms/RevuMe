import React, { useCallback, useEffect, useMemo, useState } from "react";
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
} from "./api";

const TYPES = ["place", "food", "movie", "book", "product"];
const nowISO = () => new Date().toISOString();
const USER_STORAGE_KEY = "revume_user";
const THEME_STORAGE_KEY = "revume_theme";

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
  const [token, setTokenState] = useState(() => getAuthToken());
  const [user, setUser] = useState(() => loadStoredUser());
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [theme, setTheme] = useState(() => getInitialTheme());

  const applyAuth = useCallback(result => {
    if (result && result.token && result.user) {
      setAuthToken(result.token);
      setTokenState(result.token);
      setUser(result.user);
      storeUser(result.user);
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

  const toggleTheme = useCallback(() => {
    setTheme(curr => (curr === "dark" ? "light" : "dark"));
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setRows([]);
      return;
    }
    try {
      const data = await listReviews();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = String(err?.message ?? "");
      if (message.includes("401")) {
        applyAuth(null);
      } else {
        console.error(err);
      }
    }
  }, [token, applyAuth]);

  useEffect(() => { refresh(); }, [refresh]);

  const authenticated = Boolean(token);
  const themeIsDark = theme === "dark";
  const themeIcon = themeIsDark ? "bi-sun" : "bi-moon";
  const themeLabel = themeIsDark ? "Switch to light mode" : "Switch to dark mode";
  const setAuthField = key => e => setAuthForm(s => ({ ...s, [key]: e.target.value }));

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
      setAuthError(cleaned || "Unable to process request.");
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
          <div className="row">
            {filtered.map(r => (
              <div key={r.id} className="col-12">
                <div className="card mb-3 p-2">
                  <div className="row g-2 align-items-stretch">
                    <div className="col-12 col-sm-4">
                      <img
                        className="photo"
                        alt="photo"
                        src={
                          r.photoDataUrl ||
                          `https://picsum.photos/seed/${encodeURIComponent(r.title || r.id)}/600/400`
                        }
                      />
                    </div>
                    <div className="col-12 col-sm-8">
                      <div className="card-body py-2">
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-2">
                            <span className="tag-pill text-uppercase small">{r.type}</span>
                            <span className="chip">{r.category || "Uncategorized"}</span>
                          </div>
                          <Stars value={r.rating} />
                        </div>
                        <h5 className="card-title mt-2 mb-1 title">{r.title}</h5>
                        <p className="mb-2 small text-secondary">{r.address}</p>
                        <p className="card-text notes">{r.notes}</p>
                        <div className="action-buttons">
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
                              <span className="d-none d-sm-inline ms-1">Maps</span>
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
                              <span className="d-none d-sm-inline ms-1">Website</span>
                            </a>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing(r)}
                            aria-label="Edit review"
                          >
                            <i className="bi bi-pencil"></i>
                            <span className="d-none d-sm-inline ms-1">Edit</span>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-danger"
                            onClick={async () => {
                              if (confirm("Delete this review?")) {
                                try {
                                  await deleteReview(r.id);
                                  refresh();
                                } catch (err) {
                                  const msg = String(err?.message ?? "");
                                  if (msg.includes("401")) {
                                    alert("Your session expired. Please sign in again.");
                                    applyAuth(null);
                                  } else {
                                    alert(msg);
                                  }
                                }
                              }
                            }}
                            aria-label="Delete review"
                          >
                            <i className="bi bi-trash"></i>
                            <span className="d-none d-sm-inline ms-1">Delete</span>
                          </button>
                        </div>
                        <p className="mt-2 text-secondary small">
                          Updated {new Date(r.updated || r.created || Date.now()).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

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
