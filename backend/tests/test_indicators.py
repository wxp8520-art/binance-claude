"""Unit tests for RSI calculation."""

import pytest
from app.utils.indicators import calculate_rsi


def test_rsi_basic_uptrend():
    # Steadily increasing prices should give high RSI
    closes = [10 + i for i in range(16)]  # 10, 11, 12, ..., 25
    rsi = calculate_rsi(closes, period=14)
    assert rsi == 100.0


def test_rsi_basic_downtrend():
    # Steadily decreasing prices should give low RSI
    closes = [25 - i for i in range(16)]  # 25, 24, 23, ..., 10
    rsi = calculate_rsi(closes, period=14)
    assert rsi == 0.0


def test_rsi_mixed():
    # Known test case
    closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84,
              46.08, 45.89, 46.03, 45.61, 46.28, 46.28]
    rsi = calculate_rsi(closes, period=14)
    assert 60 < rsi < 80  # Expected around 70


def test_rsi_insufficient_data():
    with pytest.raises(ValueError):
        calculate_rsi([1, 2, 3], period=14)


def test_rsi_custom_period():
    closes = [10 + i * 0.5 for i in range(8)]
    rsi = calculate_rsi(closes, period=5)
    assert rsi == 100.0


def test_rsi_flat_prices():
    closes = [50.0] * 16
    rsi = calculate_rsi(closes, period=14)
    # No changes means avg_gain=0, avg_loss=0 -> RSI should handle gracefully
    # avg_loss == 0 -> RSI = 100
    assert rsi == 100.0
