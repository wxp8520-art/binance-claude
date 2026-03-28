"""Technical indicator calculations."""


def calculate_rsi(closes: list[float], period: int = 14) -> float:
    """
    Calculate RSI (Relative Strength Index).

    Args:
        closes: List of closing prices, length must be >= period + 1
        period: RSI calculation period

    Returns:
        RSI value between 0 and 100
    """
    if len(closes) < period + 1:
        raise ValueError(f"Need at least {period + 1} data points, got {len(closes)}")

    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]

    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Smooth with Wilder's method for remaining data points
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return round(rsi, 2)
