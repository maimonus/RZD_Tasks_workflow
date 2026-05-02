from datetime import datetime

from sqlalchemy.orm import Session

from .. import models
from ..config import ROLE_ADMIN
from ..permissions import can_manage_projects
from ..repositories.workflow_repository import WorkflowRepository
from ..workflow.engine import NodeType, ProcessDefinitionDescriptor, ProcessNodeDescriptor, ProcessTransitionDescriptor, WorkflowEngine
from .notification_service import notification_service


class WorkflowService:
    def __init__(self):
        self.repository = WorkflowRepository()

    def _get_template_key(self, definition: models.ProcessDefinition) -> str:
        return definition.template_key

    def _to_descriptor(self, definition: models.ProcessDefinition | None) -> ProcessDefinitionDescriptor | None:
        if not definition:
            return None

        def coerce_node_type(raw: str | NodeType) -> NodeType:
            if isinstance(raw, NodeType):
                return raw
            return NodeType(str(raw))

        raw_nodes = definition.definition.get('nodes', [])
        nodes: list[ProcessNodeDescriptor] = []
        for raw in raw_nodes:
            raw_type = raw.get('node_type', '')
            nodes.append(ProcessNodeDescriptor(**{**raw, 'node_type': coerce_node_type(raw_type)}))

        transitions = [ProcessTransitionDescriptor(**transition) for transition in definition.definition.get('transitions', [])]
        return ProcessDefinitionDescriptor(
            definition_id=definition.id,
            name=definition.name,
            version=definition.version,
            nodes=nodes,
            transitions=transitions,
            start_node=definition.definition.get('start_node'),
        )

    def build_definition(self, db: Session, definition_id: int | None = None) -> ProcessDefinitionDescriptor | None:
        definition = self.repository.get_definition(db, definition_id) if definition_id else self.repository.get_latest_published_definition(db)
        return self._to_descriptor(definition)

    def list_definitions(self, db: Session):
        latest_by_template: dict[str, models.ProcessDefinition] = {}
        for definition in self.repository.list_definitions(db):
            template_key = self._get_template_key(definition)
            current = latest_by_template.get(template_key)
            if current is None or definition.version > current.version or (
                definition.version == current.version and definition.id > current.id
            ):
                latest_by_template[template_key] = definition

        return sorted(
            latest_by_template.values(),
            key=lambda definition: (definition.published, definition.created_at, definition.id),
            reverse=True,
        )

    def get_latest_saved_definition(self, db: Session):
        return self.repository.get_latest_saved_definition(db)

    def get_definition(self, db: Session, definition_id: int):
        return self.repository.get_definition(db, definition_id)

    def save_definition(self, db: Session, payload: dict):
        template_key = str(payload.get('template_key') or f'template-{datetime.utcnow().timestamp()}')
        template_versions = [
            definition for definition in self.repository.list_definitions(db) if self._get_template_key(definition) == template_key
        ]
        next_version = (max((definition.version for definition in template_versions), default=0)) + 1

        definition = models.ProcessDefinition(
            name=payload['name'],
            version=next_version,
            published=payload.get('published', False),
            definition={
                'template_key': template_key,
                'start_node': payload.get('start_node'),
                'nodes': payload.get('nodes', []),
                'transitions': payload.get('transitions', []),
            },
        )

        if definition.published:
            for published_definition in db.query(models.ProcessDefinition).filter(models.ProcessDefinition.published.is_(True)).all():
                published_definition.published = False

        db.add(definition)
        db.commit()
        db.refresh(definition)
        return definition

    def delete_definition(self, db: Session, definition_id: int):
        definition = self.repository.get_definition(db, definition_id)
        if not definition:
            return False

        template_key = self._get_template_key(definition)
        template_versions = [
            item for item in self.repository.list_definitions(db) if self._get_template_key(item) == template_key
        ]

        if any(item.instances for item in template_versions):
            raise ValueError('Нельзя удалить шаблон, который уже используется в маршрутах согласования')

        for item in template_versions:
            db.delete(item)

        db.commit()
        return True

    def _build_context(self, task: models.Task):
        return {
            'budget': task.project.budget if task.project else 0,
            'priority': task.priority,
            'role': task.owner.role.name if task.owner else '',
        }

    def _resolve_assigned_user_id(self, task: models.Task, role_required: str | None):
        if not role_required or not task.owner:
            return None

        candidate = task.owner.manager
        while candidate:
            if candidate.role.name == role_required:
                return candidate.id
            candidate = candidate.manager

        return None

    def _create_approval_for_node(self, db: Session, task: models.Task, instance: models.ProcessInstance, node: ProcessNodeDescriptor):
        if node.node_type != NodeType.APPROVAL:
            return None

        role_required = node.config.get('role_required', '')
        assigned_user_id = node.config.get('assigned_user_id') or self._resolve_assigned_user_id(task, role_required)

        approval = models.ApprovalTask(
            instance_id=instance.id,
            node_id=node.node_id,
            assigned_role=role_required,
            assigned_user_id=assigned_user_id,
        )
        db.add(approval)
        db.flush()

        # Notify approver(s) that there is a new pending approval.
        notification_service.notify_approval_pending_for_approvers(
            db,
            task=task,
            instance_id=instance.id,
            approval_id=approval.id,
            assigned_user_id=assigned_user_id,
            assigned_role=role_required,
        )

        return approval

    def start_or_restart_workflow(self, db: Session, task: models.Task, definition_id: int | None = None):
        descriptor = self.build_definition(db, definition_id)
        if not descriptor:
            return None

        engine = WorkflowEngine(descriptor)
        approval_descriptor = engine.create_first_approval(self._build_context(task))
        current_instance = self.repository.get_instance_by_task(db, task.id)

        if current_instance and current_instance.status == 'active':
            task.status = 'in_review'
            task.updated_at = datetime.utcnow()
            db.add(task)
            db.commit()
            db.refresh(current_instance)
            return current_instance

        if current_instance:
            current_instance.status = 'active'
            current_instance.definition_id = descriptor.definition_id
            current_instance.current_node = approval_descriptor.node_id if approval_descriptor else None
            current_instance.created_at = datetime.utcnow()
            current_instance.approvals.clear()
            instance = current_instance
        else:
            instance = models.ProcessInstance(
                task_id=task.id,
                definition_id=descriptor.definition_id,
                current_node=approval_descriptor.node_id if approval_descriptor else None,
                status='active',
            )
            db.add(instance)
            db.flush()

        task.status = 'in_review'
        task.updated_at = datetime.utcnow()

        if approval_descriptor:
            node = next((item for item in descriptor.nodes if item.node_id == approval_descriptor.node_id), None)
            if node:
                self._create_approval_for_node(db, task, instance, node)
        else:
            instance.status = 'completed'
            instance.current_node = None
            task.status = 'completed'

        db.add(task)
        db.add(instance)
        db.commit()
        db.refresh(instance)
        return instance

    def start_workflow(self, db: Session, task: models.Task, definition_id: int | None = None):
        instance = self.start_or_restart_workflow(db, task, definition_id)
        if not instance:
            raise ValueError('No published workflow definition')
        return instance

    def get_instance(self, db: Session, instance_id: int):
        return self.repository.get_instance(db, instance_id)

    def _can_resolve_approval(self, current_user: models.User, approval: models.ApprovalTask):
        if current_user.role.name == ROLE_ADMIN:
            return True
        if approval.assigned_user_id:
            return approval.assigned_user_id == current_user.id
        return approval.assigned_role == current_user.role.name

    def list_pending_approvals(self, db: Session, current_user: models.User):
        approvals = self.repository.list_pending_approvals(db)
        if current_user.role.name == ROLE_ADMIN:
            return approvals

        visible_approvals: list[models.ApprovalTask] = []
        for approval in approvals:
            if approval.assigned_user_id and approval.assigned_user_id == current_user.id:
                visible_approvals.append(approval)
                continue
            if approval.assigned_user_id is None and approval.assigned_role == current_user.role.name:
                visible_approvals.append(approval)
        return visible_approvals

    def resolve_approval(self, db: Session, task_id: int, decision: str, current_user: models.User, comment: str | None = None):
        instance = self.repository.get_instance_by_task(db, task_id)
        if not instance or instance.status != 'active':
            return None

        current_approval = next((approval for approval in instance.approvals if approval.status == 'pending'), None)
        if not current_approval:
            return None

        if not self._can_resolve_approval(current_user, current_approval):
            raise PermissionError('User cannot approve this task')

        current_approval.status = 'approved' if decision == 'approve' else 'rejected'
        current_approval.resolved_at = datetime.utcnow()
        current_approval.comment = comment

        task = instance.task

        if decision == 'reject':
            instance.status = 'rejected'
            task.status = 'in_progress'
            task.updated_at = datetime.utcnow()
            db.add(instance)
            db.add(task)
            db.commit()
            self.repository.save_audit(
                db,
                models.WorkflowAuditLog(
                    instance_id=instance.id,
                    user_id=current_user.id,
                    source_node=current_approval.node_id,
                    target_node=None,
                    action='reject',
                    result='rejected',
                    comment=comment,
                ),
            )

            notification_service.notify_approval_rejected_for_owner(
                db,
                task=task,
                instance_id=instance.id,
                approval_id=current_approval.id,
                comment=comment,
            )

            return instance

        descriptor = self.build_definition(db, instance.definition_id)
        if not descriptor:
            instance.status = 'completed'
            instance.current_node = None
            task.status = 'completed'
            task.updated_at = datetime.utcnow()
            db.add(instance)
            db.add(task)
            db.commit()

            notification_service.notify_approval_completed_for_owner(
                db,
                task=task,
                instance_id=instance.id,
                approval_id=current_approval.id,
            )

            return instance

        engine = WorkflowEngine(descriptor)
        next_state = engine.advance(instance.current_node or current_approval.node_id or '', decision, self._build_context(task))

        if next_state['completed']:
            instance.status = 'completed'
            instance.current_node = None
            task.status = 'completed'
            task.updated_at = datetime.utcnow()
            db.add(instance)
            db.add(task)
            db.commit()
            self.repository.save_audit(
                db,
                models.WorkflowAuditLog(
                    instance_id=instance.id,
                    user_id=current_user.id,
                    source_node=current_approval.node_id,
                    target_node=None,
                    action=decision,
                    result='completed',
                    comment=comment,
                ),
            )

            notification_service.notify_approval_completed_for_owner(
                db,
                task=task,
                instance_id=instance.id,
                approval_id=current_approval.id,
            )

            return instance

        instance.current_node = next_state['next_node']
        task.status = 'in_review'
        task.updated_at = datetime.utcnow()
        db.add(instance)
        db.add(task)

        if instance.current_node:
            node = next((node for node in descriptor.nodes if node.node_id == instance.current_node), None)
            if node:
                self._create_approval_for_node(db, task, instance, node)

        db.commit()
        self.repository.save_audit(
            db,
            models.WorkflowAuditLog(
                instance_id=instance.id,
                user_id=current_user.id,
                source_node=current_approval.node_id,
                target_node=next_state['next_node'],
                action=decision,
                result='approved',
                comment=comment,
            ),
        )
        db.refresh(instance)
        return instance


workflow_service = WorkflowService()
