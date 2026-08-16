from fastapi import FastAPI

from .database import Base, engine
from .routes import cart_router, payment_router, router

app = FastAPI(title="Maison Hygia API", version="0.1.0")
app.include_router(router)
app.include_router(cart_router)
app.include_router(payment_router)


@app.get("/")
def root():
    return {"message": "Maison Hygia API is running", "version": "0.1.0"}


@app.on_event("startup")
def on_startup():
    # Create tables on first run (development only; use migrations in production)
    Base.metadata.create_all(bind=engine)
