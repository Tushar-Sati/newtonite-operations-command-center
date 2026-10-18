from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BACKEND_DIR / 'newtonite.db'}"
    jwt_secret_key: SecretStr = Field(
        default=SecretStr("local-development-only-change-before-deploying"), min_length=32
    )
    jwt_access_token_minutes: int = Field(default=30, ge=1, le=1440)
    jwt_issuer: str = "newtonite-api"
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"

    @field_validator("database_url", mode="before")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Neon and other hosted Postgres providers commonly supply the generic
        # postgresql:// form. This project uses psycopg 3, not psycopg2.
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value.removeprefix("postgres://")
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value.removeprefix("postgresql://")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
