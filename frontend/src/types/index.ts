export type RoleName = 'Admin' | 'FinancialDirector' | 'DepartmentHead' | 'Manager' | 'Executor'
export type TaskType = 'manager_assigned' | 'daily'

export interface Role {
  id: number
  name: RoleName
  description?: string
}

export interface User {
  id: number
  email: string
  full_name: string
  role_id: number
  created_at: string
  manager_id?: number
  role: Role
}

export interface TaskReport {
  id: number
  task_id: number
  author_id: number
  comment?: string
  original_filename?: string
  file_url?: string
  created_at: string
  author?: User
}

export interface Task {
  id: number
  title: string
  description?: string
  priority: number
  status: string
  task_type: TaskType
  deadline?: string
  project_id?: number
  owner_id: number
  created_by_id: number
  daily_approved_once: boolean
  owner?: User
  reports: TaskReport[]
  created_at: string
  updated_at: string
}

export interface Project {
  id: number
  name: string
  description?: string
  budget: number
  status: string
  created_at: string
}

export interface ProjectDetail extends Project {
  tasks: Task[]
}

export interface WorkflowInstance {
  id: number
  task_id: number
  definition_id: number
  current_node?: string
  status: string
}

export interface WorkflowNode {
  node_id: string
  node_type: 'start' | 'approval' | 'condition' | 'end'
  label: string
  config: Record<string, unknown>
}

export interface WorkflowTransition {
  source_node: string
  target_node: string
  condition: Record<string, unknown>
  priority: number
}

export interface WorkflowDefinition {
  id: number
  name: string
  template_key: string
  version: number
  published: boolean
  created_at: string
  definition: {
    template_key?: string
    start_node?: string
    nodes: WorkflowNode[]
    transitions: WorkflowTransition[]
  }
}

export interface PendingApproval {
  approval_id: number
  instance_id: number
  task: Task
  assigned_role: string
  assigned_user_id?: number
  current_node?: string
  created_at: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  full_name: string
  password: string
  role_id: number
  manager_id?: number | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export type NotificationKind =
  | 'deadline_soon'
  | 'deadline_overdue'
  | 'approval_resolved'
  | 'daily_approved'
  | 'task_status_changed'
  | 'approval_pending'
  | 'task_accepted'

export interface Notification {
  id: number
  kind: NotificationKind
  title: string
  message: string
  task_id?: number
  created_at: string
  read_at?: string | null
}
