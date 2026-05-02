import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import api from '../../api/api'
import { useAuth } from '../../store/authStore'
import type { RoleName, Task, User } from '../../types'
import { taskStatusLabel, taskTypeLabel } from '../../utils/labels'
import { dateTimeLocalToIso, formatIsoDateTimeRu, isoToDateTimeLocal } from '../../utils/datetime'

type CalendarEntry = {
  id: number
  title: string
  status: string
  deadline: string
  ownerLabel: string
}

type CalendarViewMode = 'upcoming' | 'month'

const STATUS_COLORS: Record<string, string> = {
  pending: '#9f8f8a',
  in_progress: '#d22630',
  in_review: '#d38b1f',
  completed: '#3d8c52',
  overdue: '#8f1018',
  archived: '#7a6b66',
}

const TASK_CREATOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead', 'Manager']
const TASK_STATUS_OPTIONS = ['pending', 'in_progress', 'in_review', 'completed', 'overdue', 'archived'] as const

const pad2 = (value: number) => String(value).padStart(2, '0')

const getDayKey = (date: Date) => {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  return `${y}-${m}-${d}`
}

const getDateLabel = (date: Date) =>
  date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '')
  const isShort = normalized.length === 3
  const full = isShort ? normalized.split('').map((c) => `${c}${c}`).join('') : normalized
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const normalizeDateForInputKey = (dayKey: string) => new Date(`${dayKey}T00:00:00`)

