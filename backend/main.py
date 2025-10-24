import base64
import hashlib
import os
import secrets
from datetime import datetime
from typing import Dict, Iterable, List, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, create_engine, text
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker
from dotenv import load_dotenv
from pathlib import Path


def parse_origins(raw: str) -> List[str]:
    out: List[str] = []
    for item in (raw or "").split(","):
        clean = item.strip().rstrip("/")
        if clean:
            out.append(clean)
    return out


load_dotenv(dotenv_path=Path(__file__).resolve().with_name(".env"), override=True)

DEFAULT_ORIGINS = "https://revumeapp.netlify.app,http://localhost:5173"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN") or os.getenv("FRONTEND_ORIGINS")
ALLOWED_ORIGINS = parse_origins(FRONTEND_ORIGIN or DEFAULT_ORIGINS) or parse_origins(DEFAULT_ORIGINS)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./revume.db")
ENGINE_KWARGS = {"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, **ENGINE_KWARGS)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: uuid4().hex)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")
    tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=lambda: uuid4().hex)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String, nullable=False)
    type = Column(String)
    category = Column(String)
    rating = Column(Integer)
    address = Column(String)
    website = Column(String)
    date = Column(String)
    notes = Column(Text)
    photoDataUrl = Column("photoDataUrl", Text)
    created = Column(String)
    updated = Column(String)

    user = relationship("User", back_populates="reviews")


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(String, primary_key=True, default=lambda: uuid4().hex)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="tokens")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{base64.b64encode(salt).decode()}:{base64.b64encode(digest).decode()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt_b64, digest_b64 = hashed.split(":")
        salt = base64.b64decode(salt_b64.encode())
        expected = base64.b64decode(digest_b64.encode())
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return secrets.compare_digest(actual, expected)


def issue_token(db: Session, user: User) -> str:
    token_value = secrets.token_urlsafe(32)
    db.add(AuthToken(token=token_value, user_id=user.id))
    db.commit()
    return token_value


class UserOut(BaseModel):
    id: str
    email: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthRequest(BaseModel):
    email: str = Field(...)
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("Invalid email address")
        return value


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class ReviewPayload(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    rating: Optional[int] = None
    address: Optional[str] = None
    website: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None
    photoDataUrl: Optional[str] = None
    created: Optional[str] = None
    updated: Optional[str] = None

    model_config = ConfigDict(extra="allow")


REVIEW_FIELDS: Iterable[str] = (
    "title",
    "type",
    "category",
    "rating",
    "address",
    "website",
    "date",
    "notes",
    "photoDataUrl",
    "created",
    "updated",
)


def apply_review_fields(review: Review, data: Dict[str, object]) -> None:
    for key in REVIEW_FIELDS:
        if key not in data:
            continue
        value = data[key]
        if key == "title":
            if value is None or not str(value).strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
            value = str(value).strip()
        if key == "rating" and value is not None:
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rating must be a number")
        setattr(review, key, value)


def serialize_review(review: Review) -> Dict[str, object]:
    return {
        "id": review.id,
        "title": review.title,
        "type": review.type,
        "category": review.category,
        "rating": review.rating,
        "address": review.address,
        "website": review.website,
        "date": review.date,
        "notes": review.notes,
        "photoDataUrl": review.photoDataUrl,
        "created": review.created,
        "updated": review.updated,
    }


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
    allow_origin_regex=r"https://.*\.netlify\.app",
)


def get_token(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthToken:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing")
    scheme, _, credentials = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")
    token = db.query(AuthToken).filter(AuthToken.token == credentials).first()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return token


def get_current_user(token: AuthToken = Depends(get_token)) -> User:
    return token.user


@app.post("/api/register", response_model=AuthResponse)
def register(payload: AuthRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token_value = issue_token(db, user)
    return AuthResponse(token=token_value, user=UserOut.model_validate(user))


@app.post("/api/login", response_model=AuthResponse)
def login(payload: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token_value = issue_token(db, user)
    return AuthResponse(token=token_value, user=UserOut.model_validate(user))


@app.post("/api/logout")
def logout(token: AuthToken = Depends(get_token), db: Session = Depends(get_db)):
    db.delete(token)
    db.commit()
    return {"ok": True}


@app.get("/api/reviews")
def get_reviews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = (
        db.query(Review)
        .filter(Review.user_id == user.id)
        .order_by(Review.updated.desc().nullslast(), Review.created.desc().nullslast())
        .all()
    )
    return [serialize_review(item) for item in items]


@app.post("/api/reviews")
def create_review(
    payload: ReviewPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    if not data.get("title"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    review = Review(id=(data.get("id") or uuid4().hex), user_id=user.id, title="temp")
    apply_review_fields(review, data)
    db.add(review)
    db.commit()
    db.refresh(review)
    return serialize_review(review)


@app.put("/api/reviews/{review_id}")
def update_review(
    review_id: str,
    payload: ReviewPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    review = db.query(Review).filter(Review.id == review_id, Review.user_id == user.id).first()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    data = payload.model_dump(exclude_unset=True)
    apply_review_fields(review, data)
    db.commit()
    db.refresh(review)
    return serialize_review(review)


@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id, Review.user_id == user.id).first()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    db.delete(review)
    db.commit()
    return {"deleted": review_id}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"ok": True}
