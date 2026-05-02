import { useEffect, useMemo, useState, type DragEvent } from 'react'
import axios from 'axios'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api'
import { useAuth } from '../../store/authStore'
import type { Project, ProjectDetail, Role, RoleName, Task, User } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { projectStatusLabel, roleLabel, taskStatusLabel } from '../../utils/labels'
import SearchableSelect from '../../components/SearchableSelect'
import { dateTimeLocalToIso, formatIsoDateTimeRu, isoToDateTimeLocal } from '../../utils/datetime'

const PROJECT_EDITOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead']
const TASK_CREATOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead', 'Manager']
const PROJECT_STATUS_OPTIONS = ['active', 'archived'] as const
const PROJECT_TASK_STATUSES = ['pending', 'in_progress', 'in_review', 'completed', 'overdue'] as const
const TASK_STATUS_OPTIONS = ['pending', 'in_progress', 'in_review', 'completed', 'overdue', 'archived'] as const
const TASK_PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const

const TASK_PRIORITY_LABELS: Record<number, string> = {
  1: 'Низкий',
  2: 'Ниже среднего',
  3: 'Средний',
  4: 'Высокий',
  5: 'Критический',
}

const TASK_STATUS_STYLES: Record<string, string> = {
  pending: 'border-slate-200 bg-slate-50/90',
  in_progress: 'border-sky-200 bg-sky-50/90',
  in_review: 'border-amber-200 bg-amber-50/90',
  completed: 'border-emerald-200 bg-emerald-50/90',
  overdue: 'border-rose-200 bg-rose-50/90',
  archived: 'border-slate-300 bg-slate-100/90',
}

const ProjectDetailPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [rawError, setError] = useState<unknown>(null)
  const [rawUsersError, setUsersError] = useState<unknown>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBudget, setEditBudget] = useState(0)
  const [editStatus, setEditStatus] = useState('active')
  const [isSaving, setIsSaving] = useState(false)
  const [rawSaveError, setSaveError] = useState<unknown>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState(3)
  const [taskDeadline, setTaskDeadline] = useState('')
  const [taskOwnerId, setTaskOwnerId] = useState<number | ''>('')
  const [taskOwnerRoleFilter, setTaskOwnerRoleFilter] = useState<RoleName | 'all'>('all')
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [rawTaskCreateError, setTaskCreateError] = useState<unknown>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
  const [isDeletingProject, setIsDeletingProject] = useState(false)

  // Modal deadline editing
  const [deadlineEdit, setDeadlineEdit] = useState('')
  const [updatingDeadlineId, setUpdatingDeadlineId] = useState<number | null>(null)
  const [rawTaskActionError, setTaskActionError] = useState<unknown>(null)
  const error = rawError ? getApiErrorMessage(rawError, 'Не удалось загрузить проект') : null
  const usersError = rawUsersError ? getApiErrorMessage(rawUsersError, 'Не удалось загрузить список сотрудников') : null
  const saveError = rawSaveError ? getApiErrorMessage(rawSaveError, 'Не удалось сохранить проект') : null
  const taskCreateError = rawTaskCreateError ? getApiErrorMessage(rawTaskCreateError, 'Не удалось создать задачу') : null
  const taskActionError = rawTaskActionError ? getApiErrorMessage(rawTaskActionError, 'Не удалось выполнить действие с задачей') : null
  const canEditProject = user ? PROJECT_EDITOR_ROLES.includes(user.role.name) : false
  const canCreateTask = user ? TASK_CREATOR_ROLES.includes(user.role.name) : false
  const canDeleteProject = canEditProject
  const canDeleteTask = canCreateTask
  const canUpdateTaskStatus = canCreateTask || user?.role.name === 'Executor'

  useEffect(() => {
    const loadProject = async () => {
      setIsLoading(true)
      setError(null)
      setUsersError(null)

      try {
        const projectResponse = await api.get<ProjectDetail>(`/projects/${projectId}`)

        setProject(projectResponse.data)
        setEditName(projectResponse.data.name)
        setEditDescription(projectResponse.data.description ?? '')
        setEditBudget(projectResponse.data.budget)
        setEditStatus(projectResponse.data.status)
        setSelectedTaskId(null)
        setTaskActionError(null)

        try {
          const [usersResponse, rolesResponse] = await Promise.all([
            api.get<User[]>('/users'),
            api.get<Role[]>('/roles'),
          ])
          setUsers(usersResponse.data)
          setRoles(rolesResponse.data)
          setTaskOwnerId(user?.id ?? usersResponse.data[0]?.id ?? '')
        } catch (caughtUsersError) {
          setUsers([])
          setTaskOwnerId(user?.id ?? '')

          if (axios.isAxiosError(caughtUsersError)) {
            setUsersError(caughtUsersError.response?.data?.detail ?? 'Не удалось загрузить список сотрудников')
          } else {
            setUsersError('Не удалось загрузить список сотрудников')
          }
        }
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(caughtError.response?.data?.detail ?? 'Не удалось загрузить проект')
        } else {
          setError('Не удалось загрузить проект')
        }
      } finally {
        setIsLoading(false)
      }
    }

    if (projectId) {
      void loadProject()
    }
  }, [projectId, user?.id])

  const taskOwnerOptions = user && !users.some((candidate) => candidate.id === user.id) ? [user, ...users] : users
  const ownerOptions = useMemo(() => {
    const filteredTaskOwnerOptions =
      taskOwnerRoleFilter === 'all'
        ? taskOwnerOptions
        : taskOwnerOptions.filter((candidate) => candidate.role.name === taskOwnerRoleFilter)

    return filteredTaskOwnerOptions.map((candidate) => ({
      value: candidate.id,
      label: `${candidate.full_name} (${roleLabel(candidate.role.name)})`,
      keywords: `${candidate.full_name} ${candidate.email} ${roleLabel(candidate.role.name)}`,
    }))
  }, [taskOwnerOptions, taskOwnerRoleFilter])

  if (!projectId) {
    return <Navigate to="/projects" replace />
  }

  if (isLoading) {
    return (
      <div className="rounded-[2rem] bg-white p-8 text-sm text-slate-500 shadow-sm">
        Загружаем проект...
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {getApiErrorMessage(error, 'Не удалось загрузить проект')}
        </div>
        <Link className="inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" to="/projects">
          Вернуться к списку
        </Link>
      </div>
    )
  }

  if (!project) {
    return null
  }

  const ownerLabelById = new Map(users.map((candidate) => [candidate.id, `${candidate.full_name} (${roleLabel(candidate.role.name)})`]))
  const roleOptions = roles.length > 0 ? roles.map((role) => role.name) : Array.from(new Set(taskOwnerOptions.map((candidate) => candidate.role.name)))
  const activeProjectTasks = project.tasks.filter((task) => task.status !== 'archived')
  const tasksByStatus = activeProjectTasks.reduce<Record<string, Task[]>>((accumulator, task) => {
    const bucket = accumulator[task.status] ?? []
    bucket.push(task)
    accumulator[task.status] = bucket
    return accumulator
  }, {})
  const taskColumns = PROJECT_TASK_STATUSES.map((status) => ({
    status,
    tasks: (tasksByStatus[status] ?? []).slice().sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    }),
  }))
  const selectedTask = selectedTaskId ? project.tasks.find((task) => task.id === selectedTaskId) ?? null : null

  useEffect(() => {
    if (!selectedTask) {
      setDeadlineEdit('')
      setUpdatingDeadlineId(null)
      return
    }

    setDeadlineEdit(isoToDateTimeLocal(selectedTask.deadline))
  }, [selectedTaskId])

  const canUpdateDeadline = Boolean(selectedTask && user && canCreateTask)

  const formatTaskPriority = (priority: number) => `${priority}/5 ${TASK_PRIORITY_LABELS[priority] ?? ''}`.trim()

  const updateTaskInProject = (updatedTask: Task) => {
    setProject((currentProject) =>
      currentProject
        ? {
            ...currentProject,
            tasks: currentProject.tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
          }
        : currentProject,
    )
  }

  const removeTaskFromProject = (taskId: number) => {
    setProject((currentProject) =>
      currentProject
        ? {
            ...currentProject,
            tasks: currentProject.tasks.filter((task) => task.id !== taskId),
          }
        : currentProject,
    )
  }

  const handleSaveProject = async () => {
    if (!project) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const { data } = await api.patch<Project>(`/projects/${project.id}`, {
        name: editName,
        description: editDescription || null,
        budget: editBudget,
        status: editStatus,
      })

      setProject((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              ...data,
            }
          : currentProject,
      )
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setSaveError(caughtError.response?.data?.detail ?? 'Не удалось сохранить проект')
      } else {
        setSaveError('Не удалось сохранить проект')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!project) {
      return
    }

    const confirmed = window.confirm('Удалить этот проект? Все связанные задачи тоже будут удалены.')
    if (!confirmed) {
      return
    }

    setIsDeletingProject(true)
    setSaveError(null)

    try {
      await api.delete(`/projects/${project.id}`)
      navigate('/projects', { replace: true })
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setSaveError(caughtError.response?.data?.detail ?? 'Не удалось удалить проект')
      } else {
        setSaveError('Не удалось удалить проект')
      }
    } finally {
      setIsDeletingProject(false)
    }
  }

  const handleCreateTask = async () => {
    if (!project) {
      return
    }

    if (!taskOwnerId) {
      setTaskCreateError('Выберите исполнителя')
      return
    }

    setIsCreatingTask(true)
    setTaskCreateError(null)

    try {
      const { data } = await api.post<Task>('/tasks', {
        title: taskTitle,
        description: taskDescription || null,
        priority: taskPriority,
        deadline: taskDeadline ? new Date(taskDeadline).toISOString() : null,
        project_id: project.id,
        owner_id: taskOwnerId,
      })

      setProject((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              tasks: [data, ...currentProject.tasks],
            }
          : currentProject,
      )

      setTaskTitle('')
      setTaskDescription('')
      setTaskPriority(3)
      setTaskDeadline('')
      setTaskOwnerId(user?.id ?? users[0]?.id ?? '')
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setTaskCreateError(caughtError.response?.data?.detail ?? 'Не удалось создать задачу')
      } else {
        setTaskCreateError('Не удалось создать задачу')
      }
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleUpdateTaskDeadline = async () => {
    if (!selectedTask || !user) return
    if (!canUpdateDeadline) return
    if (updatingDeadlineId === selectedTask.id) return

    setTaskActionError(null)
    setUpdatingDeadlineId(selectedTask.id)

    const nextDeadlineIso = dateTimeLocalToIso(deadlineEdit)

    try {
      const { data } = await api.patch<Task>(`/tasks/${selectedTask.id}`, { deadline: nextDeadlineIso })
      updateTaskInProject(data)
      setDeadlineEdit(isoToDateTimeLocal(data.deadline))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setTaskActionError(caughtError.response?.data?.detail ?? 'Не удалось изменить дедлайн')
      } else {
        setTaskActionError('Не удалось изменить дедлайн')
      }
    } finally {
      setUpdatingDeadlineId(null)
    }
  }

  const handleUpdateTaskStatus = async (task: Task, status: string) => {
    if (!canUpdateTaskStatus) {
      setTaskActionError('У вас нет прав для изменения статуса этой задачи')
      return
    }

    if (task.status === status) {
      return
    }

    setUpdatingTaskId(task.id)
    setTaskActionError(null)

    try {
      const { data } = await api.patch<Task>(`/tasks/${task.id}`, { status })
      updateTaskInProject(data)
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setTaskActionError(caughtError.response?.data?.detail ?? 'Не удалось изменить статус задачи')
      } else {
        setTaskActionError('Не удалось изменить статус задачи')
      }
    } finally {
      setUpdatingTaskId(null)
      setDraggedTaskId(null)
      setDragOverStatus(null)
    }
  }

  const handleDeleteTask = async (task: Task) => {
    const confirmed = window.confirm('Удалить эту задачу?')
    if (!confirmed) {
      return
    }

    setDeletingTaskId(task.id)
    setTaskActionError(null)

    try {
      await api.delete(`/tasks/${task.id}`)
      removeTaskFromProject(task.id)
      if (selectedTaskId === task.id) {
        setSelectedTaskId(null)
      }
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setTaskActionError(caughtError.response?.data?.detail ?? 'Не удалось удалить задачу')
      } else {
        setTaskActionError('Не удалось удалить задачу')
      }
    } finally {
      setDeletingTaskId(null)
      setDraggedTaskId(null)
      setDragOverStatus(null)
    }
  }

  const handleDragStart = (task: Task, event: DragEvent<HTMLElement>) => {
    if (!canUpdateTaskStatus) {
      return
    }

    event.dataTransfer.setData('text/plain', String(task.id))
    event.dataTransfer.effectAllowed = 'move'
    setDraggedTaskId(task.id)
    setDragOverStatus(task.status)
  }

  const handleDragEnd = () => {
    setDraggedTaskId(null)
    setDragOverStatus(null)
  }

  const handleColumnDrop = (status: string, droppedTaskId?: number) => {
    const taskId = droppedTaskId ?? draggedTaskId
    if (!canUpdateTaskStatus || taskId === null || taskId === undefined) {
      return
    }

    const draggedTask = project.tasks.find((task) => task.id === taskId)
    if (!draggedTask) {
      setDraggedTaskId(null)
      setDragOverStatus(null)
      return
    }

    void handleUpdateTaskStatus(draggedTask, status)
  }

  const handleOpenTask = (task: Task) => {
    setSelectedTaskId(task.id)
  }

  const handleCloseTask = () => {
    setSelectedTaskId(null)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#7b121b,#a81b25_48%,#d22630_78%,#f7e8e9_150%)] p-8 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-sky-200">Проект</p>
            <h1 className="mt-3 font-serif text-4xl">{project.name}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-100/80">
              {project.description ? project.description : null}
            </p>
          </div>
          <Link className="inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950" to="/projects">
            Назад к проектам
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Бюджет</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{project.budget}</p>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Статус</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{projectStatusLabel(project.status)}</p>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Задач</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{activeProjectTasks.length}</p>
        </div>
      </section>

      {canEditProject ? (
        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">Редактирование проекта</h2>
            <p className="text-sm text-slate-500">Изменяйте основные параметры прямо на этой странице.</p>
          </div>

          {saveError ? (
            <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              {getApiErrorMessage(saveError, 'Не удалось выполнить действие с проектом')}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Название</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setEditName(event.target.value)}
                value={editName}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Бюджет</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                min={0}
                onChange={(event) => setEditBudget(Number(event.target.value))}
                type="number"
                value={editBudget}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Статус</span>
              <select
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setEditStatus(event.target.value)}
                value={editStatus}
              >
                {PROJECT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {projectStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Описание</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setEditDescription(event.target.value)}
                value={editDescription}
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSaving || isDeletingProject || !editName.trim()}
              onClick={() => {
                void handleSaveProject()
              }}
              type="button"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>

            {canDeleteProject ? (
              <button
                className="rounded-2xl border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || isDeletingProject}
                onClick={() => {
                  void handleDeleteProject()
                }}
                type="button"
              >
                {isDeletingProject ? 'Удаляем проект...' : 'Удалить проект'}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">Задачи проекта</h2>
          <p className="text-sm text-slate-500">
            Создавайте задачи прямо из проекта, открывайте их из карточек, меняйте статус на месте и перетаскивайте между колонками.
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-[2rem] border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Создать задачу в проекте</h3>
                <p className="mt-1 text-sm text-slate-500">Новая задача сразу попадет в текущий проект.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {activeProjectTasks.length} всего
              </span>
            </div>

            {canCreateTask ? (
              <>
                {usersError ? (
                  <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {usersError}. Задачу все еще можно создать, если исполнителя можно выбрать из доступных данных.
                  </div>
                ) : null}

                {taskCreateError ? (
                  <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {getApiErrorMessage(taskCreateError, 'Не удалось создать задачу')}
                  </div>
                ) : null}

                <div className="mt-5 space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Название</span>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Например, подготовить отчет"
                      value={taskTitle}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Роль исполнителя</span>
                    <select
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                      onChange={(event) => {
                        const role = event.target.value as RoleName | 'all'
                        setTaskOwnerRoleFilter(role)
                        setTaskOwnerId('')
                      }}
                      value={taskOwnerRoleFilter}
                    >
                      <option value="all">Все роли</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Исполнитель</span>
                    <SearchableSelect
                      label=""
                      noResultsLabel="Исполнители не найдены"
                      onChange={(nextValue) => setTaskOwnerId(nextValue)}
                      options={ownerOptions}
                      placeholder="Поиск по ФИО / email / роли"
                      value={taskOwnerId}
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Приоритет</span>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                        onChange={(event) => setTaskPriority(Number(event.target.value))}
                        value={taskPriority}
                      >
                        {TASK_PRIORITY_OPTIONS.map((priority) => (
                          <option key={priority} value={priority}>
                            {formatTaskPriority(priority)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Дедлайн</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                        onChange={(event) => setTaskDeadline(event.target.value)}
                        type="datetime-local"
                        value={taskDeadline}
                      />
                    </label>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Описание</span>
                    <textarea
                      className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                      onChange={(event) => setTaskDescription(event.target.value)}
                      placeholder="Коротко опишите ожидаемый результат"
                      value={taskDescription}
                    />
                  </label>

                  <button
                    className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={isCreatingTask || !taskTitle.trim() || !taskOwnerId}
                    onClick={() => {
                      void handleCreateTask()
                    }}
                    type="button"
                  >
                    {isCreatingTask ? 'Создаем задачу...' : 'Создать задачу'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-3xl bg-white px-4 py-4 text-sm text-slate-600">
                Создавать задачи в проекте могут руководящие роли. Для просмотра доступных задач ничего дополнительно делать не нужно.
              </div>
            )}
          </div>

          <div className="space-y-4">
            {taskActionError ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {getApiErrorMessage(taskActionError, 'Не удалось выполнить действие с задачей')}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {taskColumns.map(({ status, tasks }) => (
                <div
                  key={status}
                  className={`rounded-[2rem] border p-4 transition ${
                    dragOverStatus === status ? 'scale-[1.01] ring-2 ring-sky-300' : ''
                  } ${TASK_STATUS_STYLES[status] ?? 'border-slate-200 bg-slate-50/90'}`}
                  onDragEnter={() => {
                    if (!canUpdateTaskStatus) return
                    setDragOverStatus(status)
                  }}
                  onDragLeave={() => {
                    if (!canUpdateTaskStatus) return
                    if (dragOverStatus === status) {
                      setDragOverStatus(null)
                    }
                  }}
                  onDragOver={(event) => {
                    if (!canUpdateTaskStatus) return
                    event.preventDefault()
                    setDragOverStatus(status)
                  }}
                  onDrop={(event) => {
                    if (!canUpdateTaskStatus) return
                    event.preventDefault()
                    const droppedTaskId = Number(event.dataTransfer.getData('text/plain'))
                    if (Number.isFinite(droppedTaskId) && droppedTaskId > 0) {
                      setDraggedTaskId(droppedTaskId)
                      handleColumnDrop(status, droppedTaskId)
                      return
                    }
                    handleColumnDrop(status)
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">{taskStatusLabel(status)}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                      {tasks.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {tasks.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
                        В этом статусе пока нет задач.
                      </div>
                    ) : (
                      tasks.map((task) => (
                        <article
                          key={task.id}
                          className={`rounded-3xl border border-white/70 bg-white/95 p-4 shadow-sm transition ${
                            draggedTaskId === task.id ? 'opacity-50 ring-2 ring-sky-300' : 'hover:-translate-y-0.5 hover:shadow-md'
                          } ${canUpdateTaskStatus ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          draggable={canUpdateTaskStatus}
                          onDragEnd={handleDragEnd}
                          onDragStart={(event) => {
                            handleDragStart(task, event)
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold text-slate-900">{task.title}</h4>
                              {task.description ? (
                                <p className="mt-1 text-sm leading-6 text-slate-500">{task.description}</p>
                              ) : null}
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              {taskStatusLabel(task.status)}
                            </span>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                              Приоритет: {formatTaskPriority(task.priority)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                              {task.owner?.full_name ?? ownerLabelById.get(task.owner_id) ?? 'Неизвестный пользователь'}
                            </span>
                          </div>

                          <dl className="mt-4 grid gap-2 text-xs text-slate-500">
                            <div className="flex items-center justify-between gap-3">
                              <dt>Дедлайн</dt>
                              <dd className="font-medium text-slate-700">
                                {formatIsoDateTimeRu(task.deadline)}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt>Создана</dt>
                              <dd className="font-medium text-slate-700">
                                {new Date(task.created_at).toLocaleString('ru-RU')}
                              </dd>
                            </div>
                          </dl>

                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                              className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleOpenTask(task)
                              }}
                              type="button"
                            >
                              Открыть задачу
                            </button>

                            {canUpdateTaskStatus ? (
                              <select
                                className="min-w-[170px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-400"
                                disabled={updatingTaskId === task.id || deletingTaskId === task.id}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  event.stopPropagation()
                                  void handleUpdateTaskStatus(task, event.target.value)
                                }}
                                value={task.status}
                              >
                                {TASK_STATUS_OPTIONS.map((statusOption) => (
                                  <option key={statusOption} value={statusOption}>
                                    {taskStatusLabel(statusOption)}
                                  </option>
                                ))}
                              </select>
                            ) : null}

                            {canDeleteTask ? (
                              <button
                                className="rounded-2xl border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={deletingTaskId === task.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleDeleteTask(task)
                                }}
                                type="button"
                              >
                                {deletingTaskId === task.id ? 'Удаляем...' : 'Удалить'}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {activeProjectTasks.length > 0 ? (
              <div className="rounded-[2rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">Всего задач: {activeProjectTasks.length}</span>
                  {taskColumns.map(({ status, tasks }) => (
                    <span key={status} className="rounded-full bg-white px-3 py-1 shadow-sm">
                      {taskStatusLabel(status)}: {tasks.length}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {selectedTask ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={handleCloseTask}
        >
          <div
            className="w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Задача проекта</p>
                <h3 className="mt-2 text-3xl font-semibold text-slate-900">{selectedTask.title}</h3>
                {selectedTask.description ? (
                  <p className="mt-3 text-sm leading-6 text-slate-500">{selectedTask.description}</p>
                ) : null}
              </div>
              <button
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={handleCloseTask}
                type="button"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Статус</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
                    {taskStatusLabel(selectedTask.status)}
                  </span>
                  {canUpdateTaskStatus ? (
                    <select
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-400"
                      disabled={updatingTaskId === selectedTask.id}
                      onChange={(event) => {
                        void handleUpdateTaskStatus(selectedTask, event.target.value)
                      }}
                      value={selectedTask.status}
                    >
                      {TASK_STATUS_OPTIONS.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {taskStatusLabel(statusOption)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-500">Вы можете менять статус только в рамках доступных вам задач.</span>
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Исполнитель</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {selectedTask.owner?.full_name ?? ownerLabelById.get(selectedTask.owner_id) ?? 'Неизвестный пользователь'}
                </p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Приоритет</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{formatTaskPriority(selectedTask.priority)}</p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Сроки</p>

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
                          setDeadlineEdit('')
                          void handleUpdateTaskDeadline()
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
                    Дедлайн:{' '}
                    {formatIsoDateTimeRu(selectedTask.deadline)}
                  </p>
                )}

                <p className="mt-2 text-sm text-slate-700">
                  Создана: {new Date(selectedTask.created_at).toLocaleString('ru-RU')}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  Обновлена: {new Date(selectedTask.updated_at).toLocaleString('ru-RU')}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">{project.name}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">{taskStatusLabel(selectedTask.status)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">ID: {selectedTask.id}</span>
              {canDeleteTask ? (
                <button
                  className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deletingTaskId === selectedTask.id}
                  onClick={() => {
                    void handleDeleteTask(selectedTask)
                  }}
                  type="button"
                >
                  {deletingTaskId === selectedTask.id ? 'Удаляем задачу...' : 'Удалить задачу'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ProjectDetailPage
