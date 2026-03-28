"""Account information API."""

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import PositionModel
from app.models.schemas import APIResponse
from app.services.exchange import exchange

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/balance")
async def get_balance():
    try:
        account = await exchange.get_account_info()
        return APIResponse(
            success=True,
            data={
                "total_balance": float(account.get("totalWalletBalance", 0)),
                "available_balance": float(account.get("availableBalance", 0)),
                "used_margin": float(account.get("totalInitialMargin", 0)),
                "unrealized_pnl": float(account.get("totalUnrealizedProfit", 0)),
            },
        )
    except Exception as e:
        logger.warning("balance_fetch_failed", error=str(e))
        return APIResponse(
            success=True,
            data={
                "total_balance": 0,
                "available_balance": 0,
                "used_margin": 0,
                "unrealized_pnl": 0,
            },
        )


@router.get("/pnl")
async def get_pnl_curve(
    period: str = "7d",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PositionModel)
        .where(PositionModel.status == "CLOSED")
        .order_by(PositionModel.closed_at.asc())
    )
    positions = result.scalars().all()

    cumulative = 0
    data_points = []
    for p in positions:
        if p.closed_at:
            cumulative += float(p.realized_pnl)
            data_points.append({
                "time": p.closed_at.isoformat(),
                "pnl": float(p.realized_pnl),
                "cumulative_pnl": cumulative,
            })

    return APIResponse(success=True, data=data_points)
