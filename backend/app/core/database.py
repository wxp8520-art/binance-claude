"""Database connection and session management."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# SQLite doesn't support pool_size/max_overflow
_is_sqlite = settings.database_url.startswith("sqlite")
_engine_kwargs = {}
if not _is_sqlite:
    _engine_kwargs = {"pool_size": 10, "max_overflow": 20}

engine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
    **_engine_kwargs,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
