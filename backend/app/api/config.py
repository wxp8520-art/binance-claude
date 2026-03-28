"""Strategy configuration CRUD API."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import StrategyConfigModel
from app.models.schemas import (
    APIResponse, StrategyConfigSchema, StrategyTemplateCreate
)

router = APIRouter()


@router.get("")
async def get_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StrategyConfigModel).where(StrategyConfigModel.is_active == True)
    )
    config = result.scalar_one_or_none()
    if not config:
        return APIResponse(success=True, data=None)
    return APIResponse(
        success=True,
        data={
            "id": config.id,
            "name": config.name,
            "config": config.config_json,
            "is_active": config.is_active,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        },
    )


@router.put("")
async def update_config(
    payload: StrategyConfigSchema,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StrategyConfigModel).where(StrategyConfigModel.is_active == True)
    )
    config = result.scalar_one_or_none()
    if config:
        config.config_json = payload.model_dump()
    else:
        config = StrategyConfigModel(
            name="default",
            config_json=payload.model_dump(),
            is_active=True,
        )
        db.add(config)
    await db.flush()
    return APIResponse(success=True, data={"id": config.id})


@router.patch("")
async def patch_config(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StrategyConfigModel).where(StrategyConfigModel.is_active == True)
    )
    config = result.scalar_one_or_none()
    if not config:
        return APIResponse(success=False, error="No active config found")
    merged = {**config.config_json, **payload}
    # Validate merged config
    try:
        StrategyConfigSchema(**merged)
    except Exception as e:
        return APIResponse(success=False, error=f"Validation error: {e}")
    config.config_json = merged
    await db.flush()
    return APIResponse(success=True, data={"id": config.id})


@router.post("/templates")
async def save_template(
    payload: StrategyTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    template = StrategyConfigModel(
        name=payload.name,
        config_json=payload.config.model_dump(),
        is_active=False,
    )
    db.add(template)
    await db.flush()
    return APIResponse(success=True, data={"id": template.id})


@router.get("/templates")
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StrategyConfigModel).where(StrategyConfigModel.is_active == False)
    )
    templates = result.scalars().all()
    return APIResponse(
        success=True,
        data=[
            {"id": t.id, "name": t.name, "created_at": t.created_at.isoformat()}
            for t in templates
        ],
    )


@router.put("/templates/{template_id}")
async def load_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
):
    # Deactivate current active config
    result = await db.execute(
        select(StrategyConfigModel).where(StrategyConfigModel.is_active == True)
    )
    current = result.scalar_one_or_none()
    if current:
        current.is_active = False

    # Activate the selected template
    result = await db.execute(
        select(StrategyConfigModel).where(StrategyConfigModel.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        return APIResponse(success=False, error="Template not found")

    # Create a new active config from template
    new_config = StrategyConfigModel(
        name=template.name,
        config_json=template.config_json,
        is_active=True,
    )
    db.add(new_config)
    await db.flush()
    return APIResponse(success=True, data={"id": new_config.id})
