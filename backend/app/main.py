"""FastAPI application entry point."""

import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.database import engine, Base
from app.core.websocket import ws_manager
from app.api import config as config_router
from app.api import positions as positions_router
from app.api import scanner as scanner_router
from app.api import system as system_router
from app.api import logs as logs_router
from app.api import account as account_router
from app.services.exchange import exchange
from app.services.scanner import scanner_engine
from app.services.tp_sl_engine import tp_sl_engine
from app.services.notifier import notifier

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Connect to Binance
    try:
        await exchange.connect()
        await notifier.init()
        if exchange.connected:
            await scanner_engine.start()
            await tp_sl_engine.start()
            logger.info("all_engines_started")
        else:
            logger.warning("engines_not_started_no_api_key", hint="Set BINANCE_API_KEY in .env")
    except Exception as e:
        logger.error("startup_error", error=str(e))

    yield

    # Shutdown
    await scanner_engine.stop()
    await tp_sl_engine.stop()
    await exchange.disconnect()
    await notifier.close()
    await engine.dispose()
    logger.info("shutdown_complete")


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(config_router.router, prefix="/api/config", tags=["Config"])
app.include_router(positions_router.router, prefix="/api/positions", tags=["Positions"])
app.include_router(scanner_router.router, prefix="/api/scanner", tags=["Scanner"])
app.include_router(system_router.router, prefix="/api/system", tags=["System"])
app.include_router(logs_router.router, prefix="/api/logs", tags=["Logs"])
app.include_router(account_router.router, prefix="/api/account", tags=["Account"])


@app.get("/api/health")
async def health_check():
    return {"success": True, "data": {"status": "healthy"}, "error": None}


@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, receive pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
