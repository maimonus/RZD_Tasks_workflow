from . import models
from .config import ROLE_ADMIN, ROLE_HIERARCHY

TASK_MANAGEMENT_ROLES = {
    ROLE_ADMIN,
    'FinancialDirector',
    'DepartmentHead',
    'Manager',
}

PROJECT_MANAGEMENT_ROLES = {
    ROLE_ADMIN,
    'FinancialDirector',
    'DepartmentHead',
}


def can_access_user(actor: models.User, target: models.User) -> bool:
    if actor.id == target.id:
        return True

    if actor.role.name == ROLE_ADMIN:
        return True

    return target.role.name in ROLE_HIERARCHY.get(actor.role.name, [])


def can_manage_tasks(actor: models.User) -> bool:
    return actor.role.name in TASK_MANAGEMENT_ROLES


def can_manage_projects(actor: models.User) -> bool:
    return actor.role.name in PROJECT_MANAGEMENT_ROLES
