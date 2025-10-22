import os
from typing import List
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


def parse_origins(raw: str) -> List[str]:
    out: List[str] = []
    for item in (raw or "").split(","):
        clean = item.strip().rstrip("/")
        if clean:
            out.append(clean)
    return out


DEFAULT_ORIGINS = "https://revumeapp.netlify.app,http://localhost:5173"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN") or os.getenv("FRONTEND_ORIGINS")
ALLOWED_ORIGINS = parse_origins(FRONTEND_ORIGIN or DEFAULT_ORIGINS) or parse_origins(DEFAULT_ORIGINS)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
    allow_origin_regex=r"https://.*\.netlify\.app",
)

reviews = {}

@app.get("/api/reviews")
def get_reviews():
    return list(reviews.values())

@app.post("/api/reviews")
def create_review(review: dict):
    item = dict(review)
    item["id"] = (item.get("id") or uuid4().hex).strip()
    if not item["id"]:
        item["id"] = uuid4().hex
    reviews[item["id"]] = item
    return item

@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: str):
    if review_id not in reviews:
        raise HTTPException(404)
    del reviews[review_id]
    return {"deleted": review_id}

@app.put("/api/reviews/{review_id}")
def update_review(review_id: str, review: dict):
    if review_id not in reviews:
        raise HTTPException(404, "Review not found")
    current = reviews[review_id].copy()
    current.update(review)
    current["id"] = review_id
    reviews[review_id] = current
    return current

@app.get("/health")
def health():
    return {"ok": True}
