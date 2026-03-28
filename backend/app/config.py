"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "Binance Short Grid Bot"
    debug: bool = False
    api_prefix: str = "/api"

    # Database
    database_url: str = "postgresql+asyncpg://bot:changeme@db:5432/trading_bot"
    database_echo: bool = False

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Binance API
    binance_api_key: str = ""
    binance_api_secret: str = ""
    binance_testnet: bool = True  # Default to testnet for safety

    # JWT Auth
    jwt_secret: str = "change-this-secret-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # Telegram Notification
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
