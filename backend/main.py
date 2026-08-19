"""Maison Hygia backend - FastAPI application."""

import logging
import sys
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pythonjsonlogger import jsonlogger
from sqlalchemy import text

from .admin import admin_router
from .auth import AuthError
from .config import settings
from .database import ALLOWED_ORIGINS, engine, ensure_schema
from .routes import cart_router, checkout_router, payment_router, router

# --- Structured JSON logging ---
LOG_LEVEL = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logger = logging.getLogger("maisonhygia")
logger.setLevel(LOG_LEVEL)

_formatter = jsonlogger.JsonFormatter(
    "%(asctime)s %(levelname)s %(name)s %(message)s",
    rename_fields={"asctime": "timestamp", "levelname": "level"},
)
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_formatter)
logger.addHandler(_handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables for local dev. Production uses Alembic migrations.
    if settings.AUTO_CREATE_SCHEMA:
        ensure_schema()
    yield
    engine.dispose()


app = FastAPI(title="Maison Hygia API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(cart_router)
app.include_router(payment_router)
app.include_router(checkout_router)
app.include_router(admin_router)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    """Log every request with a trace id for correlation."""
    trace_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    logger.info(
        "request",
        extra={
            "trace_id": trace_id,
            "method": request.method,
            "path": request.url.path,
        },
    )
    response = await call_next(request)
    response.headers["X-Request-Id"] = trace_id
    logger.info(
        "response",
        extra={
            "trace_id": trace_id,
            "status_code": response.status_code,
        },
    )
    return response


@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError):
    """Convert the custom AuthError into a proper JSON HTTP response."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/")
def root():
    return {"message": "Maison Hygia API is running", "version": "0.1.0"}


@app.get("/health")
def health():
    """Health check that verifies database connectivity."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:  # noqa: BLE001 - any DB failure becomes a 500 health check
        logger.error("health check failed", extra={"error": str(e)})
        return JSONResponse(
            status_code=500,
            content={"status": "error", "database": "unavailable", "detail": str(e)},
        )
    return {"status": "ok", "version": "0.1.0", "database": "ok"}


def run_server(port: int = 8001, reload: bool = True):
    """Run the backend server (for local development)."""
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
        reload_dirs=["backend"],
    )


if __name__ == "__main__":
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    run_server(port=port, reload=True)
