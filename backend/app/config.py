"""Application settings loaded from environment variables.

Supports encrypted API keys: if BINANCE_API_KEY or BINANCE_API_SECRET
starts with 'ENC:', it is decrypted at startup using MASTER_KEY env var.
"""

import os
import sys
from functools import lru_cache

from pydantic_settings import BaseSettings


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

    # Binance API (may be ENC:xxx encrypted values)
    binance_api_key: str = ""
    binance_api_secret: str = ""
    binance_testnet: bool = True  # Default to testnet for safety

    # Master key for decryption (passed via env, never stored in .env)
    master_key: str = ""

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
    settings = Settings()

    # Auto-decrypt encrypted API keys
    from app.core.crypto import is_encrypted, decrypt

    needs_decrypt = (
        is_encrypted(settings.binance_api_key)
        or is_encrypted(settings.binance_api_secret)
    )

    if needs_decrypt:
        master_key = settings.master_key or os.environ.get("MASTER_KEY", "")
        if not master_key:
            print(
                "ERROR: API keys are encrypted but MASTER_KEY is not set. "
                "Pass it via: MASTER_KEY=xxx docker compose up",
                file=sys.stderr,
            )
            sys.exit(1)
        try:
            if is_encrypted(settings.binance_api_key):
                object.__setattr__(
                    settings, "binance_api_key",
                    decrypt(settings.binance_api_key, master_key),
                )
            if is_encrypted(settings.binance_api_secret):
                object.__setattr__(
                    settings, "binance_api_secret",
                    decrypt(settings.binance_api_secret, master_key),
                )
        except Exception:
            print("ERROR: Failed to decrypt API keys. Wrong MASTER_KEY?", file=sys.stderr)
            sys.exit(1)

    return settings
