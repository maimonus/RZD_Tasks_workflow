from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from .. import models
from ..auth import auth_service

class AuthServiceFacade:
    def authenticate_user(self, db: Session, email: str, password: str):
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            return None
        if not auth_service.verify_password(password, user.hashed_password):
            return None
        return user

    def register_user(self, db: Session, email: str, full_name: str, password: str, role_id: int, manager_id: int | None):
        existing_user = db.query(models.User).filter(models.User.email == email).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Email уже зарегистрирован')

        role = db.get(models.Role, role_id)
        if not role:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Роль не найдена')

        if manager_id is not None:
            manager = db.get(models.User, manager_id)
            if not manager:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Руководитель не найден')

        hashed_password = auth_service.hash_password(password)
        user = models.User(email=email, full_name=full_name, hashed_password=hashed_password, role_id=role_id, manager_id=manager_id)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

auth_facade = AuthServiceFacade()
