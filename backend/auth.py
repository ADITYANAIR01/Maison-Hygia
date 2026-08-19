"""Authentication and authorization utilities for admin endpoints."""

import os
import time

import httpx
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import UserRole

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_JWKS_URL = (
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else None
)
SUPABASE_ISSUER = f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else None

security = HTTPBearer(auto_error=False)

# JWKS cache with 1-hour TTL
_JWKS_CACHE: dict | None = None
_JWKS_CACHE_TIME = 0
JWKS_TTL_SECONDS = 3600


class AuthError(Exception):
    """Authentication/authorization error."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_jwks() -> dict:
    """Fetch and cache JWKS from Supabase with 1-hour TTL."""
    global _JWKS_CACHE, _JWKS_CACHE_TIME

    if not SUPABASE_JWKS_URL:
        return {"keys": []}

    now = time.time()
    if _JWKS_CACHE is not None and (now - _JWKS_CACHE_TIME) < JWKS_TTL_SECONDS:
        return _JWKS_CACHE

    try:
        response = httpx.get(SUPABASE_JWKS_URL, timeout=10.0)
        response.raise_for_status()
        _JWKS_CACHE = response.json()
        _JWKS_CACHE_TIME = now
        return _JWKS_CACHE
    except Exception:  # noqa: BLE001 - degrade to empty JWKS on any fetch error
        return {"keys": []}


def verify_supabase_jwt(token: str) -> dict:
    """Verify Supabase JWT token and return payload."""
    if not SUPABASE_JWKS_URL or not SUPABASE_ISSUER:
        raise AuthError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Supabase authentication not configured",
        )

    jwks = get_jwks()
    if not jwks.get("keys"):
        raise AuthError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Unable to fetch JWKS",
        )

    # Get the key ID from token header
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token header")

    kid = unverified_header.get("kid")
    if not kid:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Token missing key ID")

    # Find matching key
    key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
    if not key:
        # Refresh JWKS cache and try once more
        get_jwks.cache_clear()
        jwks = get_jwks()
        key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if not key:
            raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token key")

    # Verify and decode token
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="authenticated",
            issuer=SUPABASE_ISSUER,
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Token has expired")
    except jwt.JWTClaimsError as e:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, f"Invalid token claims: {e}")
    except JWTError as e:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Extract and verify JWT from Authorization header."""
    if not credentials:
        raise AuthError(
            status.HTTP_401_UNAUTHORIZED,
            "Authorization header required",
        )

    try:
        payload = verify_supabase_jwt(credentials.credentials)
        return payload
    except AuthError:
        raise
    # fmt: off
    except Exception as e:  # noqa: BLE001 - any unexpected verification error becomes 401
        raise AuthError(status.HTTP_401_UNAUTHORIZED, f"Authentication failed: {e}")
    # fmt: on


def require_admin(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Require user to have admin role."""
    user_id = user.get("sub")
    if not user_id:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token: missing subject")

    # Check user_roles table for admin role
    role = (
        db.query(UserRole)
        .filter(
            UserRole.user_id == user_id,
            UserRole.role == "admin",
        )
        .first()
    )

    if not role:
        raise AuthError(
            status.HTTP_403_FORBIDDEN,
            "Admin access required",
        )

    # Attach user_id to payload for convenience
    user["user_id"] = user_id
    return user


def require_editor_or_admin(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Require user to have editor or admin role."""
    user_id = user.get("sub")
    if not user_id:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token: missing subject")

    role = (
        db.query(UserRole)
        .filter(
            UserRole.user_id == user_id,
            UserRole.role.in_(["admin", "editor"]),
        )
        .first()
    )

    if not role:
        raise AuthError(
            status.HTTP_403_FORBIDDEN,
            "Editor or admin access required",
        )

    user["user_id"] = user_id
    return user
