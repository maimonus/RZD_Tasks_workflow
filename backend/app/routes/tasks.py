import shutil
from datetime import datetime
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import auth_service
from ..config import TASK_REPORT_UPLOAD_DIR
from ..dependencies import get_db
from ..permissions import can_access_user, can_manage_tasks
from ..services.task_service import task_service
from ..services.workflow_service import workflow_service
from ..services.notification_service import notification_service, NotificationEvent

router = APIRouter(prefix='/tasks', tags=['tasks'])


def _get_task_or_404(db: Session, task_id: int) -> models.Task:
    task = task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='Задача не найдена')
    return task


def _ensure_task_access(current_user: models.User, task: models.Task):
    if not can_access_user(current_user, task.owner):
        raise HTTPException(status_code=403, detail='Доступ запрещен')


def _validate_owner_status_transition(task: models.Task, next_status: str):
    if task.status == 'archived':
        raise HTTPException(status_code=403, detail='Архивную задачу нельзя менять исполнителю')

    if next_status == 'archived':
        raise HTTPException(status_code=403, detail='Переносить задачи в архив может только руководитель')

    if task.task_type == 'daily' and not task.daily_approved_once and task.status in {'pending', 'overdue'}:
        raise HTTPException(
            status_code=403,
            detail='Ежедневную задачу до начала работы должен согласовать руководитель',
        )

    if task.status in {'pending', 'overdue'} and next_status != 'in_progress':
        raise HTTPException(status_code=403, detail='Сначала примите задачу, чтобы перевести ее в работу')

    if task.status == 'in_review':
        raise HTTPException(status_code=403, detail='Задача уже находится на проверке и ждет решения руководителя')

    if task.status == 'completed' and next_status != 'completed':
        raise HTTPException(status_code=403, detail='Завершенную задачу нельзя повторно изменить исполнителю')


def _validate_daily_task_assignment(task_type: schemas.TaskType, owner_id: int, current_user: models.User):
    if task_type == schemas.TaskType.DAILY and owner_id != current_user.id:
        raise HTTPException(status_code=400, detail='Ежедневную задачу можно создавать только для себя')


def _store_report_file(upload: UploadFile) -> tuple[str, str, str]:
    original_name = Path(upload.filename or 'report').name
    suffix = Path(original_name).suffix[:20]
    stored_name = f'{uuid4().hex}{suffix}'
    destination = TASK_REPORT_UPLOAD_DIR / stored_name

    with destination.open('wb') as target_file:
        shutil.copyfileobj(upload.file, target_file)

    return original_name, stored_name, f'/uploads/task-reports/{stored_name}'


