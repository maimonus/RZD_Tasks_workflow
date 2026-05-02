from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRES_MINUTES
from . import models, schemas
from .dependencies import get_db

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/auth/login')

class AuthService:
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)

    def create_access_token(self, subject: int, role: str) -> str:
        expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MINUTES)
        payload = {'sub': str(subject), 'role': role, 'exp': expire}
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    def decode_token(self, token: str) -> schemas.TokenPayload:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return schemas.TokenPayload(**payload)
        except JWTError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Недействительный токен') from exc

    def get_current_user(self, token: str = Depends(oauth2_scheme), session: Session = Depends(get_db)) -> models.User:
        payload = self.decode_token(token)
        user = session.get(models.User, int(payload.sub))
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Пользователь не найден')
        return user

    def require_role(self, allowed_roles: list[str]):
        def role_dependency(user: models.User = Depends(self.get_current_user)):
            if user.role.name not in allowed_roles:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Доступ запрещен')
            return user
        return role_dependency

auth_service = AuthService()
