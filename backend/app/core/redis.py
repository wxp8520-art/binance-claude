"""Redis connection management. Gracefully handles unavailability."""

import structlog

logger = structlog.get_logger(__name__)

redis_client = None

try:
    import redis.asyncio as redis
    from app.config import get_settings
    settings = get_settings()
    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
except Exception as e:
    logger.warning("redis_unavailable", error=str(e))


async def get_redis():
    return redis_client
