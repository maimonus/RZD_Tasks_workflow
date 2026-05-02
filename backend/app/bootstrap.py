import os
from datetime import datetime, timedelta

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from . import models
from .auth import auth_service
from .config import (
    ROLE_ADMIN,
    ROLE_DEPARTMENT_HEAD,
    ROLE_EXECUTOR,
    ROLE_FINANCIAL_DIRECTOR,
    ROLE_MANAGER,
)
from .services.workflow_service import workflow_service

LEGACY_ROLE_DESCRIPTIONS_EN = {
    ROLE_ADMIN: 'Platform administrator with full access',
    ROLE_FINANCIAL_DIRECTOR: 'Oversees the finance function and departments',
    ROLE_DEPARTMENT_HEAD: 'Leads a department and manages managers',
    ROLE_MANAGER: 'Creates and assigns tasks to executors',
    ROLE_EXECUTOR: 'Works on assigned tasks',
}

DEFAULT_ROLES_RU = [
    (ROLE_ADMIN, 'Администратор платформы с полным доступом'),
    (ROLE_FINANCIAL_DIRECTOR, 'Руководит финансовой функцией и отделами'),
    (ROLE_DEPARTMENT_HEAD, 'Управляет отделом и менеджерами'),
    (ROLE_MANAGER, 'Создает задачи и назначает их исполнителям'),
    (ROLE_EXECUTOR, 'Исполняет назначенные задачи'),
]


def apply_runtime_migrations(db: Session) -> None:
    inspector = inspect(db.bind)
    if 'tasks' not in inspector.get_table_names():
        return

    task_columns = {column['name'] for column in inspector.get_columns('tasks')}
    migration_applied = False

    if 'task_type' not in task_columns:
        db.execute(text("ALTER TABLE tasks ADD COLUMN task_type VARCHAR(50) NOT NULL DEFAULT 'manager_assigned'"))
        migration_applied = True

    if 'created_by_id' not in task_columns:
        db.execute(text('ALTER TABLE tasks ADD COLUMN created_by_id INTEGER'))
        migration_applied = True

    if 'daily_approved_once' not in task_columns:
        db.execute(text('ALTER TABLE tasks ADD COLUMN daily_approved_once BOOLEAN NOT NULL DEFAULT 0'))
        migration_applied = True

    if 'assistants_user_ids' not in task_columns:
        db.execute(
            text("ALTER TABLE tasks ADD COLUMN assistants_user_ids JSON NOT NULL DEFAULT '[]'")
        )
        migration_applied = True

    if migration_applied:
        db.commit()

    tasks_without_creator = db.query(models.Task).filter(models.Task.created_by_id.is_(None)).all()
    for task in tasks_without_creator:
        task.created_by_id = task.owner.manager_id or task.owner_id

    if tasks_without_creator:
        db.commit()


