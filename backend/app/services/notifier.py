"""Notification service: Telegram + WebSocket push."""

import httpx
import structlog

from app.config import get_settings
from app.core.websocket import ws_manager

logger = structlog.get_logger(__name__)
settings = get_settings()

TEMPLATES = {
    "new_target": "\U0001f4e1 {symbol} triggered short signal | RSI: {rsi} | Price: {price} | MCap: {mcap}",
    "grid_filled": "\U0001f4c9 {symbol} Tier {tier} short filled | Price: {price} | Qty: {qty} | Lev: {lev}x",
    "tp_triggered": "\U0001f4b0 {symbol} Tier {tier} TP | Profit: {pnl_pct}% | Closed: {close_qty} | Realized: {profit} U",
    "sl_triggered": "\U0001f6a8 {symbol} Stop Loss | Reason: {reason} | Loss: {loss} U",
    "system_error": "\u26a0\ufe0f System Error | Module: {module} | Error: {error}",
    "margin_warning": "\u26a0\ufe0f Margin Alert | Ratio: {ratio}% | Threshold: {threshold}%",
    "consecutive_pause": "\u23f8 Trading paused | {losses} consecutive losses | Resume: {resume_at}",
}


class Notifier:
    """Sends notifications via Telegram and WebSocket."""

    def __init__(self):
        self._http: httpx.AsyncClient | None = None

    async def init(self):
        self._http = httpx.AsyncClient(timeout=10)

    async def close(self):
        if self._http:
            await self._http.aclose()

    async def notify(self, event: str, data: dict, level: str = "INFO"):
        """Send notification to all configured channels."""
        template = TEMPLATES.get(event, "{event}: {data}")
        try:
            message = template.format(**data)
        except KeyError:
            message = f"{event}: {data}"

        # WebSocket push
        await ws_manager.broadcast("alert", {
            "event": event,
            "level": level,
            "message": message,
            "data": data,
        })

        # Telegram
        if settings.telegram_bot_token and settings.telegram_chat_id:
            await self._send_telegram(message)

        logger.info("notification_sent", event=event, level=level)

    async def _send_telegram(self, text: str):
        if not self._http:
            await self.init()
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        try:
            resp = await self._http.post(
                url,
                json={
                    "chat_id": settings.telegram_chat_id,
                    "text": text,
                    "parse_mode": "Markdown",
                },
            )
            if resp.status_code != 200:
                logger.warning("telegram_send_failed", status=resp.status_code, body=resp.text)
        except Exception as e:
            logger.error("telegram_error", error=str(e))


# Singleton
notifier = Notifier()
