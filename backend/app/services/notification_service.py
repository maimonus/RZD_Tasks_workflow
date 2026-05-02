from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models


@dataclass(frozen=True)
class NotificationEvent:
    kind: str
    event_key: str
    title: str
    message: str
    task_id: Optional[int]


class NotificationService:
    def create_notification(
        self,
        db: Session,
        *,
        user_id: int,
        event: NotificationEvent,
        now: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        now = now or datetime.utcnow()

        existing = (
            db.query(models.Notification)
            .filter(
                models.Notification.user_id == user_id,
                models.Notification.kind == event.kind,
                models.Notification.event_key == event.event_key,
            )
            .first()
        )
        if existing:
            return None

        notification = models.Notification(
            user_id=user_id,
            kind=event.kind,
            task_id=event.task_id,
            title=event.title,
            message=event.message,
            event_key=event.event_key,
            created_at=now,
        )
        db.add(notification)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return None

        db.refresh(notification)
        return notification

    def list_user_notifications(self, db: Session, current_user: models.User) -> list[models.Notification]:
        return (
            db.query(models.Notification)
            .filter(models.Notification.user_id == current_user.id)
            .order_by(models.Notification.read_at.is_(None).desc(), models.Notification.created_at.desc())
            .all()
        )

    def unread_count(self, db: Session, current_user: models.User) -> int:
        return (
            db.query(models.Notification)
            .filter(models.Notification.user_id == current_user.id, models.Notification.read_at.is_(None))
            .count()
        )

    def mark_notification_read(
        self,
        db: Session,
        *,
        current_user: models.User,
        notification_id: int,
        read_at: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        read_at = read_at or datetime.utcnow()

        notification = (
            db.query(models.Notification)
            .filter(
                models.Notification.user_id == current_user.id,
                models.Notification.id == notification_id,
            )
            .first()
        )
        if not notification:
            return None

        if notification.read_at is None:
            notification.read_at = read_at
            db.add(notification)
            db.commit()
            db.refresh(notification)
        return notification

    def mark_all_user_notifications_read(
        self,
        db: Session,
        *,
        current_user: models.User,
        read_at: Optional[datetime] = None,
    ) -> int:
        read_at = read_at or datetime.utcnow()

        notifications = (
            db.query(models.Notification)
            .filter(models.Notification.user_id == current_user.id, models.Notification.read_at.is_(None))
            .all()
        )
        if not notifications:
            return 0

        for notification in notifications:
            notification.read_at = read_at
            db.add(notification)

        db.commit()
        return len(notifications)

    def mark_task_notifications_read(
        self,
        db: Session,
        *,
        current_user: models.User,
        task_id: int,
        read_at: Optional[datetime] = None,
    ) -> int:
        read_at = read_at or datetime.utcnow()

        notifications = (
            db.query(models.Notification)
            .filter(
                models.Notification.user_id == current_user.id,
                models.Notification.task_id == task_id,
                models.Notification.kind == "task_status_changed",
                models.Notification.read_at.is_(None),
            )
            .all()
        )
        if not notifications:
            return 0

        for notification in notifications:
            notification.read_at = read_at
            db.add(notification)

        db.commit()
        return len(notifications)

    def notify_task_accept_needed(
        self,
        db: Session,
        *,
        task: models.Task,
        now: Optional[datetime] = None,
        receiver_user_ids_override: Optional[list[int]] = None,
    ) -> Optional[models.Notification]:
        """
        Уведомляем о необходимости принять задачу:
        - назначенному ответственному (task.owner_id)
        - всем выбранным помощникам (task.assistants_user_ids)

        receiver_user_ids_override позволяет уведомлять только конкретных пользователей
        (нужно для ensure_user_notifications, чтобы не создавать уведомления другим людям).
        """
        now = now or datetime.utcnow()

        if task.task_type != "manager_assigned":
            return None

        if task.status not in {"pending", "overdue"}:
            return None

        event_key = f"task_accept_needed:{task.id}:{task.status}"
        title = "Нужно принять задачу"
        message = (
            f'Выполните действие: примите задачу «{task.title}».'
            if task.status == "pending"
            else f'Задача просрочена — примите задачу «{task.title}».'
        )

        if receiver_user_ids_override is not None:
            receiver_user_ids = [uid for uid in receiver_user_ids_override if uid is not None]
        else:
            receiver_user_ids = [task.owner_id]
            for user_id in getattr(task, "assistants_user_ids", []) or []:
                if user_id is None:
                    continue
                if user_id == task.owner_id:
                    continue
                receiver_user_ids.append(user_id)

        created_any: Optional[models.Notification] = None
        for receiver_id in receiver_user_ids:
            notification = self.create_notification(
                db,
                user_id=receiver_id,
                event=NotificationEvent(
                    kind="task_status_changed",
                    event_key=event_key,
                    task_id=task.id,
                    title=title,
                    message=message,
                ),
                now=now,
            )
            if notification is not None and created_any is None:
                created_any = notification

        return created_any

    def notify_deadline_soon(
        self,
        db: Session,
        *,
        task: models.Task,
        within_hours: int,
        now: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        now = now or datetime.utcnow()
        if not task.deadline:
            return None

        if task.status in {"completed", "archived"}:
            return None

        delta = task.deadline - now
        total_seconds = delta.total_seconds()
        if not (0 < total_seconds <= within_hours * 3600):
            return None

        deadline_ts = int(task.deadline.timestamp())
        event_key = f"deadline_soon:{task.id}:{deadline_ts}"
        return self.create_notification(
            db,
            user_id=task.owner_id,
            event=NotificationEvent(
                kind="deadline_soon",
                event_key=event_key,
                task_id=task.id,
                title="Скоро дедлайн задачи",
                message=f'До дедлайна по задаче «{task.title}» осталось меньше {within_hours} часов.',
            ),
            now=now,
        )

    def notify_deadline_overdue(
        self,
        db: Session,
        *,
        task: models.Task,
        now: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        now = now or datetime.utcnow()
        if not task.deadline:
            return None

        event_key = f"deadline_overdue:{task.id}:{int(task.deadline.timestamp())}"
        return self.create_notification(
            db,
            user_id=task.owner_id,
            event=NotificationEvent(
                kind="deadline_overdue",
                event_key=event_key,
                task_id=task.id,
                title="Срок выполнения подошёл",
                message=f'Задача «{task.title}» просрочена. Проверьте статус и приоритет.',
            ),
            now=now,
        )

    def notify_deadlines_soon_job(
        self,
        db: Session,
        *,
        within_hours: int = 24,
        now: Optional[datetime] = None,
    ) -> int:
        now = now or datetime.utcnow()

        created = 0
        tasks = db.query(models.Task).all()
        for task in tasks:
            notification = self.notify_deadline_soon(
                db,
                task=task,
                within_hours=within_hours,
                now=now,
            )
            if notification is not None:
                created += 1

        return created

    def notify_deadline_overdue_job(
        self,
        db: Session,
        *,
        now: Optional[datetime] = None,
    ) -> int:
        now = now or datetime.utcnow()

        created = 0
        tasks = db.query(models.Task).all()
        for task in tasks:
            if not task.deadline:
                continue

            # Avoid generating overdue notifications for tasks already completed/archived.
            if task.status in {"completed", "archived"}:
                continue

            # Create only when overdue (deadline passed).
            if task.deadline <= now:
                notification = self.notify_deadline_overdue(db, task=task, now=now)
                if notification is not None:
                    created += 1

        return created

    def notify_approval_completed_for_owner(
        self,
        db: Session,
        *,
        task: models.Task,
        instance_id: int,
        approval_id: int,
        now: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        now = now or datetime.utcnow()
        event_key = f"approval_resolved:completed:{task.id}:{instance_id}:{approval_id}"

        return self.create_notification(
            db,
            user_id=task.owner_id,
            event=NotificationEvent(
                kind="approval_resolved",
                event_key=event_key,
                task_id=task.id,
                title="Задача согласована",
                message=f'Согласование выполнено. Задача «{task.title}» завершена.',
            ),
            now=now,
        )

    def notify_approval_rejected_for_owner(
        self,
        db: Session,
        *,
        task: models.Task,
        instance_id: int,
        approval_id: int,
        now: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        now = now or datetime.utcnow()
        event_key = f"approval_resolved:rejected:{task.id}:{instance_id}:{approval_id}"

        return self.create_notification(
            db,
            user_id=task.owner_id,
            event=NotificationEvent(
                kind="approval_resolved",
                event_key=event_key,
                task_id=task.id,
                title="Согласование отклонено",
                message=f'Задача «{task.title}» отклонена на этапе согласования. Вернитесь к выполнению.',
            ),
            now=now,
        )

    def notify_approval_pending_for_approvers(
        self,
        db: Session,
        *,
        task: models.Task,
        instance_id: int,
        approval_id: int,
        assigned_user_id: int | None,
        assigned_role: str,
        now: Optional[datetime] = None,
    ) -> int:
        """
        Уведомляем тех, кому назначено согласование.
        - если assigned_user_id известен — шлём ровно ему
        - если нет — шлём всем пользователям с ролью assigned_role (редкий fallback)
        """
        now = now or datetime.utcnow()
        event_key = f"approval_pending:{task.id}:{instance_id}:{approval_id}"

        receiver_user_ids: list[int] = []
        if assigned_user_id is not None:
            receiver_user_ids = [assigned_user_id]
        else:
            # fallback: notify all users by role name
            receiver_user_ids = [
                u.id
                for u in db.query(models.User).join(models.Role).filter(models.Role.name == assigned_role).all()
            ]

        if not receiver_user_ids:
            return 0

        created = 0
        for user_id in receiver_user_ids:
            notification = self.create_notification(
                db,
                user_id=user_id,
                event=NotificationEvent(
                    kind="approval_pending",
                    event_key=event_key,
                    task_id=task.id,
                    title="Новое согласование задачи",
                    message=f'Вам поступило согласование по задаче «{task.title}».',
                ),
                now=now,
            )
            if notification is not None:
                created += 1

        return created

    def notify_task_accepted_for_creator(
        self,
        db: Session,
        *,
        task: models.Task,
        accepted_by_user_id: int,
        accepted_by_name: str,
        now: Optional[datetime] = None,
    ) -> Optional[models.Notification]:
        """
        Исполнитель принял задачу (через /tasks/{id}/accept).
        Уведомляем того, кто создал задачу (task.created_by_id).
        """
        now = now or datetime.utcnow()

        creator_id = task.created_by_id
        if not creator_id or creator_id == accepted_by_user_id:
            return None

        event_key = f"task_accepted:{task.id}:{creator_id}:{accepted_by_user_id}"
        return self.create_notification(
            db,
            user_id=creator_id,
            event=NotificationEvent(
                kind="task_accepted",
                event_key=event_key,
                task_id=task.id,
                title="Задача принята исполнителем",
                message=f'Исполнитель «{accepted_by_name}» принял задачу «{task.title}».',
            ),
            now=now,
        )

    def ensure_user_notifications(self, db: Session, current_user: models.User, *, now: Optional[datetime] = None) -> None:
        """
        Дозаполняет таблицу notifications недостающими записями на основе текущего состояния:
        - accept-needed для manager_assigned задач (pending/overdue)
        - дедлайны (soon/overdue)
        - ежедневные согласования (daily_approved_once)
        - approval_pending для pending approval задач, видимых текущему пользователю
        - approval_resolved для уже resolved approval задач владельца task

        Важно: task_accepted восстановить корректно нельзя без данных "кто именно принял"
        (они хранятся только в event_key при создании уведомления), поэтому catch-up для task_accepted не делаем.
        """
        now = now or datetime.utcnow()

        # tasks owned by current_user (ответственный)
        tasks = db.query(models.Task).filter(models.Task.owner_id == current_user.id).all()
        for task in tasks:
            self.notify_task_accept_needed(
                db,
                task=task,
                now=now,
                receiver_user_ids_override=[current_user.id],
            )

            # deadlines (как и раньше — только владельцу/ответственному)
            self.notify_deadline_soon(db, task=task, within_hours=24, now=now)
            self.notify_deadline_overdue(db, task=task, now=now)

            # daily approval (once)
            if task.task_type == "daily" and task.daily_approved_once:
                daily_event_key = f"daily_approved:{task.id}"
                self.create_notification(
                    db,
                    user_id=task.owner_id,
                    event=NotificationEvent(
                        kind="daily_approved",
                        event_key=daily_event_key,
                        task_id=task.id,
                        title="Ежедневная задача согласована",
                        message=f'Руководитель согласовал ежедневную задачу «{task.title}».',
                    ),
                    now=now,
                )

        # tasks where current_user is an assistant
        # NOTE: JSON array containment operators can differ by DB/driver; use safe python filtering.
        all_tasks = db.query(models.Task).all()
        assistant_tasks = [task for task in all_tasks if current_user.id in (task.assistants_user_ids or [])]
        for task in assistant_tasks:
            self.notify_task_accept_needed(
                db,
                task=task,
                now=now,
                receiver_user_ids_override=[current_user.id],
            )

        # task_accepted for creator:
        # Если manager_assigned задача находится в работе, значит её принял текущий owner_id.
        # Это позволяет восстановить accepted_by_user_id = task.owner_id.
        created_tasks_in_progress = (
            db.query(models.Task)
            .filter(models.Task.created_by_id == current_user.id)
            .filter(models.Task.task_type == "manager_assigned")
            .filter(models.Task.status == "in_progress")
            .all()
        )
        for task in created_tasks_in_progress:
            accepted_by_user_id = task.owner_id
            if not accepted_by_user_id or accepted_by_user_id == current_user.id:
                continue

            event_key = f"task_accepted:{task.id}:{current_user.id}:{accepted_by_user_id}"
            accepted_by_name = task.owner.full_name if task.owner else ""
            self.create_notification(
                db,
                user_id=current_user.id,
                event=NotificationEvent(
                    kind="task_accepted",
                    event_key=event_key,
                    task_id=task.id,
                    title="Задача принята исполнителем",
                    message=f'Исполнитель «{accepted_by_name}» принял задачу «{task.title}».',
                ),
                now=now,
            )

        # approvals pending (видимая часть для текущего пользователя)
        pending_approvals = (
            db.query(models.ApprovalTask)
            .filter(models.ApprovalTask.status == "pending")
            .filter(
                (models.ApprovalTask.assigned_user_id == current_user.id)
                | (
                    models.ApprovalTask.assigned_user_id.is_(None)
                    & (models.ApprovalTask.assigned_role == current_user.role.name)
                )
            )
            .all()
        )
        for approval in pending_approvals:
            instance = approval.instance
            if not instance:
                continue
            task = instance.task
            if not task:
                continue

            event_key = f"approval_pending:{task.id}:{approval.instance_id}:{approval.id}"
            self.create_notification(
                db,
                user_id=current_user.id,
                event=NotificationEvent(
                    kind="approval_pending",
                    event_key=event_key,
                    task_id=task.id,
                    title="Новое согласование задачи",
                    message=f'Вам поступило согласование по задаче «{task.title}».',
                ),
                now=now,
            )

        # approvals resolved (сообщаем владельцу task, т.е. owner_id)
        resolved_approvals = (
            db.query(models.ApprovalTask)
            .join(models.ProcessInstance, models.ProcessInstance.id == models.ApprovalTask.instance_id)
            .join(models.Task, models.Task.id == models.ProcessInstance.task_id)
            .filter(models.Task.owner_id == current_user.id)
            .filter(models.ApprovalTask.resolved_at.isnot(None))
            .filter(models.ApprovalTask.status.in_(("approved", "rejected")))
            .all()
        )
        for approval in resolved_approvals:
            # instance/task уже доступны из join; но используем отношения для title/task.id
            instance = approval.instance
            if not instance:
                continue
            task = instance.task
            if not task:
                continue

            if approval.status == "approved":
                event_key = f"approval_resolved:completed:{task.id}:{approval.instance_id}:{approval.id}"
                title = "Задача согласована"
                message = f'Согласование выполнено. Задача «{task.title}» завершена.'
            else:
                event_key = f"approval_resolved:rejected:{task.id}:{approval.instance_id}:{approval.id}"
                title = "Согласование отклонено"
                comment_part = f' Комментарий согласующего: «{approval.comment}».' if approval.comment and approval.comment.strip() else ''
                message = (
                    f'Задача «{task.title}» отклонена на этапе согласования. Вернитесь к выполнению.'
                    f'{comment_part}'
                )

            self.create_notification(
                db,
                user_id=current_user.id,
                event=NotificationEvent(
                    kind="approval_resolved",
                    event_key=event_key,
                    task_id=task.id,
                    title=title,
                    message=message,
                ),
                now=now,
            )


notification_service = NotificationService()