def bootstrap_defaults(db: Session) -> None:
    roles_by_name = {role.name: role for role in db.query(models.Role).all()}

    for name, ru_description in DEFAULT_ROLES_RU:
        role = roles_by_name.get(name)
        if role is None:
            db.add(models.Role(name=name, description=ru_description))
            continue

        legacy_description = LEGACY_ROLE_DESCRIPTIONS_EN.get(name)
        if role.description is None or (legacy_description and role.description == legacy_description):
            role.description = ru_description

    db.commit()

    admin_email = os.getenv('ADMIN_EMAIL', 'admin@finance.local')
    admin_password = os.getenv('ADMIN_PASSWORD', 'admin12345')
    demo_password = os.getenv('DEMO_PASSWORD', 'demo12345')

    admin_role = db.query(models.Role).filter(models.Role.name == ROLE_ADMIN).first()
    if admin_role is None:
        return

    existing_admin = db.query(models.User).filter(models.User.email == admin_email).first()
    if existing_admin:
        if existing_admin.full_name == 'System Administrator':
            existing_admin.full_name = 'Системный администратор'
            db.commit()
    else:
        db.add(
            models.User(
                email=admin_email,
                full_name='Системный администратор',
                hashed_password=auth_service.hash_password(admin_password),
                role_id=admin_role.id,
            )
        )
        db.commit()

    # Demo users (idempotent by email)
    demo_users = [
        # Financial director + department head + 3 managers
        {'email': 'fd@finance.local', 'full_name': 'Петрова Анна', 'role_name': ROLE_FINANCIAL_DIRECTOR, 'manager_email': None},
        {'email': 'head@finance.local', 'full_name': 'Смирнов Олег', 'role_name': ROLE_DEPARTMENT_HEAD, 'manager_email': 'fd@finance.local'},
        {'email': 'manager1@finance.local', 'full_name': 'Кузнецова Мария', 'role_name': ROLE_MANAGER, 'manager_email': 'head@finance.local'},
        {'email': 'manager2@finance.local', 'full_name': 'Волков Артем', 'role_name': ROLE_MANAGER, 'manager_email': 'head@finance.local'},
        {'email': 'manager3@finance.local', 'full_name': 'Лебедева Ирина', 'role_name': ROLE_MANAGER, 'manager_email': 'head@finance.local'},

        # Executors under managers 1-3
        {'email': 'executor1@finance.local', 'full_name': 'Иванов Илья', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager1@finance.local'},
        {'email': 'executor2@finance.local', 'full_name': 'Соколова Елена', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager1@finance.local'},
        {'email': 'executor3@finance.local', 'full_name': 'Никитин Павел', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager2@finance.local'},
        {'email': 'executor4@finance.local', 'full_name': 'Орлова Дарья', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager2@finance.local'},
        {'email': 'executor5@finance.local', 'full_name': 'Морозов Денис', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager3@finance.local'},
        {'email': 'executor6@finance.local', 'full_name': 'Федорова Нина', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager3@finance.local'},

        # +20 users (to reach total 31 with existing 11)
        # Managers 4-6 (under department head)
        {'email': 'manager4@finance.local', 'full_name': 'Алексеева Марина', 'role_name': ROLE_MANAGER, 'manager_email': 'head@finance.local'},
        {'email': 'manager5@finance.local', 'full_name': 'Захаров Сергей', 'role_name': ROLE_MANAGER, 'manager_email': 'head@finance.local'},
        {'email': 'manager6@finance.local', 'full_name': 'Кравцова Ольга', 'role_name': ROLE_MANAGER, 'manager_email': 'head@finance.local'},

        # Executors 7-23 (under managers 4-6)
        {'email': 'executor7@finance.local', 'full_name': 'Смирнова Валерия', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager4@finance.local'},
        {'email': 'executor8@finance.local', 'full_name': 'Баранов Михаил', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager4@finance.local'},
        {'email': 'executor9@finance.local', 'full_name': 'Орлов Арсений', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager4@finance.local'},
        {'email': 'executor10@finance.local', 'full_name': 'Сидорова Софья', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager4@finance.local'},
        {'email': 'executor11@finance.local', 'full_name': 'Попов Павел', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager5@finance.local'},
        {'email': 'executor12@finance.local', 'full_name': 'Тарасова Елизавета', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager5@finance.local'},
        {'email': 'executor13@finance.local', 'full_name': 'Григорьев Кирилл', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager5@finance.local'},
        {'email': 'executor14@finance.local', 'full_name': 'Романова Анжелика', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager5@finance.local'},
        {'email': 'executor15@finance.local', 'full_name': 'Кузьмин Денис', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager6@finance.local'},
        {'email': 'executor16@finance.local', 'full_name': 'Павлова Галина', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager6@finance.local'},
        {'email': 'executor17@finance.local', 'full_name': 'Фролов Артем', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager6@finance.local'},
        {'email': 'executor18@finance.local', 'full_name': 'Киселева Ксения', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager6@finance.local'},
        {'email': 'executor19@finance.local', 'full_name': 'Мельникова Ника', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager6@finance.local'},
        {'email': 'executor20@finance.local', 'full_name': 'Кузнецов Алексей', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager5@finance.local'},
        {'email': 'executor21@finance.local', 'full_name': 'Леонтьева Вера', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager4@finance.local'},
        {'email': 'executor22@finance.local', 'full_name': 'Сорокин Егор', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager5@finance.local'},
        {'email': 'executor23@finance.local', 'full_name': 'Шевцова Ева', 'role_name': ROLE_EXECUTOR, 'manager_email': 'manager4@finance.local'},
    ]

    roles = {role.name: role.id for role in db.query(models.Role).all()}

    def user_by_email(email: str) -> models.User | None:
        return db.query(models.User).filter(models.User.email == email).first()

    pending = list(demo_users)
    progress = True
    while pending and progress:
        progress = False
        next_pending: list[dict] = []

        for candidate in pending:
            if user_by_email(candidate['email']):
                continue

            role_id = roles.get(candidate['role_name'])
            if not role_id:
                continue

            manager_id = None
            manager_email = candidate['manager_email']
            if manager_email:
                manager = user_by_email(manager_email)
                if not manager:
                    next_pending.append(candidate)
                    continue
                manager_id = manager.id

            db.add(
                models.User(
                    email=candidate['email'],
                    full_name=candidate['full_name'],
                    hashed_password=auth_service.hash_password(demo_password),
                    role_id=role_id,
                    manager_id=manager_id,
                )
            )
            db.flush()
            progress = True

        pending = next_pending

    db.commit()

    # Demo projects (idempotent by name)
    demo_projects = [
        {'name': 'Цифровая трансформация', 'description': 'Автоматизация финансовых процессов и отчетности.', 'budget': 2_800_000},
        {'name': 'Аудит затрат', 'description': 'Проверка расходов и выявление точек оптимизации.', 'budget': 950_000},
        {'name': 'Планирование бюджета 2026', 'description': 'Сбор заявок, консолидация и согласование бюджета на 2026 год.', 'budget': 1_450_000},
    ]

    existing_project_names = {project.name for project in db.query(models.Project).all()}
    for candidate in demo_projects:
        if candidate['name'] in existing_project_names:
            continue
        db.add(models.Project(**candidate))
    db.commit()

    projects_by_name = {project.name: project for project in db.query(models.Project).all()}
    users_by_email = {user.email: user for user in db.query(models.User).all()}

    now = datetime.utcnow()

    # Existing 11 demo tasks
    demo_tasks = [
        {
            'title': 'Автоматизировать сверку платежей',
            'description': 'Настроить шаблон еженедельной сверки банковских операций и проводок.',
            'priority': 5,
            'status': 'in_progress',
            'deadline': now + timedelta(days=5),
            'project_name': 'Цифровая трансформация',
            'owner_email': 'executor1@finance.local',
        },
        {
            'title': 'Подготовить дашборд KPI отдела',
            'description': 'Сформировать набор финансовых KPI для ежемесячного мониторинга.',
            'priority': 4,
            'status': 'pending',
            'deadline': now + timedelta(days=10),
            'project_name': 'Цифровая трансформация',
            'owner_email': 'executor2@finance.local',
        },
        {
            'title': 'Описать регламент электронного согласования',
            'description': 'Подготовить инструкцию по новым маршрутам согласования заявок.',
            'priority': 3,
            'status': 'completed',
            'deadline': now - timedelta(days=2),
            'project_name': 'Цифровая трансформация',
            'owner_email': 'executor3@finance.local',
        },
        {
            'title': 'Проверить расходы на командировки',
            'description': 'Сверить лимиты и фактические расходы за квартал.',
            'priority': 4,
            'status': 'in_progress',
            'deadline': now + timedelta(days=3),
            'project_name': 'Аудит затрат',
            'owner_email': 'executor4@finance.local',
        },
        {
            'title': 'Собрать отчет по экономии',
            'description': 'Консолидировать подтвержденные инициативы по снижению затрат.',
            'priority': 3,
            'status': 'pending',
            'deadline': now + timedelta(days=8),
            'project_name': 'Аудит затрат',
            'owner_email': 'executor1@finance.local',
        },
        {
            'title': 'Подготовить список отклонений по закупкам',
            'description': 'Выявить отклонения от плановых бюджетов закупки.',
            'priority': 2,
            'status': 'overdue',
            'deadline': now - timedelta(days=1),
            'project_name': 'Аудит затрат',
            'owner_email': 'executor2@finance.local',
        },
        {
            'title': 'Собрать заявки подразделений',
            'description': 'Проверить полноту и формат поданных бюджетных заявок.',
            'priority': 5,
            'status': 'in_progress',
            'deadline': now + timedelta(days=4),
            'project_name': 'Планирование бюджета 2026',
            'owner_email': 'executor3@finance.local',
        },
        {
            'title': 'Сверить лимиты CAPEX и OPEX',
            'description': 'Сопоставить лимиты по статьям CAPEX/OPEX с заявками отделов.',
            'priority': 4,
            'status': 'pending',
            'deadline': now + timedelta(days=11),
            'project_name': 'Планирование бюджета 2026',
            'owner_email': 'executor4@finance.local',
        },
        {
            'title': 'Подготовить презентацию для бюджетного комитета',
            'description': 'Сформировать материалы с ключевыми рисками и допущениями.',
            'priority': 3,
            'status': 'pending',
            'deadline': now + timedelta(days=14),
            'project_name': 'Планирование бюджета 2026',
            'owner_email': 'executor2@finance.local',
        },
        {
            'title': 'Проверить корректность центров затрат',
            'description': 'Верифицировать распределение центров затрат по подразделениям.',
            'priority': 3,
            'status': 'in_progress',
            'deadline': now + timedelta(days=6),
            'project_name': 'Планирование бюджета 2026',
            'owner_email': 'executor5@finance.local',
        },
        {
            'title': 'Подготовить шаблон ежемесячного отчета',
            'description': 'Создать унифицированный шаблон отчета для руководителей отделов.',
            'priority': 2,
            'status': 'pending',
            'deadline': now + timedelta(days=9),
            'project_name': 'Цифровая трансформация',
            'owner_email': 'executor6@finance.local',
        },
    ]

    existing_task_keys = {(task.title, task.project_id) for task in db.query(models.Task).all()}

    for candidate in demo_tasks:
        project = projects_by_name.get(candidate['project_name'])
        owner = users_by_email.get(candidate['owner_email'])
        if not project or not owner:
            continue

        unique_key = (candidate['title'], project.id)
        if unique_key in existing_task_keys:
            continue

        db.add(
            models.Task(
                title=candidate['title'],
                description=candidate['description'],
                priority=candidate['priority'],
                status=candidate['status'],
                task_type='manager_assigned',
                deadline=candidate['deadline'],
                project_id=project.id,
                owner_id=owner.id,
                created_by_id=owner.manager_id or owner.id,
                daily_approved_once=False,
            )
        )
        existing_task_keys.add(unique_key)

    # +70 tasks (idempotent by generated (title, project_id))
    all_projects = list(db.query(models.Project).all())
    all_executors = (
        db.query(models.User)
        .join(models.Role)
        .filter(models.Role.name == ROLE_EXECUTOR)
        .all()
    )

    executor_fallback = users_by_email.get('executor1@finance.local')
    if not executor_fallback:
        executor_fallback = next(iter(users_by_email.values()), None)

    if all_projects and all_executors:
        statuses_cycle = ['pending', 'in_progress', 'in_review', 'completed', 'overdue', 'pending', 'pending', 'in_progress']
        title_prefixes = [
            'Проверить корректность',
            'Подготовить отчет по',
            'Сверить данные по',
            'Проанализировать',
            'Сформировать рекомендации по',
            'Обновить шаблон',
            'Согласовать изменения',
            'Провести сверку',
            'Собрать информацию о',
            'Разработать план по',
        ]
        description_fragments = [
            'Нужно подготовить финальную версию с учетом актуальных вводных.',
            'Проверить допущения, источники данных и согласованность показателей.',
            'Собрать подтверждающие материалы и зафиксировать выводы.',
            'Уточнить расхождения, подготовить обоснование и предложить вариант решения.',
            'Сделать сводку по рискам и ожидаемым эффектам.',
        ]

        task_count_target = 70
        created = 0
        for i in range(1, task_count_target + 1):
            project = all_projects[(i - 1) % len(all_projects)]
            owner = all_executors[(i - 1) % len(all_executors)]

            task_type: str = 'daily' if i % 6 == 0 else 'manager_assigned'
            daily_approved_once = task_type == 'daily' and i % 12 == 0

            status = statuses_cycle[(i - 1) % len(statuses_cycle)]
            if task_type == 'daily':
                # Ensure daily tasks are mostly in "waiting for manager approval"
                if not daily_approved_once and status not in {'pending', 'overdue', 'in_progress'}:
                    status = 'pending'
                if daily_approved_once and status == 'overdue':
                    status = 'pending'
            else:
                # Keep manager tasks from being always completed
                if status == 'pending' and i % 5 == 0:
                    status = 'in_progress'

            priority = 1 + ((i * 37) % 5)

            deadline_delta_days = ((i * 11) % 45) - 10
            deadline = now + timedelta(days=deadline_delta_days)

            title = f"{title_prefixes[(i - 1) % len(title_prefixes)]} #{i} — {project.name}"
            description = f"{description_fragments[(i - 1) % len(description_fragments)]} Проект: {project.name}."

            unique_key = (title, project.id)
            if unique_key in existing_task_keys:
                continue

            db.add(
                models.Task(
                    title=title,
                    description=description,
                    priority=priority,
                    status=status,
                    task_type=task_type,
                    deadline=deadline,
                    project_id=project.id,
                    owner_id=owner.id,
                    created_by_id=owner.manager_id or owner.id,
                    daily_approved_once=daily_approved_once,
                )
            )
            existing_task_keys.add(unique_key)
            created += 1

        # If for some reason we skipped a lot due to duplicates, we still want to commit others.
        # Note: deterministic titles should prevent duplicates for a fresh DB.
        if created > 0:
            db.commit()
    else:
        db.commit()

    # Ensure workflow definition exists and seed a subset of workflows for agreements UI
    definition = (
        db.query(models.ProcessDefinition)
        .filter(models.ProcessDefinition.published.is_(True))
        .order_by(models.ProcessDefinition.version.desc(), models.ProcessDefinition.id.desc())
        .first()
    )

    if definition is None:
        db.add(
            models.ProcessDefinition(
                name='Базовый маршрут согласования',
                version=1,
                published=True,
                definition={
                    'start_node': 'start',
                    'nodes': [
                        {'node_id': 'start', 'node_type': 'start', 'label': 'Старт', 'config': {}},
                        {
                            'node_id': 'approval-1',
                            'node_type': 'approval',
                            'label': 'Согласование менеджера',
                            'config': {'role_required': ROLE_MANAGER},
                        },
                        {
                            'node_id': 'approval-2',
                            'node_type': 'approval',
                            'label': 'Согласование руководителя отдела',
                            'config': {'role_required': ROLE_DEPARTMENT_HEAD},
                        },
                        {'node_id': 'end', 'node_type': 'end', 'label': 'Финиш', 'config': {}},
                    ],
                    'transitions': [
                        {'source_node': 'start', 'target_node': 'approval-1', 'condition': {}, 'priority': 0},
                        {'source_node': 'approval-1', 'target_node': 'approval-2', 'condition': {}, 'priority': 0},
                        {'source_node': 'approval-2', 'target_node': 'end', 'condition': {}, 'priority': 0},
                    ],
                },
            )
        )
        db.commit()

        definition = (
            db.query(models.ProcessDefinition)
            .filter(models.ProcessDefinition.published.is_(True))
            .order_by(models.ProcessDefinition.version.desc(), models.ProcessDefinition.id.desc())
            .first()
        )

    if definition is not None:
        # Create pending approvals for a subset of manager_assigned tasks
        manager_tasks = (
            db.query(models.Task)
            .filter(
                models.Task.task_type == 'manager_assigned',
                models.Task.status != 'completed',
                models.Task.status != 'archived',
            )
            .order_by(models.Task.id.asc())
            .limit(14)
            .all()
        )

        for task in manager_tasks:
            existing_instance = db.query(models.ProcessInstance).filter(models.ProcessInstance.task_id == task.id).first()
            if existing_instance:
                continue
            workflow_service.start_or_restart_workflow(db, task, definition.id)
