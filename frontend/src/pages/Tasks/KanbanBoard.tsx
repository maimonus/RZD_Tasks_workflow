import { useMemo, useState, type DragEvent } from 'react'

import type { Task } from '../../types'
import { taskStatusLabel, taskTypeLabel } from '../../utils/labels'
import { formatIsoDateTimeRu } from '../../utils/datetime'

const TASK_BOARD_STATUSES = ['pending', 'in_progress', 'in_review', 'completed', 'overdue'] as const
const TASK_STATUS_OPTIONS = ['pending', 'in_progress', 'in_review', 'completed', 'overdue', 'archived'] as const

interface KanbanBoardProps {
  tasks: Task[]
  canUpdateTaskStatus: boolean
  updatingTaskId: number | null
  onOpenTask: (taskId: number) => void
  onUpdateTaskStatus: (task: Task, status: string) => void
  projectNameById: Map<number, string>
  userNameById: Map<number, string>
}

const KanbanBoard = ({
  tasks,
  canUpdateTaskStatus,
  updatingTaskId,
  onOpenTask,
  onUpdateTaskStatus,
  projectNameById,
  userNameById,
}: KanbanBoardProps) => {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'archived'), [tasks])

  const tasksByStatus = useMemo(
    () =>
      activeTasks.reduce<Record<string, Task[]>>((accumulator, task) => {
        const bucket = accumulator[task.status] ?? []
        bucket.push(task)
        accumulator[task.status] = bucket
        return accumulator
      }, {}),
    [activeTasks],
  )

  const taskColumns = TASK_BOARD_STATUSES.map((status) => ({
    status,
    tasks: (tasksByStatus[status] ?? []).slice().sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    }),
  }))

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

    const draggedTask = tasks.find((task) => task.id === taskId)
    if (!draggedTask || draggedTask.status === status) {
      setDraggedTaskId(null)
      setDragOverStatus(null)
      return
    }

    onUpdateTaskStatus(draggedTask, status)
    setDraggedTaskId(null)
    setDragOverStatus(null)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {taskColumns.map(({ status, tasks: statusTasks }) => (
        <div
          key={status}
          className={`rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition ${
            dragOverStatus === status ? 'scale-[1.01] ring-2 ring-sky-300' : ''
          }`}
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
              handleColumnDrop(status, droppedTaskId)
              return
            }
            handleColumnDrop(status)
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{taskStatusLabel(status)}</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              {statusTasks.length}
            </span>
          </div>

          <div className="space-y-3">
            {statusTasks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                В этом статусе пока нет задач.
              </div>
            ) : (
              statusTasks.map((task) => {
                return (
                  <article
                    key={task.id}
                    className={`rounded-3xl border border-white bg-white p-4 shadow-sm transition ${
                      draggedTaskId === task.id ? 'opacity-50 ring-2 ring-sky-300' : 'hover:-translate-y-0.5 hover:shadow-md'
                    } ${canUpdateTaskStatus ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    draggable={canUpdateTaskStatus}
                    onDragEnd={handleDragEnd}
                    onDragStart={(event) => {
                      handleDragStart(task, event)
                    }}
                  >
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{taskTypeLabel(task.task_type)}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">Приоритет {task.priority}</span>
                    </div>

                    <button
                      className="mt-3 text-left text-base font-semibold text-slate-900 transition hover:text-sky-700"
                      onClick={() => onOpenTask(task.id)}
                      type="button"
                    >
                      {task.title}
                    </button>

                    {task.description ? (
                      <p className="mt-2 text-sm leading-6 text-slate-500">{task.description}</p>
                    ) : null}

                    <div className="mt-4 space-y-1 text-xs text-slate-600">
                      <p>{task.owner?.full_name ?? userNameById.get(task.owner_id) ?? `Пользователь #${task.owner_id}`}</p>
                      <p>
                        {typeof task.project_id === 'number'
                          ? projectNameById.get(task.project_id) ?? `Проект #${task.project_id}`
                          : 'Без проекта'}
                      </p>
                      <p>{task.deadline ? formatIsoDateTimeRu(task.deadline) : 'Без дедлайна'}</p>
                    </div>


                    <div className="mt-4 flex flex-col gap-3">
                      <button
                        className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        onClick={() => onOpenTask(task.id)}
                        type="button"
                      >
                        Открыть
                      </button>

                      {canUpdateTaskStatus ? (
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-400"
                          disabled={updatingTaskId === task.id}
                          onChange={(event) => {
                            onUpdateTaskStatus(task, event.target.value)
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
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default KanbanBoard
