"""Authentication and authorization utilities for admin endpoints."""

import time

import httpx
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import settings
from .database import SessionLocal

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


def _jwks_url() -> str:
    return (
        f"https://cognito-idp.{settings.AWS_REGION}.amazonaws.com/"
        f"{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )


def _issuer() -> str:
    return (
        f"https://cognito-idp.{settings.AWS_REGION}.amazonaws.com/"
        f"{settings.COGNITO_USER_POOL_ID}"
    )


def get_jwks() -> dict:
    """Fetch and cache Cognito JWKS with 1-hour TTL."""
    global _JWKS_CACHE, _JWKS_CACHE_TIME

    if not settings.COGNITO_USER_POOL_ID:
        return {"keys": []}

    now = time.time()
    if _JWKS_CACHE is not None and (now - _JWKS_CACHE_TIME) < JWKS_TTL_SECONDS:
        return _JWKS_CACHE

    try:
        response = httpx.get(_jwks_url(), timeout=10.0)
        response.raise_for_status()
        _JWKS_CACHE = response.json()
        _JWKS_CACHE_TIME = now
        return _JWKS_CACHE
    except Exception:  # noqa: BLE001 - degrade to empty JWKS on any fetch error
        return {"keys": []}


def _reset_jwks_cache() -> None:
    global _JWKS_CACHE, _JWKS_CACHE_TIME
    _JWKS_CACHE = None
    _JWKS_CACHE_TIME = 0


def verify_cognito_jwt(token: str) -> dict:
    """Verify a Cognito JWT token and return the payload."""
    if not settings.COGNITO_USER_POOL_ID or not settings.COGNITO_APP_CLIENT_ID:
        raise AuthError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Cognito authentication not configured",
        )

    jwks = get_jwks()
    if not jwks.get("keys"):
        raise AuthError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Unable to fetch JWKS",
        )

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token header")

    kid = unverified_header.get("kid")
    if not kid:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Token missing key ID")

    key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
    if not key:
        # Refresh the JWKS cache manually and try once more.
        _reset_jwks_cache()
        jwks = get_jwks()
        key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if not key:
            raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token key")

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=_issuer(),
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Token has expired")
    except jwt.JWTClaimsError as e:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, f"Invalid token claims: {e}")
    except JWTError as e:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")

    audience = payload.get("aud") or payload.get("client_id")
    if audience != settings.COGNITO_APP_CLIENT_ID:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Invalid token audience")

    return payload


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
        return verify_cognito_jwt(credentials.credentials)
    except AuthError:
        raise
    # fmt: off
    except Exception as e:  # noqa: BLE001 - any unexpected verification error becomes 401
        raise AuthError(status.HTTP_401_UNAUTHORIZED, f"Authentication failed: {e}")
    # fmt: on


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require the authenticated user to have the admin role.

    Admin is granted via the Cognito ``custom:role`` claim or membership in the
    ``admin`` Cognito group. No database role lookup is performed.
    """
    role = user.get("custom:role")
    groups = user.get("cognito:groups") or []
    if role != "admin" and "admin" not in groups:
        raise AuthError(
            status.HTTP_403_FORBIDDEN,
            "Admin access required",
        )

    user["user_id"] = user.get("sub")
    return user
