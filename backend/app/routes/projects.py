from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import schemas, models
from ..dependencies import get_db
from ..auth import auth_service
from ..permissions import can_access_user, can_manage_projects

router = APIRouter(prefix='/projects', tags=['projects'])

@router.get('', response_model=List[schemas.ProjectSchema])
def list_projects(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    return db.query(models.Project).all()

@router.get('/{project_id}', response_model=schemas.ProjectDetailSchema)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail='Проект не найден')

    visible_tasks = [task for task in project.tasks if can_access_user(current_user, task.owner)]
    payload = schemas.ProjectSchema.model_validate(project).model_dump()
    payload['tasks'] = visible_tasks
    return payload

@router.post('', response_model=schemas.ProjectSchema)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    if not can_manage_projects(current_user):
        raise HTTPException(status_code=403, detail='Только руководящие роли могут создавать проекты')

    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.patch('/{project_id}', response_model=schemas.ProjectSchema)
def update_project(project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    if not can_manage_projects(current_user):
        raise HTTPException(status_code=403, detail='Только руководящие роли могут редактировать проекты')

    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail='Проект не найден')

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project

@router.delete('/{project_id}')
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    if not can_manage_projects(current_user):
        raise HTTPException(status_code=403, detail='РўРѕР»СЊРєРѕ СЂСѓРєРѕРІРѕРґСЏС‰РёРµ СЂРѕР»Рё РјРѕРіСѓС‚ СѓРґР°Р»СЏС‚СЊ РїСЂРѕРµРєС‚С‹')

    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail='РџСЂРѕРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ')

    db.delete(project)
    db.commit()
    return {'detail': 'РџСЂРѕРµРєС‚ СѓРґР°Р»РµРЅ'}
