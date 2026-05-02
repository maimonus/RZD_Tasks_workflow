from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import auth_service
from ..dependencies import get_db
from ..permissions import can_manage_tasks

router = APIRouter(prefix='/settings', tags=['settings'])


def _get_or_create_workload_settings(db: Session) -> models.WorkloadSettings:
    settings = db.query(models.WorkloadSettings).order_by(models.WorkloadSettings.id.asc()).first()
    if settings is not None:
        return settings

    # Create defaults (match models defaults)
    settings = models.WorkloadSettings()
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


@router.get('/workload', response_model=schemas.WorkloadSettingsSchema)
def get_workload_settings(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    settings = _get_or_create_workload_settings(db)
    return settings


@router.patch('/workload', response_model=schemas.WorkloadSettingsSchema)
def patch_workload_settings(
    payload: schemas.WorkloadSettingsUpdatePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    # Updating settings is restricted to managerial roles.
    if not can_manage_tasks(current_user):
        raise HTTPException(status_code=403, detail='Недостаточно прав')

    settings = _get_or_create_workload_settings(db)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings
