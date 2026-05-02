from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import auth_service
from ..dependencies import get_db
from ..permissions import can_manage_projects
from ..services.task_service import task_service
from ..services.workflow_service import workflow_service

router = APIRouter(prefix='/workflow', tags=['workflow'])


@router.get('/definitions', response_model=list[schemas.WorkflowDefinitionSchema])
def list_definitions(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    return workflow_service.list_definitions(db)


@router.get('/definitions/latest', response_model=schemas.WorkflowDefinitionSchema | None)
def get_latest_definition(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    return workflow_service.get_latest_saved_definition(db)


@router.post('/definitions', response_model=schemas.WorkflowDefinitionSchema)
def save_definition(
    payload: schemas.WorkflowDefinitionPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    if not can_manage_projects(current_user):
        raise HTTPException(status_code=403, detail='Только руководящие роли могут управлять процессами согласования')

    if not payload.nodes:
        raise HTTPException(status_code=400, detail='Добавьте хотя бы один узел процесса')

    definition = workflow_service.save_definition(db, payload.model_dump())
    return definition


@router.delete('/definitions/{definition_id}')
def delete_definition(
    definition_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    if not can_manage_projects(current_user):
        raise HTTPException(status_code=403, detail='РўРѕР»СЊРєРѕ СЂСѓРєРѕРІРѕРґСЏС‰РёРµ СЂРѕР»Рё РјРѕРіСѓС‚ СѓРїСЂР°РІР»СЏС‚СЊ РїСЂРѕС†РµСЃСЃР°РјРё СЃРѕРіР»Р°СЃРѕРІР°РЅРёСЏ')

    try:
        deleted = workflow_service.delete_definition(db, definition_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not deleted:
        raise HTTPException(status_code=404, detail='Шаблон процесса не найден')

    return {'detail': 'Шаблон процесса удален'}


@router.get('/approvals', response_model=list[schemas.PendingApprovalSchema])
def list_pending_approvals(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    approvals = workflow_service.list_pending_approvals(db, current_user)
    payload: list[dict] = []

    for approval in approvals:
        if approval.instance is None or approval.instance.task is None:
            continue

        payload.append(
            {
                'approval_id': approval.id,
                'instance_id': approval.instance_id,
                'task': approval.instance.task,
                'assigned_role': approval.assigned_role,
                'assigned_user_id': approval.assigned_user_id,
                'current_node': approval.node_id,
                'created_at': approval.created_at,
            }
        )

    return payload


@router.post('/start/{task_id}', response_model=schemas.WorkflowInstanceSchema)
def start_workflow(task_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    task = task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='Задача не найдена')
    instance = workflow_service.start_workflow(db, task)
    return instance


@router.post('/approve/{task_id}', response_model=schemas.WorkflowInstanceSchema)
def approve_workflow(
    task_id: int,
    action: schemas.ApprovalAction,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    try:
        instance = workflow_service.resolve_approval(db, task_id, 'approve', current_user, action.comment)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error

    if not instance:
        raise HTTPException(status_code=404, detail='Экземпляр согласования не найден')
    return instance


@router.post('/reject/{task_id}', response_model=schemas.WorkflowInstanceSchema)
def reject_workflow(
    task_id: int,
    action: schemas.ApprovalAction,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    try:
        instance = workflow_service.resolve_approval(db, task_id, 'reject', current_user, action.comment)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error

    if not instance:
        raise HTTPException(status_code=404, detail='Экземпляр согласования не найден')
    return instance


@router.get('/instance/{instance_id}', response_model=schemas.WorkflowInstanceSchema)
def get_instance(instance_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    instance = workflow_service.get_instance(db, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail='Экземпляр процесса не найден')
    return instance
