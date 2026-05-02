import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

import api from '../../api/api'
import type { Notification, Task, NotificationKind } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { taskStatusLabel, taskTypeLabel } from '../../utils/labels'
import { formatIsoDateTimeRu } from '../../utils/datetime'

type TaskModalState =
  | { open: false }
  | {
      open: true
      taskId: number
      approvalResolvedTitle?: string
      approvalResolvedMessage?: string
    }

const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  deadline_soon: 'Дедлайн скоро',
  deadline_overdue: 'Дедлайн просрочен',
  approval_pending: 'Ожидает согласования',
  approval_resolved: 'Согласование завершено',
  daily_approved: 'Ежедневная задача согласована',
  task_status_changed: 'Изменение статуса задачи',
  task_accepted: 'Задача принята исполнителем',
}

const NOTIFICATION_KIND_BADGE_CLASSES: Partial<Record<NotificationKind, string>> = {
  deadline_soon: 'bg-rose-100 text-rose-800',
  deadline_overdue: 'bg-rose-200 text-rose-900',
  approval_pending: 'bg-amber-100 text-amber-900',
  approval_resolved: 'bg-emerald-100 text-emerald-900',
  daily_approved: 'bg-emerald-100 text-emerald-900',
  task_status_changed: 'bg-sky-100 text-sky-900',
  task_accepted: 'bg-emerald-100 text-emerald-900',
}

const Notifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [markAllLoading, setMarkAllLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const [taskModal, setTaskModal] = useState<TaskModalState>({ open: false })
  const [taskModalLoading, setTaskModalLoading] = useState(false)
  const [taskModalError, setTaskModalError] = useState<string | null>(null)
  const [taskModalTask, setTaskModalTask] = useState<Task | null>(null)

  const [taskModalAcceptLoading, setTaskModalAcceptLoading] = useState(false)
  const [taskModalAcceptError, setTaskModalAcceptError] = useState<string | null>(null)
  const [taskModalAcceptSuccess, setTaskModalAcceptSuccess] = useState<string | null>(null)

  type NotificationCategory = 'all' | 'accepted' | 'approval' | 'required' | 'overdue' | 'other'

  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all')

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications])

  const isAcceptNeededNotification = (notification: Notification) =>
    notification.kind === 'task_status_changed' &&
    notification.title === 'Нужно принять задачу' &&
    typeof notification.task_id === 'number'

  const getNotificationCategory = (notification: Notification): NotificationCategory => {
    // Принято
    if (notification.kind === 'task_accepted') return 'accepted'

    // По согласованию (результат)
    if (notification.kind === 'approval_resolved') return 'approval'

    // Просрочки по дедлайнам
    if (notification.kind === 'deadline_overdue') return 'overdue'

    // Для изменения статуса задачи backend использует pending/overdue,
    // а различие видно из текста сообщения.
    if (notification.kind === 'task_status_changed') {
      const title = notification.title.toLowerCase()
      const message = notification.message.toLowerCase()

      if (message.includes('просроч')) return 'overdue'
      if (title.includes('нужно')) return 'required'
    }

    // Ожидает согласования / нужно выполнить действие
    if (notification.kind === 'approval_pending') return 'required'
    if (isAcceptNeededNotification(notification)) return 'required'

    return 'other'
  }

  const filteredNotifications = useMemo(() => {
    if (selectedCategory === 'all') return notifications
    return notifications.filter((n) => getNotificationCategory(n) === selectedCategory)
  }, [notifications, selectedCategory])

  const acceptNeededForModalTask = useMemo(() => {
    if (!taskModal.open) return false
    const taskId = taskModal.taskId
    return notifications.some((n) => isAcceptNeededNotification(n) && n.task_id === taskId && !n.read_at)
  }, [notifications, taskModal])

  const isApprovalPendingNotification = (notification: Notification) =>
    notification.kind === 'approval_pending' && typeof notification.task_id === 'number'

  const refreshNotifications = async () => {
    const { data } = await api.get<Notification[]>('/notifications')
    setNotifications(data)
  }

  const openTaskInModal = async (taskId: number) => {
    setTaskModalLoading(true)
    setTaskModalError(null)
    setTaskModalTask(null)

    setTaskModalAcceptLoading(false)
    setTaskModalAcceptError(null)
    setTaskModalAcceptSuccess(null)

    try {
      const { data } = await api.get<Task>(`/tasks/${taskId}`)
      setTaskModalTask(data)
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setTaskModalError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось загрузить задачу'))
      } else {
        setTaskModalError('Не удалось загрузить задачу')
      }
    } finally {
      setTaskModalLoading(false)
    }
  }

  useEffect(() => {
    const taskId = taskModal.open ? taskModal.taskId : null
    if (!taskId) return
    void openTaskInModal(taskId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskModal.open, taskModal.open ? taskModal.taskId : null])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      try {
        await refreshNotifications()
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось загрузить уведомления'))
        } else {
          setError('Не удалось загрузить уведомления')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMarkRead = async (notificationId: number) => {
    const { data } = await api.post<Notification>(`/notifications/${notificationId}/read`, {})
    setNotifications((current) => current.map((n) => (n.id === data.id ? data : n)))
    window.dispatchEvent(new Event('notifications:changed'))
    return data
  }

  const handleOpenNotification = async (notification: Notification) => {
    setActionLoading(notification.id)
    setError(null)
    setSuccess(null)

    try {
      const acceptNeeded = isAcceptNeededNotification(notification)

      // Не помечаем accept-needed уведомления как прочитанные при клике карточки:
      // пользователь должен подтвердить действие кнопкой "Принять".
      if (!acceptNeeded && !notification.read_at) {
        await handleMarkRead(notification.id)
      }

      if (typeof notification.task_id === 'number') {
        const isRejectedApproval =
          notification.kind === 'approval_resolved' && notification.title === 'Согласование отклонено'

        setTaskModal({
          open: true,
          taskId: notification.task_id,
          approvalResolvedTitle: isRejectedApproval ? notification.title : undefined,
          approvalResolvedMessage: isRejectedApproval ? notification.message : undefined,
        })
      }
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось открыть уведомление'))
      } else {
        setError('Не удалось открыть уведомление')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const handleAcceptFromNotification = async (notification: Notification) => {
    if (!isAcceptNeededNotification(notification)) return
    if (typeof notification.task_id !== 'number') return

    const taskId = notification.task_id

    setActionLoading(notification.id)
    setError(null)
    setSuccess(null)

    try {
      await api.post(`/tasks/${taskId}/accept`, {})
      await refreshNotifications()
      setSuccess('Задача принята')
      window.dispatchEvent(new Event('notifications:changed'))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось принять задачу'))
      } else {
        setError('Не удалось принять задачу')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const handleAcceptFromTaskModal = async () => {
    if (!taskModal.open) return
    if (!acceptNeededForModalTask) return

    const taskId = taskModal.taskId

    setTaskModalAcceptLoading(true)
    setTaskModalAcceptError(null)
    setTaskModalAcceptSuccess(null)

    try {
      await api.post(`/tasks/${taskId}/accept`, {})
      await refreshNotifications()
      setTaskModalAcceptSuccess('Задача принята')

      window.dispatchEvent(new Event('notifications:changed'))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setTaskModalAcceptError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось принять задачу'))
      } else {
        setTaskModalAcceptError('Не удалось принять задачу')
      }
    } finally {
      setTaskModalAcceptLoading(false)
    }
  }

  const handleMarkAllRead = async () => {
    setMarkAllLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await api.post('/notifications/read-all')
      setNotifications((current) => current.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
      setSuccess('Все уведомления отмечены как прочитанные')
      window.dispatchEvent(new Event('notifications:changed'))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось отметить прочитанными'))
      } else {
        setError('Не удалось отметить прочитанными')
      }
    } finally {
      setMarkAllLoading(false)
    }
  }

  const closeTaskModal = () => {
    setTaskModal({ open: false })
    setTaskModalLoading(false)
    setTaskModalError(null)
    setTaskModalTask(null)

    setTaskModalAcceptLoading(false)
    setTaskModalAcceptError(null)
    setTaskModalAcceptSuccess(null)
  }

  const deadlineColorClasses = (deadline?: string | null) => {
    if (!deadline) return 'text-slate-700'

    const d = new Date(deadline)
    if (Number.isNaN(d.getTime())) return 'text-slate-700'

    const diffMs = d.getTime() - Date.now()
    const diffHours = diffMs / (1000 * 60 * 60)

    // Backend отправляет deadline_soon в пределах 24 часов
    if (diffHours <= 0) return 'text-rose-900'
    if (diffHours <= 24) return 'text-rose-900'
    return 'text-slate-700'
  }

  const deadlineBadgeClasses = (deadline?: string | null) => {
    if (!deadline) return 'bg-slate-100 text-slate-700'

    const d = new Date(deadline)
    if (Number.isNaN(d.getTime())) return 'bg-slate-100 text-slate-700'

    const diffMs = d.getTime() - Date.now()
    const diffHours = diffMs / (1000 * 60 * 60)

    if (diffHours <= 0) return 'bg-rose-200 text-rose-900'
    if (diffHours <= 24) return 'bg-rose-100 text-rose-900'
    return 'bg-slate-100 text-slate-700'
  }

  if (isLoading) {
    return <div className="rounded-[2rem] bg-white p-8 text-sm text-slate-500 shadow-sm">Загружаем уведомления...</div>
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#86141c,#b81f29_48%,#d22630_72%,#f3d9db_140%)] p-8 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm uppercase tracking-[0.35em] text-sky-200">Уведомления</p>
              {unreadCount > 0 ? (
                <svg className="h-5 w-5 text-rose-200" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18 16V11.5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v1.18C7.64 5.86 6 8.42 6 11.5V16l-2 2h16l-2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </div>
            <h1 className="mt-3 font-serif text-4xl font-bold">Ваши события</h1>
            <p className="mt-2 text-sm text-white/80">{unreadCount} непрочитано</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategory === 'all' ? 'bg-white text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                onClick={() => setSelectedCategory('all')}
              >
                Все
              </button>

              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategory === 'accepted' ? 'bg-white text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                onClick={() => setSelectedCategory('accepted')}
              >
                Принято
              </button>

              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategory === 'approval' ? 'bg-white text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                onClick={() => setSelectedCategory('approval')}
              >
                Согласовано
              </button>

              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategory === 'required' ? 'bg-white text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                onClick={() => setSelectedCategory('required')}
              >
                Нужно / Ожидает
              </button>

              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategory === 'overdue' ? 'bg-white text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                onClick={() => setSelectedCategory('overdue')}
              >
                Просрочки
              </button>

              <button
                type="button"
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  selectedCategory === 'other' ? 'bg-white text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                onClick={() => setSelectedCategory('other')}
              >
                Прочее
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-200"
              disabled={markAllLoading || unreadCount === 0}
              onClick={() => {
                void handleMarkAllRead()
              }}
              type="button"
            >
              {markAllLoading ? 'Отмечаем...' : 'Прочитать все'}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {success ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div>
      ) : null}

      {filteredNotifications.length === 0 ? (
        <div className="rounded-[2rem] bg-white p-6 text-sm text-slate-500 shadow-sm">Уведомлений по выбранной категории пока нет.</div>
      ) : (
        <section className="space-y-3">
          {filteredNotifications.map((notification) => {
            const isUnread = !notification.read_at
            const isBusy = actionLoading === notification.id
            const acceptNeeded = isAcceptNeededNotification(notification)

            return (
              <div
                key={notification.id}
                role="button"
                tabIndex={0}
                className={`w-full rounded-[2rem] border p-6 text-left shadow-sm transition cursor-pointer ${
                  isUnread ? 'border-sky-200 bg-sky-50 hover:border-sky-300' : 'border-slate-200 bg-white hover:bg-slate-50'
                } ${isBusy ? 'opacity-70' : ''}`}
                onClick={() => {
                  if (isBusy) return
                  void handleOpenNotification(notification)
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  if (isBusy) return
                  void handleOpenNotification(notification)
                }}
                aria-disabled={isBusy}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          isUnread ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isUnread ? 'Новое' : 'Прочитано'}
                      </span>

                      {notification.kind ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                            NOTIFICATION_KIND_BADGE_CLASSES[notification.kind] ?? 'bg-white text-slate-700'
                          }`}
                        >
                          {NOTIFICATION_KIND_LABELS[notification.kind] ?? notification.kind}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-3 text-xl font-semibold text-slate-900">{notification.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{notification.message}</p>

                    {acceptNeeded ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void handleAcceptFromNotification(notification)
                          }}
                          type="button"
                        >
                          {isBusy ? 'Принимаем...' : 'Принять'}
                        </button>
                      </div>
                    ) : isApprovalPendingNotification(notification) ? (
                      <p className="mt-3 text-xs font-semibold text-slate-500">Открыть карточку задачи #{notification.task_id}</p>
                    ) : typeof notification.task_id === 'number' ? (
                      <p className="mt-3 text-xs font-semibold text-slate-500">Открыть карточку задачи #{notification.task_id}</p>
                    ) : null}
                  </div>

                  <div className="shrink-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {new Date(notification.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {taskModal.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => closeTaskModal()}
          role="dialog"
          aria-modal="true"
          aria-label="Карточка задачи"
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Карточка задачи</p>
                {taskModalLoading ? (
                  <div className="mt-2 text-2xl font-semibold text-slate-900">Загружаем...</div>
                ) : taskModalTask ? (
                  <>
                    <h3 className="mt-2 text-3xl font-semibold text-slate-900">{taskModalTask.title}</h3>
                    {taskModalTask.description ? (
                      <p className="mt-3 text-sm leading-6 text-slate-500">{taskModalTask.description}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <button
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={closeTaskModal}
                type="button"
                disabled={taskModalLoading}
              >
                Закрыть
              </button>
            </div>

            {taskModalError ? (
              <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{taskModalError}</div>
            ) : null}

            {taskModalTask && !taskModalError ? (
              <>
                {taskModal.approvalResolvedMessage && taskModal.open ? (
                  <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <div className="font-semibold">{taskModal.approvalResolvedTitle ?? 'Комментарий согласующего'}</div>
                    <div className="mt-1 leading-6">{taskModal.approvalResolvedMessage}</div>
                  </div>
                ) : null}

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Статус</p>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{taskStatusLabel(taskModalTask.status)}</p>
                  </div>

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Категория</p>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{taskTypeLabel(taskModalTask.task_type)}</p>
                  </div>

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Приоритет</p>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{taskModalTask.priority}</p>
                  </div>

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Срок</p>
                    <p className={`mt-3 text-sm font-semibold ${deadlineColorClasses(taskModalTask.deadline)}`}>
                      {formatIsoDateTimeRu(taskModalTask.deadline)}
                    </p>
                    {taskModalTask.deadline ? (
                      <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${deadlineBadgeClasses(taskModalTask.deadline)}`}>
                        {taskModalTask.status === 'overdue' ? 'Просрочено' : 'Дедлайн'}
                      </div>
                    ) : null}
                  </div>
                </div>

                {acceptNeededForModalTask ? (
                  <div className="mt-6 rounded-[2rem] bg-slate-50/70 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-emerald-900">Нужно принять задачу</div>

                      <div className="flex items-center gap-3">
                        {taskModalAcceptError ? (
                          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
                            {taskModalAcceptError}
                          </div>
                        ) : null}

                        {taskModalAcceptSuccess ? (
                          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                            {taskModalAcceptSuccess}
                          </div>
                        ) : null}

                        <button
                          className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                          disabled={taskModalAcceptLoading}
                          onClick={() => {
                            void handleAcceptFromTaskModal()
                          }}
                          type="button"
                        >
                          {taskModalAcceptLoading ? 'Принимаем...' : 'Принять'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Notifications
