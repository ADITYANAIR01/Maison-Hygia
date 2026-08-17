from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import ALLOWED_ORIGINS
from .database import ensure_schema
from .routes import cart_router, payment_router, router


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
app.include_router(cart_router)
app.include_router(payment_router)


@app.get("/")
def root():
    return {"message": "Maison Hygia API is running", "version": "0.1.0"}
