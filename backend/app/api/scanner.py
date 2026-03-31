"""Scanner monitoring API."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import ScannerLogModel
from app.models.schemas import APIResponse
from app.services.scanner import scanner_engine


class ManualOpenRequest(BaseModel):
    leverage: Optional[int] = Field(default=None, ge=1, le=125)
    margin: Optional[float] = Field(default=None, ge=10, le=100000)
    order_type: Optional[str] = Field(default=None, pattern=r"^(LIMIT|MARKET)$")

router = APIRouter()


@router.get("/results")
async def get_scanner_results(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScannerLogModel)
        .order_by(ScannerLogModel.scan_time.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return APIResponse(
        success=True,
        data=[
            {
                "id": log.id,
                "scan_time": log.scan_time.isoformat(),
                "total_pairs": log.total_pairs,
                "passed": log.passed,
                "details": log.details,
            }
            for log in logs
        ],
    )


@router.get("/status")
async def get_scanner_status():
    return APIResponse(
        success=True,
        data={
            "running": scanner_engine.running,
            "last_scan": scanner_engine.last_scan.isoformat() if scanner_engine.last_scan else None,
        },
    )


@router.get("/watchlist")
async def get_watchlist():
    """Get real-time prices for all USDT perpetual pairs (passed scanner filters)."""
    from app.services.exchange import exchange
    if not exchange.connected:
        return APIResponse(success=False, error="Exchange not connected")

    try:
        tickers = await exchange.get_all_tickers()
        usdt_pairs = [
            {
                "symbol": t["symbol"],
                "price": float(t.get("lastPrice", 0)),
                "change_pct": round(float(t.get("priceChangePercent", 0)), 2),
                "volume_24h": round(float(t.get("quoteVolume", 0)), 0),
                "high_24h": float(t.get("highPrice", 0)),
                "low_24h": float(t.get("lowPrice", 0)),
            }
            for t in tickers
            if t["symbol"].endswith("USDT") and float(t.get("quoteVolume", 0)) > 0
        ]
        usdt_pairs.sort(key=lambda x: x["volume_24h"], reverse=True)
        return APIResponse(success=True, data=usdt_pairs[:100])
    except Exception as e:
        return APIResponse(success=False, error=f"Failed to fetch tickers: {e}")


@router.get("/price/{symbol}")
async def get_symbol_price(symbol: str):
    """Get real-time mark price for a single symbol."""
    from app.services.exchange import exchange
    if not exchange.connected:
        return APIResponse(success=False, error="Exchange not connected")
    try:
        mark = await exchange.get_mark_price(symbol)
        return APIResponse(success=True, data={
            "symbol": symbol,
            "mark_price": float(mark["markPrice"]),
            "index_price": float(mark.get("indexPrice", 0)),
            "funding_rate": float(mark.get("lastFundingRate", 0)),
        })
    except Exception as e:
        return APIResponse(success=False, error=f"Failed to get price: {e}")


@router.post("/preview/{symbol}")
async def preview_order(symbol: str, body: ManualOpenRequest = ManualOpenRequest()):
    """Preview grid order details before opening a position."""
    config = await scanner_engine._load_config()
    if not config:
        return APIResponse(success=False, error="No active strategy config")

    if body.leverage is not None:
        config.leverage = body.leverage
    if body.margin is not None:
        config.total_margin_per_target = body.margin
    if body.order_type is not None:
        config.order_type = body.order_type

    from app.services.exchange import exchange
    try:
        mark = await exchange.get_mark_price(symbol)
        price = float(mark["markPrice"])
    except Exception as e:
        return APIResponse(success=False, error=f"Failed to get price: {e}")

    grid_tiers = []
    total_notional = 0
    for t in config.grid_tiers:
        target_price = price * (1 + t.price_increase_pct / 100)
        margin_alloc = config.total_margin_per_target * t.position_ratio
        notional = margin_alloc * config.leverage
        qty = notional / target_price
        grid_tiers.append({
            "tier": t.tier_index,
            "price_increase_pct": t.price_increase_pct,
            "target_price": round(target_price, 6),
            "margin": round(margin_alloc, 2),
            "notional": round(notional, 2),
            "qty": round(qty, 6),
            "ratio_pct": round(t.position_ratio * 100, 1),
        })
        total_notional += notional

    return APIResponse(success=True, data={
        "symbol": symbol,
        "mark_price": price,
        "index_price": float(mark.get("indexPrice", 0)),
        "funding_rate": float(mark.get("lastFundingRate", 0)),
        "leverage": config.leverage,
        "total_margin": config.total_margin_per_target,
        "total_notional": round(total_notional, 2),
        "order_type": config.order_type,
        "grid_tiers": grid_tiers,
        "tp_tiers": [
            {"tier": t.tier_index, "trigger_pct": t.profit_trigger_pct, "close_ratio_pct": round(t.close_ratio * 100, 1)}
            for t in config.tp_tiers
        ],
    })


@router.post("/trigger/{symbol}")
async def manual_trigger(symbol: str, body: ManualOpenRequest = ManualOpenRequest()):
    config = await scanner_engine._load_config()
    if not config:
        return APIResponse(success=False, error="No active strategy config")

    # Apply overrides from request body
    if body.leverage is not None:
        config.leverage = body.leverage
    if body.margin is not None:
        config.total_margin_per_target = body.margin
    if body.order_type is not None:
        config.order_type = body.order_type

    from app.services.exchange import exchange
    try:
        mark = await exchange.get_mark_price(symbol)
        price = float(mark["markPrice"])
    except Exception as e:
        return APIResponse(success=False, error=f"Failed to get price: {e}")

    from app.services.grid_engine import grid_engine
    pos_id = await grid_engine.open_position(symbol, price, 0, config)
    if pos_id:
        # Return grid tier preview
        grid_preview = [
            {
                "tier": t.tier_index,
                "price": round(price * (1 + t.price_increase_pct / 100), 6),
                "ratio": t.position_ratio,
            }
            for t in config.grid_tiers
        ]
        return APIResponse(success=True, data={
            "position_id": pos_id,
            "symbol": symbol,
            "price": price,
            "leverage": config.leverage,
            "margin": config.total_margin_per_target,
            "grid_preview": grid_preview,
        })
    return APIResponse(success=False, error="Failed to open position")
