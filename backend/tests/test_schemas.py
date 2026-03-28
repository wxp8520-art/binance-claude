"""Unit tests for Pydantic schema validation."""

import pytest
from pydantic import ValidationError
from app.models.schemas import StrategyConfigSchema, GridTierSchema, TakeProfitTierSchema


def make_default_config(**overrides):
    base = {
        "rsi_threshold": 90,
        "rsi_period": 14,
        "kline_interval": "15m",
        "min_market_cap_usd": 5e7,
        "min_volume_24h_usd": 1e7,
        "min_depth_ratio": 0.02,
        "blacklist": [],
        "scan_interval_sec": 60,
        "max_concurrent_positions": 5,
        "cooldown_hours": 24,
        "grid_tiers": [
            {"tier_index": 1, "price_increase_pct": 10, "position_ratio": 0.3},
            {"tier_index": 2, "price_increase_pct": 30, "position_ratio": 0.7},
        ],
        "total_margin_per_target": 500,
        "leverage": 5,
        "order_type": "LIMIT",
        "tp_tiers": [
            {"tier_index": 1, "profit_trigger_pct": 400, "close_ratio": 0.5},
        ],
        "trailing_stop_enabled": False,
        "trailing_stop_activation": 200,
        "trailing_stop_callback": 30,
        "margin_loss_stop_pct": 300,
        "per_target_loss_stop_pct": 200,
        "time_stop_hours": 48,
        "margin_rate_alert": 150,
        "max_total_margin_pct": 70,
        "max_daily_loss_pct": 10,
        "max_consecutive_losses": 3,
        "consecutive_loss_pause_min": 60,
    }
    base.update(overrides)
    return base


def test_valid_config():
    config = StrategyConfigSchema(**make_default_config())
    assert config.rsi_threshold == 90
    assert len(config.grid_tiers) == 2


def test_rsi_out_of_range():
    with pytest.raises(ValidationError):
        StrategyConfigSchema(**make_default_config(rsi_threshold=101))
    with pytest.raises(ValidationError):
        StrategyConfigSchema(**make_default_config(rsi_threshold=49))


def test_invalid_kline_interval():
    with pytest.raises(ValidationError):
        StrategyConfigSchema(**make_default_config(kline_interval="2h"))


def test_leverage_range():
    config = StrategyConfigSchema(**make_default_config(leverage=20))
    assert config.leverage == 20
    with pytest.raises(ValidationError):
        StrategyConfigSchema(**make_default_config(leverage=21))


def test_grid_tiers_min_length():
    with pytest.raises(ValidationError):
        StrategyConfigSchema(**make_default_config(grid_tiers=[
            {"tier_index": 1, "price_increase_pct": 10, "position_ratio": 1.0},
        ]))


def test_tp_tiers_valid():
    config = StrategyConfigSchema(**make_default_config())
    assert len(config.tp_tiers) == 1
    assert config.tp_tiers[0].profit_trigger_pct == 400
