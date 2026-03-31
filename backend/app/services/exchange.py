"""Binance Futures API wrapper with rate limiting and error handling."""

import asyncio
import math
import time
import structlog
from typing import Any, Callable, Coroutine

from binance import AsyncClient, BinanceSocketManager
from binance.exceptions import BinanceAPIException

from app.config import get_settings

logger = structlog.get_logger(__name__)

settings = get_settings()


class BinanceExchange:
    """Async wrapper around Binance Futures API with rate limiting.

    """

    def __init__(self):
        self._client: AsyncClient | None = None
        self._bsm: BinanceSocketManager | None = None
        self._weight_used: int = 0
        self._weight_reset_time: float = time.time()
        self._max_weight: int = 1800
        self._rate_limited_until: float = 0
        self._symbol_info: dict[str, dict] = {}

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
        await self._load_symbol_info()

    async def disconnect(self):
        if self._client:
            await self._client.close_connection()
            logger.info("binance_disconnected")

    async def _load_symbol_info(self):
        """Load exchange info to get price/quantity precision for all symbols."""
        try:
            info = await self._client.futures_exchange_info()
            for s in info["symbols"]:
                symbol = s["symbol"]
                price_precision = s.get("pricePrecision", 8)
                qty_precision = s.get("quantityPrecision", 8)

                # Extract filters
                tick_size = None
                step_size = None
                min_qty = None
                min_notional = None
                for f in s.get("filters", []):
                    if f["filterType"] == "PRICE_FILTER":
                        tick_size = float(f["tickSize"])
                    elif f["filterType"] == "LOT_SIZE":
                        step_size = float(f["stepSize"])
                        min_qty = float(f["minQty"])
                    elif f["filterType"] == "MIN_NOTIONAL":
                        min_notional = float(f.get("notional", 0))

                self._symbol_info[symbol] = {
                    "price_precision": price_precision,
                    "qty_precision": qty_precision,
                    "tick_size": tick_size,
                    "step_size": step_size,
                    "min_qty": min_qty,
                    "min_notional": min_notional,
                }
            logger.info("symbol_info_loaded", count=len(self._symbol_info))
        except Exception as e:
            logger.error("symbol_info_load_failed", error=str(e))

    def format_price(self, symbol: str, price: float) -> str:
        """Format price to match exchange precision rules."""
        info = self._symbol_info.get(symbol)
        if not info:
            return f"{price:.2f}"
        precision = info["price_precision"]
        tick_size = info.get("tick_size")
        if tick_size and tick_size > 0:
            price = math.floor(price / tick_size) * tick_size
        return f"{price:.{precision}f}"

    def format_qty(self, symbol: str, qty: float) -> str:
        """Format quantity to match exchange precision rules."""
        info = self._symbol_info.get(symbol)
        if not info:
            return f"{qty:.3f}"
        precision = info["qty_precision"]
        step_size = info.get("step_size")
        if step_size and step_size > 0:
            qty = math.floor(qty / step_size) * step_size
        return f"{qty:.{precision}f}"

    def get_min_qty(self, symbol: str) -> float:
        """Get minimum order quantity for a symbol."""
        info = self._symbol_info.get(symbol)
        return info["min_qty"] if info and info.get("min_qty") else 0.001

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

    async def _safe_call(
        self,
        fn: Callable[..., Coroutine],
        weight: int = 1,
        retries: int = 3,
        **kwargs: Any,
    ):
        """Call an async API method with rate limiting and retries.

        Usage: await self._safe_call(self._client.futures_ticker, weight=40)
        Or:    await self._safe_call(self._client.futures_mark_price, weight=1, symbol="BTCUSDT")
        """
        if not self._client:
            raise RuntimeError("Binance client not connected. Set valid API keys in .env")
        await self._check_rate_limit(weight)
        for attempt in range(retries):
            try:
                return await fn(**kwargs)
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
            self._client.futures_ticker, weight=40
        )

    async def get_orderbook(self, symbol: str, limit: int = 5) -> dict:
        return await self._safe_call(
            self._client.futures_order_book, weight=2, symbol=symbol, limit=limit
        )

    async def get_klines(self, symbol: str, interval: str, limit: int = 15) -> list:
        return await self._safe_call(
            self._client.futures_klines, weight=5, symbol=symbol, interval=interval, limit=limit
        )

    async def get_mark_price(self, symbol: str) -> dict:
        return await self._safe_call(
            self._client.futures_mark_price, weight=1, symbol=symbol
        )

    # ── Account ──

    async def get_account_balance(self) -> list[dict]:
        return await self._safe_call(
            self._client.futures_account_balance, weight=5
        )

    async def get_position_risk(self) -> list[dict]:
        return await self._safe_call(
            self._client.futures_position_information, weight=5
        )

    async def get_account_info(self) -> dict:
        return await self._safe_call(
            self._client.futures_account, weight=5
        )

    # ── Trading ──

    async def set_leverage(self, symbol: str, leverage: int) -> dict:
        return await self._safe_call(
            self._client.futures_change_leverage, weight=1, symbol=symbol, leverage=leverage
        )

    async def place_limit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
    ) -> dict:
        formatted_qty = self.format_qty(symbol, quantity)
        formatted_price = self.format_price(symbol, price)
        return await self._safe_call(
            self._client.futures_create_order,
            weight=1,
            symbol=symbol,
            side=side,
            type="LIMIT",
            timeInForce="GTC",
            quantity=formatted_qty,
            price=formatted_price,
        )

    async def place_market_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
    ) -> dict:
        formatted_qty = self.format_qty(symbol, quantity)
        return await self._safe_call(
            self._client.futures_create_order,
            weight=1,
            symbol=symbol,
            side=side,
            type="MARKET",
            quantity=formatted_qty,
        )

    async def cancel_order(self, symbol: str, order_id: str) -> dict:
        return await self._safe_call(
            self._client.futures_cancel_order, weight=1, symbol=symbol, orderId=order_id
        )

    async def get_order_status(self, symbol: str, order_id: str) -> dict:
        return await self._safe_call(
            self._client.futures_get_order, weight=1, symbol=symbol, orderId=order_id
        )

    async def cancel_all_orders(self, symbol: str) -> dict:
        return await self._safe_call(
            self._client.futures_cancel_all_open_orders, weight=1, symbol=symbol
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
