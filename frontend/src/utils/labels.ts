import type { RoleName, TaskType } from '../types'

export const ROLE_LABELS: Record<RoleName, string> = {
  Admin: 'Администратор',
  FinancialDirector: 'Финансовый директор',
  DepartmentHead: 'Руководитель отдела',
  Manager: 'Менеджер',
  Executor: 'Исполнитель',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  in_progress: 'В работе',
  in_review: 'На проверке',
  completed: 'Завершена',
  overdue: 'Просрочена',
  archived: 'В архиве',
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  manager_assigned: 'От руководителя',
  daily: 'Ежедневная',
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  archived: 'В архиве',
}

export const roleLabel = (role: RoleName | null | undefined) => {
  if (!role) return 'Неизвестная роль'
  return ROLE_LABELS[role] ?? role
}

export const taskStatusLabel = (status: string | null | undefined) => {
  if (!status) return 'Неизвестный статус'
  return TASK_STATUS_LABELS[status] ?? status
}

export const taskTypeLabel = (taskType: TaskType | null | undefined) => {
  if (!taskType) return 'Неизвестная категория'
  return TASK_TYPE_LABELS[taskType] ?? taskType
}

export const projectStatusLabel = (status: string | null | undefined) => {
  if (!status) return 'Неизвестный статус'
  return PROJECT_STATUS_LABELS[status] ?? status
}
