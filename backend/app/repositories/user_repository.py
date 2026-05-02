from sqlalchemy.orm import Session
from .. import models

class UserRepository:
    def get_by_email(self, db: Session, email: str):
        return db.query(models.User).filter(models.User.email == email).first()

    def get_by_id(self, db: Session, user_id: int):
        return db.query(models.User).filter(models.User.id == user_id).first()

    def list_users(self, db: Session):
        return db.query(models.User).all()

    def create(self, db: Session, user: models.User):
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
