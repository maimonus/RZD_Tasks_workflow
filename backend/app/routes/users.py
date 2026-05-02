from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import schemas, models
from ..dependencies import get_db
from ..auth import auth_service

router = APIRouter(prefix='/users', tags=['users'])

@router.get('', response_model=List[schemas.UserSchema])
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(auth_service.get_current_user)):
    return db.query(models.User).all()