@router.get('', response_model=List[schemas.TaskSchema])
def list_tasks(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    tasks = task_service.list_tasks(db)
    return [task for task in tasks if can_access_user(current_user, task.owner)]


@router.post('', response_model=schemas.TaskSchema)
def create_task(payload: schemas.TaskCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    is_managerial_role = can_manage_tasks(current_user)
    owner = db.get(models.User, payload.owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail='Исполнитель не найден')

    _validate_daily_task_assignment(payload.task_type, payload.owner_id, current_user)

    assistants_ids = list(dict.fromkeys(payload.assistants_user_ids or []))  # preserve order, unique
    # assistants don't make sense for daily tasks in this UI/logic
    if payload.task_type == schemas.TaskType.DAILY and assistants_ids:
        raise HTTPException(status_code=400, detail='Для ежедневных задач помощники не предусмотрены')

    # assistants must exist
    if assistants_ids:
        # remove accidental owner duplication
        assistants_ids = [user_id for user_id in assistants_ids if user_id != owner.id]

    if assistants_ids:
        found = (
            db.query(models.User)
            .filter(models.User.id.in_(assistants_ids))
            .all()
        )
        found_ids = {u.id for u in found}
        missing = [user_id for user_id in assistants_ids if user_id not in found_ids]
        if missing:
            raise HTTPException(status_code=404, detail=f'Помощник(и) не найдены: {missing[:5]}')

    if not is_managerial_role:
        if payload.task_type != schemas.TaskType.DAILY or payload.owner_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail='Сотрудник может создавать только свои ежедневные задачи',
            )
    elif not can_access_user(current_user, owner):
        raise HTTPException(status_code=403, detail='Вы не можете назначать задачи этому пользователю')

    task_data = payload.model_dump()
    task_data['assistants_user_ids'] = assistants_ids
    task_data['created_by_id'] = current_user.id
    task_data['daily_approved_once'] = False
    task = task_service.create_task(db, task_data)

    # Notify executor (for manager_assigned tasks) that task needs acceptance.
    notification_service.notify_task_accept_needed(db, task=task)

    return task


@router.get('/{task_id}', response_model=schemas.TaskSchema)
def get_task(task_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    task = _get_task_or_404(db, task_id)
    _ensure_task_access(current_user, task)
    return task


@router.patch('/{task_id}', response_model=schemas.TaskSchema)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    task = _get_task_or_404(db, task_id)
    _ensure_task_access(current_user, task)

    update_data = payload.model_dump(exclude_none=False)
    # allow clearing deadline (set to null), but ignore other null fields
    update_data = {k: v for k, v in update_data.items() if v is not None or k == 'deadline'}

    is_managerial_role = can_manage_tasks(current_user)
    is_task_owner = current_user.id == task.owner_id

    if 'assistants_user_ids' in update_data:
        if not is_managerial_role:
            raise HTTPException(status_code=403, detail='Только руководитель может менять помощников')

        assistants_ids = list(dict.fromkeys(update_data['assistants_user_ids'] or []))
        assistants_ids = [user_id for user_id in assistants_ids if user_id != task.owner_id]

        if task.task_type == 'daily' and assistants_ids:
            raise HTTPException(status_code=400, detail='Для ежедневных задач помощники не предусмотрены')

        if assistants_ids:
            found = db.query(models.User).filter(models.User.id.in_(assistants_ids)).all()
            found_ids = {u.id for u in found}
            missing = [user_id for user_id in assistants_ids if user_id not in found_ids]
            if missing:
                raise HTTPException(status_code=404, detail=f'Помощник(и) не найдены: {missing[:5]}')

        update_data['assistants_user_ids'] = assistants_ids

    # Deadline update rules: deadline can be changed only by managerial roles.
    if 'deadline' in update_data:
        if task.status in {'completed', 'archived'}:
            raise HTTPException(status_code=403, detail='Нельзя менять дедлайн завершенных или архивных задач')

        if not is_managerial_role:
            raise HTTPException(status_code=403, detail='Дедлайн может менять только руководитель')

    if not is_managerial_role:
        if not is_task_owner:
            raise HTTPException(status_code=403, detail='Вы можете изменять только свои задачи')

        allowed_owner_fields = {'status'}
        if not set(update_data.keys()).issubset(allowed_owner_fields):
            raise HTTPException(status_code=403, detail='Исполнитель может менять только статус своей задачи')

        if 'status' in update_data:
            _validate_owner_status_transition(task, update_data['status'])
    elif task.task_type == 'daily' and 'status' in update_data and not task.daily_approved_once:
        if update_data['status'] not in {'pending', 'in_progress', 'archived'}:
            raise HTTPException(
                status_code=400,
                detail='Ежедневную задачу сначала нужно согласовать или отклонить',
            )
        if update_data['status'] == 'in_progress':
            update_data['daily_approved_once'] = True

            # Notify executor about daily approval (once)
            notification_service.create_notification(
                db,
                user_id=task.owner_id,
                event=NotificationEvent(
                    kind='daily_approved',
                    event_key=f'daily_approved:{task.id}',
                    task_id=task.id,
                    title='Ежедневная задача согласована',
                    message=f'Руководитель согласовал ежедневную задачу «{task.title}».',
                ),
            )

    if 'owner_id' in update_data:
        new_owner = db.get(models.User, update_data['owner_id'])
        if not new_owner:
            raise HTTPException(status_code=404, detail='Исполнитель не найден')
        if not can_access_user(current_user, new_owner):
            raise HTTPException(status_code=403, detail='Вы не можете назначать задачи этому пользователю')
        if task.task_type == 'daily' and update_data['owner_id'] != task.created_by_id:
            raise HTTPException(status_code=400, detail='Ежедневная задача должна оставаться за ее автором')

    updated = task_service.update_task(db, task, update_data)
    return updated


@router.post('/{task_id}/accept', response_model=schemas.TaskSchema)
def accept_task(task_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    task = _get_task_or_404(db, task_id)
    _ensure_task_access(current_user, task)

    if current_user.id != task.owner_id:
        raise HTTPException(status_code=403, detail='Принять задачу может только назначенный исполнитель')

    if task.task_type == 'daily':
        raise HTTPException(status_code=400, detail='Ежедневную задачу переводит в работу руководитель')

    if task.status not in {'pending', 'overdue'}:
        raise HTTPException(status_code=400, detail='Эту задачу уже не нужно принимать')

    updated = task_service.update_task(db, task, {'status': 'in_progress'})

    # When task is accepted, mark related "accept needed" notifications as read
    # for all involved users: responsible + assistants.
    involved_user_ids = {updated.owner_id, *(getattr(updated, "assistants_user_ids", []) or [])}
    for user_id in involved_user_ids:
        notify_user = db.get(models.User, user_id)
        if not notify_user:
            continue

        notification_service.mark_task_notifications_read(
            db,
            current_user=notify_user,
            task_id=updated.id,
        )

    # Notify task creator that responsible accepted the task.
    notification_service.notify_task_accepted_for_creator(
        db,
        task=updated,
        accepted_by_user_id=current_user.id,
        accepted_by_name=current_user.full_name,
    )

    return updated


@router.get('/{task_id}/reports', response_model=List[schemas.TaskReportSchema])
def list_task_reports(task_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    task = _get_task_or_404(db, task_id)
    _ensure_task_access(current_user, task)
    return task.reports


@router.post('/{task_id}/reports', response_model=schemas.TaskReportSchema)
def create_task_report(
    task_id: int,
    comment: str | None = Form(default=None),
    definition_id: int | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_service.get_current_user),
):
    task = _get_task_or_404(db, task_id)
    _ensure_task_access(current_user, task)

    if current_user.id != task.owner_id:
        raise HTTPException(status_code=403, detail='Отчет по выполнению может отправить только назначенный исполнитель')

    if task.status == 'archived':
        raise HTTPException(status_code=400, detail='Нельзя отправить отчет по архивной задаче')

    if task.status in {'pending', 'overdue'}:
        raise HTTPException(status_code=400, detail='Сначала согласуйте задачу, а затем отправляйте отчет')

    normalized_comment = comment.strip() if comment else None
    has_file = file is not None and bool(file.filename)
    if not normalized_comment and not has_file:
        raise HTTPException(status_code=400, detail='Добавьте комментарий или прикрепите файл')

    selected_definition = None
    if definition_id is not None:
        selected_definition = workflow_service.get_definition(db, definition_id)
        if not selected_definition or not selected_definition.published:
            raise HTTPException(status_code=400, detail='Выберите опубликованный маршрут согласования')

    report = models.TaskReport(task_id=task.id, author_id=current_user.id, comment=normalized_comment)

    if has_file and file is not None:
        original_filename, stored_filename, file_path = _store_report_file(file)
        report.original_filename = original_filename
        report.stored_filename = stored_filename
        report.file_path = file_path
        file.file.close()

    if task.task_type == 'daily' and task.daily_approved_once:
        task.updated_at = datetime.utcnow()
        db.add(report)
        db.add(task)
        db.commit()
        db.refresh(report)
        return report

    task.status = 'in_review'
    task.updated_at = datetime.utcnow()
    db.add(report)
    db.add(task)
    db.commit()
    db.refresh(task)
    db.refresh(report)
    workflow_service.start_or_restart_workflow(db, task, selected_definition.id if selected_definition else None)
    db.refresh(report)
    return report


@router.delete('/{task_id}')
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    if not can_manage_tasks(current_user):
        raise HTTPException(status_code=403, detail='Только руководящие роли могут удалять задачи')

    task = _get_task_or_404(db, task_id)
    _ensure_task_access(current_user, task)

    task_service.delete_task(db, task)
    return {'detail': 'Задача удалена'}
