"""Position management API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.database import PositionModel
from app.models.schemas import APIResponse, TPUpdateRequest, SLUpdateRequest

router = APIRouter()


@router.get("")
async def list_positions(
    status: str | None = Query(None, pattern=r"^(PENDING|OPENING|ACTIVE|CLOSING|CLOSED)$"),
    db: AsyncSession = Depends(get_db),
):
    query = select(PositionModel).options(
        selectinload(PositionModel.grid_entries),
        selectinload(PositionModel.tp_executions),
    )
    if status:
        query = query.where(PositionModel.status == status)
    query = query.order_by(PositionModel.created_at.desc())
    result = await db.execute(query)
    positions = result.scalars().all()
    return APIResponse(
        success=True,
        data=[_serialize_position(p) for p in positions],
    )


@router.get("/{position_id}")
async def get_position(position_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PositionModel)
        .options(
            selectinload(PositionModel.grid_entries),
            selectinload(PositionModel.tp_executions),
        )
        .where(PositionModel.id == position_id)
    )
    position = result.scalar_one_or_none()
    if not position:
        return APIResponse(success=False, error="Position not found")
    return APIResponse(success=True, data=_serialize_position(position))


@router.post("/{position_id}/close")
async def close_position(position_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PositionModel).where(PositionModel.id == position_id)
    )
    position = result.scalar_one_or_none()
    if not position:
        return APIResponse(success=False, error="Position not found")
    if position.status not in ("ACTIVE", "OPENING"):
        return APIResponse(success=False, error=f"Cannot close position in {position.status} status")
    position.status = "CLOSING"
    position.close_reason = "MANUAL"
    await db.flush()
    # Actual close will be handled by the TP/SL engine
    return APIResponse(success=True, data={"id": str(position.id), "status": "CLOSING"})


@router.post("/close-all")
async def close_all_positions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PositionModel).where(PositionModel.status.in_(["ACTIVE", "OPENING"]))
    )
    positions = result.scalars().all()
    for p in positions:
        p.status = "CLOSING"
        p.close_reason = "MANUAL_ALL"
    await db.flush()
    return APIResponse(success=True, data={"closing_count": len(positions)})


@router.patch("/{position_id}/tp")
async def update_tp(
    position_id: str,
    payload: TPUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PositionModel).where(PositionModel.id == position_id)
    )
    position = result.scalar_one_or_none()
    if not position:
        return APIResponse(success=False, error="Position not found")
    snapshot = position.config_snapshot or {}
    snapshot["tp_tiers"] = [t.model_dump() for t in payload.tp_tiers]
    position.config_snapshot = snapshot
    await db.flush()
    return APIResponse(success=True, data={"id": str(position.id)})


@router.patch("/{position_id}/sl")
async def update_sl(
    position_id: str,
    payload: SLUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PositionModel).where(PositionModel.id == position_id)
    )
    position = result.scalar_one_or_none()
    if not position:
        return APIResponse(success=False, error="Position not found")
    snapshot = position.config_snapshot or {}
    updates = payload.model_dump(exclude_none=True)
    snapshot.update(updates)
    position.config_snapshot = snapshot
    await db.flush()
    return APIResponse(success=True, data={"id": str(position.id)})


def _serialize_position(p: PositionModel) -> dict:
    return {
        "id": str(p.id),
        "symbol": p.symbol,
        "trigger_price": float(p.trigger_price),
        "trigger_rsi": float(p.trigger_rsi),
        "trigger_time": p.trigger_time.isoformat(),
        "status": p.status,
        "leverage": p.leverage,
        "total_margin": float(p.total_margin),
        "avg_entry_price": float(p.avg_entry_price) if p.avg_entry_price else None,
        "current_qty": float(p.current_qty),
        "realized_pnl": float(p.realized_pnl),
        "close_reason": p.close_reason,
        "closed_at": p.closed_at.isoformat() if p.closed_at else None,
        "grid_entries": [
            {
                "tier_index": g.tier_index,
                "target_price": float(g.target_price),
                "status": g.status,
                "order_id": g.order_id,
                "filled_price": float(g.filled_price) if g.filled_price else None,
                "filled_qty": float(g.filled_qty) if g.filled_qty else None,
                "filled_at": g.filled_at.isoformat() if g.filled_at else None,
            }
            for g in p.grid_entries
        ],
        "tp_executions": [
            {
                "tier_index": t.tier_index,
                "trigger_pnl_pct": float(t.trigger_pnl_pct) if t.trigger_pnl_pct else None,
                "close_ratio": float(t.close_ratio) if t.close_ratio else None,
                "status": t.status,
                "closed_qty": float(t.closed_qty) if t.closed_qty else None,
                "closed_price": float(t.closed_price) if t.closed_price else None,
                "realized_pnl": float(t.realized_pnl) if t.realized_pnl else None,
                "executed_at": t.executed_at.isoformat() if t.executed_at else None,
            }
            for t in p.tp_executions
        ],
    }
