import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

import api from '../api/api'
import type { Project, RoleName, Task, User, WorkloadSettings } from '../types'
import { useAuth } from '../store/authStore'
import { projectStatusLabel, roleLabel, taskStatusLabel, taskTypeLabel } from '../utils/labels'
import { formatIsoDateTimeRu } from '../utils/datetime'

const STATUS_COLORS: Record<string, string> = {
  pending: '#9f8f8a',
  in_progress: '#d22630',
  in_review: '#d38b1f',
  completed: '#3d8c52',
  overdue: '#8f1018',
  archived: '#7a6b66',
}

const TYPE_COLORS: Record<string, string> = {
  manager_assigned: '#d22630',
  daily: '#231815',
}

const ROLE_COLORS: Record<RoleName, string> = {
  Admin: '#8f1018',
  FinancialDirector: '#d22630',
  DepartmentHead: '#b4202a',
  Manager: '#d38b1f',
  Executor: '#5d514d',
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'short',
  year: '2-digit',
})

type DistributionItem = {
  key: string
  label: string
  value: number
  color: string
  hint?: string
}

type InsightFilter =
  | { kind: 'all'; label: string }
  | { kind: 'status'; value: string; label: string }
  | { kind: 'taskType'; value: Task['task_type']; label: string }
  | { kind: 'role'; value: RoleName; label: string }
  | { kind: 'employee'; value: number; label: string }
  | { kind: 'project'; value: number; label: string }
  | {
      kind: 'metric'
      value:
        | 'active'
        | 'completed'
        | 'overdue'
        | 'daily'
        | 'in_review'
        | 'with_reports'
        | 'manager_pending'
        | 'daily_pending'
      label: string
    }
  | { kind: 'deadline'; value: number; label: string }

type FocusAction =
  | { kind: 'task'; id: number; label: string; ownerId: number; ownerLabel: string }
  | { kind: 'employee'; id: number; label: string }

const ALL_FILTER: InsightFilter = { kind: 'all', label: 'Вся система' }

const formatPercent = (value: number) => `${Math.round(value)}%`

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)

const COLLAPSED_EMPLOYEE_CARDS = 4

