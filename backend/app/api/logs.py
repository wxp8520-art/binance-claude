"""Trade and system logs API."""

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import PositionModel, ScannerLogModel, SystemLogModel
from app.models.schemas import APIResponse

router = APIRouter()


@router.get("/trades")
async def get_trade_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(PositionModel).where(
        PositionModel.status == "CLOSED"
    ).order_by(PositionModel.closed_at.desc())

    if start:
        query = query.where(PositionModel.closed_at >= start)
    if end:
        query = query.where(PositionModel.closed_at <= end)

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    positions = result.scalars().all()

    return APIResponse(
        success=True,
        data=[
            {
                "id": str(p.id),
                "symbol": p.symbol,
                "trigger_price": float(p.trigger_price),
                "avg_entry_price": float(p.avg_entry_price) if p.avg_entry_price else None,
                "leverage": p.leverage,
                "realized_pnl": float(p.realized_pnl),
                "close_reason": p.close_reason,
                "trigger_time": p.trigger_time.isoformat(),
                "closed_at": p.closed_at.isoformat() if p.closed_at else None,
            }
            for p in positions
        ],
    )


@router.get("/scanner")
async def get_scanner_logs(
    limit: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScannerLogModel).order_by(ScannerLogModel.created_at.desc()).limit(limit)
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


@router.get("/system")
async def get_system_logs(
    level: str | None = Query(None, pattern=r"^(INFO|WARN|ERROR)$"),
    module: str | None = None,
    limit: int = Query(100, ge=10, le=500),
    db: AsyncSession = Depends(get_db),
):
    query = select(SystemLogModel).order_by(SystemLogModel.created_at.desc())
    if level:
        query = query.where(SystemLogModel.level == level)
    if module:
        query = query.where(SystemLogModel.module == module)
    query = query.limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    return APIResponse(
        success=True,
        data=[
            {
                "id": log.id,
                "level": log.level,
                "module": log.module,
                "message": log.message,
                "details": log.details,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
    )


@router.get("/export")
async def export_csv(
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(PositionModel).where(
        PositionModel.status == "CLOSED"
    ).order_by(PositionModel.closed_at.desc())

    if start:
        query = query.where(PositionModel.closed_at >= start)
    if end:
        query = query.where(PositionModel.closed_at <= end)

    result = await db.execute(query)
    positions = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "symbol", "trigger_price", "avg_entry_price",
        "leverage", "realized_pnl", "close_reason", "trigger_time", "closed_at",
    ])
    for p in positions:
        writer.writerow([
            str(p.id), p.symbol, float(p.trigger_price),
            float(p.avg_entry_price) if p.avg_entry_price else "",
            p.leverage, float(p.realized_pnl), p.close_reason,
            p.trigger_time.isoformat(),
            p.closed_at.isoformat() if p.closed_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=trade_logs.csv"},
    )
