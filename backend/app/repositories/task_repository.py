from sqlalchemy.orm import Session
from .. import models

class TaskRepository:
    def list_tasks(self, db: Session):
        return db.query(models.Task).all()

    def get(self, db: Session, task_id: int):
        return db.query(models.Task).filter(models.Task.id == task_id).first()

    def create(self, db: Session, task: models.Task):
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def update(self, db: Session, task: models.Task, data: dict):
        for key, value in data.items():
            setattr(task, key, value)
        db.commit()
        db.refresh(task)
        return task

    def delete(self, db: Session, task: models.Task):
        db.delete(task)
        db.commit()
