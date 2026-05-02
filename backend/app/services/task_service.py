from datetime import datetime
from sqlalchemy.orm import Session

from .. import models
from ..repositories.task_repository import TaskRepository
from .notification_service import notification_service

class TaskService:
    def __init__(self):
        self.repository = TaskRepository()

    def list_tasks(self, db: Session):
        return self.repository.list_tasks(db)

    def get_task(self, db: Session, task_id: int):
        return self.repository.get(db, task_id)

    def create_task(self, db: Session, data: dict):
        task = models.Task(**data)
        return self.repository.create(db, task)

    def update_task(self, db: Session, task: models.Task, data: dict):
        data['updated_at'] = datetime.utcnow()
        return self.repository.update(db, task, data)

    def delete_task(self, db: Session, task: models.Task):
        self.repository.delete(db, task)

    def enforce_overdue(self, db: Session):
        tasks = self.repository.list_tasks(db)
        changed = []
        for task in tasks:
            if task.deadline and task.status not in {'completed', 'archived'} and task.deadline < datetime.utcnow():
                if task.status != 'overdue':
                    task.status = 'overdue'
                    changed.append(task.id)

                    # Ensure executor gets "accept needed" notification for overdue tasks.
                    notification_service.notify_task_accept_needed(db, task=task)

        if changed:
            db.commit()
        return changed

task_service = TaskService()
