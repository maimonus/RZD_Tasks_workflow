import { Task } from '../types'
import { taskStatusLabel } from '../utils/labels'

interface TaskCardProps {
  task: Task
}

const TaskCard = ({ task }: TaskCardProps) => {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="font-semibold">{task.title}</h3>
      <p className="text-sm text-slate-500">Статус: {taskStatusLabel(task.status)}</p>
      <p className="text-sm text-slate-500">Приоритет: {task.priority}</p>
    </div>
  )
}

export default TaskCard
