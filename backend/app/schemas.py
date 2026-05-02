from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class TaskType(str, Enum):
    MANAGER_ASSIGNED = 'manager_assigned'
    DAILY = 'daily'

class RoleSchema(BaseModel):
    id: int
    name: str
    description: Optional[str]

    model_config = {
        'from_attributes': True,
    }

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role_id: int
    manager_id: Optional[int] = None

class UserSchema(BaseModel):
    id: int
    email: str
    full_name: str
    role_id: int
    manager_id: Optional[int]
    created_at: datetime
    role: RoleSchema

    model_config = {
        'from_attributes': True,
    }

class LoginRequest(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: int
    role: str
    exp: int

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: int = Field(ge=1, le=5)
    deadline: Optional[datetime]
    project_id: Optional[int]
    owner_id: int
    # helpers/assistants are optional: can be empty list
    assistants_user_ids: List[int] = Field(default_factory=list)
    task_type: TaskType = TaskType.MANAGER_ASSIGNED

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = Field(None, ge=1, le=5)
    status: Optional[str] = None
    deadline: Optional[datetime] = None
    owner_id: Optional[int] = None
    project_id: Optional[int] = None
    assistants_user_ids: Optional[List[int]] = None

class TaskReportSchema(BaseModel):
    id: int
    task_id: int
    author_id: int
    comment: Optional[str]
    original_filename: Optional[str]
    file_url: Optional[str]
    created_at: datetime
    author: Optional[UserSchema] = None

    model_config = {
        'from_attributes': True,
    }

class TaskSchema(BaseModel):
    id: int
    title: str
    description: Optional[str]
    priority: int
    status: str
    task_type: TaskType
    deadline: Optional[datetime]
    project_id: Optional[int]
    owner_id: int
    created_by_id: int
    daily_approved_once: bool
    assistants_user_ids: List[int] = Field(default_factory=list)
    owner: Optional[UserSchema] = None
    reports: List[TaskReportSchema] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {
        'from_attributes': True,
    }

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    budget: int = 0

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[int] = None
    status: Optional[str] = None

class ProjectSchema(BaseModel):
    id: int
    name: str
    description: Optional[str]
    budget: int
    status: str
    created_at: datetime

    model_config = {
        'from_attributes': True,
    }

class ProjectDetailSchema(ProjectSchema):
    tasks: List[TaskSchema] = Field(default_factory=list)

    model_config = {
        'from_attributes': True,
    }

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    owner_id: int
    checklist: Optional[List[Any]] = []

class ApprovalAction(BaseModel):
    comment: Optional[str] = None

class WorkflowNodePayload(BaseModel):
    node_id: str
    node_type: str
    label: str
    config: dict[str, Any] = Field(default_factory=dict)

class WorkflowTransitionPayload(BaseModel):
    source_node: str
    target_node: str
    condition: dict[str, Any] = Field(default_factory=dict)
    priority: int = 0

class WorkflowDefinitionPayload(BaseModel):
    name: str
    template_key: Optional[str] = None
    start_node: Optional[str] = None
    nodes: List[WorkflowNodePayload]
    transitions: List[WorkflowTransitionPayload]
    published: bool = False

class WorkflowDefinitionSchema(BaseModel):
    id: int
    name: str
    template_key: str
    version: int
    published: bool
    definition: dict[str, Any]
    created_at: datetime

    model_config = {
        'from_attributes': True,
    }

class WorkflowInstanceSchema(BaseModel):
    id: int
    task_id: int
    definition_id: int
    current_node: Optional[str]
    status: str
    created_at: datetime

    model_config = {
        'from_attributes': True,
    }

class ApprovalTaskSchema(BaseModel):
    id: int
    instance_id: int
    assigned_role: str
    assigned_user_id: Optional[int]
    status: str
    created_at: datetime
    resolved_at: Optional[datetime]
    comment: Optional[str]

    model_config = {
        'from_attributes': True,
    }

class WorkflowAuditSchema(BaseModel):
    id: int
    instance_id: int
    user_id: int
    source_node: Optional[str]
    target_node: Optional[str]
    action: str
    result: str
    comment: Optional[str]
    created_at: datetime

    model_config = {
        'from_attributes': True,
    }

class PendingApprovalSchema(BaseModel):
    approval_id: int
    instance_id: int
    task: TaskSchema
    assigned_role: str
    assigned_user_id: Optional[int]
    current_node: Optional[str]
    created_at: datetime


class NotificationKind(str, Enum):
    DEADLINE_SOON = 'deadline_soon'
    DEADLINE_OVERDUE = 'deadline_overdue'

    # approvals workflow
    APPROVAL_PENDING = 'approval_pending'
    APPROVAL_RESOLVED = 'approval_resolved'

    # tasks lifecycle
    DAILY_APPROVED = 'daily_approved'
    TASK_STATUS_CHANGED = 'task_status_changed'
    TASK_ACCEPTED = 'task_accepted'


class NotificationSchema(BaseModel):
    id: int
    kind: NotificationKind
    title: str
    message: str
    task_id: Optional[int]
    created_at: datetime
    read_at: Optional[datetime]

    model_config = {
        'from_attributes': True,
    }


class MarkNotificationReadPayload(BaseModel):
    read_at: Optional[datetime] = None


class WorkloadSettingsSchema(BaseModel):
    id: int

    # base part of 100% (how many "normal" active tasks correspond to 100% base)
    max_tasks_for_100: int

    # extra part of 100% (how many "critical" tasks correspond to 100% extra)
    max_critical_tasks_for_100: int

    # priority >= this threshold considered "critical"
    critical_priority_threshold: int

    # base task weight formula component
    base_task_weight: int

    # linear scaling component for priority weight
    priority_weight_step: int

    # extra multiplier for critical tasks
    critical_task_multiplier: int

    created_at: datetime
    updated_at: datetime

    model_config = {
        'from_attributes': True,
    }


class WorkloadSettingsUpdatePayload(BaseModel):
    max_tasks_for_100: int = Field(ge=0)
    max_critical_tasks_for_100: int = Field(ge=0)
    critical_priority_threshold: int = Field(ge=1, le=5)
    base_task_weight: int = Field(ge=0)
    priority_weight_step: int = Field(ge=0)
    critical_task_multiplier: int = Field(ge=1)
