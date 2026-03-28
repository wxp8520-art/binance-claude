"""Scanner monitoring API."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import ScannerLogModel
from app.models.schemas import APIResponse
from app.services.scanner import scanner_engine

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


@router.post("/trigger/{symbol}")
async def manual_trigger(symbol: str):
    config = await scanner_engine._load_config()
    if not config:
        return APIResponse(success=False, error="No active strategy config")

    from app.services.exchange import exchange
    try:
        mark = await exchange.get_mark_price(symbol)
        price = float(mark["markPrice"])
    except Exception as e:
        return APIResponse(success=False, error=f"Failed to get price: {e}")

    from app.services.grid_engine import grid_engine
    pos_id = await grid_engine.open_position(symbol, price, 0, config)
    if pos_id:
        return APIResponse(success=True, data={"position_id": pos_id, "symbol": symbol})
    return APIResponse(success=False, error="Failed to open position")
