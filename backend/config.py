"""Application settings loaded from environment variables / .env."""

from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # DATABASE_URL is required — no fallback to SQLite.
    DATABASE_URL: str

    FRONTEND_URL: str = "http://localhost:8000"
    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:8000",
        "http://localhost:8001",
    ]

    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None

    COGNITO_USER_POOL_ID: str | None = None
    COGNITO_APP_CLIENT_ID: str | None = None
    AWS_REGION: str = "us-east-1"

    S3_ASSETS_BUCKET: str | None = None
    CF_ASSETS_DOMAIN: str = "assets.maisonhygia.adityanair.tech"

    LOG_LEVEL: str = "INFO"
    AUTO_CREATE_SCHEMA: bool = True

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def split_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


settings = Settings()
