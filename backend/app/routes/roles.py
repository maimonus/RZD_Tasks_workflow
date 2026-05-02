from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models, schemas
from ..dependencies import get_db

router = APIRouter(prefix='/roles', tags=['roles'])


@router.get('', response_model=List[schemas.RoleSchema])
def list_roles(db: Session = Depends(get_db)):
    return db.query(models.Role).order_by(models.Role.id.asc()).all()
