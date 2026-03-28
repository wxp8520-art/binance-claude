"""Binance Futures API wrapper with rate limiting and error handling."""

import asyncio
import time
import structlog
from decimal import Decimal
from typing import Any

from binance import AsyncClient, BinanceSocketManager
from binance.exceptions import BinanceAPIException

from app.config import get_settings

logger = structlog.get_logger(__name__)

settings = get_settings()


class BinanceExchange:
    """Async wrapper around Binance Futures API with rate limiting."""

    def __init__(self):
        self._client: AsyncClient | None = None
        self._bsm: BinanceSocketManager | None = None
        self._weight_used: int = 0
        self._weight_reset_time: float = time.time()
        self._max_weight: int = 1800  # Stay under 2400 limit
        self._rate_limited_until: float = 0

    @property
    def connected(self) -> bool:
        return self._client is not None

    async def connect(self):
        if not settings.binance_api_key or settings.binance_api_key == "your_api_key_here":
            logger.warning("binance_skipped_no_api_key")
            return
        self._client = await AsyncClient.create(
            api_key=settings.binance_api_key,
            api_secret=settings.binance_api_secret,
            testnet=settings.binance_testnet,
        )
        self._bsm = BinanceSocketManager(self._client)
        logger.info("binance_connected", testnet=settings.binance_testnet)

    async def disconnect(self):
        if self._client:
            await self._client.close_connection()
            logger.info("binance_disconnected")

    async def _check_rate_limit(self, weight: int = 1):
        now = time.time()
        if now > self._weight_reset_time + 60:
            self._weight_used = 0
            self._weight_reset_time = now
        if now < self._rate_limited_until:
            wait = self._rate_limited_until - now
            logger.warning("rate_limit_waiting", wait_seconds=wait)
            await asyncio.sleep(wait)
        if self._weight_used + weight > self._max_weight:
            wait = 60 - (now - self._weight_reset_time)
            if wait > 0:
                logger.warning("rate_limit_preemptive", wait_seconds=wait)
                await asyncio.sleep(wait)
            self._weight_used = 0
            self._weight_reset_time = time.time()
        self._weight_used += weight

    async def _safe_call(self, coro, weight: int = 1, retries: int = 3):
        if not self._client:
            raise RuntimeError("Binance client not connected. Set valid API keys in .env")
        await self._check_rate_limit(weight)
        for attempt in range(retries):
            try:
                return await coro
            except BinanceAPIException as e:
                if e.code == -1003:  # Rate limit
                    self._rate_limited_until = time.time() + 60
                    logger.warning("rate_limited_by_binance", code=e.code)
                    if attempt < retries - 1:
                        await asyncio.sleep(2 ** attempt)
                        continue
                logger.error("binance_api_error", code=e.code, message=e.message, attempt=attempt)
                if attempt < retries - 1:
                    await asyncio.sleep(2)
                    continue
                raise
            except Exception as e:
                logger.error("binance_unexpected_error", error=str(e), attempt=attempt)
                if attempt < retries - 1:
                    await asyncio.sleep(2)
                    continue
                raise

    # ── Market Data ──

    async def get_all_tickers(self) -> list[dict]:
        return await self._safe_call(
            self._client.futures_ticker(), weight=40
        )

    async def get_orderbook(self, symbol: str, limit: int = 5) -> dict:
        return await self._safe_call(
            self._client.futures_order_book(symbol=symbol, limit=limit), weight=2
        )

    async def get_klines(self, symbol: str, interval: str, limit: int = 15) -> list:
        return await self._safe_call(
            self._client.futures_klines(symbol=symbol, interval=interval, limit=limit), weight=5
        )

    async def get_mark_price(self, symbol: str) -> dict:
        return await self._safe_call(
            self._client.futures_mark_price(symbol=symbol), weight=1
        )

    # ── Account ──

    async def get_account_balance(self) -> list[dict]:
        return await self._safe_call(
            self._client.futures_account_balance(), weight=5
        )

    async def get_position_risk(self) -> list[dict]:
        return await self._safe_call(
            self._client.futures_position_information(), weight=5
        )

    async def get_account_info(self) -> dict:
        return await self._safe_call(
            self._client.futures_account(), weight=5
        )

    # ── Trading ──

    async def set_leverage(self, symbol: str, leverage: int) -> dict:
        return await self._safe_call(
            self._client.futures_change_leverage(symbol=symbol, leverage=leverage), weight=1
        )

    async def place_limit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
    ) -> dict:
        return await self._safe_call(
            self._client.futures_create_order(
                symbol=symbol,
                side=side,
                type="LIMIT",
                timeInForce="GTC",
                quantity=f"{quantity:.8f}".rstrip("0").rstrip("."),
                price=f"{price:.8f}".rstrip("0").rstrip("."),
            ),
            weight=1,
        )

    async def place_market_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
    ) -> dict:
        return await self._safe_call(
            self._client.futures_create_order(
                symbol=symbol,
                side=side,
                type="MARKET",
                quantity=f"{quantity:.8f}".rstrip("0").rstrip("."),
            ),
            weight=1,
        )

    async def cancel_order(self, symbol: str, order_id: str) -> dict:
        return await self._safe_call(
            self._client.futures_cancel_order(symbol=symbol, orderId=order_id), weight=1
        )

    async def get_order_status(self, symbol: str, order_id: str) -> dict:
        return await self._safe_call(
            self._client.futures_get_order(symbol=symbol, orderId=order_id), weight=1
        )

    async def cancel_all_orders(self, symbol: str) -> dict:
        return await self._safe_call(
            self._client.futures_cancel_all_open_orders(symbol=symbol), weight=1
        )

    # ── WebSocket Streams ──

    def get_symbol_ticker_socket(self, symbol: str):
        return self._bsm.symbol_ticker_futures_socket(symbol)

    def get_all_ticker_socket(self):
        return self._bsm.all_ticker_futures_socket()

    def get_user_data_socket(self):
        return self._bsm.futures_user_socket()


# Singleton instance
exchange = BinanceExchange()
