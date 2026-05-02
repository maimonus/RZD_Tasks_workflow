import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import api from '../../api/api'
import type { Project, Task, User } from '../../types'
import SearchableSelect from '../../components/SearchableSelect'
import { projectStatusLabel, taskStatusLabel } from '../../utils/labels'

const ArchivePage = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [executorId, setExecutorId] = useState<number | ''>('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const loadArchive = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [projectsResponse, tasksResponse, usersResponse] = await Promise.all([
          api.get<Project[]>('/projects'),
          api.get<Task[]>('/tasks'),
          api.get<User[]>('/users'),
        ])

        setProjects(projectsResponse.data)
        setTasks(tasksResponse.data)
        setUsers(usersResponse.data)
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(caughtError.response?.data?.detail ?? 'Не удалось загрузить архив')
        } else {
          setError('Не удалось загрузить архив')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadArchive()
  }, [])

  const dateToIsoDay = (value: string) => {
    // value: "YYYY-MM-DD"
    if (!value) return ''
    return value
  }

  const queryLower = query.trim().toLowerCase()

  const archivedTasksBase = useMemo(() => tasks.filter((task) => task.status === 'archived'), [tasks])
  const archivedProjectsBase = useMemo(() => projects.filter((project) => project.status === 'archived'), [projects])

  const userNameById = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users])

  const executorOptions = useMemo(() => {
    return users.map((user) => ({
      value: user.id,
      label: user.full_name,
      keywords: `${user.full_name} ${user.email}`,
    }))
  }, [users])

  const filteredArchivedTasks = useMemo(() => {
    const isoDay = dateToIsoDay(date)

    return archivedTasksBase
      .filter((task) => {
        if (executorId !== '') {
          if (task.owner_id !== executorId) return false
        }

        if (isoDay) {
          const updated = task.updated_at ? new Date(task.updated_at) : null
          if (!updated) return false
          const updatedIsoDay = updated.toISOString().slice(0, 10)
          if (updatedIsoDay !== isoDay) return false
        }

        if (queryLower) {
          const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase()
          if (!haystack.includes(queryLower)) return false
        }

        return true
      })
      .slice()
      .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
  }, [archivedTasksBase, date, executorId, queryLower])

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])

  const filteredArchivedProjects = useMemo(() => {
    const isoDay = dateToIsoDay(date)

    return archivedProjectsBase
      .filter((project) => {
        if (isoDay) {
          const created = project.created_at ? new Date(project.created_at) : null
          if (!created) return false
          const createdIsoDay = created.toISOString().slice(0, 10)
          if (createdIsoDay !== isoDay) return false
        }

        if (queryLower) {
          const haystack = `${project.name} ${project.description ?? ''}`.toLowerCase()
          if (!haystack.includes(queryLower)) return false
        }

        if (executorId !== '') {
          // Для проектов фильтрация по исполнителю делается через наличие архивных задач этого исполнителя в проекте
          const hasMatchingTask = archivedTasksBase.some(
            (task) => task.project_id === project.id && task.owner_id === executorId,
          )
          if (!hasMatchingTask) return false
        }

        return true
      })
      .slice()
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  }, [archivedProjectsBase, archivedTasksBase, date, executorId, queryLower])

  const areFiltersActive = Boolean(query.trim()) || executorId !== '' || Boolean(date)

  const resetFilters = () => {
    setQuery('')
    setExecutorId('')
    setDate('')
  }

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#86141c,#b81f29_48%,#d22630_72%,#f3d9db_140%)] p-8 text-white shadow-lg"
      >
        <h1 className="text-2xl font-semibold">Архив</h1>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">Поиск по архиву</h2>
            <p className="text-sm text-slate-500">
              Фильтры применяются к архивным проектам и задачам.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <label className="w-full sm:min-w-[280px]">
              <span className="sr-only">Поиск по названию и описанию</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                placeholder="Поиск по названию/описанию..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={isLoading}
              />
            </label>

            <div className="w-full sm:min-w-[260px]">
              <SearchableSelect
                label="Исполнитель"
                emptyLabel="Все исполнители"
                noResultsLabel="Исполнители не найдены"
                placeholder="Поиск по ФИО/почте"
                options={executorOptions}
                value={executorId === '' ? '' : executorId}
                onChange={setExecutorId}
                disabled={isLoading}
              />
            </div>

            <label className="w-full sm:min-w-[210px]">
              <span className="sr-only">Фильтр по дате</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
                disabled={isLoading}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              <p className="mt-2 text-xs font-semibold text-slate-500">Дата (создано/обновлено)</p>
            </label>

            <button
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!areFiltersActive || isLoading}
              onClick={resetFilters}
              type="button"
              title="Сбросить фильтры"
            >
              Сбросить
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Архивных проектов</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{isLoading ? '...' : filteredArchivedProjects.length}</p>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Архивных задач</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{isLoading ? '...' : filteredArchivedTasks.length}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Проекты</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {isLoading ? '...' : filteredArchivedProjects.length}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {isLoading ? (
              <div className="rounded-3xl bg-slate-50 px-4 py-6 text-sm text-slate-500">Загружаем архив проектов...</div>
            ) : filteredArchivedProjects.length === 0 ? (
              <div className="rounded-3xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {areFiltersActive ? 'Архивных проектов по фильтрам не найдено.' : 'Архивных проектов пока нет.'}
              </div>
            ) : (
              filteredArchivedProjects.map((project) => (
                <article key={project.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {project.description ? project.description : null}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                      {projectStatusLabel(project.status)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">Бюджет: {project.budget}</span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                      Создан: {new Date(project.created_at).toLocaleString('ru-RU')}
                    </span>
                  </div>

                  <Link
                    className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    to={`/projects/${project.id}`}
                  >
                    Открыть проект
                  </Link>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Задачи</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {isLoading ? '...' : filteredArchivedTasks.length}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {isLoading ? (
              <div className="rounded-3xl bg-slate-50 px-4 py-6 text-sm text-slate-500">Загружаем архив задач...</div>
            ) : filteredArchivedTasks.length === 0 ? (
              <div className="rounded-3xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {areFiltersActive ? 'Архивных задач по фильтрам не найдено.' : 'Архивных задач пока нет.'}
              </div>
            ) : (
              filteredArchivedTasks.map((task) => (
                <article key={task.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                      {task.description ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{task.description}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                      {taskStatusLabel(task.status)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">Приоритет: {task.priority}</span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                      Обновлена: {new Date(task.updated_at).toLocaleString('ru-RU')}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                      Исполнитель: {task.owner_id ? userNameById.get(task.owner_id) ?? 'Неизвестно' : '—'}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                      Проект:{' '}
                      {task.project_id ? projectNameById.get(task.project_id) ?? `Проект #${task.project_id}` : 'Без проекта'}
                    </span>
                  </div>

                  {task.project_id ? (
                    <Link
                      className="mt-4 inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      to={`/projects/${task.project_id}`}
                    >
                      Перейти к проекту
                    </Link>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default ArchivePage
