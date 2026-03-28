"""Scanner engine: filters targets by market cap, volume, depth, RSI."""

import asyncio
from datetime import datetime, timezone, timedelta

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.database import async_session
from app.core.websocket import ws_manager
from app.models.database import PositionModel, ScannerLogModel, StrategyConfigModel
from app.models.schemas import StrategyConfigSchema
from app.services.exchange import exchange
from app.utils.indicators import calculate_rsi

logger = structlog.get_logger(__name__)
settings = get_settings()


class ScannerEngine:
    """Periodically scans all USDT perpetual pairs for short-selling opportunities."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_scan: datetime | None = None

    @property
    def running(self) -> bool:
        return self._running

    @property
    def last_scan(self) -> datetime | None:
        return self._last_scan

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("scanner_started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("scanner_stopped")

    async def _loop(self):
        while self._running:
            try:
                config = await self._load_config()
                if config:
                    await self._scan(config)
                await asyncio.sleep(config.scan_interval_sec if config else 60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("scanner_loop_error", error=str(e))
                await asyncio.sleep(30)

    async def _load_config(self) -> StrategyConfigSchema | None:
        async with async_session() as db:
            result = await db.execute(
                select(StrategyConfigModel).where(StrategyConfigModel.is_active == True)
            )
            row = result.scalar_one_or_none()
            if not row:
                return None
            return StrategyConfigSchema(**row.config_json)

    async def _scan(self, config: StrategyConfigSchema):
        logger.info("scan_start")
        tickers = await exchange.get_all_tickers()
        usdt_pairs = [t for t in tickers if t["symbol"].endswith("USDT")]

        details = []
        passed_symbols = []

        # Count active positions
        async with async_session() as db:
            result = await db.execute(
                select(func.count()).select_from(PositionModel).where(
                    PositionModel.status.in_(["ACTIVE", "OPENING"])
                )
            )
            active_count = result.scalar() or 0

        for ticker in usdt_pairs:
            symbol = ticker["symbol"]
            reject = None

            # a. Blacklist
            if symbol in config.blacklist:
                reject = "blacklisted"

            # b. Market cap estimate
            elif float(ticker.get("quoteVolume", 0)) == 0:
                reject = "no_volume"
            else:
                price = float(ticker.get("lastPrice", 0))
                volume_24h = float(ticker.get("quoteVolume", 0))

                # c. Volume filter
                if not reject and volume_24h < config.min_volume_24h_usd:
                    reject = "low_volume"

                # b. Market cap estimate (rough: volume * price as proxy)
                est_mcap = volume_24h  # simplified proxy
                if not reject and est_mcap < config.min_market_cap_usd:
                    reject = "low_market_cap"

            if reject:
                details.append({"symbol": symbol, "passed": False, "reject_reason": reject})
                continue

            # d. Order book depth
            try:
                depth = await exchange.get_orderbook(symbol, limit=5)
                bid_total = sum(float(b[1]) * float(b[0]) for b in depth["bids"])
                ask_total = sum(float(a[1]) * float(a[0]) for a in depth["asks"])
                depth_ratio = (bid_total + ask_total) / max(est_mcap, 1)
                if depth_ratio < config.min_depth_ratio:
                    details.append({"symbol": symbol, "passed": False, "reject_reason": "low_depth"})
                    continue
            except Exception as e:
                logger.warning("depth_check_failed", symbol=symbol, error=str(e))
                details.append({"symbol": symbol, "passed": False, "reject_reason": "depth_error"})
                continue

            # e. RSI filter
            try:
                klines = await exchange.get_klines(
                    symbol, config.kline_interval, limit=config.rsi_period + 1
                )
                closes = [float(k[4]) for k in klines]
                rsi = calculate_rsi(closes, config.rsi_period)
                if rsi < config.rsi_threshold:
                    details.append({
                        "symbol": symbol, "passed": False,
                        "reject_reason": f"rsi_low({rsi:.1f})"
                    })
                    continue
            except Exception as e:
                logger.warning("rsi_check_failed", symbol=symbol, error=str(e))
                details.append({"symbol": symbol, "passed": False, "reject_reason": "rsi_error"})
                continue

            # f. Cooldown check
            async with async_session() as db:
                result = await db.execute(
                    select(PositionModel)
                    .where(PositionModel.symbol == symbol)
                    .order_by(PositionModel.trigger_time.desc())
                    .limit(1)
                )
                last_pos = result.scalar_one_or_none()
                if last_pos:
                    cooldown_until = last_pos.trigger_time + timedelta(hours=config.cooldown_hours)
                    if datetime.now(timezone.utc) < cooldown_until:
                        details.append({
                            "symbol": symbol, "passed": False,
                            "reject_reason": "cooldown"
                        })
                        continue

            # g. Concurrent position limit
            if active_count >= config.max_concurrent_positions:
                details.append({
                    "symbol": symbol, "passed": False,
                    "reject_reason": "max_positions_reached"
                })
                continue

            # All filters passed
            passed_symbols.append({"symbol": symbol, "price": price, "rsi": rsi})
            details.append({"symbol": symbol, "passed": True})
            active_count += 1

        # Save scan log
        self._last_scan = datetime.now(timezone.utc)
        async with async_session() as db:
            log = ScannerLogModel(
                scan_time=self._last_scan,
                total_pairs=len(usdt_pairs),
                passed=len(passed_symbols),
                details=details,
            )
            db.add(log)
            await db.commit()

        logger.info(
            "scan_complete",
            total=len(usdt_pairs),
            passed=len(passed_symbols),
            symbols=[s["symbol"] for s in passed_symbols],
        )

        # Broadcast update
        await ws_manager.broadcast("scanner_update", {
            "scan_time": self._last_scan.isoformat(),
            "passed": len(passed_symbols),
            "total": len(usdt_pairs),
        })

        return passed_symbols


# Singleton
scanner_engine = ScannerEngine()