const MiniRing = ({
  value,
  total,
  color,
  size = 76,
}: {
  value: number
  total: number
  color: string
  size?: number
}) => {
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? Math.max(0, Math.min(value / total, 1)) : 0
  const dashOffset = circumference * (1 - progress)

  return (
    <svg className="-rotate-90" height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="rgba(210, 38, 48, 0.12)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  )
}

const ClickableMetricCard = ({
  title,
  value,
  subtitle,
  accent,
  active,
  onClick,
}: {
  title: string
  value: string
  subtitle?: string
  accent: string
  active: boolean
  onClick: () => void
}) => (
  <button
    className={`group rounded-[2rem] border p-5 text-left shadow-sm transition ${
      active
        ? 'border-transparent bg-white ring-2 ring-[rgba(210,38,48,0.28)]'
        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[rgba(210,38,48,0.35)] hover:shadow-md'
    }`}
    onClick={onClick}
    type="button"
  >
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{title}</p>
        <p className="mt-3 text-4xl font-semibold text-slate-900">{value}</p>
        {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="h-12 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
    </div>
  </button>
)

const InteractiveDonutChart = ({
  title,
  description,
  data,
  total,
  centerLabel,
  centerCaption,
  activeKey,
  onSelect,
}: {
  title: string
  description?: string
  data: DistributionItem[]
  total: number
  centerLabel: string
  centerCaption: string
  activeKey: string | null
  onSelect: (item: DistributionItem) => void
}) => {
  const radius = 62
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}

      <div className="mt-6 grid gap-5">
        <div className="mx-auto flex w-full max-w-[190px] justify-center">
          <div className="relative h-[190px] w-[190px]">
            <svg className="h-[190px] w-[190px] -rotate-90" viewBox="0 0 180 180">
              <circle cx="90" cy="90" fill="none" r={radius} stroke="#f0e4de" strokeWidth="18" />
              {data.map((item) => {
                const segmentLength = total > 0 ? (item.value / total) * circumference : 0
                const segment = (
                  <circle
                    key={item.key}
                    cx="90"
                    cy="90"
                    fill="none"
                    r={radius}
                    stroke={item.color}
                    strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="round"
                    strokeWidth={activeKey === item.key ? 22 : 18}
                    style={{ transition: 'stroke-width 180ms ease, opacity 180ms ease', opacity: activeKey && activeKey !== item.key ? 0.35 : 1 }}
                  />
                )
                offset += segmentLength
                return segment
              })}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <div className="text-4xl font-semibold text-slate-900">{centerLabel}</div>
              <div className="mt-2 max-w-[120px] text-[10px] uppercase tracking-[0.18em] text-slate-500">{centerCaption}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {data.map((item) => (
            <button
              key={item.key}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                activeKey === item.key
                  ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                  : 'border-slate-200 bg-slate-50 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
              }`}
              onClick={() => onSelect(item)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-900">{item.label}</span>
                </div>
                {item.hint ? <p className="mt-1 pl-6 text-xs text-slate-500">{item.hint}</p> : null}
              </div>
              <span className="shrink-0 text-sm font-semibold text-slate-700">{item.value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const Dashboard = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<InsightFilter>(ALL_FILTER)
  const [focusAction, setFocusAction] = useState<FocusAction | null>(null)
  const { user } = useAuth()
  const canManageTasks = ['Admin', 'FinancialDirector', 'DepartmentHead', 'Manager'].includes(user?.role.name as RoleName)

  const [workloadSettings, setWorkloadSettings] = useState<WorkloadSettings | null>(null)
  const [isWorkloadSettingsSaving, setIsWorkloadSettingsSaving] = useState(false)
  const [workloadSettingsError, setWorkloadSettingsError] = useState<string | null>(null)
  const [isWorkloadSettingsOpen, setIsWorkloadSettingsOpen] = useState(false)

  const [workloadSettingsDraft, setWorkloadSettingsDraft] = useState<{
    max_tasks_for_100: number
    max_critical_tasks_for_100: number
    critical_priority_threshold: number
    base_task_weight: number
    priority_weight_step: number
    critical_task_multiplier: number
  } | null>(null)

  const [workloadSettingsDraftTouched, setWorkloadSettingsDraftTouched] = useState(false)

  const [isWorkloadExpanded, setIsWorkloadExpanded] = useState(false)
  const [isProductivityExpanded, setIsProductivityExpanded] = useState(false)
  const [userQuery, setUserQuery] = useState('')

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [tasksResponse, projectsResponse, usersResponse, workloadSettingsResponse] = await Promise.all([
          api.get<Task[]>('/tasks'),
          api.get<Project[]>('/projects'),
          api.get<User[]>('/users'),
          api.get<WorkloadSettings>('/settings/workload'),
        ])
        setTasks(tasksResponse.data)
        setProjects(projectsResponse.data)
        setUsers(usersResponse.data)
        setWorkloadSettings(workloadSettingsResponse.data)
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(caughtError.response?.data?.detail ?? 'Не удалось загрузить данные панели')
        } else {
          setError('Не удалось загрузить данные панели')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadDashboardData()
  }, [])

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'archived'), [tasks])
  const activeProjects = useMemo(() => projects.filter((project) => project.status === 'active'), [projects])
  const completedTasks = useMemo(() => activeTasks.filter((task) => task.status === 'completed'), [activeTasks])
  const overdueTasks = useMemo(() => activeTasks.filter((task) => task.status === 'overdue'), [activeTasks])
  const tasksInReview = useMemo(() => activeTasks.filter((task) => task.status === 'in_review'), [activeTasks])
  const dailyTasks = useMemo(() => activeTasks.filter((task) => task.task_type === 'daily'), [activeTasks])
  const managerAssignedTasks = useMemo(
    () => activeTasks.filter((task) => task.task_type === 'manager_assigned'),
    [activeTasks],
  )
  const dailyApprovedTasks = useMemo(
    () => dailyTasks.filter((task) => task.daily_approved_once),
    [dailyTasks],
  )
  const tasksWithReports = useMemo(() => activeTasks.filter((task) => task.reports.length > 0), [activeTasks])
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])

  const completionRate = activeTasks.length > 0 ? (completedTasks.length / activeTasks.length) * 100 : 0
  const overdueRate = activeTasks.length > 0 ? (overdueTasks.length / activeTasks.length) * 100 : 0
  const reportCoverageRate = activeTasks.length > 0 ? (tasksWithReports.length / activeTasks.length) * 100 : 0
  const dailyApprovalRate = dailyTasks.length > 0 ? (dailyApprovedTasks.length / dailyTasks.length) * 100 : 0
  const avgTasksPerEmployee = users.length > 0 ? activeTasks.length / users.length : 0
  const totalBudget = activeProjects.reduce((sum, project) => sum + project.budget, 0)
  const managerPendingCount = managerAssignedTasks.filter((task) => task.status === 'pending' || task.status === 'overdue').length
  const dailyPendingCount = dailyTasks.filter((task) => !task.daily_approved_once).length

  const statusDistribution = useMemo<DistributionItem[]>(() => {
    const stats = activeTasks.reduce<Record<string, number>>((accumulator, task) => {
      accumulator[task.status] = (accumulator[task.status] ?? 0) + 1
      return accumulator
    }, {})

    return Object.entries(stats)
      .map(([status, value]) => ({
        key: status,
        label: taskStatusLabel(status),
        value,
        color: STATUS_COLORS[status] ?? '#7a6b66',
      }))
      .sort((left, right) => right.value - left.value)
  }, [activeTasks])

  const taskTypeDistribution = useMemo<DistributionItem[]>(() => {
    const stats = activeTasks.reduce<Record<string, number>>((accumulator, task) => {
      accumulator[task.task_type] = (accumulator[task.task_type] ?? 0) + 1
      return accumulator
    }, {})

    return Object.entries(stats)
      .map(([taskType, value]) => ({
        key: taskType,
        label: taskTypeLabel(taskType as Task['task_type']),
        value,
        color: TYPE_COLORS[taskType] ?? '#7a6b66',
        hint:
          taskType === 'daily'
            ? `${dailyPendingCount} ждут первого согласования`
            : `${managerPendingCount} ждут принятия исполнителем`,
      }))
      .sort((left, right) => right.value - left.value)
  }, [activeTasks, dailyPendingCount, managerPendingCount])

  const roleDistribution = useMemo<DistributionItem[]>(() => {
    const stats = activeTasks.reduce<Record<RoleName, number>>((accumulator, task) => {
      const role = userMap.get(task.owner_id)?.role.name
      if (!role) {
        return accumulator
      }
      accumulator[role] = (accumulator[role] ?? 0) + 1
      return accumulator
    }, {} as Record<RoleName, number>)

    return Object.entries(stats)
      .map(([role, value]) => ({
        key: role,
        label: roleLabel(role as RoleName),
        value,
        color: ROLE_COLORS[role as RoleName] ?? '#7a6b66',
      }))
      .sort((left, right) => right.value - left.value)
  }, [activeTasks, userMap])

  const workloadByUser = useMemo(() => {
    const settings = workloadSettings
    const baseTaskWeight = settings?.base_task_weight ?? 1
    const priorityWeightStep = settings?.priority_weight_step ?? 0
    const criticalPriorityThreshold = settings?.critical_priority_threshold ?? 5
    const criticalTaskMultiplier = settings?.critical_task_multiplier ?? 2
    const maxTasksFor100 = settings?.max_tasks_for_100 ?? 10
    const maxCriticalTasksFor100 = settings?.max_critical_tasks_for_100 ?? 3

    const getTaskWeight = (priority: number) => {
      const weightBase = baseTaskWeight + priorityWeightStep * (priority - 1)
      const isCritical = priority >= criticalPriorityThreshold
      return isCritical ? weightBase * criticalTaskMultiplier : weightBase
    }

    // 100% calibration:
    // - base part: max_tasks_for_100 tasks with priority=1
    // - critical part: max_critical_tasks_for_100 tasks with priority=critical_priority_threshold
    const maxScoreBase = maxTasksFor100 * (baseTaskWeight + priorityWeightStep * (1 - 1))
    const maxScoreCritical =
      maxCriticalTasksFor100 * (baseTaskWeight + priorityWeightStep * (criticalPriorityThreshold - 1)) * criticalTaskMultiplier
    const maxScore = maxScoreBase + maxScoreCritical

    const percentFromScore = (score: number) => {
      if (!Number.isFinite(score) || score <= 0) return 0
      if (maxScore <= 0) return 0
      return Math.max(0, Math.min(100, (score / maxScore) * 100))
    }

    const buckets = activeTasks.reduce<
      Record<
        number,
        {
          activeCount: number
          totalCount: number
          completed: number
          score: number
        }
      >
    >((acc, task) => {
      const ownerId = task.owner_id
      const existing = acc[ownerId] ?? { activeCount: 0, totalCount: 0, completed: 0, score: 0 }
      existing.totalCount += 1
      if (task.status === 'completed') {
        existing.completed += 1
      } else {
        existing.activeCount += 1
        existing.score += getTaskWeight(task.priority)
      }
      acc[ownerId] = existing
      return acc
    }, {})

    return Object.entries(buckets)
      .map(([ownerId, b]) => {
        const owner = userMap.get(Number(ownerId))
        return {
          id: Number(ownerId),
          name: owner?.full_name ?? `Сотрудник #${ownerId}`,
          role: owner?.role.name,
          activeCount: b.activeCount,
          totalCount: b.totalCount,
          completed: b.completed,
          workloadPercent: percentFromScore(b.score),
        }
      })
      .sort((left, right) => right.workloadPercent - left.workloadPercent || right.activeCount - left.activeCount)
  }, [activeTasks, userMap, workloadSettings])

  const productivityByUser = useMemo(() => {
    const stats = activeTasks.reduce<Record<number, { completed: number; overdue: number; total: number }>>((accumulator, task) => {
      const bucket = accumulator[task.owner_id] ?? { completed: 0, overdue: 0, total: 0 }
      bucket.total += 1
      if (task.status === 'completed') {
        bucket.completed += 1
      }
      if (task.status === 'overdue') {
        bucket.overdue += 1
      }
      accumulator[task.owner_id] = bucket
      return accumulator
    }, {})

    return Object.entries(stats)
      .map(([ownerId, stat]) => {
        const owner = userMap.get(Number(ownerId))
        const efficiency = stat.total > 0 ? (stat.completed / stat.total) * 100 : 0
        return {
          id: Number(ownerId),
          name: owner?.full_name ?? `Сотрудник #${ownerId}`,
          role: owner?.role.name,
          completed: stat.completed,
          overdue: stat.overdue,
          total: stat.total,
          efficiency,
        }
      })
      .sort((left, right) => right.efficiency - left.efficiency || right.completed - left.completed)
  }, [activeTasks, userMap])

  const roleAnalytics = useMemo(() => {
    const stats = users.reduce<Record<RoleName, { people: number; active: number; completed: number; overdue: number; daily: number }>>(
      (accumulator, user) => {
        const role = user.role.name
        const bucket = accumulator[role] ?? { people: 0, active: 0, completed: 0, overdue: 0, daily: 0 }
        bucket.people += 1
        accumulator[role] = bucket
        return accumulator
      },
      {} as Record<RoleName, { people: number; active: number; completed: number; overdue: number; daily: number }>,
    )

    activeTasks.forEach((task) => {
      const role = userMap.get(task.owner_id)?.role.name
      if (!role) {
        return
      }
      const bucket = stats[role] ?? { people: 0, active: 0, completed: 0, overdue: 0, daily: 0 }
      bucket.active += 1
      if (task.status === 'completed') {
        bucket.completed += 1
      }
      if (task.status === 'overdue') {
        bucket.overdue += 1
      }
      if (task.task_type === 'daily') {
        bucket.daily += 1
      }
      stats[role] = bucket
    })

    return Object.entries(stats)
      .map(([role, stat]) => ({
        role: role as RoleName,
        ...stat,
        completionRate: stat.active > 0 ? (stat.completed / stat.active) * 100 : 0,
      }))
      .sort((left, right) => right.active - left.active)
  }, [activeTasks, userMap, users])

  const projectAnalytics = useMemo(() => {
    return projects
      .map((project) => {
        const projectTasks = activeTasks.filter((task) => task.project_id === project.id)
        const completed = projectTasks.filter((task) => task.status === 'completed').length
        const overdue = projectTasks.filter((task) => task.status === 'overdue').length
        const inReview = projectTasks.filter((task) => task.status === 'in_review').length
        const progress = projectTasks.length > 0 ? (completed / projectTasks.length) * 100 : 0

        return {
          id: project.id,
          name: project.name,
          status: project.status,
          budget: project.budget,
          totalTasks: projectTasks.length,
          completed,
          overdue,
          inReview,
          progress,
        }
      })
      .sort((left, right) => right.overdue - left.overdue || right.totalTasks - left.totalTasks)
      .slice(0, 6)
  }, [activeTasks, projects])

  const deadlinePressure = useMemo(() => {
    const now = Date.now()
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000

    return activeTasks
      .filter((task) => task.deadline && task.status !== 'completed')
      .map((task) => ({
        id: task.id,
        title: task.title,
        owner: userMap.get(task.owner_id)?.full_name ?? task.owner?.full_name ?? 'Неизвестный сотрудник',
        deadline: new Date(task.deadline!),
        status: task.status,
      }))
      .filter((task) => task.deadline.getTime() <= sevenDaysFromNow)
      .sort((left, right) => left.deadline.getTime() - right.deadline.getTime())
      .slice(0, 7)
  }, [activeTasks, userMap])

  const recentTrend = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      const key = `${date.getFullYear()}-${date.getMonth()}`
      return {
        key,
        label: MONTH_FORMATTER.format(date),
        created: 0,
        completed: 0,
      }
    })

    const monthMap = new Map(months.map((month) => [month.key, month]))

    activeTasks.forEach((task) => {
      const createdAt = new Date(task.created_at)
      const createdKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}`
      const createdBucket = monthMap.get(createdKey)
      if (createdBucket) {
        createdBucket.created += 1
      }

      if (task.status === 'completed') {
        const updatedAt = new Date(task.updated_at)
        const completedKey = `${updatedAt.getFullYear()}-${updatedAt.getMonth()}`
        const completedBucket = monthMap.get(completedKey)
        if (completedBucket) {
          completedBucket.completed += 1
        }
      }
    })

    return months
  }, [activeTasks])

  const trendMax = Math.max(...recentTrend.map((item) => Math.max(item.created, item.completed)), 1)

  const filteredWorkloadByUser = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return workloadByUser

    return workloadByUser.filter((item) => {
      const roleText = item.role ? roleLabel(item.role) : ''
      const haystack = `${item.name} ${roleText}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [userQuery, workloadByUser])

  const filteredProductivityByUser = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return productivityByUser

    return productivityByUser.filter((item) => {
      const roleText = item.role ? roleLabel(item.role) : ''
      const haystack = `${item.name} ${roleText}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [userQuery, productivityByUser])

  const visibleWorkloadByUser = isWorkloadExpanded ? filteredWorkloadByUser : filteredWorkloadByUser.slice(0, COLLAPSED_EMPLOYEE_CARDS)
  const visibleProductivityByUser = isProductivityExpanded
    ? filteredProductivityByUser
    : filteredProductivityByUser.slice(0, COLLAPSED_EMPLOYEE_CARDS)

  const hiddenWorkloadCount = Math.max(filteredWorkloadByUser.length - visibleWorkloadByUser.length, 0)
  const hiddenProductivityCount = Math.max(filteredProductivityByUser.length - visibleProductivityByUser.length, 0)

  const isSameFilter = (left: InsightFilter, right: InsightFilter) => {
    if (left.kind !== right.kind) {
      return false
    }
    if (left.kind === 'all' && right.kind === 'all') {
      return true
    }
    return 'value' in left && 'value' in right ? left.value === right.value : left.label === right.label
  }

  const toggleFilter = (filter: InsightFilter) => {
    setActiveFilter((current) => (isSameFilter(current, filter) ? ALL_FILTER : filter))
  }

  const openEmployeeMenu = (employeeId: number, employeeName: string) => {
    setFocusAction({ kind: 'employee', id: employeeId, label: employeeName })
  }

  const openTaskMenu = (task: Task) => {
    const ownerLabel = userMap.get(task.owner_id)?.full_name ?? task.owner?.full_name ?? 'Неизвестный сотрудник'
    setFocusAction({
      kind: 'task',
      id: task.id,
      label: task.title,
      ownerId: task.owner_id,
      ownerLabel,
    })
  }

  const openWorkloadSettings = () => {
    if (!workloadSettings) return
    setWorkloadSettingsDraft({
      max_tasks_for_100: workloadSettings.max_tasks_for_100,
      max_critical_tasks_for_100: workloadSettings.max_critical_tasks_for_100,
      critical_priority_threshold: workloadSettings.critical_priority_threshold,
      base_task_weight: workloadSettings.base_task_weight,
      priority_weight_step: workloadSettings.priority_weight_step,
      critical_task_multiplier: workloadSettings.critical_task_multiplier,
    })
    setWorkloadSettingsDraftTouched(false)
    setWorkloadSettingsError(null)
    setIsWorkloadSettingsOpen(true)
  }

  const closeWorkloadSettings = () => {
    setIsWorkloadSettingsOpen(false)
    setWorkloadSettingsDraftTouched(false)
    setWorkloadSettingsError(null)
  }

  const updateWorkloadSettingsDraft = <K extends keyof NonNullable<typeof workloadSettingsDraft>>(
    key: K,
    value: NonNullable<typeof workloadSettingsDraft>[K],
  ) => {
    setWorkloadSettingsDraft((prev) => {
      if (!prev) return prev
      return { ...prev, [key]: value }
    })
    setWorkloadSettingsDraftTouched(true)
  }

  const saveWorkloadSettings = async () => {
    if (!workloadSettingsDraft) return

    setIsWorkloadSettingsSaving(true)
    setWorkloadSettingsError(null)

    try {
      const { data } = await api.patch<WorkloadSettings>('/settings/workload', workloadSettingsDraft)
      setWorkloadSettings(data)
      setIsWorkloadSettingsOpen(false)
      setWorkloadSettingsDraftTouched(false)
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setWorkloadSettingsError(caughtError.response?.data?.detail ?? 'Не удалось сохранить настройки')
      } else {
        setWorkloadSettingsError('Не удалось сохранить настройки')
      }
    } finally {
      setIsWorkloadSettingsSaving(false)
    }
  }

  const filteredTasks = useMemo(() => {
    if (activeFilter.kind === 'all') {
      return activeTasks
    }

    return activeTasks.filter((task) => {
      switch (activeFilter.kind) {
        case 'status':
          return task.status === activeFilter.value
        case 'taskType':
          return task.task_type === activeFilter.value
        case 'role':
          return userMap.get(task.owner_id)?.role.name === activeFilter.value
        case 'employee':
          return task.owner_id === activeFilter.value
        case 'project':
          return task.project_id === activeFilter.value
        case 'deadline':
          return task.id === activeFilter.value
        case 'metric':
          switch (activeFilter.value) {
            case 'active':
              return task.status !== 'completed'
            case 'completed':
              return task.status === 'completed'
            case 'overdue':
              return task.status === 'overdue'
            case 'daily':
              return task.task_type === 'daily'
            case 'in_review':
              return task.status === 'in_review'
            case 'with_reports':
              return task.reports.length > 0
            case 'manager_pending':
              return task.task_type === 'manager_assigned' && (task.status === 'pending' || task.status === 'overdue')
            case 'daily_pending':
              return task.task_type === 'daily' && !task.daily_approved_once
          }
      }
    })
  }, [activeFilter, activeTasks, userMap])

  const filteredCompletedCount = filteredTasks.filter((task) => task.status === 'completed').length
  const filteredOverdueCount = filteredTasks.filter((task) => task.status === 'overdue').length
  const filteredReportsCount = filteredTasks.filter((task) => task.reports.length > 0).length
  const filteredCompletionRate = filteredTasks.length > 0 ? (filteredCompletedCount / filteredTasks.length) * 100 : 0

  const focusTasks = useMemo(() => {
    return [...filteredTasks]
      .sort((left, right) => {
        const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER
        const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER
        if (leftDeadline !== rightDeadline) {
          return leftDeadline - rightDeadline
        }
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      })
      .slice(0, 8)
  }, [filteredTasks])

  if (isLoading) {
    return <div className="rounded-[2rem] bg-white p-8 text-sm text-slate-500 shadow-sm">Загружаем аналитику...</div>
  }

return (
    <div className="space-y-6 pb-8 xl:pr-[424px]">
      <section
        className="overflow-hidden rounded-[2.25rem] border border-[rgba(255,255,255,0.14)] p-8 text-white shadow-[0_24px_60px_rgba(94,20,26,0.22)]"
        style={{
          background:
            'linear-gradient(135deg, rgba(116,11,18,0.98) 0%, rgba(210,38,48,0.96) 40%, rgba(50,17,19,0.98) 100%), radial-gradient(circle at top right, rgba(255,255,255,0.14), transparent 32%)',
        }}
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.38em] text-white/70">Аналитический модуль</p>
              <h1 className="mt-4 font-serif text-4xl font-bold leading-tight">Панель управления задачами, сотрудниками и проектами</h1>
            </div>

            <div className="rounded-[2rem] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-white/70">Текущий фокус</p>
              <p className="mt-3 text-2xl font-semibold">{activeFilter.label}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ClickableMetricCard
              accent="#ffffff"
              active={activeFilter.kind === 'metric' && activeFilter.value === 'active'}
              onClick={() => toggleFilter({ kind: 'metric', value: 'active', label: 'Активные задачи' })}
              subtitle="Все задачи, которые еще не завершены"
              title="Задач в работе"
              value={String(activeTasks.length - completedTasks.length)}
            />
            <ClickableMetricCard
              accent="#ffe6a7"
              active={activeFilter.kind === 'metric' && activeFilter.value === 'with_reports'}
              onClick={() => toggleFilter({ kind: 'metric', value: 'with_reports', label: 'Задачи с отчетами' })}
              subtitle={`${tasksWithReports.length} задач уже содержат отчеты`}
              title="Покрытие отчетами"
              value={formatPercent(reportCoverageRate)}
            />
            <ClickableMetricCard
              accent="#ffd4d7"
              active={activeFilter.kind === 'metric' && activeFilter.value === 'daily'}
              onClick={() => toggleFilter({ kind: 'metric', value: 'daily', label: 'Ежедневные задачи' })}
              subtitle={`Согласовано ${formatPercent(dailyApprovalRate)} ежедневных задач`}
              title="Ежедневные задачи"
              value={String(dailyTasks.length)}
            />
            <ClickableMetricCard
              accent="#f7b2b7"
              active={activeFilter.kind === 'metric' && activeFilter.value === 'in_review'}
              onClick={() => toggleFilter({ kind: 'metric', value: 'in_review', label: 'Задачи на проверке' })}
              subtitle="Задачи, которые прямо сейчас находятся на согласовании"
              title="На проверке"
              value={String(tasksInReview.length)}
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ClickableMetricCard
          accent="#d22630"
          active={activeFilter.kind === 'all'}
          onClick={() => setActiveFilter(ALL_FILTER)}
              subtitle=""
          title="Все активные задачи"
          value={String(activeTasks.length)}
        />
        <ClickableMetricCard
          accent="#3d8c52"
          active={activeFilter.kind === 'metric' && activeFilter.value === 'completed'}
          onClick={() => toggleFilter({ kind: 'metric', value: 'completed', label: 'Завершенные задачи' })}
          subtitle={`${formatPercent(completionRate)} от активного контура`}
          title="Завершение"
          value={String(completedTasks.length)}
        />
        <ClickableMetricCard
          accent="#8f1018"
          active={activeFilter.kind === 'metric' && activeFilter.value === 'overdue'}
          onClick={() => toggleFilter({ kind: 'metric', value: 'overdue', label: 'Просроченные задачи' })}
          subtitle={`${formatPercent(overdueRate)} требуют внимания`}
          title="Просрочка"
          value={String(overdueTasks.length)}
        />
        <ClickableMetricCard
          accent="#231815"
          active={activeFilter.kind === 'metric' && activeFilter.value === 'manager_pending'}
          onClick={() => toggleFilter({ kind: 'metric', value: 'manager_pending', label: 'Ждут принятия исполнителем' })}
          subtitle={`Средняя нагрузка ${avgTasksPerEmployee.toFixed(avgTasksPerEmployee >= 10 ? 0 : 1)} задач на человека`}
          title="Активный бюджет"
          value={formatCompactNumber(totalBudget)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <InteractiveDonutChart
          activeKey={activeFilter.kind === 'status' ? activeFilter.value : null}
          centerCaption="активных задач"
          centerLabel={String(activeTasks.length)}
          data={statusDistribution}
          description=""
          onSelect={(item) => toggleFilter({ kind: 'status', value: item.key, label: item.label })}
          title="Структура по статусам"
          total={activeTasks.length}
        />

        <InteractiveDonutChart
          activeKey={activeFilter.kind === 'taskType' ? activeFilter.value : null}
          centerCaption="ежедневных"
          centerLabel={String(dailyTasks.length)}
          data={taskTypeDistribution}
          description=""
          onSelect={(item) => toggleFilter({ kind: 'taskType', value: item.key as Task['task_type'], label: item.label })}
          title="Типы задач"
          total={activeTasks.length}
        />

        <InteractiveDonutChart
          activeKey={activeFilter.kind === 'role' ? activeFilter.value : null}
          centerCaption="ролей с задачами"
          centerLabel={String(roleDistribution.length)}
          data={roleDistribution}
          description=""
          onSelect={(item) => toggleFilter({ kind: 'role', value: item.key as RoleName, label: item.label })}
          title="Распределение по ролям"
          total={activeTasks.length}
        />
      </section>

      <section className="grid gap-6">
<div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm xl:fixed xl:bottom-6 xl:right-6 xl:top-28 xl:z-50 xl:w-[400px] xl:overflow-y-auto xl:p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Фокус панели</h2>
              </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{activeFilter.label}</div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Задачи</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{filteredTasks.length}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Завершение</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-700">{formatPercent(filteredCompletionRate)}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Просрочка</p>
              <p className="mt-3 text-3xl font-semibold text-rose-700">{filteredOverdueCount}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">С отчетами</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{filteredReportsCount}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 relative z-0">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Фильтр</p>
              <p className="mt-1 w-full truncate font-semibold text-slate-900">{activeFilter.label}</p>
            </div>
            <button
              className="shrink-0 rounded-full border border-[rgba(210,38,48,0.28)] bg-[rgba(210,38,48,0.06)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(210,38,48,0.10)]"
              onClick={() => {
                setActiveFilter(ALL_FILTER)
                setFocusAction(null)
              }}
              type="button"
            >
              Сбросить фильтр
            </button>
          </div>

          {focusAction ? (
            <div className="relative z-20">
              <div className="mt-4 flex items-start justify-between gap-3 relative z-10">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {focusAction.kind === 'task' ? 'Задача' : 'Сотрудник'}
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">{focusAction.label}</p>
                  {focusAction.kind === 'task' ? (
                    <button
                      className="mt-2 text-xs font-semibold text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
                      onClick={() => openEmployeeMenu(focusAction.ownerId, focusAction.ownerLabel)}
                      type="button"
                    >
                      {focusAction.ownerLabel}
                    </button>
                  ) : null}
                </div>
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  onClick={() => setFocusAction(null)}
                  type="button"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                <button
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  onClick={() =>
                    setActiveFilter(
                      focusAction.kind === 'task'
                        ? { kind: 'deadline', value: focusAction.id, label: focusAction.label }
                        : { kind: 'employee', value: focusAction.id, label: focusAction.label },
                    )
                  }
                  type="button"
                >
                  Показать в фокусе
                </button>
                <Link
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  to={focusAction.kind === 'task' ? `/tasks?task=${focusAction.id}` : `/tasks?owner=${focusAction.id}`}
                >
                  {focusAction.kind === 'task' ? 'Перейти к задаче' : 'Перейти к задачам сотрудника'}
                </Link>
              </div>
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {focusTasks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                Для выбранного фильтра задач пока нет.
              </div>
            ) : (
              focusTasks.map((task) => {
                const ownerName = userMap.get(task.owner_id)?.full_name ?? task.owner?.full_name ?? 'Неизвестный сотрудник'

                return (
                  <article key={task.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <button className="block w-full text-left" onClick={() => openTaskMenu(task)} type="button">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900">{task.title}</h3>
                          {task.description ? (
                            <p className="mt-1 max-h-10 overflow-hidden text-xs leading-5 text-slate-500">{task.description}</p>
                          ) : null}
                        </div>
                        <span
                          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
                          style={{ backgroundColor: STATUS_COLORS[task.status] ?? '#7a6b66' }}
                        >
                          {taskStatusLabel(task.status)}
                        </span>
                      </div>
                    </button>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1 font-semibold">{taskTypeLabel(task.task_type)}</span>
                      <button
                        className="rounded-full bg-white px-3 py-1 font-semibold transition hover:bg-slate-100"
                        onClick={() => openEmployeeMenu(task.owner_id, ownerName)}
                        type="button"
                      >
                        {ownerName}
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        onClick={(event) => {
                          event.stopPropagation()
                          window.location.href = `/tasks?task=${task.id}`
                        }}
                      >
                        {task.deadline ? formatIsoDateTimeRu(task.deadline) : 'Без дедлайна'}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>

      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">Нагрузка сотрудников</h2>
              {canManageTasks ? (
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[rgba(210,38,48,0.35)] hover:bg-slate-50 disabled:opacity-50"
                  onClick={openWorkloadSettings}
                  disabled={!workloadSettings || isWorkloadSettingsSaving}
                >
                  {isWorkloadSettingsSaving ? 'Сохранение…' : 'Настройки'}
                </button>
              ) : null}
            </div>

            {canManageTasks && isWorkloadSettingsOpen ? (
              <div className="fixed inset-0 z-[100] flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
                  onClick={closeWorkloadSettings}
                  role="button"
                  tabIndex={0}
                />
                <div className="relative w-full max-w-[560px] rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">Настройки нагрузки сотрудников</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        100% соответствует заданному администратором “эталонному” уровню.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      onClick={closeWorkloadSettings}
                      aria-label="Закрыть"
                    >
                      Закрыть
                    </button>
                  </div>

                  {workloadSettingsError ? (
                    <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{workloadSettingsError}</div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-semibold text-blue-900">💡 Как работает расчет нагрузки:</p>
                    <p className="mt-2 text-xs text-blue-800">
                      Нагрузка = (количество обычных задач ÷ база) × 50% + (критичные задачи × множитель ÷ база критичных) × 50%
                    </p>
                  </div>

                  <div className="mt-5 space-y-5">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Максимальное количество обычных задач для 100%</p>
                          <p className="mt-1 text-xs text-slate-600">Количество задач с нормальным приоритетом, при котором нагрузка = 100%</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">{workloadSettingsDraft?.max_tasks_for_100 ?? 0}</p>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={50}
                        step={1}
                        className="mt-3 w-full"
                        value={workloadSettingsDraft?.max_tasks_for_100 ?? 0}
                        onChange={(e) => updateWorkloadSettingsDraft('max_tasks_for_100', Number(e.target.value))}
                      />
                      <div className="mt-3 flex gap-3">
                        <label className="block flex-1">
                          <span className="text-xs font-semibold text-slate-500">Вручную</span>
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                            value={workloadSettingsDraft?.max_tasks_for_100 ?? 0}
                            min={1}
                            onChange={(e) => updateWorkloadSettingsDraft('max_tasks_for_100', Math.max(1, Number(e.target.value)))}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Максимум критичных задач для 100%</p>
                          <p className="mt-1 text-xs text-slate-600">Количество критичных задач, при котором их нагрузка = 100%</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">{workloadSettingsDraft?.max_critical_tasks_for_100 ?? 0}</p>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        className="mt-3 w-full"
                        value={workloadSettingsDraft?.max_critical_tasks_for_100 ?? 0}
                        onChange={(e) => updateWorkloadSettingsDraft('max_critical_tasks_for_100', Number(e.target.value))}
                      />
                      <div className="mt-3 flex gap-3">
                        <label className="block flex-1">
                          <span className="text-xs font-semibold text-slate-500">Вручную</span>
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                            value={workloadSettingsDraft?.max_critical_tasks_for_100 ?? 0}
                            min={1}
                            onChange={(e) => updateWorkloadSettingsDraft('max_critical_tasks_for_100', Math.max(1, Number(e.target.value)))}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">Порог “критичности” (priority ≥ )</p>
                          <p className="text-sm font-semibold text-slate-700">{workloadSettingsDraft?.critical_priority_threshold ?? 0}</p>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          className="mt-2 w-full"
                          value={workloadSettingsDraft?.critical_priority_threshold ?? 1}
onChange={(e) => updateWorkloadSettingsDraft('critical_priority_threshold', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                          value={workloadSettingsDraft?.critical_priority_threshold ?? 1}
                          min={1}
                          max={5}
                          onChange={(e) => updateWorkloadSettingsDraft('critical_priority_threshold', Number(e.target.value) as any)}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">Множитель критичных</p>
                          <p className="text-sm font-semibold text-slate-700">{workloadSettingsDraft?.critical_task_multiplier ?? 1}</p>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          className="mt-2 w-full"
                          value={workloadSettingsDraft?.critical_task_multiplier ?? 1}
                          onChange={(e) => updateWorkloadSettingsDraft('critical_task_multiplier', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                          value={workloadSettingsDraft?.critical_task_multiplier ?? 1}
                          min={1}
                          max={5}
                          onChange={(e) => updateWorkloadSettingsDraft('critical_task_multiplier', Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">Вес priority=1</p>
                          <p className="text-sm font-semibold text-slate-700">{workloadSettingsDraft?.base_task_weight ?? 0}</p>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={1}
                          className="mt-2 w-full"
                          value={workloadSettingsDraft?.base_task_weight ?? 0}
                          onChange={(e) => updateWorkloadSettingsDraft('base_task_weight', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                          value={workloadSettingsDraft?.base_task_weight ?? 0}
                          min={0}
                          onChange={(e) => updateWorkloadSettingsDraft('base_task_weight', Number(e.target.value))}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">Шаг веса (priority растёт)</p>
                          <p className="text-sm font-semibold text-slate-700">{workloadSettingsDraft?.priority_weight_step ?? 0}</p>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={1}
                          className="mt-2 w-full"
                          value={workloadSettingsDraft?.priority_weight_step ?? 0}
                          onChange={(e) => updateWorkloadSettingsDraft('priority_weight_step', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                          value={workloadSettingsDraft?.priority_weight_step ?? 0}
                          min={0}
                          max={5}
                          onChange={(e) => updateWorkloadSettingsDraft('priority_weight_step', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-900">📊 Примеры расчета:</p>
                    <div className="mt-3 space-y-2 text-xs text-amber-800">
                      <p><strong>Сценарий 1:</strong> Сотрудник с 10 обычными задачами (priority 1) = 100% (база)</p>
                      <p><strong>Сценарий 2:</strong> Сотрудник с 3 критичными задачами (priority 5) = 100% (критичная база)</p>
                      <p><strong>Сценарий 3:</strong> Сотрудник с 5 обычными + 1 критичной = ~50% + ~17% = ~67%</p>
                      <p><strong>Совет:</strong> Начните с базовых значений (10/3) и мониторьте нагрузку в течение недели, затем оптимизируйте.</p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        if (!workloadSettings) return
                        setWorkloadSettingsDraft({
                          max_tasks_for_100: workloadSettings.max_tasks_for_100,
                          max_critical_tasks_for_100: workloadSettings.max_critical_tasks_for_100,
                          critical_priority_threshold: workloadSettings.critical_priority_threshold,
                          base_task_weight: workloadSettings.base_task_weight,
                          priority_weight_step: workloadSettings.priority_weight_step,
                          critical_task_multiplier: workloadSettings.critical_task_multiplier,
                        })
                        setWorkloadSettingsDraftTouched(false)
                        setWorkloadSettingsError(null)
                      }}
                      disabled={!workloadSettingsDraftTouched || isWorkloadSettingsSaving}
                    >
                      Сбросить
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      onClick={saveWorkloadSettings}
                      disabled={!workloadSettingsDraftTouched || isWorkloadSettingsSaving}
                    >
                      {isWorkloadSettingsSaving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <label className="w-full sm:max-w-[340px]">
              <span className="sr-only">Поиск по пользователям</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                placeholder="Поиск по ФИО / роли..."
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-6 grid min-h-[320px] gap-4 md:grid-cols-2">
            {filteredWorkloadByUser.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 md:col-span-2">
                {userQuery.trim() ? 'Ничего не найдено по этому запросу.' : 'Недостаточно данных для отображения нагрузки.'}
              </div>
            ) : (
              visibleWorkloadByUser.map((item) => (
                <button
                  key={item.id}
                  className={`rounded-3xl border p-4 text-left transition ${
                    activeFilter.kind === 'employee' && activeFilter.value === item.id
                      ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                      : 'border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                  }`}
                  onClick={() => openEmployeeMenu(item.id, item.name)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.role ? roleLabel(item.role) : 'Роль не определена'}</p>
                    </div>
                    <div className="relative h-[76px] w-[76px] shrink-0">
                      <MiniRing color="#d22630" total={100} value={item.workloadPercent} />
                      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-900">
                        {formatPercent(item.workloadPercent)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700">
                      Загруженность: {formatPercent(item.workloadPercent)}
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-3 text-sm text-emerald-700">Завершено: {item.completed}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {filteredWorkloadByUser.length > COLLAPSED_EMPLOYEE_CARDS ? (
            <button
              className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[rgba(210,38,48,0.35)] hover:bg-white"
              onClick={() => setIsWorkloadExpanded((current) => !current)}
              type="button"
            >
              {isWorkloadExpanded ? 'Скрыть лишние карточки' : `Показать еще ${hiddenWorkloadCount}`}
            </button>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Сотрудники с лучшей динамикой</h2>

          <div className="mt-6 min-h-[320px] space-y-4">
            {filteredProductivityByUser.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                {userQuery.trim() ? 'Ничего не найдено по этому запросу.' : 'Пока недостаточно данных по сотрудникам.'}
              </div>
            ) : (
              visibleProductivityByUser.map((item, index) => (
                <button
                  key={item.id}
                  className={`w-full rounded-3xl border p-4 text-left transition ${
                    activeFilter.kind === 'employee' && activeFilter.value === item.id
                      ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                      : 'border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                  }`}
                  onClick={() => openEmployeeMenu(item.id, item.name)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">#{index + 1}</p>
                      <p className="mt-1 break-words font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.role ? roleLabel(item.role) : 'Роль не определена'}</p>
                    </div>
                    <div className="relative h-[76px] w-[76px] shrink-0">
                      <MiniRing color="#3d8c52" total={100} value={item.efficiency} />
                      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-900">
                        {formatPercent(item.efficiency)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700">Всего: {item.total}</div>
                    <div className="rounded-2xl bg-white px-3 py-3 text-sm text-emerald-700">Завершено: {item.completed}</div>
                    <div className="rounded-2xl bg-white px-3 py-3 text-sm text-rose-700">Просрочено: {item.overdue}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {filteredProductivityByUser.length > COLLAPSED_EMPLOYEE_CARDS ? (
            <button
              className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[rgba(210,38,48,0.35)] hover:bg-white"
              onClick={() => setIsProductivityExpanded((current) => !current)}
              type="button"
            >
              {isProductivityExpanded ? 'Скрыть лишние карточки' : `Показать еще ${hiddenProductivityCount}`}
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Аналитика по ролям</h2>

          <div className="mt-6 w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Тренд за 6 месяцев</h3>

            <div className="mt-6 space-y-4">
              {recentTrend.map((item) => (
                <div key={item.key} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                    <span className="text-xs text-slate-500">
                      Создано {item.created} • Завершено {item.completed}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>Создано</span>
                        <span>{item.created}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full"
                          style={{ backgroundColor: '#d22630', width: `${(item.created / trendMax) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>Завершено</span>
                        <span>{item.completed}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full"
                          style={{ backgroundColor: '#3d8c52', width: `${(item.completed / trendMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-600">Роль</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Сотрудники</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Активные</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Ежедневные</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Просрочено</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Завершение</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {roleAnalytics.map((item) => (
                  <tr
                    key={item.role}
                    className={`cursor-pointer transition ${
                      activeFilter.kind === 'role' && activeFilter.value === item.role
                        ? 'bg-[rgba(210,38,48,0.08)]'
                        : 'hover:bg-[rgba(210,38,48,0.04)]'
                    }`}
                    onClick={() => toggleFilter({ kind: 'role', value: item.role, label: roleLabel(item.role) })}
                  >
                    <td className="px-4 py-4 font-semibold text-slate-900">{roleLabel(item.role)}</td>
                    <td className="px-4 py-4 text-slate-700">{item.people}</td>
                    <td className="px-4 py-4 text-slate-700">{item.active}</td>
                    <td className="px-4 py-4 text-slate-700">{item.daily}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{item.overdue}</span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{formatPercent(item.completionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Контур согласования</h2>

            <div className="mt-6 grid gap-4">
              <button
                className={`rounded-3xl border p-4 text-left transition ${
                  activeFilter.kind === 'metric' && activeFilter.value === 'manager_pending'
                    ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                    : 'border-slate-200 bg-slate-50 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                }`}
                onClick={() => toggleFilter({ kind: 'metric', value: 'manager_pending', label: 'Ждут принятия исполнителем' })}
                type="button"
              >
                <p className="text-sm text-slate-500">Ожидают принятия исполнителем</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{managerPendingCount}</p>
              </button>

              <button
                className={`rounded-3xl border p-4 text-left transition ${
                  activeFilter.kind === 'metric' && activeFilter.value === 'in_review'
                    ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                    : 'border-slate-200 bg-slate-50 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                }`}
                onClick={() => toggleFilter({ kind: 'metric', value: 'in_review', label: 'На согласовании после отчета' })}
                type="button"
              >
                <p className="text-sm text-slate-500">На согласовании после отчета</p>
                <p className="mt-2 text-3xl font-semibold text-amber-700">{tasksInReview.length}</p>
              </button>

              <button
                className={`rounded-3xl border p-4 text-left transition ${
                  activeFilter.kind === 'metric' && activeFilter.value === 'daily_pending'
                    ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                    : 'border-slate-200 bg-slate-50 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                }`}
                onClick={() => toggleFilter({ kind: 'metric', value: 'daily_pending', label: 'Ежедневные ждут первого согласования' })}
                type="button"
              >
                <p className="text-sm text-slate-500">Ежедневные ждут первого согласования</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{dailyPendingCount}</p>
              </button>
            </div>
          </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Дедлайны на ближайшие 7 дней</h2>

            <div className="mt-6 space-y-3">
              {deadlinePressure.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  Критичных дедлайнов на ближайшую неделю нет.
                </div>
              ) : (
                deadlinePressure.map((task) => (
                  <button
                    key={task.id}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      activeFilter.kind === 'deadline' && activeFilter.value === task.id
                        ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                        : 'border-slate-200 bg-slate-50 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                    }`}
                    onClick={() => {
                      const selectedTask = activeTasks.find((item) => item.id === task.id)
                      if (selectedTask) {
                        openTaskMenu(selectedTask)
                      }
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{task.owner}</p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{ backgroundColor: STATUS_COLORS[task.status] ?? '#7a6b66' }}
                      >
                        {taskStatusLabel(task.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">{formatIsoDateTimeRu(task.deadline.toISOString())}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Здоровье проектов</h2>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {projectAnalytics.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 xl:col-span-2">
              Проекты еще не наполнены задачами.
            </div>
          ) : (
            projectAnalytics.map((project) => (
              <button
                key={project.id}
                className={`rounded-3xl border p-4 text-left transition ${
                  activeFilter.kind === 'project' && activeFilter.value === project.id
                    ? 'border-transparent bg-[rgba(210,38,48,0.08)] ring-2 ring-[rgba(210,38,48,0.25)]'
                    : 'border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-[rgba(210,38,48,0.35)] hover:bg-white'
                }`}
                onClick={() => toggleFilter({ kind: 'project', value: project.id, label: project.name })}
                type="button"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {projectStatusLabel(project.status)} • бюджет {formatMoney(project.budget)}
                    </p>
                  </div>
                  <div className="relative h-[82px] w-[82px] shrink-0">
                    <MiniRing color="#d22630" total={100} value={project.progress} size={82} />
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-900">
                      {formatPercent(project.progress)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700">Задач: {project.totalTasks}</div>
                  <div className="rounded-2xl bg-white px-3 py-3 text-sm text-emerald-700">Завершено: {project.completed}</div>
                  <div className="rounded-2xl bg-white px-3 py-3 text-sm text-amber-700">На проверке: {project.inReview}</div>
                  <div className="rounded-2xl bg-white px-3 py-3 text-sm text-rose-700">Просрочено: {project.overdue}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

export default Dashboard
