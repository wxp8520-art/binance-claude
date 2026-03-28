"""SQLAlchemy ORM models matching the database schema.
Compatible with both PostgreSQL (JSONB/UUID) and SQLite (JSON/String).
"""

import json
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Index, Integer, Numeric, String, Text, ForeignKey, func,
    TypeDecorator, types,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Cross-DB compatible types ──

class JSONType(TypeDecorator):
    """JSON type that works on both PostgreSQL (native JSON) and SQLite (TEXT)."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return json.dumps(value)
        return None

    def process_result_value(self, value, dialect):
        if value is not None:
            return json.loads(value)
        return None


class UUIDType(TypeDecorator):
    """UUID type that works on both PostgreSQL (native UUID) and SQLite (CHAR(36))."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return None

    def process_result_value(self, value, dialect):
        if value is not None:
            return str(value)
        return None


# ── Models ──

class StrategyConfigModel(Base):
    __tablename__ = "strategy_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="default")
    config_json: Mapped[dict] = mapped_column(JSONType, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PositionModel(Base):
    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(UUIDType, primary_key=True, default=lambda: str(uuid.uuid4()))
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    trigger_price: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    trigger_rsi: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    trigger_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    leverage: Mapped[int] = mapped_column(Integer, nullable=False)
    total_margin: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    avg_entry_price: Mapped[float | None] = mapped_column(Numeric(20, 8))
    current_qty: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    realized_pnl: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    close_reason: Mapped[str | None] = mapped_column(String(30))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    config_snapshot: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    grid_entries: Mapped[list["GridEntryModel"]] = relationship(back_populates="position")
    tp_executions: Mapped[list["TPExecutionModel"]] = relationship(back_populates="position")

    __table_args__ = (
        Index("idx_positions_status", "status"),
        Index("idx_positions_symbol", "symbol"),
    )


class GridEntryModel(Base):
    __tablename__ = "grid_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_id: Mapped[str] = mapped_column(UUIDType, ForeignKey("positions.id"), nullable=False)
    tier_index: Mapped[int] = mapped_column(Integer, nullable=False)
    target_price: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="WAITING")
    order_id: Mapped[str | None] = mapped_column(String(50))
    filled_price: Mapped[float | None] = mapped_column(Numeric(20, 8))
    filled_qty: Mapped[float | None] = mapped_column(Numeric(20, 8))
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    position: Mapped["PositionModel"] = relationship(back_populates="grid_entries")


class TPExecutionModel(Base):
    __tablename__ = "tp_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_id: Mapped[str] = mapped_column(UUIDType, ForeignKey("positions.id"), nullable=False)
    tier_index: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger_pnl_pct: Mapped[float | None] = mapped_column(Numeric(10, 2))
    close_ratio: Mapped[float | None] = mapped_column(Numeric(5, 4))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    closed_qty: Mapped[float | None] = mapped_column(Numeric(20, 8))
    closed_price: Mapped[float | None] = mapped_column(Numeric(20, 8))
    realized_pnl: Mapped[float | None] = mapped_column(Numeric(20, 4))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    position: Mapped["PositionModel"] = relationship(back_populates="tp_executions")


class ScannerLogModel(Base):
    __tablename__ = "scanner_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_pairs: Mapped[int | None] = mapped_column(Integer)
    passed: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SystemLogModel(Base):
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[str | None] = mapped_column(String(10))
    module: Mapped[str | None] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
