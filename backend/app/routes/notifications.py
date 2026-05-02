from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import auth_service
from ..dependencies import get_db
from ..services.notification_service import notification_service

router = APIRouter(prefix='/notifications', tags=['notifications'])


@router.get('', response_model=List[schemas.NotificationSchema])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    notification_service.ensure_user_notifications(db, current_user)
    return notification_service.list_user_notifications(db, current_user)


@router.post('/read-all')
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    updated = notification_service.mark_all_user_notifications_read(db, current_user=current_user)
    return {'detail': 'OK', 'updated': updated}


@router.post('/{notification_id}/read', response_model=schemas.NotificationSchema)
def mark_read(
    notification_id: int,
    payload: schemas.MarkNotificationReadPayload | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    read_at = payload.read_at if payload else None
    notification = notification_service.mark_notification_read(
        db,
        current_user=current_user,
        notification_id=notification_id,
        read_at=read_at,
    )
    if not notification:
        raise HTTPException(status_code=404, detail='Уведомление не найдено')
    return notification


@router.get('/unread-count')
def unread_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    return {'unread': notification_service.unread_count(db, current_user)}
