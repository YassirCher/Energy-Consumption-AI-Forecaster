"""
Authentication & Authorization — EcoForecaster v5.0
JWT-based auth with role-based access control (admin/viewer).
"""

import os
import sqlite3
import datetime
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext

# ─── Configuration ──────────────────────────────────────────────────────────────

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "ecoforecaster-local-development-only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
DEFAULT_ADMIN_PASSWORD = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123")
DEFAULT_VIEWER_PASSWORD = os.environ.get("DEFAULT_VIEWER_PASSWORD", "viewer123")

if os.environ.get("ENVIRONMENT") == "production":
    required_secrets = {
        "JWT_SECRET_KEY": os.environ.get("JWT_SECRET_KEY"),
        "DEFAULT_ADMIN_PASSWORD": os.environ.get("DEFAULT_ADMIN_PASSWORD"),
        "DEFAULT_VIEWER_PASSWORD": os.environ.get("DEFAULT_VIEWER_PASSWORD"),
    }
    missing_secrets = [name for name, value in required_secrets.items() if not value]
    if missing_secrets:
        raise RuntimeError(f"Missing production authentication configuration: {', '.join(missing_secrets)}")

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_DB_PATH = os.path.join(_BASE_DIR, "users.db")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# ─── Pydantic Models ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class UserInfo(BaseModel):
    username: str
    role: str

# ─── Database Setup ─────────────────────────────────────────────────────────────

def _ensure_users_table():
    conn = sqlite3.connect(_DB_PATH)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    # Seed default users if they don't exist
    cur.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        admin_hash = pwd_context.hash(DEFAULT_ADMIN_PASSWORD)
        viewer_hash = pwd_context.hash(DEFAULT_VIEWER_PASSWORD)
        cur.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                    ("admin", admin_hash, "admin"))
        cur.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                    ("viewer", viewer_hash, "viewer"))
        print("[Auth] Default admin and viewer accounts created from environment configuration")

    conn.commit()
    conn.close()

_ensure_users_table()

# ─── Token Operations ──────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

# ─── User Operations ──────────────────────────────────────────────────────────

def authenticate_user(username: str, password: str) -> Optional[dict]:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()

    if row and pwd_context.verify(password, row["password_hash"]):
        return {"username": row["username"], "role": row["role"]}
    return None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """FastAPI dependency to get the current authenticated user."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    payload = decode_token(credentials.credentials)
    username = payload.get("sub")
    role = payload.get("role")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    return {"username": username, "role": role}


def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    """FastAPI dependency — returns user if authenticated, None otherwise."""
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        return {"username": payload.get("sub"), "role": payload.get("role")}
    except HTTPException:
        return None


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — requires admin role."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return user
