"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Unified API Response ──

class APIResponse(BaseModel):
    success: bool
    data: Any = None
    error: str | None = None


# ── Grid Tier ──

class GridTierSchema(BaseModel):
    tier_index: int = Field(ge=1, le=8)
    price_increase_pct: float = Field(ge=1, le=500, description="Price increase % from trigger price")
    position_ratio: float = Field(ge=0.01, le=1.0, description="Position ratio of total margin")


# ── Take Profit Tier ──

class TakeProfitTierSchema(BaseModel):
    tier_index: int = Field(ge=1, le=5)
    profit_trigger_pct: float = Field(ge=10, le=5000, description="Profit trigger %")
    close_ratio: float = Field(ge=0.01, le=1.0, description="Close ratio of remaining position")


# ── Strategy Config ──

class StrategyConfigSchema(BaseModel):
    # Scanner parameters
    rsi_threshold: float = Field(default=90, ge=50, le=100)
    rsi_period: int = Field(default=14, ge=5, le=50)
    kline_interval: str = Field(default="15m", pattern=r"^(1m|5m|15m|1h|4h)$")
    min_market_cap_usd: float = Field(default=5e7, ge=1e6, le=1e9)
    min_volume_24h_usd: float = Field(default=1e7, ge=1e6, le=5e7)
    min_depth_ratio: float = Field(default=0.02, ge=0.005, le=0.1)
    blacklist: list[str] = Field(default_factory=list)
    scan_interval_sec: int = Field(default=60, ge=30, le=600)
    max_concurrent_positions: int = Field(default=5, ge=1, le=20)
    cooldown_hours: float = Field(default=24, ge=0.5, le=168)

    # Grid parameters
    grid_tiers: list[GridTierSchema] = Field(min_length=2, max_length=8)
    total_margin_per_target: float = Field(default=500, ge=50, le=10000)
    leverage: int = Field(default=5, ge=1, le=20)
    order_type: str = Field(default="LIMIT", pattern=r"^(LIMIT|MARKET)$")

    # Take profit parameters
    tp_tiers: list[TakeProfitTierSchema] = Field(min_length=1, max_length=5)
    trailing_stop_enabled: bool = False
    trailing_stop_activation: float = Field(default=200, ge=50, le=500)
    trailing_stop_callback: float = Field(default=30, ge=5, le=50)

    # Stop loss parameters
    margin_loss_stop_pct: float = Field(default=300, ge=50, le=500)
    per_target_loss_stop_pct: float = Field(default=200, ge=50, le=500)
    time_stop_hours: float = Field(default=48, ge=1, le=168)
    margin_rate_alert: float = Field(default=150, ge=100, le=300)

    # Account-level risk control
    max_total_margin_pct: float = Field(default=70, ge=10, le=100)
    max_daily_loss_pct: float = Field(default=10, ge=1, le=50)
    max_consecutive_losses: int = Field(default=3, ge=1, le=10)
    consecutive_loss_pause_min: int = Field(default=60, ge=5, le=1440)


class StrategyConfigResponse(BaseModel):
    id: int
    name: str
    config: StrategyConfigSchema
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StrategyTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    config: StrategyConfigSchema


# ── Position ──

class PositionResponse(BaseModel):
    id: str
    symbol: str
    trigger_price: float
    trigger_rsi: float
    trigger_time: datetime
    status: str
    leverage: int
    total_margin: float
    avg_entry_price: float | None
    current_qty: float
    realized_pnl: float
    unrealized_pnl: float | None = None
    close_reason: str | None
    closed_at: datetime | None
    grid_entries: list[dict] = []
    tp_executions: list[dict] = []


class PositionCloseRequest(BaseModel):
    reason: str = "MANUAL"


class TPUpdateRequest(BaseModel):
    tp_tiers: list[TakeProfitTierSchema]


class SLUpdateRequest(BaseModel):
    margin_loss_stop_pct: float | None = None
    per_target_loss_stop_pct: float | None = None
    time_stop_hours: float | None = None


# ── Scanner ──

class ScannerResultResponse(BaseModel):
    scan_time: datetime
    total_pairs: int
    passed: int
    details: list[dict]


# ── System ──

class SystemStatusResponse(BaseModel):
    status: str  # running / paused / error
    mode: str  # live / testnet
    active_positions: int
    uptime_seconds: float


class ModeSwitch(BaseModel):
    mode: str = Field(pattern=r"^(live|testnet)$")
