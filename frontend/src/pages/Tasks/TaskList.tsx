import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'

import api from '../../api/api'
import SearchableSelect from '../../components/SearchableSelect'
import { useAuth } from '../../store/authStore'
import type { Project, Role, RoleName, Task, TaskReport, TaskType, User, WorkflowDefinition } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { roleLabel, taskStatusLabel, taskTypeLabel } from '../../utils/labels'
import KanbanBoard from './KanbanBoard'
import { formatIsoDateTimeRu } from '../../utils/datetime'

const TASK_CREATOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead', 'Manager']
const TASK_PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const

type TaskSortField = 'title' | 'priority' | 'status' | 'owner' | 'project' | 'deadline'
type TaskViewMode = 'table' | 'kanban'

const TASK_PRIORITY_LABELS: Record<number, string> = {
  1: 'Низкий',
  2: 'Ниже среднего',
  3: 'Средний',
  4: 'Высокий',
  5: 'Критический',
}

const TaskList = () => {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workflowDefinitions, setWorkflowDefinitions] = useState<WorkflowDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(3)
  const [deadline, setDeadline] = useState('')
  const [ownerId, setOwnerId] = useState<number | ''>('')
  // помощники (опционально): multi-select собираем через SearchableSelect + список выбранных
  const [assistantIds, setAssistantIds] = useState<number[]>([])
  const [assistantPickId, setAssistantPickId] = useState<number | ''>('')
  const [ownerRoleFilter, setOwnerRoleFilter] = useState<RoleName | 'all'>('all')
  const [projectId, setProjectId] = useState<number | ''>('')

  // Modal deadline editing
  const [deadlineEdit, setDeadlineEdit] = useState('')
  const [updatingDeadlineId, setUpdatingDeadlineId] = useState<number | null>(null)
  const [taskType, setTaskType] = useState<TaskType>('manager_assigned')
  const [viewMode, setViewMode] = useState<TaskViewMode>('table')
  const [taskOwnerFilter, setTaskOwnerFilter] = useState<number | 'all'>('all')
  const [taskQuery, setTaskQuery] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState<string | 'all'>('all')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<number | 'all'>('all')
  const [taskProjectFilter, setTaskProjectFilter] = useState<number | 'all' | 'none'>('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskType | 'all'>('all')

  const [sortField, setSortField] = useState<TaskSortField>('deadline')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [reportComment, setReportComment] = useState('')
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [reportDefinitionId, setReportDefinitionId] = useState<number | ''>('')
  const [reportInputKey, setReportInputKey] = useState(0)
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [rawReportError, setReportError] = useState<unknown>(null)
  const [reportSuccess, setReportSuccess] = useState<string | null>(null)

  const canManageTasks = user ? TASK_CREATOR_ROLES.includes(user.role.name) : false
  const canCreateTask = Boolean(user)
  const canDeleteTask = canManageTasks
  const canUpdateTaskStatus = canManageTasks || user?.role.name === 'Executor'
  const publishedWorkflowDefinitions = workflowDefinitions.filter((definition) => definition.published)

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [tasksResponse, usersResponse, projectsResponse, rolesResponse, workflowDefinitionsResponse] = await Promise.all([
          api.get<Task[]>('/tasks'),
          api.get<User[]>('/users'),
          api.get<Project[]>('/projects'),
          api.get<Role[]>('/roles'),
          api.get<WorkflowDefinition[]>('/workflow/definitions'),
        ])

        setTasks(tasksResponse.data)
        setUsers(usersResponse.data)
        setProjects(projectsResponse.data)
        setRoles(rolesResponse.data)
        setWorkflowDefinitions(workflowDefinitionsResponse.data)
        setReportDefinitionId(workflowDefinitionsResponse.data.find((definition) => definition.published)?.id ?? '')

        if (user) {
          setOwnerId(canManageTasks ? user.id : user.id)
          setTaskType(canManageTasks ? 'manager_assigned' : 'daily')
        }
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось загрузить задачи'))
        } else {
          setError('Не удалось загрузить задачи')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [canManageTasks, user])

  useEffect(() => {
    if (!user) {
      return
    }

    if (!canManageTasks) {
      setTaskType('daily')
      setOwnerId(user.id)
      return
    }

    if (taskType === 'daily') {
      setOwnerId(user.id)
    }
  }, [canManageTasks, taskType, user])

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'archived'), [tasks])
  const activeProjects = useMemo(() => projects.filter((project) => project.status !== 'archived'), [projects])

  const userNameById = useMemo(() => new Map(users.map((item) => [item.id, item.full_name])), [users])
  const projectNameById = useMemo(() => new Map(projects.map((item) => [item.id, item.name])), [projects])

  const displayedTasks = useMemo(() => {
    const query = taskQuery.trim().toLowerCase()

    return activeTasks.filter((task) => {
      if (taskOwnerFilter !== 'all' && task.owner_id !== taskOwnerFilter) {
        return false
      }

      if (taskTypeFilter !== 'all' && task.task_type !== taskTypeFilter) {
        return false
      }

      if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) {
        return false
      }

      if (taskPriorityFilter !== 'all' && task.priority !== taskPriorityFilter) {
        return false
      }

      if (taskProjectFilter !== 'all') {
        if (taskProjectFilter === 'none') {
          if (task.project_id !== undefined && task.project_id !== null) {
            return false
          }
        } else if (task.project_id !== taskProjectFilter) {
          return false
        }
      }

      if (query) {
        const ownerName = task.owner?.full_name ?? userNameById.get(task.owner_id) ?? ''
        const projectName = projectNameById.get(task.project_id ?? -1) ?? 'Без проекта'

        const haystack = [
          task.title,
          task.description ?? '',
          ownerName,
          projectName,
          taskStatusLabel(task.status),
          taskTypeLabel(task.task_type),
          TASK_PRIORITY_LABELS[task.priority] ?? String(task.priority),
          String(task.priority),
        ]
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [
    activeTasks,
    projectNameById,
    taskOwnerFilter,
    taskPriorityFilter,
    taskProjectFilter,
    taskQuery,
    taskStatusFilter,
    taskTypeFilter,
    userNameById,
  ])
  // Важно: выбранная задача должна открываться даже если она archived
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null
  const reportError = rawReportError ? getApiErrorMessage(rawReportError, 'Не удалось отправить отчет') : null

  const filteredUsers = useMemo(() => {
    if (!canManageTasks) {
      return users.filter((candidate) => candidate.id === user?.id)
    }

    return users.filter((candidate) => ownerRoleFilter === 'all' || candidate.role.name === ownerRoleFilter)
  }, [canManageTasks, ownerRoleFilter, user?.id, users])

  const ownerOptions = useMemo(
    () =>
      (filteredUsers.length > 0 ? filteredUsers : user ? [user] : []).map((assignee) => ({
        value: assignee.id,
        label: `${assignee.full_name} (${roleLabel(assignee.role.name)})`,
        keywords: `${assignee.full_name} ${assignee.email} ${roleLabel(assignee.role.name)}`,
      })),
    [filteredUsers, user],
  )

  const projectOptions = useMemo(
    () =>
      activeProjects.map((project) => ({
        value: project.id,
        label: project.name,
        keywords: `${project.name} ${project.description ?? ''}`,
      })),
    [activeProjects],
  )

  const areFiltersActive =
    taskOwnerFilter !== 'all' ||
    taskQuery.trim().length > 0 ||
    taskStatusFilter !== 'all' ||
    taskPriorityFilter !== 'all' ||
    taskProjectFilter !== 'all' ||
    taskTypeFilter !== 'all'

  const resetFilters = () => {
    setTaskOwnerFilter('all')
    setTaskQuery('')
    setTaskStatusFilter('all')
    setTaskPriorityFilter('all')
    setTaskProjectFilter('all')
    setTaskTypeFilter('all')
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPriority(3)
    setDeadline('')
    setProjectId('')
    setOwnerRoleFilter('all')
    setTaskType(canManageTasks ? 'manager_assigned' : 'daily')
    setOwnerId(user?.id ?? '')
    setAssistantIds([])
    setAssistantPickId('')
  }

  const resetReportForm = () => {
    setReportComment('')
    setReportFile(null)
    setReportDefinitionId(publishedWorkflowDefinitions[0]?.id ?? '')
    setReportInputKey((current) => current + 1)
    setReportError(null)
    setReportSuccess(null)
  }

  const taskNeedsWorkflowReport = (task: Task) => task.task_type !== 'daily' || !task.daily_approved_once

  const handleCreateTask = async () => {
    if (!user) {
      return
    }

    const resolvedOwnerId = taskType === 'daily' ? user.id : ownerId
    if (!resolvedOwnerId) {
      setError('Перед созданием задачи выберите исполнителя')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        title,
        description: description || null,
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        project_id: projectId || null,
        owner_id: resolvedOwnerId,
        task_type: taskType,
        assistants_user_ids: assistantIds,
      }

      const { data } = await api.post<Task>('/tasks', payload)
      setTasks((currentTasks) => [data, ...currentTasks])
      resetForm()
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось создать задачу'))
      } else {
        setError('Не удалось создать задачу')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    const confirmed = window.confirm('Удалить эту задачу?')
    if (!confirmed) {
      return
    }

    setDeletingTaskId(taskId)
    setError(null)

    try {
      await api.delete(`/tasks/${taskId}`)
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null)
      }
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось удалить задачу'))
      } else {
        setError('Не удалось удалить задачу')
      }
    } finally {
      setDeletingTaskId(null)
    }
  }

  const handleUpdateTaskStatus = async (task: Task, status: string) => {
    if (!canUpdateTaskStatus || task.status === status) {
      return
    }

    setUpdatingTaskId(task.id)
    setError(null)

    try {
      const { data } = await api.patch<Task>(`/tasks/${task.id}`, { status })
      setTasks((currentTasks) => currentTasks.map((candidate) => (candidate.id === data.id ? data : candidate)))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось изменить статус задачи'))
      } else {
        setError('Не удалось изменить статус задачи')
      }
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const formatIsoToDateTimeLocal = (iso?: string): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  useEffect(() => {
    if (!selectedTask) {
      setDeadlineEdit('')
      return
    }

    setDeadlineEdit(formatIsoToDateTimeLocal(selectedTask.deadline))
  }, [selectedTaskId]) 

  const canUpdateDeadline = Boolean(selectedTask && user && canManageTasks)

  const handleUpdateTaskDeadline = async () => {
    if (!selectedTask || !user) return
    if (!canUpdateDeadline) return
    if (updatingDeadlineId === selectedTask.id) return

    const nextDeadlineIso = deadlineEdit ? new Date(deadlineEdit).toISOString() : null

    setUpdatingDeadlineId(selectedTask.id)
    setError(null)

    try {
      const { data } = await api.patch<Task>(`/tasks/${selectedTask.id}`, { deadline: nextDeadlineIso })
      setTasks((currentTasks) => currentTasks.map((candidate) => (candidate.id === data.id ? data : candidate)))
      setDeadlineEdit(formatIsoToDateTimeLocal(data.deadline))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось изменить дедлайн'))
      } else {
        setError('Не удалось изменить дедлайн')
      }
    } finally {
      setUpdatingDeadlineId(null)
    }
  }

  const sortedTasks = useMemo(() => {
    const directionMultiplier = sortDirection === 'asc' ? 1 : -1
    const compareText = (left: string, right: string) => left.localeCompare(right, 'ru', { sensitivity: 'base' })

    return [...displayedTasks].sort((left, right) => {
      let comparison = 0

      switch (sortField) {
        case 'title':
          comparison = compareText(left.title, right.title)
          break
        case 'priority':
          comparison = left.priority - right.priority
          break
        case 'status':
          comparison = compareText(taskStatusLabel(left.status), taskStatusLabel(right.status))
          break
        case 'owner': {
          const leftOwner = left.owner?.full_name ?? userNameById.get(left.owner_id) ?? ''
          const rightOwner = right.owner?.full_name ?? userNameById.get(right.owner_id) ?? ''
          comparison = compareText(leftOwner, rightOwner)
          break
        }
        case 'project': {
          const leftProject = projectNameById.get(left.project_id ?? -1) ?? 'Без проекта'
          const rightProject = projectNameById.get(right.project_id ?? -1) ?? 'Без проекта'
          comparison = compareText(leftProject, rightProject)
          break
        }
        case 'deadline': {
          const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER
          const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER
          comparison = leftDeadline - rightDeadline
          break
        }
      }

      if (comparison === 0) {
        comparison = new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      }

      return comparison * directionMultiplier
    })
  }, [displayedTasks, projectNameById, sortDirection, sortField, userNameById])

  const handleSort = (field: TaskSortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortField(field)
    setSortDirection(field === 'deadline' ? 'asc' : 'desc')
  }

  const sortIndicator = (field: TaskSortField) => {
    if (sortField !== field) return '<>'
    return sortDirection === 'asc' ? '^' : 'v'
  }

  const handleOpenTask = (taskId: number) => {
    setSelectedTaskId(taskId)
    resetReportForm()

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('task', String(taskId))
    setSearchParams(nextParams, { replace: true })
  }

  const handleCloseTask = () => {
    setSelectedTaskId(null)
    resetReportForm()

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('task')
    setSearchParams(nextParams, { replace: true })
  }

  const addReportToTask = (taskId: number, report: TaskReport) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task
        }

        return {
          ...task,
          status: task.task_type === 'daily' && task.daily_approved_once ? task.status : 'in_review',
          reports: [report, ...task.reports],
          updated_at: report.created_at,
        }
      }),
    )
  }

  const getFileUrl = (fileUrl?: string) => {
    if (!fileUrl) {
      return null
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      return fileUrl
    }

    const baseUrl = typeof api.defaults.baseURL === 'string' ? api.defaults.baseURL : window.location.origin
    return new URL(fileUrl, baseUrl).toString()
  }

  const handleSubmitReport = async () => {
    if (!selectedTask) {
      return
    }

    const needsWorkflow = taskNeedsWorkflowReport(selectedTask)
    if (needsWorkflow && !reportDefinitionId) {
      setReportError('Выберите маршрут согласования для отчета')
      return
    }

    if (!reportComment.trim() && !reportFile) {
      setReportError('Добавьте комментарий или прикрепите файл')
      return
    }

    const formData = new FormData()
    if (reportComment.trim()) {
      formData.append('comment', reportComment.trim())
    }
    if (needsWorkflow && reportDefinitionId) {
      formData.append('definition_id', String(reportDefinitionId))
    }
    if (reportFile) {
      formData.append('file', reportFile)
    }

    setIsSubmittingReport(true)
    setReportError(null)
    setReportSuccess(null)

    try {
      const { data } = await api.post<TaskReport>(`/tasks/${selectedTask.id}/reports`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      addReportToTask(selectedTask.id, data)
      setReportComment('')
      setReportFile(null)
      setReportDefinitionId(publishedWorkflowDefinitions[0]?.id ?? '')
      setReportInputKey((current) => current + 1)
      setReportSuccess(needsWorkflow ? 'Отчет отправлен на согласование' : 'Ежедневное обновление сохранено')
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setReportError(caughtError.response?.data?.detail ?? 'Не удалось отправить отчет')
      } else {
        setReportError('Не удалось отправить отчет')
      }
    } finally {
      setIsSubmittingReport(false)
    }
  }

  const renderReportAuthor = (report: TaskReport) =>
    report.author?.full_name ?? userNameById.get(report.author_id) ?? 'Неизвестный пользователь'

  const dailyTasksCount = activeTasks.filter((task) => task.task_type === 'daily').length
  const pendingAgreementCount = activeTasks.filter(
    (task) =>
      (task.task_type === 'daily' && !task.daily_approved_once) ||
      (task.task_type === 'manager_assigned' && task.status === 'pending'),
  ).length

  const selectedTaskNeedsManagerApproval =
    selectedTask?.task_type === 'daily' && !selectedTask.daily_approved_once && selectedTask.status !== 'archived'
  const canSubmitReport = selectedTask ? user?.id === selectedTask.owner_id : false
  const selectedWorkflowDefinition =
    publishedWorkflowDefinitions.find((definition) => definition.id === reportDefinitionId) ?? null
  const roleOptions = roles.length > 0 ? roles.map((role) => role.name) : []

  const handleTaskOwnerFilterChange = (nextValue: number | 'all') => {
    setTaskOwnerFilter(nextValue)
  }

  useEffect(() => {
    const ownerParam = searchParams.get('owner')
    if (!ownerParam) {
      setTaskOwnerFilter('all')
      return
    }

    const ownerIdFromUrl = Number(ownerParam)
    if (Number.isFinite(ownerIdFromUrl)) {
      setTaskOwnerFilter(ownerIdFromUrl)
    }
  }, [searchParams])

  useEffect(() => {
    if (isLoading) {
      return
    }

    const taskParam = searchParams.get('task')
    if (!taskParam) {
      return
    }

    const taskIdFromUrl = Number(taskParam)
    if (Number.isFinite(taskIdFromUrl) && tasks.some((task) => task.id === taskIdFromUrl)) {
      setSelectedTaskId(taskIdFromUrl)
    }
  }, [isLoading, searchParams, tasks])

  if (isLoading) {
    return <div className="rounded-[2rem] bg-white p-8 text-sm text-slate-500 shadow-sm">Загружаем задачи...</div>
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#86141c,#b81f29_48%,#d22630_72%,#f3d9db_140%)] p-8 text-white shadow-lg">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.35em] text-sky-200">Задачи</p>
            <h1 className="mt-4 font-serif text-4xl font-bold">Таблица и канбан в одном разделе</h1>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-100">Активные задачи</p>
              <p className="mt-3 text-3xl font-semibold">{activeTasks.length}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-100">Ежедневные</p>
              <p className="mt-3 text-3xl font-semibold">{dailyTasksCount}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-100">Ждут согласования</p>
              <p className="mt-3 text-3xl font-semibold">{pendingAgreementCount}</p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {canCreateTask ? (
        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">Создать задачу</h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Название</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например: Проверить платежный календарь"
                value={title}
              />
            </label>

            {canManageTasks ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Категория</span>
                <select
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  onChange={(event) => setTaskType(event.target.value as TaskType)}
                  value={taskType}
                >
                  <option value="manager_assigned">От руководителя</option>
                  <option value="daily">Ежедневная</option>
                </select>
              </label>
            ) : (
              <div className="rounded-3xl border border-sky-100 bg-sky-50 px-5 py-4 text-sm text-sky-900">
                Категория: <span className="font-semibold">{taskTypeLabel('daily')}</span>
              </div>
            )}

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Проект</span>
              <SearchableSelect
                label=""
                noResultsLabel="Проекты не найдены"
                onChange={(nextValue) => setProjectId(nextValue)}
                options={projectOptions}
                placeholder="Поиск по названию проекта"
                value={projectId}
              />
            </label>

            {canManageTasks && taskType === 'manager_assigned' ? (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Роль ответственного</span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                    onChange={(event) => {
                      setOwnerRoleFilter(event.target.value as RoleName | 'all')
                      setOwnerId('')
                      setAssistantIds([])
                      setAssistantPickId('')
                    }}
                    value={ownerRoleFilter}
                  >
                    <option value="all">Все роли</option>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>

                <SearchableSelect
                  label="Ответственный"
                  noResultsLabel="Пользователи не найдены"
                  onChange={(nextValue) => {
                    setOwnerId(nextValue)
                    // если вдруг ответственный попал в помощники — уберём
                    if (typeof nextValue === 'number') {
                      setAssistantIds((current) => current.filter((id) => id !== nextValue))
                    }
                  }}
                  options={ownerOptions}
                  placeholder="Поиск по ФИО, email или роли"
                  value={ownerId}
                />

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Помощники (необязательно)</span>
                  <SearchableSelect
                    label=""
                    noResultsLabel="Помощники не найдены"
                    onChange={(nextValue) => {
                      setAssistantPickId(nextValue)
                      if (nextValue === '') return

                      if (typeof ownerId === 'number' && nextValue === ownerId) return

                      setAssistantIds((current) => (current.includes(nextValue) ? current : [...current, nextValue]))
                      setAssistantPickId('')
                    }}
                    options={
                      typeof ownerId === 'number'
                        ? ownerOptions.filter((opt) => opt.value !== ownerId)
                        : ownerOptions
                    }
                    placeholder="Добавить помощника"
                    value={assistantPickId}
                    emptyLabel="Выберите помощника"
                  />
                </label>

                {assistantIds.length > 0 ? (
                  <div className="mt-1">
                    <div className="text-xs font-semibold text-slate-700">Выбрано:</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assistantIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                          onClick={() => setAssistantIds((current) => current.filter((x) => x !== id))}
                          title="Удалить помощника"
                        >
                          {userNameById.get(id) ?? `#${id}`} ×
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
                Исполнитель: <span className="font-semibold">{user?.full_name ?? 'Не выбран'}</span>
              </div>
            )}

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Приоритет</span>
              <select
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setPriority(Number(event.target.value))}
                value={priority}
              >
                {TASK_PRIORITY_OPTIONS.map((priorityOption) => (
                  <option key={priorityOption} value={priorityOption}>
                    {priorityOption}/5 {TASK_PRIORITY_LABELS[priorityOption]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Дедлайн</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setDeadline(event.target.value)}
                type="datetime-local"
                value={deadline}
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-slate-700">Описание</span>
            <textarea
              className="min-h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Кратко опишите ожидаемый результат"
              value={description}
            />
          </label>

          <button
            className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isSubmitting || !title.trim() || (taskType === 'manager_assigned' && !ownerId)}
            onClick={() => {
              void handleCreateTask()
            }}
            type="button"
          >
            {isSubmitting ? 'Создаем задачу...' : 'Создать задачу'}
          </button>
        </section>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Все задачи</h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="min-w-[240px]">
              <span className="sr-only">Фильтр по исполнителю</span>
              <SearchableSelect
                label=""
                emptyLabel="Все исполнители"
                noResultsLabel="Исполнители не найдены"
                placeholder="Поиск по ФИО / email / роли"
                options={users.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.full_name,
                  keywords: `${candidate.full_name} ${candidate.email} ${roleLabel(candidate.role.name)}`,
                }))}
                value={taskOwnerFilter === 'all' ? '' : taskOwnerFilter}
                onChange={(nextValue) => {
                  handleTaskOwnerFilterChange(nextValue === '' ? 'all' : nextValue)
                }}
              />
            </div>

            <label className="min-w-[240px]">
              <span className="sr-only">Поиск по задачам</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                placeholder="Поиск по названию, описанию, проекту..."
                value={taskQuery}
                onChange={(event) => setTaskQuery(event.target.value)}
              />
            </label>

            <label className="min-w-[200px]">
              <span className="sr-only">Фильтр по статусу</span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value)}
              >
                <option value="all">Все статусы</option>
                <option value="pending">Ожидает</option>
                <option value="in_progress">В работе</option>
                <option value="in_review">На проверке</option>
                <option value="completed">Завершена</option>
                <option value="overdue">Просрочена</option>
              </select>
            </label>

            <label className="min-w-[190px]">
              <span className="sr-only">Фильтр по приоритету</span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                value={taskPriorityFilter}
                onChange={(event) => setTaskPriorityFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              >
                <option value="all">Все приоритеты</option>
                {TASK_PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}/5
                  </option>
                ))}
              </select>
            </label>

            <div className="min-w-[240px]">
              <span className="sr-only">Фильтр по проекту</span>
              <SearchableSelect
                label=""
                emptyLabel="Все проекты"
                noResultsLabel="Проекты не найдены"
                placeholder="Поиск по названию проекта"
                options={[
                  { value: 0, label: 'Без проекта', keywords: 'без проекта' },
                  ...activeProjects.map((project) => ({
                    value: project.id,
                    label: project.name,
                    keywords: `${project.name} ${project.description ?? ''}`,
                  })),
                ]}
                value={
                  taskProjectFilter === 'all' ? '' : taskProjectFilter === 'none' ? 0 : taskProjectFilter
                }
                onChange={(nextValue) => {
                  if (nextValue === '') {
                    setTaskProjectFilter('all')
                    return
                  }

                  setTaskProjectFilter(nextValue === 0 ? 'none' : nextValue)
                }}
              />
            </div>

            <label className="min-w-[200px]">
              <span className="sr-only">Фильтр по категории</span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                value={taskTypeFilter}
                onChange={(event) => setTaskTypeFilter(event.target.value === 'all' ? 'all' : (event.target.value as TaskType))}
              >
                <option value="all">Все категории</option>
                <option value="manager_assigned">{taskTypeLabel('manager_assigned')}</option>
                <option value="daily">{taskTypeLabel('daily')}</option>
              </select>
            </label>

            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              <button
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setViewMode('table')}
                type="button"
              >
                Таблица
              </button>
              <button
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setViewMode('kanban')}
                type="button"
              >
                Канбан
              </button>
            </div>

            <button
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!areFiltersActive}
              onClick={resetFilters}
              type="button"
              title="Сбросить все фильтры"
            >
              Сбросить фильтры
            </button>
          </div>
        </div>


        {viewMode === 'table' ? (
          <div className="mt-6 min-h-[420px] overflow-hidden rounded-[2rem] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-600">
                    <button className="inline-flex items-center gap-2" onClick={() => handleSort('title')} type="button">
                      Задача <span className="text-slate-400">{sortIndicator('title')}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Категория</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">
                    <button className="inline-flex items-center gap-2" onClick={() => handleSort('priority')} type="button">
                      Приоритет <span className="text-slate-400">{sortIndicator('priority')}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">
                    <button className="inline-flex items-center gap-2" onClick={() => handleSort('status')} type="button">
                      Статус <span className="text-slate-400">{sortIndicator('status')}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">
                    <button className="inline-flex items-center gap-2" onClick={() => handleSort('owner')} type="button">
                      Ответственный <span className="text-slate-400">{sortIndicator('owner')}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">
                    <button className="inline-flex items-center gap-2" onClick={() => handleSort('project')} type="button">
                      Проект <span className="text-slate-400">{sortIndicator('project')}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">
                    <button className="inline-flex items-center gap-2" onClick={() => handleSort('deadline')} type="button">
                      Дедлайн <span className="text-slate-400">{sortIndicator('deadline')}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Отчеты</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sortedTasks.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={9}>
                      По заданным фильтрам задач не найдено.
                      <div className="mt-3">
                        <button
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={resetFilters}
                          type="button"
                        >
                          Сбросить фильтры
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedTasks.map((task) => (
                    <tr key={task.id}>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{task.title}</div>
                        {task.description ? (
                          <div className="mt-1 max-w-md text-xs text-slate-500">{task.description}</div>
                        ) : null}
                      </td>
  <td className="px-4 py-4">
                        <div className="space-y-2">
                          <span className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 min-w-fit">
                            {taskTypeLabel(task.task_type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{task.priority}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 min-w-fit">
                          {taskStatusLabel(task.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        <div className="flex flex-col gap-1">
                          <span>{task.owner?.full_name ?? userNameById.get(task.owner_id) ?? 'Неизвестный пользователь'}</span>
                          {task.assistants_user_ids?.length ? (
                            <span className="text-xs text-slate-500">Помощники: {task.assistants_user_ids.length}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {projectNameById.get(task.project_id ?? -1) ?? 'Без проекта'}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{formatIsoDateTimeRu(task.deadline)}</td>
                      <td className="px-4 py-4 text-slate-700">{task.reports.length}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">

                          <button
                            className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            onClick={() => handleOpenTask(task.id)}
                            type="button"
                          >
                            Открыть
                          </button>

                          {canDeleteTask ? (
                            <button
                              className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={deletingTaskId === task.id}
                              onClick={() => {
                                void handleDeleteTask(task.id)
                              }}
                              type="button"
                            >
                              {deletingTaskId === task.id ? 'Удаляем...' : 'Удалить'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 min-h-[420px]">
            <KanbanBoard
              canUpdateTaskStatus={canUpdateTaskStatus}
              onOpenTask={handleOpenTask}
              onUpdateTaskStatus={(task, status) => {
                void handleUpdateTaskStatus(task, status)
              }}
              projectNameById={projectNameById}
              tasks={displayedTasks}
              updatingTaskId={updatingTaskId}
              userNameById={userNameById}
            />
          </div>
        )}
      </section>

      {selectedTask ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={handleCloseTask}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"
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
                    onClick={handleCloseTask}
                    to={`/projects/${selectedTask.project_id}`}
                  >
                    Перейти к проекту
                  </Link>
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

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Статус</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{taskStatusLabel(selectedTask.status)}</p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Категория</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{taskTypeLabel(selectedTask.task_type)}</p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ответственный</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {selectedTask.owner?.full_name ?? userNameById.get(selectedTask.owner_id) ?? 'Неизвестный пользователь'}
                </p>
                {selectedTask.assistants_user_ids?.length ? (
                  <p className="mt-2 truncate text-sm font-semibold text-slate-700">
                    Помощники:{' '}
                    {selectedTask.assistants_user_ids
                      .map((id) => userNameById.get(id) ?? `#${id}`)
                      .join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Помощников нет</p>
                )}
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
                    void handleUpdateTaskStatus(selectedTask, event.target.value)
                  }}
                  value={selectedTask.status}
                >
                  <option value="pending">Ожидает</option>
                  <option value="in_progress">В работе</option>
                  <option value="in_review">На проверке</option>
                  <option value="completed">Завершена</option>
                  <option value="overdue">Просрочена</option>
                  <option value="archived">В архиве</option>
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

            <section className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-2">
                <h4 className="text-xl font-semibold text-slate-900">Отчет по выполнению</h4>
              </div>

              {canSubmitReport ? (
                selectedTask.task_type === 'manager_assigned' && (selectedTask.status === 'pending' || selectedTask.status === 'overdue') ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900">
                      Сначала примите задачу (кнопка доступна в уведомлениях)
                    </div>
                  </div>
                ) : selectedTaskNeedsManagerApproval ? (
                  <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Ожидает согласования руководителем.
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                        {reportError ? (
                          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{reportError}</div>
                        ) : null}

                    {reportSuccess ? (
                      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {reportSuccess}
                      </div>
                    ) : null}

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Комментарий исполнителя</span>
                      <textarea
                        className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                        onChange={(event) => setReportComment(event.target.value)}
                        placeholder="Опишите, что было сделано и какой результат получен"
                        value={reportComment}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Файл отчета</span>
                      <input
                        key={reportInputKey}
                        className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-semibold file:text-slate-700"
                        onChange={(event) => setReportFile(event.target.files?.[0] ?? null)}
                        type="file"
                      />
                    </label>

                    {taskNeedsWorkflowReport(selectedTask) ? (
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-slate-700">Маршрут согласования</span>
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                          onChange={(event) => setReportDefinitionId(event.target.value ? Number(event.target.value) : '')}
                          value={reportDefinitionId}
                        >
                          <option value="">Выберите маршрут согласования</option>
                          {publishedWorkflowDefinitions.map((definition) => (
                            <option key={definition.id} value={definition.id}>
                              {definition.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500">
                          {selectedWorkflowDefinition
                            ? `Будет запущен шаблон "${selectedWorkflowDefinition.name}".`
                            : 'Сначала выберите опубликованный шаблон согласования.'}
                        </p>
                      </label>
                    ) : null}

                    <button
                      className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={
                        isSubmittingReport ||
                        (!reportComment.trim() && !reportFile) ||
                        (taskNeedsWorkflowReport(selectedTask) && !reportDefinitionId)
                      }
                      onClick={() => {
                        void handleSubmitReport()
                      }}
                      type="button"
                    >
                      {isSubmittingReport ? 'Отправляем отчет...' : 'Отправить отчет'}
                    </button>
                  </div>
                )
              ) : null}

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
                  selectedTask.reports.map((report) => (
                    <article key={report.id} className="rounded-3xl bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{renderReportAuthor(report)}</p>
                          <p className="mt-1 text-xs text-slate-500">{new Date(report.created_at).toLocaleString('ru-RU')}</p>
                        </div>
                        {report.original_filename && getFileUrl(report.file_url) ? (
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
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default TaskList
