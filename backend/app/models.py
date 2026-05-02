from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from .db import Base

class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    users = relationship('User', back_populates='role')

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey('roles.id'), nullable=False)
    manager_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    role = relationship('Role', back_populates='users')
    manager = relationship('User', remote_side=[id])
    tasks = relationship('Task', back_populates='owner', foreign_keys='Task.owner_id')
    created_tasks = relationship('Task', back_populates='creator', foreign_keys='Task.created_by_id')
    events = relationship('Event', back_populates='owner')
    task_reports = relationship('TaskReport', back_populates='author')

class Project(Base):
    __tablename__ = 'projects'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    budget = Column(Integer, default=0)
    status = Column(String(50), default='active')
    created_at = Column(DateTime, default=datetime.utcnow)
    tasks = relationship('Task', back_populates='project', cascade='all, delete-orphan')

class Task(Base):
    __tablename__ = 'tasks'
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Integer, default=3)
    status = Column(String(50), default='pending')
    task_type = Column(String(50), default='manager_assigned', nullable=False)
    deadline = Column(DateTime, nullable=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)

    # Optional helpers/assistants (оnly notifications; accepting/reporting is still done by owner_id)
    assistants_user_ids = Column(JSON, default=list, nullable=False)

    created_by_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    daily_approved_once = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship('User', back_populates='tasks', foreign_keys=[owner_id])
    creator = relationship('User', back_populates='created_tasks', foreign_keys=[created_by_id])
    project = relationship('Project', back_populates='tasks')
    process_instance = relationship('ProcessInstance', back_populates='task', uselist=False, cascade='all, delete-orphan')
    history = relationship('TaskHistory', back_populates='task', cascade='all, delete-orphan')
    reports = relationship('TaskReport', back_populates='task', cascade='all, delete-orphan', order_by='desc(TaskReport.created_at)')

class TaskHistory(Base):
    __tablename__ = 'task_history'
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey('tasks.id'), nullable=False)
    changed_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    field = Column(String(100), nullable=False)
    old_value = Column(String(255), nullable=True)
    new_value = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    task = relationship('Task', back_populates='history')

class TaskReport(Base):
    __tablename__ = 'task_reports'
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey('tasks.id'), nullable=False)
    author_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    comment = Column(Text, nullable=True)
    original_filename = Column(String(255), nullable=True)
    stored_filename = Column(String(255), nullable=True, unique=True)
    file_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship('Task', back_populates='reports')
    author = relationship('User', back_populates='task_reports')

    @property
    def file_url(self):
        return self.file_path

class Event(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    checklist = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
    owner = relationship('User', back_populates='events')

class ProcessDefinition(Base):
    __tablename__ = 'process_definitions'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    version = Column(Integer, default=1)
    published = Column(Boolean, default=False)
    definition = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    instances = relationship('ProcessInstance', back_populates='definition')

    @property
    def template_key(self) -> str:
        return str((self.definition or {}).get('template_key') or f'legacy-{self.id}')

class ProcessNode(Base):
    __tablename__ = 'process_nodes'
    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey('process_definitions.id'), nullable=False)
    node_id = Column(String(100), nullable=False)
    node_type = Column(String(50), nullable=False)
    label = Column(String(255), nullable=False)
    config = Column(JSON, default={})

class ProcessTransition(Base):
    __tablename__ = 'process_transitions'
    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey('process_definitions.id'), nullable=False)
    source_node = Column(String(100), nullable=False)
    target_node = Column(String(100), nullable=False)
    condition = Column(JSON, default={})
    priority = Column(Integer, default=0)

class ProcessInstance(Base):
    __tablename__ = 'process_instances'
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey('tasks.id'), unique=True, nullable=False)
    definition_id = Column(Integer, ForeignKey('process_definitions.id'), nullable=False)
    current_node = Column(String(100), nullable=True)
    status = Column(String(50), default='active')
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship('Task', back_populates='process_instance')
    definition = relationship('ProcessDefinition', back_populates='instances')
    approvals = relationship('ApprovalTask', back_populates='instance', cascade='all, delete-orphan')
    audit = relationship('WorkflowAuditLog', back_populates='instance', cascade='all, delete-orphan')

class ApprovalTask(Base):
    __tablename__ = 'approval_tasks'
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(Integer, ForeignKey('process_instances.id'), nullable=False)
    node_id = Column(String(100), nullable=True)
    assigned_role = Column(String(100), nullable=False)
    assigned_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    status = Column(String(50), default='pending')
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    comment = Column(Text, nullable=True)

    instance = relationship('ProcessInstance', back_populates='approvals')
    assigned_user = relationship('User')

class WorkflowAuditLog(Base):
    __tablename__ = 'workflow_audit_log'
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(Integer, ForeignKey('process_instances.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    source_node = Column(String(100), nullable=True)
    target_node = Column(String(100), nullable=True)
    action = Column(String(50), nullable=False)
    result = Column(String(50), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    instance = relationship('ProcessInstance', back_populates='audit')


class Notification(Base):
    __tablename__ = 'notifications'
    __table_args__ = (
        UniqueConstraint('user_id', 'kind', 'event_key', name='uq_notifications_user_kind_event_key'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)

    kind = Column(String(50), nullable=False)  # e.g. 'deadline', 'approval'
    task_id = Column(Integer, ForeignKey('tasks.id'), nullable=True)

    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    event_key = Column(String(255), nullable=False)  # used for dedupe
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)

    # relationships (optional)
    owner = relationship('User', foreign_keys=[user_id])


class WorkloadSettings(Base):
    __tablename__ = 'workload_settings'

    # One-row settings table
    id = Column(Integer, primary_key=True, index=True)

    # Total active tasks at/or below this number corresponds to "base" part of 100%
    max_tasks_for_100 = Column(Integer, nullable=False, default=10)

    # Critical tasks (priority >= critical_priority_threshold) count that corresponds to "extra" part of 100%
    max_critical_tasks_for_100 = Column(Integer, nullable=False, default=3)

    # Tasks with priority >= this value are considered critical for extra multiplier
    critical_priority_threshold = Column(Integer, nullable=False, default=5)

    # Base weight part for task priority scaling: weight = base_task_weight + priority_step * (priority - 1)
    base_task_weight = Column(Integer, nullable=False, default=1)

    # Linear step for priority scaling (priority is 1..5)
    priority_weight_step = Column(Integer, nullable=False, default=0)

    # Extra multiplier applied for critical tasks
    critical_task_multiplier = Column(Integer, nullable=False, default=2)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
