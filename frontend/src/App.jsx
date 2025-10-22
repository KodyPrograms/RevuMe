import React, { useEffect, useMemo, useState } from "react";
import { listReviews, createReview, updateReview, deleteReview } from "./api";

const TYPES = ["place", "food", "movie", "book", "product"];
const nowISO = () => new Date().toISOString();

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

  async function refresh() {
    const data = await listReviews();
    setRows(Array.isArray(data) ? data : []);
  }
  useEffect(() => { refresh(); }, []);

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

  return (
    <div>
      {/* Top bar */}
      <nav className="navbar navbar-dark navbar-expand py-2">
        <div className="container">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <i className="bi bi-cup-hot me-2 text-warning"></i>
            <span className="brand fw-bold">RevuMe</span>
          </a>
          <div className="ms-auto d-flex gap-2 align-items-center">
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
                    <div className="col-4 d-none d-sm-block">
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
                        <div className="d-flex gap-2 flex-wrap">
                          {r.address && (
                            <a
                              className="btn btn-ghost btn-sm"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                r.address
                              )}`}
                            >
                              <i className="bi bi-geo-alt"></i> Maps
                            </a>
                          )}
                          {r.website && (
                            <a
                              className="btn btn-ghost btn-sm"
                              target="_blank"
                              rel="noreferrer"
                              href={r.website}
                            >
                              <i className="bi bi-link-45deg"></i> Website
                            </a>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>
                            <i className="bi bi-pencil"></i> Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-danger"
                            onClick={async () => {
                              if (confirm("Delete this review?")) {
                                await deleteReview(r.id);
                                refresh();
                              }
                            }}
                          >
                            <i className="bi bi-trash"></i> Delete
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
        />
      )}
    </div>
  );
}

function Editor({ initial, onClose, onSaved }) {
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
    if (form.id) {
      await updateReview(form.id, payload);
    } else {
      // add created now to help backends that do not stamp it
      payload.created = nowISO();
      await createReview(payload);
    }
    onSaved();
  }

  return (
    <div
      className="offcanvas offcanvas-bottom show"
      style={{ visibility: "visible", height: "86vh", background: "var(--bg)" }}
    >
      <div className="offcanvas-header">
        <h5 className="offcanvas-title brand">
          {form.id ? "Edit Review" : "New Review"}
        </h5>
        <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
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
