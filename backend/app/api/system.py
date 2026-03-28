"""System control API."""

import time

from fastapi import APIRouter
from sqlalchemy import select, func

from app.core.database import async_session
from app.models.database import PositionModel
from app.models.schemas import APIResponse, ModeSwitch
from app.services.scanner import scanner_engine
from app.services.tp_sl_engine import tp_sl_engine

router = APIRouter()

_start_time = time.time()
_system_state = {"status": "running", "mode": "testnet"}


@router.post("/pause")
async def pause_system():
    await scanner_engine.stop()
    # TP/SL engine keeps running to protect open positions
    _system_state["status"] = "paused"
    return APIResponse(success=True, data={"status": "paused"})


@router.post("/resume")
async def resume_system():
    await scanner_engine.start()
    _system_state["status"] = "running"
    return APIResponse(success=True, data={"status": "running"})


@router.get("/status")
async def get_system_status():
    async with async_session() as db:
        result = await db.execute(
            select(func.count()).select_from(PositionModel).where(
                PositionModel.status.in_(["ACTIVE", "OPENING"])
            )
        )
        active_count = result.scalar() or 0

    return APIResponse(
        success=True,
        data={
            "status": _system_state["status"],
            "mode": _system_state["mode"],
            "active_positions": active_count,
            "uptime_seconds": time.time() - _start_time,
            "scanner_running": scanner_engine.running,
        },
    )


@router.get("/mode", tags=["Mode"])
async def get_mode():
    return APIResponse(success=True, data={"mode": _system_state["mode"]})


@router.put("/mode", tags=["Mode"])
async def set_mode(payload: ModeSwitch):
    _system_state["mode"] = payload.mode
    return APIResponse(success=True, data={"mode": payload.mode})
