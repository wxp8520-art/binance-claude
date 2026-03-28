"""Grid short-selling position opening engine."""

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.websocket import ws_manager
from app.models.database import (
    GridEntryModel, PositionModel, TPExecutionModel, StrategyConfigModel
)
from app.models.schemas import StrategyConfigSchema
from app.services.exchange import exchange

logger = structlog.get_logger(__name__)


class GridEngine:
    """Handles grid short-selling position opening."""

    async def open_position(
        self,
        symbol: str,
        trigger_price: float,
        trigger_rsi: float,
        config: StrategyConfigSchema,
    ) -> str | None:
        """
        Open a new grid short position for the given symbol.
        Returns the position ID or None if failed.
        """
        position_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        async with async_session() as db:
            # Create position record
            position = PositionModel(
                id=position_id,
                symbol=symbol,
                trigger_price=trigger_price,
                trigger_rsi=trigger_rsi,
                trigger_time=now,
                status="OPENING",
                leverage=config.leverage,
                total_margin=config.total_margin_per_target,
                config_snapshot=config.model_dump(),
            )
            db.add(position)

            # Create grid entries
            for tier in config.grid_tiers:
                target_price = trigger_price * (1 + tier.price_increase_pct / 100)
                entry = GridEntryModel(
                    position_id=position_id,
                    tier_index=tier.tier_index,
                    target_price=target_price,
                    status="WAITING",
                )
                db.add(entry)

            # Create TP execution records
            for tp in config.tp_tiers:
                tp_exec = TPExecutionModel(
                    position_id=position_id,
                    tier_index=tp.tier_index,
                    trigger_pnl_pct=tp.profit_trigger_pct,
                    close_ratio=tp.close_ratio,
                    status="PENDING",
                )
                db.add(tp_exec)

            await db.commit()

        # Set leverage
        try:
            await exchange.set_leverage(symbol, config.leverage)
        except Exception as e:
            logger.error("set_leverage_failed", symbol=symbol, error=str(e))
            await self._update_position_status(position_id, "CLOSED", "LEVERAGE_ERROR")
            return None

        # Place grid orders
        try:
            await self._place_grid_orders(position_id, symbol, trigger_price, config)
        except Exception as e:
            logger.error("grid_orders_failed", symbol=symbol, error=str(e))

        # Check if at least tier 1 was placed
        async with async_session() as db:
            result = await db.execute(
                select(GridEntryModel).where(
                    GridEntryModel.position_id == position_id,
                    GridEntryModel.status.in_(["WAITING", "FILLED"]),
                    GridEntryModel.order_id.isnot(None),
                )
            )
            placed = result.scalars().all()
            if not placed:
                await self._update_position_status(position_id, "CLOSED", "NO_ORDERS_PLACED")
                return None

            # Set to ACTIVE
            await self._update_position_status(position_id, "ACTIVE")

        await ws_manager.broadcast("position_update", {
            "id": position_id,
            "symbol": symbol,
            "status": "ACTIVE",
            "trigger_price": trigger_price,
        })

        logger.info(
            "position_opened",
            id=position_id,
            symbol=symbol,
            trigger_price=trigger_price,
            leverage=config.leverage,
        )

        return position_id

    async def _place_grid_orders(
        self,
        position_id: str,
        symbol: str,
        trigger_price: float,
        config: StrategyConfigSchema,
    ):
        """Place limit short orders for each grid tier."""
        for tier in sorted(config.grid_tiers, key=lambda t: t.tier_index):
            target_price = trigger_price * (1 + tier.price_increase_pct / 100)
            margin = config.total_margin_per_target * tier.position_ratio
            qty = (margin * config.leverage) / target_price

            # Check account balance
            try:
                balances = await exchange.get_account_balance()
                usdt_balance = next(
                    (float(b["balance"]) for b in balances if b["asset"] == "USDT"), 0
                )
                if usdt_balance < margin:
                    logger.warning(
                        "insufficient_balance",
                        symbol=symbol,
                        tier=tier.tier_index,
                        required=margin,
                        available=usdt_balance,
                    )
                    await self._mark_grid_entry(position_id, tier.tier_index, "SKIPPED")
                    await ws_manager.broadcast("alert", {
                        "type": "insufficient_balance",
                        "symbol": symbol,
                        "tier": tier.tier_index,
                    })
                    continue
            except Exception as e:
                logger.warning("balance_check_failed", error=str(e))

            # Place order
            try:
                if config.order_type == "LIMIT":
                    order = await exchange.place_limit_order(
                        symbol=symbol,
                        side="SELL",
                        quantity=qty,
                        price=target_price,
                    )
                else:
                    order = await exchange.place_market_order(
                        symbol=symbol,
                        side="SELL",
                        quantity=qty,
                    )

                order_id = str(order["orderId"])
                await self._update_grid_entry(
                    position_id, tier.tier_index, order_id=order_id
                )

                logger.info(
                    "grid_order_placed",
                    symbol=symbol,
                    tier=tier.tier_index,
                    price=target_price,
                    qty=qty,
                    order_id=order_id,
                )

                await ws_manager.broadcast("grid_entry_filled", {
                    "position_id": position_id,
                    "tier": tier.tier_index,
                    "price": target_price,
                    "qty": qty,
                })

            except Exception as e:
                logger.error(
                    "grid_order_failed",
                    symbol=symbol,
                    tier=tier.tier_index,
                    error=str(e),
                )
                await self._mark_grid_entry(position_id, tier.tier_index, "SKIPPED")

    async def check_grid_fills(self, position_id: str, symbol: str, current_price: float):
        """Check if any WAITING grid entries have been filled."""
        async with async_session() as db:
            result = await db.execute(
                select(GridEntryModel).where(
                    GridEntryModel.position_id == position_id,
                    GridEntryModel.status == "WAITING",
                    GridEntryModel.order_id.isnot(None),
                )
            )
            waiting_entries = result.scalars().all()

            for entry in waiting_entries:
                if current_price >= float(entry.target_price):
                    try:
                        order_status = await exchange.get_order_status(
                            symbol, entry.order_id
                        )
                        if order_status["status"] == "FILLED":
                            entry.status = "FILLED"
                            entry.filled_price = float(order_status.get("avgPrice", entry.target_price))
                            entry.filled_qty = float(order_status.get("executedQty", 0))
                            entry.filled_at = datetime.now(timezone.utc)
                            await db.commit()

                            await ws_manager.broadcast("grid_entry_filled", {
                                "position_id": position_id,
                                "tier": entry.tier_index,
                                "filled_price": entry.filled_price,
                                "filled_qty": entry.filled_qty,
                            })

                            logger.info(
                                "grid_entry_filled",
                                position_id=position_id,
                                tier=entry.tier_index,
                                price=entry.filled_price,
                            )
                    except Exception as e:
                        logger.warning(
                            "fill_check_error",
                            position_id=position_id,
                            tier=entry.tier_index,
                            error=str(e),
                        )

    async def _update_grid_entry(
        self, position_id: str, tier_index: int, order_id: str
    ):
        async with async_session() as db:
            result = await db.execute(
                select(GridEntryModel).where(
                    GridEntryModel.position_id == position_id,
                    GridEntryModel.tier_index == tier_index,
                )
            )
            entry = result.scalar_one_or_none()
            if entry:
                entry.order_id = order_id
                await db.commit()

    async def _mark_grid_entry(self, position_id: str, tier_index: int, status: str):
        async with async_session() as db:
            result = await db.execute(
                select(GridEntryModel).where(
                    GridEntryModel.position_id == position_id,
                    GridEntryModel.tier_index == tier_index,
                )
            )
            entry = result.scalar_one_or_none()
            if entry:
                entry.status = status
                await db.commit()

    async def _update_position_status(
        self, position_id: str, status: str, close_reason: str | None = None
    ):
        async with async_session() as db:
            result = await db.execute(
                select(PositionModel).where(PositionModel.id == position_id)
            )
            position = result.scalar_one_or_none()
            if position:
                position.status = status
                if close_reason:
                    position.close_reason = close_reason
                    position.closed_at = datetime.now(timezone.utc)
                await db.commit()


# Singleton
grid_engine = GridEngine()
