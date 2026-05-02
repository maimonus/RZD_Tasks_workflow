from sqlalchemy.orm import Session
from .. import models

class WorkflowRepository:
    def get_definition(self, db: Session, definition_id: int):
        return db.query(models.ProcessDefinition).filter(models.ProcessDefinition.id == definition_id).first()

    def get_latest_published_definition(self, db: Session):
        return db.query(models.ProcessDefinition).filter(models.ProcessDefinition.published.is_(True)).order_by(models.ProcessDefinition.version.desc()).first()

    def get_latest_saved_definition(self, db: Session):
        return db.query(models.ProcessDefinition).order_by(models.ProcessDefinition.version.desc(), models.ProcessDefinition.id.desc()).first()

    def list_definitions(self, db: Session):
        return db.query(models.ProcessDefinition).order_by(models.ProcessDefinition.created_at.desc(), models.ProcessDefinition.id.desc()).all()

    def list_pending_approvals(self, db: Session):
        return db.query(models.ApprovalTask).filter(models.ApprovalTask.status == 'pending').order_by(models.ApprovalTask.created_at.asc()).all()

    def create_instance(self, db: Session, instance: models.ProcessInstance):
        db.add(instance)
        db.commit()
        db.refresh(instance)
        return instance

    def create_approval(self, db: Session, approval: models.ApprovalTask):
        db.add(approval)
        db.commit()
        db.refresh(approval)
        return approval

    def get_instance(self, db: Session, instance_id: int):
        return db.query(models.ProcessInstance).filter(models.ProcessInstance.id == instance_id).first()

    def get_instance_by_task(self, db: Session, task_id: int):
        return db.query(models.ProcessInstance).filter(models.ProcessInstance.task_id == task_id).first()

    def save_audit(self, db: Session, audit: models.WorkflowAuditLog):
        db.add(audit)
        db.commit()
        return audit

    def save_definition(self, db: Session, definition: models.ProcessDefinition):
        db.add(definition)
        db.commit()
        db.refresh(definition)
        return definition
