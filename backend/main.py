"""Maison Hygia backend - FastAPI application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import AuthError
from .database import ALLOWED_ORIGINS, ensure_schema
from .routes import admin_router, cart_router, payment_router, router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and apply lightweight dev migrations (see database.ensure_schema).
    # Production should use real migrations.
    ensure_schema()
    yield


app = FastAPI(title="Maison Hygia API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(admin_router)
app.include_router(cart_router)
app.include_router(payment_router)


@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError):
    """Convert the custom AuthError into a proper JSON HTTP response."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/")
def root():
    return {"message": "Maison Hygia API is running", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


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
