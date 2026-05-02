from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import schemas, models
from ..auth import auth_service
from ..services.auth_service import auth_facade
from ..dependencies import get_db

router = APIRouter(prefix='/auth', tags=['auth'])

@router.post('/login', response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = auth_facade.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Неверный логин или пароль')
    access_token = auth_service.create_access_token(user.id, user.role.name)
    return {'access_token': access_token, 'token_type': 'bearer'}

@router.post('/register', response_model=schemas.UserSchema)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    user = auth_facade.register_user(db, payload.email, payload.full_name, payload.password, payload.role_id, payload.manager_id)
    return user

@router.get('/me', response_model=schemas.UserSchema)
def get_me(current_user: models.User = Depends(auth_service.get_current_user)):
    return current_user
