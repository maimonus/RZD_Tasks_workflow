import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/api'
import type { PendingApproval, Project, Task, User, RoleName } from '../../types'
import { useAuth } from '../../store/authStore'
import { getApiErrorMessage } from '../../utils/apiError'
import { taskStatusLabel, taskTypeLabel } from '../../utils/labels'
import SearchableSelect from '../../components/SearchableSelect'
import { dateTimeLocalToIso, formatIsoDateTimeRu, isoToDateTimeLocal } from '../../utils/datetime'

const TASK_CREATOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead', 'Manager']
const TASK_STATUS_OPTIONS = ['pending', 'in_progress', 'in_review', 'completed', 'overdue', 'archived'] as const

const normalize = (value: string) => value.trim().toLowerCase()

const getFileUrl = (fileUrl?: string) => {
  if (!fileUrl) return null
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl

  const baseUrl =
    typeof api.defaults.baseURL === 'string' ? api.defaults.baseURL : window.location.origin
  return new URL(fileUrl, baseUrl).toString()
}

const Approvals = () => {
  const [searchParams] = useSearchParams()
  const taskIdParam = searchParams.get('task')
  const taskId =
    taskIdParam && Number.isFinite(Number(taskIdParam)) ? Number(taskIdParam) : null

  const { user } = useAuth()

  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)
  const [comments, setComments] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Modal deadline editing
  const [deadlineEdit, setDeadlineEdit] = useState('')
  const [updatingDeadlineId, setUpdatingDeadlineId] = useState<number | null>(null)

  const [titleQuery, setTitleQuery] = useState('')
  const [ownerFilterId, setOwnerFilterId] = useState<number | ''>('')
  const [projectFilterId, setProjectFilterId] = useState<number | ''>('')

  const visibleApprovals = useMemo(() => {
    const q = normalize(titleQuery)

    let list = approvals

    if (taskId !== null) {
      list = list.filter((a) => a.task.id === taskId)
    }

    if (q) {
      list = list.filter((a) => normalize(a.task.title).includes(q))
    }

    if (ownerFilterId !== '') {
      list = list.filter((a) => a.task.owner_id === ownerFilterId)
    }

    if (projectFilterId !== '') {
      list = list.filter((a) => (a.task.project_id ?? -1) === projectFilterId)
    }

    return list
  }, [approvals, ownerFilterId, projectFilterId, taskId, titleQuery])

  useEffect(() => {
    const loadApprovals = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [approvalsResponse, projectsResponse, usersResponse] = await Promise.all([
          api.get<PendingApproval[]>('/workflow/approvals'),
          api.get<Project[]>('/projects'),
          api.get<User[]>('/users'),
        ])
        setApprovals(approvalsResponse.data)
        setProjects(projectsResponse.data)
        setUsers(usersResponse.data)
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(
            getApiErrorMessage(
              caughtError.response?.data?.detail,
              'Не удалось загрузить согласования',
            ),
          )
        } else {
          setError('Не удалось загрузить согласования')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadApprovals()
  }, [])

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])

  const userNameById = useMemo(() => new Map(users.map((candidate) => [candidate.id, candidate.full_name])), [users])

  const canManageTasks = user ? TASK_CREATOR_ROLES.includes(user.role.name) : false
  const canUpdateTaskStatus = user ? canManageTasks || user.role.name === 'Executor' : false
  const canDeleteTask = canManageTasks

  const executorOptions = useMemo(() => {
    const map = new Map<number, string>()

    for (const approval of approvals) {
      const id = approval.task.owner_id
      const label = approval.task.owner?.full_name ?? 'Неизвестный пользователь'
      const existing = map.get(id)
      if (!existing || existing === 'Неизвестный пользователь') {
        map.set(id, label)
      }
    }

    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
      .map(([value, label]) => ({
        value,
        label,
        keywords: label,
      }))
  }, [approvals])

  const projectOptions = useMemo(() => {
    const base = projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((project) => ({
        value: project.id,
        label: project.name,
        keywords: project.name,
      }))

    return [{ value: -1, label: 'Без проекта', keywords: 'Без проекта' }, ...base]
  }, [projects])

  const openTaskCard = (task: Task) => {
    setSelectedTask(task)
    setActionError(null)
    setUpdatingTaskId(null)
    setDeletingTaskId(null)
  }

  const closeTaskCard = () => {
    setSelectedTask(null)
    setActionError(null)
    setUpdatingTaskId(null)
    setDeletingTaskId(null)
  }

  useEffect(() => {
    if (!selectedTask) {
      setDeadlineEdit('')
      return
    }

    setDeadlineEdit(isoToDateTimeLocal(selectedTask.deadline))
  }, [selectedTask?.id])

  const canUpdateDeadline = Boolean(selectedTask && user && canManageTasks)

  const handleUpdateTaskStatus = async (taskId: number, status: string) => {
    if (!canUpdateTaskStatus) return

    const current = selectedTask
    if (!current || current.id !== taskId) return

    if (current.status === status) return

    setUpdatingTaskId(taskId)
    setActionError(null)

    try {
      const { data } = await api.patch<Task>(`/tasks/${taskId}`, { status })
      setSelectedTask(data)
      setApprovals((currentApprovals) =>
        currentApprovals.map((a) => (a.task.id === data.id ? { ...a, task: data } : a)),
      )
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setActionError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось изменить статус задачи'))
      } else {
        setActionError('Не удалось изменить статус задачи')
      }
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleUpdateTaskDeadline = async (nextDeadlineEdit?: string) => {
    if (!selectedTask || !user) return
    if (!canUpdateDeadline) return
    if (updatingDeadlineId === selectedTask.id) return

    const valueToUse = nextDeadlineEdit ?? deadlineEdit
    const nextDeadlineIso = dateTimeLocalToIso(valueToUse)

    setUpdatingDeadlineId(selectedTask.id)
    setActionError(null)

    try {
      const { data } = await api.patch<Task>(`/tasks/${selectedTask.id}`, { deadline: nextDeadlineIso })
      setSelectedTask(data)
      setApprovals((currentApprovals) =>
        currentApprovals.map((a) => (a.task.id === data.id ? { ...a, task: data } : a)),
      )
      setDeadlineEdit(isoToDateTimeLocal(data.deadline))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setActionError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось изменить дедлайн'))
      } else {
        setActionError('Не удалось изменить дедлайн')
      }
    } finally {
      setUpdatingDeadlineId(null)
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    if (!canDeleteTask) return

    const confirmed = window.confirm('Удалить эту задачу?')
    if (!confirmed) return

    setDeletingTaskId(taskId)
    setActionError(null)

    try {
      await api.delete(`/tasks/${taskId}`)
      setApprovals((currentApprovals) => currentApprovals.filter((a) => a.task.id !== taskId))
      closeTaskCard()
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setActionError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось удалить задачу'))
      } else {
        setActionError('Не удалось удалить задачу')
      }
    } finally {
      setDeletingTaskId(null)
    }
  }

  const handleDecision = async (approval: PendingApproval, decision: 'approve' | 'reject') => {
    setActionLoadingId(approval.approval_id)
    setError(null)
    setSuccess(null)

    try {
      await api.post(`/workflow/${decision}/${approval.task.id}`, {
        comment: comments[approval.approval_id] || null,
      })

      setApprovals((current) => current.filter((item) => item.approval_id !== approval.approval_id))
      setComments((current) => {
        const next = { ...current }
        delete next[approval.approval_id]
        return next
      })
      setSuccess(decision === 'approve' ? 'Согласование выполнено' : 'Задача отправлена на доработку')
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось выполнить действие'))
      } else {
        setError('Не удалось выполнить действие')
      }
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#86141c,#b81f29_48%,#d22630_72%,#f3d9db_140%)] p-8 text-white shadow-lg"
      >
        <h1 className="text-2xl font-semibold">Согласования</h1>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Название задачи</span>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sky-400"
              placeholder="Например: Еженедельный отчет"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              type="text"
              aria-label="Фильтр по названию"
            />
          </label>

          <div className="min-w-0">
            <SearchableSelect
              label="Исполнитель"
              options={executorOptions}
              value={ownerFilterId}
              onChange={(value) => setOwnerFilterId(value)}
              placeholder="Выберите исполнителя"
            />
          </div>

          <div className="min-w-0">
            <SearchableSelect
              label="Проект"
              options={projectOptions}
              value={projectFilterId}
              onChange={(value) => setProjectFilterId(value)}
              placeholder="Выберите проект"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {isLoading ? (
          <div className="rounded-[2rem] bg-white p-6 text-sm text-slate-500 shadow-sm">
            Загружаем согласования...
          </div>
        ) : visibleApprovals.length === 0 ? (
          <div className="rounded-[2rem] bg-white p-6 text-sm text-slate-500 shadow-sm">
            У вас сейчас нет ожидающих согласований.
          </div>
        ) : (
          visibleApprovals.map((approval) => (
            <article
              key={approval.approval_id}
              className="rounded-[2rem] bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Этап согласования</p>
                  <button
                    type="button"
                    className="mt-2 text-left text-xl font-semibold text-slate-900 hover:underline"
                    onClick={() => openTaskCard(approval.task)}
                  >
                    {approval.task.title}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    {taskStatusLabel(approval.task.status)}
                  </span>

                  <button
                    type="button"
                    className={
                      approval.task.status === 'overdue'
                        ? 'rounded-2xl bg-[#8f1018] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#8f1018]/90'
                        : 'rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500'
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      openTaskCard(approval.task)
                    }}
                  >
                    Открыть
                  </button>

                  {approval.task.task_type === 'daily' ? (
                    <span className="rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800">
                      {approval.task.daily_approved_once ? 'Ежедневная' : 'Единоразовое'}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Исполнитель</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {approval.task.owner?.full_name ?? 'Неизвестный пользователь'}
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Проект</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {projectNameById.get(approval.task.project_id ?? -1) ?? 'Без проекта'}
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Срок</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {formatIsoDateTimeRu(approval.task.deadline)}
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Отчеты</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{approval.task.reports.length}</p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Создано</p>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {new Date(approval.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Последний отчет исполнителя</h3>
                {approval.task.reports.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-slate-600">
                      {approval.task.reports[0].comment || 'Комментарий к отчету не добавлен.'}
                    </p>
                    {approval.task.reports[0].original_filename && approval.task.reports[0].file_url ? (
                      <a
                        className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        href={new URL(
                          approval.task.reports[0].file_url!,
                          api.defaults.baseURL
                        ).toString()}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Скачать {approval.task.reports[0].original_filename}
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Отчетов пока нет.</p>
                )}
              </div>

              <label className="mt-5 block space-y-2">
                <span className="text-sm font-medium text-slate-700">Комментарий согласующего</span>
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  onChange={(event) =>
                    setComments((current) => ({
                      ...current,
                      [approval.approval_id]: event.target.value,
                    }))
                  }
                  placeholder="Добавьте замечания или подтверждение решения"
                  value={comments[approval.approval_id] ?? ''}
                />
              </label>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  disabled={actionLoadingId === approval.approval_id}
                  onClick={() => {
                    void handleDecision(approval, 'approve')
                  }}
                  type="button"
                >
                  {actionLoadingId === approval.approval_id ? 'Обрабатываем...' : 'Согласовать'}
                </button>
                <button
                  className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                  disabled={actionLoadingId === approval.approval_id}
                  onClick={() => {
                    void handleDecision(approval, 'reject')
                  }}
                  type="button"
                >
                  {actionLoadingId === approval.approval_id ? 'Обрабатываем...' : 'Отклонить'}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      {selectedTask ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={closeTaskCard}
        >
          <div
            className="w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Карточка задачи</p>
                <h3 className="mt-2 text-3xl font-semibold text-slate-900">{selectedTask.title}</h3>

                {selectedTask.description ? (
                  <p className="mt-3 text-sm leading-6 text-slate-500">{selectedTask.description}</p>
                ) : null}

                {selectedTask.project_id ? (
                  <Link
                    className="mt-3 inline-flex rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    onClick={closeTaskCard}
                    to={`/projects/${selectedTask.project_id}`}
                  >
                    Перейти к проекту
                  </Link>
                ) : null}
              </div>

              <button
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={closeTaskCard}
                type="button"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Статус</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{taskStatusLabel(selectedTask.status)}</p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Категория</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{taskTypeLabel(selectedTask.task_type)}</p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Исполнитель</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {selectedTask.owner?.full_name ?? userNameById.get(selectedTask.owner_id) ?? 'Неизвестный пользователь'}
                </p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Срок</p>

                {canUpdateDeadline ? (
                  <div className="mt-3 space-y-2">
                      <input
                        className="w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-2 py-2 text-xs outline-none transition focus:border-sky-400"
                        type="datetime-local"
                        value={deadlineEdit}
                        onChange={(event) => setDeadlineEdit(event.target.value)}
                        disabled={updatingDeadlineId === selectedTask.id}
                      />

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={updatingDeadlineId === selectedTask.id}
                        onClick={() => {
                          void handleUpdateTaskDeadline()
                        }}
                        type="button"
                        title="Сохранить дедлайн"
                      >
                        {updatingDeadlineId === selectedTask.id ? 'Сохраняем...' : 'Сохранить'}
                      </button>

                      <button
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={updatingDeadlineId === selectedTask.id}
                        onClick={() => {
                          void handleUpdateTaskDeadline('')
                        }}
                        type="button"
                        title="Убрать дедлайн"
                      >
                        Без дедлайна
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-700">
                    {formatIsoDateTimeRu(selectedTask.deadline)}
                  </p>
                )}
              </div>
            </div>

            {canUpdateTaskStatus ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                  disabled={updatingTaskId === selectedTask.id}
                  onChange={(event) => {
                    void handleUpdateTaskStatus(selectedTask.id, event.target.value)
                  }}
                  value={selectedTask.status}
                >
                  {TASK_STATUS_OPTIONS.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {taskStatusLabel(statusOption)}
                    </option>
                  ))}
                </select>

                {canDeleteTask ? (
                  <button
                    className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={deletingTaskId === selectedTask.id}
                    onClick={() => {
                      void handleDeleteTask(selectedTask.id)
                    }}
                    type="button"
                  >
                    {deletingTaskId === selectedTask.id ? 'Удаляем задачу...' : 'Удалить задачу'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {actionError ? (
              <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div>
            ) : null}

            <section className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-2">
                <h4 className="text-xl font-semibold text-slate-900">Отчет по выполнению</h4>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-lg font-semibold text-slate-900">История отчетов</h5>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                    {selectedTask.reports.length}
                  </span>
                </div>

                {selectedTask.reports.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                    Отчетов по этой задаче пока нет.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedTask.reports.map((report) => (
                      <article key={report.id} className="rounded-3xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {report.author?.full_name ?? userNameById.get(report.author_id) ?? 'Неизвестный пользователь'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{new Date(report.created_at).toLocaleString('ru-RU')}</p>
                          </div>

                          {report.original_filename && report.file_url ? (
                            <a
                              className="inline-flex rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              href={getFileUrl(report.file_url) ?? undefined}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Скачать {report.original_filename}
                            </a>
                          ) : null}
                        </div>

                        {report.comment ? (
                          <p className="mt-4 text-sm leading-6 text-slate-600">{report.comment}</p>
                        ) : (
                          <p className="mt-4 text-sm text-slate-400">Комментарий не добавлен.</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Approvals
