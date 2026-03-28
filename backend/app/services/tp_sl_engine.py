"""Take profit and stop loss monitoring engine."""

import asyncio
from datetime import datetime, timezone, timedelta

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.core.websocket import ws_manager
from app.models.database import (
    GridEntryModel, PositionModel, TPExecutionModel, SystemLogModel
)
from app.models.schemas import StrategyConfigSchema
from app.services.exchange import exchange
from app.services.grid_engine import grid_engine

logger = structlog.get_logger(__name__)


class TPSLEngine:
    """Monitors active positions for take profit and stop loss conditions."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._max_pnl_tracker: dict[str, float] = {}  # position_id -> max pnl%
        self._consecutive_losses: int = 0
        self._paused_until: datetime | None = None
        self._daily_loss: float = 0
        self._daily_loss_date: str = ""

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("tp_sl_engine_started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("tp_sl_engine_stopped")

    async def _loop(self):
        while self._running:
            try:
                await self._monitor_all_positions()
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("tp_sl_loop_error", error=str(e))
                await asyncio.sleep(10)

    async def _monitor_all_positions(self):
        # Check pause state
        if self._paused_until and datetime.now(timezone.utc) < self._paused_until:
            return

        async with async_session() as db:
            result = await db.execute(
                select(PositionModel)
                .options(
                    selectinload(PositionModel.grid_entries),
                    selectinload(PositionModel.tp_executions),
                )
                .where(PositionModel.status.in_(["ACTIVE", "CLOSING"]))
            )
            positions = result.scalars().all()

        for position in positions:
            try:
                await self._monitor_position(position)
            except Exception as e:
                logger.error(
                    "position_monitor_error",
                    position_id=str(position.id),
                    error=str(e),
                )

    async def _monitor_position(self, position: PositionModel):
        config = StrategyConfigSchema(**(position.config_snapshot or {}))
        symbol = position.symbol
        pos_id = str(position.id)

        # Handle manual close request
        if position.status == "CLOSING":
            await self._close_position(position, "MANUAL")
            return

        # Get current price
        try:
            mark = await exchange.get_mark_price(symbol)
            current_price = float(mark["markPrice"])
        except Exception as e:
            logger.warning("price_fetch_failed", symbol=symbol, error=str(e))
            return

        # Check grid fills
        await grid_engine.check_grid_fills(pos_id, symbol, current_price)

        # Calculate avg entry and current qty from filled entries
        filled_entries = [g for g in position.grid_entries if g.status == "FILLED"]
        if not filled_entries:
            return

        total_value = sum(float(g.filled_price or 0) * float(g.filled_qty or 0) for g in filled_entries)
        total_qty = sum(float(g.filled_qty or 0) for g in filled_entries)
        if total_qty == 0:
            return

        avg_entry = total_value / total_qty

        # Calculate PnL (short: profit when price drops)
        pnl_pct = (avg_entry - current_price) / avg_entry * 100 * position.leverage
        unrealized_pnl = (avg_entry - current_price) * total_qty

        # Update position in DB
        async with async_session() as db:
            result = await db.execute(
                select(PositionModel).where(PositionModel.id == pos_id)
            )
            pos = result.scalar_one_or_none()
            if pos:
                pos.avg_entry_price = avg_entry
                pos.current_qty = total_qty
                await db.commit()

        # Broadcast price update
        await ws_manager.broadcast("price_tick", {
            "position_id": pos_id,
            "symbol": symbol,
            "current_price": current_price,
            "avg_entry": avg_entry,
            "pnl_pct": round(pnl_pct, 2),
            "unrealized_pnl": round(unrealized_pnl, 4),
        })

        # ── Check Take Profit Tiers ──
        pending_tps = sorted(
            [t for t in position.tp_executions if t.status == "PENDING"],
            key=lambda t: t.tier_index,
        )
        for tp in pending_tps:
            if pnl_pct >= float(tp.trigger_pnl_pct or 0):
                close_qty = total_qty * float(tp.close_ratio or 0)
                try:
                    order = await exchange.place_market_order(
                        symbol=symbol, side="BUY", quantity=close_qty
                    )
                    realized = (avg_entry - current_price) * close_qty

                    async with async_session() as db:
                        result = await db.execute(
                            select(TPExecutionModel).where(
                                TPExecutionModel.position_id == pos_id,
                                TPExecutionModel.tier_index == tp.tier_index,
                            )
                        )
                        tp_record = result.scalar_one_or_none()
                        if tp_record:
                            tp_record.status = "EXECUTED"
                            tp_record.closed_qty = close_qty
                            tp_record.closed_price = current_price
                            tp_record.realized_pnl = realized
                            tp_record.executed_at = datetime.now(timezone.utc)

                        # Update position realized pnl
                        pos_result = await db.execute(
                            select(PositionModel).where(PositionModel.id == pos_id)
                        )
                        pos = pos_result.scalar_one_or_none()
                        if pos:
                            pos.realized_pnl = float(pos.realized_pnl or 0) + realized
                            pos.current_qty = total_qty - close_qty
                        await db.commit()

                    total_qty -= close_qty

                    await ws_manager.broadcast("tp_triggered", {
                        "position_id": pos_id,
                        "symbol": symbol,
                        "tier": tp.tier_index,
                        "pnl_pct": round(pnl_pct, 2),
                        "closed_qty": close_qty,
                        "realized": round(realized, 4),
                    })

                    logger.info(
                        "tp_triggered",
                        position_id=pos_id,
                        tier=tp.tier_index,
                        pnl_pct=round(pnl_pct, 2),
                    )

                except Exception as e:
                    logger.error("tp_order_failed", position_id=pos_id, error=str(e))

        # Check if all qty closed after TP
        if total_qty <= 0:
            await self._finalize_position(pos_id, "TP_COMPLETE")
            return

        # ── Check Trailing Stop ──
        if config.trailing_stop_enabled and pnl_pct >= config.trailing_stop_activation:
            max_pnl = self._max_pnl_tracker.get(pos_id, pnl_pct)
            if pnl_pct > max_pnl:
                self._max_pnl_tracker[pos_id] = pnl_pct
                max_pnl = pnl_pct
            drawdown = max_pnl - pnl_pct
            if drawdown >= config.trailing_stop_callback:
                await self._close_position(position, "TRAILING_STOP")
                return

        # ── Check Hard Stop Loss ──
        margin_loss = abs(unrealized_pnl) / float(position.total_margin) * 100

        # a. Margin loss stop
        if unrealized_pnl < 0 and margin_loss >= config.margin_loss_stop_pct:
            await self._close_position(position, "MARGIN_STOP_LOSS")
            return

        # b. Per target loss stop
        if unrealized_pnl < 0:
            loss_vs_margin = abs(unrealized_pnl) / float(position.total_margin) * 100
            if loss_vs_margin >= config.per_target_loss_stop_pct:
                await self._close_position(position, "TARGET_STOP_LOSS")
                return

        # c. Time stop
        elapsed = datetime.now(timezone.utc) - position.trigger_time
        if elapsed > timedelta(hours=config.time_stop_hours):
            await self._close_position(position, "TIME_STOP")
            return

        # d. Margin rate alert
        try:
            account = await exchange.get_account_info()
            margin_ratio = float(account.get("totalMarginBalance", 0))
            maint_margin = float(account.get("totalMaintMargin", 0))
            if maint_margin > 0:
                ratio = margin_ratio / maint_margin * 100
                if ratio < config.margin_rate_alert:
                    await ws_manager.broadcast("alert", {
                        "type": "margin_rate_warning",
                        "ratio": round(ratio, 2),
                        "threshold": config.margin_rate_alert,
                    })
        except Exception:
            pass

    async def _close_position(self, position: PositionModel, reason: str):
        """Close all remaining quantity at market."""
        symbol = position.symbol
        pos_id = str(position.id)
        current_qty = float(position.current_qty or 0)

        if current_qty > 0:
            try:
                await exchange.place_market_order(
                    symbol=symbol, side="BUY", quantity=current_qty
                )
            except Exception as e:
                logger.error("close_order_failed", position_id=pos_id, error=str(e))
                # Try to cancel all open orders
                try:
                    await exchange.cancel_all_orders(symbol)
                except Exception:
                    pass

        await self._finalize_position(pos_id, reason)

        # Track consecutive losses
        async with async_session() as db:
            result = await db.execute(
                select(PositionModel).where(PositionModel.id == pos_id)
            )
            pos = result.scalar_one_or_none()
            if pos and float(pos.realized_pnl or 0) < 0:
                self._consecutive_losses += 1
                config = StrategyConfigSchema(**(pos.config_snapshot or {}))
                if self._consecutive_losses >= config.max_consecutive_losses:
                    self._paused_until = datetime.now(timezone.utc) + timedelta(
                        minutes=config.consecutive_loss_pause_min
                    )
                    logger.warning(
                        "consecutive_loss_pause",
                        losses=self._consecutive_losses,
                        paused_until=self._paused_until.isoformat(),
                    )
                    await ws_manager.broadcast("alert", {
                        "type": "consecutive_loss_pause",
                        "losses": self._consecutive_losses,
                        "resume_at": self._paused_until.isoformat(),
                    })
            else:
                self._consecutive_losses = 0

        await ws_manager.broadcast("sl_triggered", {
            "position_id": pos_id,
            "symbol": symbol,
            "reason": reason,
        })

    async def _finalize_position(self, position_id: str, reason: str):
        """Mark position as closed in database."""
        async with async_session() as db:
            result = await db.execute(
                select(PositionModel).where(PositionModel.id == position_id)
            )
            pos = result.scalar_one_or_none()
            if pos:
                pos.status = "CLOSED"
                pos.close_reason = reason
                pos.closed_at = datetime.now(timezone.utc)
                await db.commit()

        self._max_pnl_tracker.pop(position_id, None)

        logger.info(
            "position_closed",
            position_id=position_id,
            reason=reason,
        )


# Singleton
tp_sl_engine = TPSLEngine()