const CalendarPage = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<CalendarViewMode>('upcoming')
  const [monthCursor, setMonthCursor] = useState(() => new Date())
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  const { user } = useAuth()

  const canManageTasks = user ? TASK_CREATOR_ROLES.includes(user.role.name) : false
  const canUpdateTaskStatus = canManageTasks || user?.role.name === 'Executor'
  const canDeleteTask = canManageTasks

  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Modal deadline editing
  const [deadlineEdit, setDeadlineEdit] = useState('')
  const [updatingDeadlineId, setUpdatingDeadlineId] = useState<number | null>(null)

  useEffect(() => {
    const loadCalendarData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [tasksResponse, usersResponse] = await Promise.all([api.get<Task[]>('/tasks'), api.get<User[]>('/users')])
        setTasks(tasksResponse.data)
        setUsers(usersResponse.data)
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(caughtError.response?.data?.detail ?? 'Не удалось загрузить календарь')
        } else {
          setError('Не удалось загрузить календарь')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadCalendarData()
  }, [])

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null
    return tasks.find((t) => t.id === selectedTaskId) ?? null
  }, [selectedTaskId, tasks])

  useEffect(() => {
    if (!selectedTask) {
      setDeadlineEdit('')
      setUpdatingDeadlineId(null)
      return
    }

    setDeadlineEdit(isoToDateTimeLocal(selectedTask.deadline))
  }, [selectedTask?.id])

  const ownerById = useMemo(
    () =>
      new Map(
        users.map((candidate) => [
          candidate.id,
          candidate.full_name,
        ]),
      ),
    [users],
  )

  const entriesWithDeadlines = useMemo(() => {
    return tasks
      .filter((task) => Boolean(task.deadline))
      .map<CalendarEntry>((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        deadline: task.deadline as string,
        ownerLabel: task.owner?.full_name ?? ownerById.get(task.owner_id) ?? 'Неизвестный пользователь',
      }))
  }, [tasks, ownerById])

  const upcoming = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    return [...entriesWithDeadlines]
      .filter((entry) => new Date(entry.deadline).getTime() >= startOfToday.getTime())
      .sort((left, right) => new Date(left.deadline).getTime() - new Date(right.deadline).getTime())
      .slice(0, 20)
  }, [entriesWithDeadlines])

  const groupedByDay = useMemo(() => {
    return upcoming.reduce<Record<string, CalendarEntry[]>>((accumulator, entry) => {
      const dayKey = getDayKey(new Date(entry.deadline))
      const bucket = accumulator[dayKey] ?? []
      bucket.push(entry)
      accumulator[dayKey] = bucket
      return accumulator
    }, {})
  }, [upcoming])

  const tasksByDayKey = useMemo(() => {
    return entriesWithDeadlines.reduce<Record<string, CalendarEntry[]>>((accumulator, entry) => {
      const dayKey = getDayKey(new Date(entry.deadline))
      const bucket = accumulator[dayKey] ?? []
      bucket.push(entry)
      accumulator[dayKey] = bucket
      return accumulator
    }, {})
  }, [entriesWithDeadlines])

  const markedDayColor = (dayKey: string) => {
    const dayEntries = tasksByDayKey[dayKey] ?? []
    if (dayEntries.length === 0) return '#d1d5db' // slate-300 fallback

    const has = (status: string) => dayEntries.some((e) => e.status === status)

    if (has('overdue')) return STATUS_COLORS.overdue
    if (has('in_review')) return STATUS_COLORS.in_review
    if (has('pending')) return STATUS_COLORS.pending
    if (has('in_progress')) return STATUS_COLORS.in_progress
    if (has('completed')) return STATUS_COLORS.completed

    return STATUS_COLORS[dayEntries[0].status] ?? '#d1d5db'
  }

  const monthMeta = useMemo(() => {
    const year = monthCursor.getFullYear()
    const month = monthCursor.getMonth() // 0-11
    const firstDay = new Date(year, month, 1)

    // Monday as first column (0..6)
    const startOffset = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: Array<{ dayKey: string | null; dayNumber: number | null }> = []
    for (let i = 0; i < 42; i += 1) {
      const dayNumber = i - startOffset + 1
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        cells.push({ dayKey: null, dayNumber: null })
        continue
      }

      const date = new Date(year, month, dayNumber)
      cells.push({ dayKey: getDayKey(date), dayNumber })
    }

    return { year, month, cells }
  }, [monthCursor])

  const selectedDayEntries = useMemo(() => {
    if (!selectedDayKey) return []
    const list = tasksByDayKey[selectedDayKey] ?? []
    return [...list].sort((left, right) => new Date(left.deadline).getTime() - new Date(right.deadline).getTime())
  }, [selectedDayKey, tasksByDayKey])

  const monthLabel = useMemo(() => {
    const labelDate = new Date(monthMeta.year, monthMeta.month, 1)
    return labelDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  }, [monthMeta.year, monthMeta.month])

  const openTaskCard = (taskId: number) => {
    setSelectedTaskId(taskId)
  }

  const closeTaskCard = () => {
    setSelectedTaskId(null)
    setActionError(null)
    setDeadlineEdit('')
    setUpdatingDeadlineId(null)
  }

  const canUpdateDeadline = Boolean(selectedTask && user && canManageTasks)

  const handleUpdateTaskDeadline = async () => {
    if (!selectedTask || !user) return
    if (!canUpdateDeadline) return
    if (updatingDeadlineId === selectedTask.id) return

    const nextDeadlineIso = dateTimeLocalToIso(deadlineEdit)

    setUpdatingDeadlineId(selectedTask.id)
    setActionError(null)

    try {
      const { data } = await api.patch<Task>(`/tasks/${selectedTask.id}`, { deadline: nextDeadlineIso })
      setTasks((currentTasks) => currentTasks.map((candidate) => (candidate.id === data.id ? data : candidate)))
      setDeadlineEdit(isoToDateTimeLocal(data.deadline))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setActionError(
          caughtError.response?.data?.detail ?? 'Не удалось изменить дедлайн',
        )
      } else {
        setActionError('Не удалось изменить дедлайн')
      }
    } finally {
      setUpdatingDeadlineId(null)
    }
  }

  const handleUpdateTaskStatus = async (taskId: number, status: string) => {
    if (!canUpdateTaskStatus) return

    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task || task.status === status) return

    setActionError(null)
    setUpdatingTaskId(taskId)

    try {
      const { data } = await api.patch<Task>(`/tasks/${taskId}`, { status })
      setTasks((currentTasks) => currentTasks.map((candidate) => (candidate.id === data.id ? data : candidate)))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setActionError(caughtError.response?.data?.detail ?? 'Не удалось изменить статус задачи')
      } else {
        setActionError('Не удалось изменить статус задачи')
      }
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    const confirmed = window.confirm('Удалить эту задачу?')
    if (!confirmed) return

    setActionError(null)
    setDeletingTaskId(taskId)

    try {
      await api.delete(`/tasks/${taskId}`)
      setTasks((currentTasks) => currentTasks.filter((candidate) => candidate.id !== taskId))
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null)
      }
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setActionError(caughtError.response?.data?.detail ?? 'Не удалось удалить задачу')
      } else {
        setActionError('Не удалось удалить задачу')
      }
    } finally {
      setDeletingTaskId(null)
    }
  }

  const renderTaskPreviewCard = (entry: CalendarEntry) => {
    const statusColor = STATUS_COLORS[entry.status] ?? '#d1d5db'
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => openTaskCard(entry.id)}
        className="w-full block text-left rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 hover:border-sky-300 hover:ring-1 hover:ring-sky-200"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium text-slate-900">{entry.title}</p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700" style={{ border: `1px solid ${hexToRgba(statusColor, 0.25)}` }}>
            {taskStatusLabel(entry.status)}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {new Date(entry.deadline).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} - {entry.ownerLabel}
        </p>
      </button>
    )
  }

  const getFileUrl = (fileUrl?: string) => {
    if (!fileUrl) return null
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl
    return new URL(fileUrl, api.defaults.baseURL ?? window.location.origin).toString()
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#86141c,#b81f29_48%,#d22630_72%,#f3d9db_140%)] p-6 text-white shadow-sm">
        <h1 className="text-2xl font-semibold">Календарь сроков задач</h1>
      </div>

      {error ? <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-slate-900">Отображение</p>
          </div>

          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            <button
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                viewMode === 'upcoming' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => {
                setViewMode('upcoming')
                setSelectedDayKey(null)
              }}
              type="button"
            >
              Ближайшие задачи
            </button>
            <button
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                viewMode === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => {
                setViewMode('month')
                setSelectedDayKey(null)
              }}
              type="button"
            >
              Календарь
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-slate-500">Загружаем календарь...</p>
        ) : (
          <>
            {viewMode === 'upcoming' ? (
              upcoming.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">Нет задач с дедлайнами.</p>
              ) : (
                <div className="mt-6 space-y-6">
                  {Object.entries(groupedByDay).map(([dayKey, entries]) => {
                    const dayDate = normalizeDateForInputKey(dayKey)
                    return (
                      <section key={dayKey}>
                        <h2 className="text-base font-semibold text-slate-900">{getDateLabel(dayDate)}</h2>
                        <div className="mt-3 space-y-3">
                          {entries.map((entry) => renderTaskPreviewCard(entry))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )
            ) : (
              <div className="mt-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-base font-semibold text-slate-900">{monthLabel}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        const next = new Date(monthCursor)
                        next.setMonth(next.getMonth() - 1)
                        setMonthCursor(next)
                        setSelectedDayKey(null)
                      }}
                      type="button"
                    >
                      ◀
                    </button>
                    <button
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        setMonthCursor(new Date())
                        setSelectedDayKey(null)
                      }}
                      type="button"
                    >
                      Сегодня
                    </button>
                    <button
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        const next = new Date(monthCursor)
                        next.setMonth(next.getMonth() + 1)
                        setMonthCursor(next)
                        setSelectedDayKey(null)
                      }}
                      type="button"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    <div className="grid grid-cols-7 gap-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      <div className="text-center">Пн</div>
                      <div className="text-center">Вт</div>
                      <div className="text-center">Ср</div>
                      <div className="text-center">Чт</div>
                      <div className="text-center">Пт</div>
                      <div className="text-center">Сб</div>
                      <div className="text-center">Вс</div>
                    </div>

                    <div className="grid grid-cols-7 gap-0 px-2 py-2">
                      {monthMeta.cells.map((cell, idx) => {
                        if (!cell.dayKey || !cell.dayNumber) {
                          return <div key={`empty-${idx}`} className="h-10" aria-hidden="true" />
                        }

                        const dayEntries = tasksByDayKey[cell.dayKey] ?? []
                        const isMarked = dayEntries.length > 0
                        const isSelected = selectedDayKey === cell.dayKey
                        const statusColor = markedDayColor(cell.dayKey)

                        return (
                          <button
                            key={cell.dayKey}
                            type="button"
                            onClick={() => {
                              if (!isMarked) {
                                setSelectedDayKey(null)
                                return
                              }

                              // Всегда показываем список под календарем, а модалку открываем только по клику на задачу.
                              setSelectedDayKey(cell.dayKey)
                            }}
                            className={[
                              'relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition border',
                              isSelected ? 'text-slate-900' : isMarked ? 'text-slate-900' : 'text-slate-400',
                              isMarked ? 'hover:bg-slate-50' : 'hover:bg-white',
                            ].join(' ')}
                            style={{
                              backgroundColor: isSelected ? hexToRgba(statusColor, 0.12) : undefined,
                              borderColor: isMarked
                                ? isSelected
                                  ? hexToRgba(statusColor, 0.35)
                                  : hexToRgba(statusColor, 0.18)
                                : 'transparent',
                            }}
                            aria-pressed={isSelected}
                          >
                            {cell.dayNumber}
                            {isMarked ? (
                              <span
                                className="pointer-events-none absolute bottom-1 h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: statusColor }}
                              />
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    {selectedDayKey ? (
                      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{getDateLabel(normalizeDateForInputKey(selectedDayKey))}</h3>
                          </div>
                          <button
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={() => setSelectedDayKey(null)}
                            type="button"
                          >
                            Закрыть
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          {selectedDayEntries.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                              На эту дату задач нет.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {selectedDayEntries.map((entry) => renderTaskPreviewCard(entry))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        Выберите дату с дедлайнами.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-slate-700"
                    style={{
                      border: `1px solid ${hexToRgba(STATUS_COLORS[selectedTask.status] ?? '#d1d5db', 0.25)}`,
                      backgroundColor: 'white',
                    }}
                  >
                    {taskStatusLabel(selectedTask.status)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {taskTypeLabel(selectedTask.task_type)}
                  </span>
                </div>
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
                  {selectedTask.owner?.full_name ?? ownerById.get(selectedTask.owner_id) ?? 'Неизвестный пользователь'}
                </p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
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
                  <p className="mt-3 text-sm text-slate-700">{formatIsoDateTimeRu(selectedTask.deadline)}</p>
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
                              {report.author?.full_name ?? ownerById.get(report.author_id) ?? 'Неизвестный пользователь'}
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

export default CalendarPage
