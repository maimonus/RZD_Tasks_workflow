import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import api from '../../api/api'
import { useAuth } from '../../store/authStore'
import type { Project, RoleName } from '../../types'
import { projectStatusLabel } from '../../utils/labels'

const PROJECT_CREATOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead']

const Projects = () => {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState(0)
  const [projectQuery, setProjectQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canCreateProject = user ? PROJECT_CREATOR_ROLES.includes(user.role.name) : false
  const canDeleteProject = canCreateProject
  const visibleProjects = useMemo(
    () => projects.filter((project) => project.status !== 'archived'),
    [projects],
  )

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    if (!q) return visibleProjects

    return visibleProjects.filter((project) => {
      const haystack = `${project.name} ${project.description ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [projectQuery, visibleProjects])

  useEffect(() => {
    const loadProjects = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const { data } = await api.get<Project[]>('/projects')
        setProjects(data)
      } catch (caughtError) {
        if (axios.isAxiosError(caughtError)) {
          setError(caughtError.response?.data?.detail ?? 'Не удалось загрузить проекты')
        } else {
          setError('Не удалось загрузить проекты')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadProjects()
  }, [])

  const handleCreateProject = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const { data } = await api.post<Project>('/projects', {
        name,
        description: description || null,
        budget,
      })
      setProjects((currentProjects) => [data, ...currentProjects])
      setName('')
      setDescription('')
      setBudget(0)
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(caughtError.response?.data?.detail ?? 'Не удалось создать проект')
      } else {
        setError('Не удалось создать проект')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteProject = async (projectId: number) => {
    const confirmed = window.confirm('Удалить этот проект? Все связанные задачи тоже будут удалены.')
    if (!confirmed) {
      return
    }

    setDeletingProjectId(projectId)
    setError(null)

    try {
      await api.delete(`/projects/${projectId}`)
      setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId))
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(caughtError.response?.data?.detail ?? 'Не удалось удалить проект')
      } else {
        setError('Не удалось удалить проект')
      }
    } finally {
      setDeletingProjectId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#86141c,#b81f29_48%,#d22630_72%,#f3d9db_140%)] p-8 text-white shadow-lg">
        <h1 className="text-2xl font-semibold">Проекты</h1>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {canCreateProject ? (
        <section className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Создать проект</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Название</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Бюджет</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                min={0}
                onChange={(event) => setBudget(Number(event.target.value))}
                type="number"
                value={budget}
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Описание</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
          </div>

          <button
            className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isSubmitting || !name.trim()}
            onClick={() => {
              void handleCreateProject()
            }}
            type="button"
          >
            {isSubmitting ? 'Создание...' : 'Создать проект'}
          </button>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Список проектов</h2>
            {projectQuery.trim() ? (
              <p className="mt-1 text-sm text-slate-500">
                Найдено: <span className="font-semibold text-slate-700">{filteredProjects.length}</span>
              </p>
            ) : null}
          </div>

          <label className="w-full sm:max-w-[460px]">
            <span className="sr-only">Поиск по проектам</span>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
              placeholder="Поиск по названию или описанию..."
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="grid min-h-[420px] gap-4 md:grid-cols-2">
          {isLoading ? (
            <div className="rounded-[2rem] bg-white p-6 text-sm text-slate-500 shadow-sm md:col-span-2">
              Загружаем проекты...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-6 text-sm text-slate-500 shadow-sm md:col-span-2">
              {projectQuery.trim() ? 'Проектов по запросу не найдено.' : 'Проектов пока нет.'}
            </div>
          ) : (
            filteredProjects.map((project) => (
              <article
                key={project.id}
                className="rounded-[2rem] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <h2 className="text-xl font-semibold text-slate-900">{project.name}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {project.description ? project.description : null}
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
                  <span className="rounded-full bg-slate-100 px-3 py-1">Бюджет: {project.budget}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Статус: {projectStatusLabel(project.status)}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    className="inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    to={`/projects/${project.id}`}
                  >
                    Открыть проект
                  </Link>
                  {canDeleteProject ? (
                    <button
                      className="inline-flex rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deletingProjectId === project.id}
                      onClick={() => {
                        void handleDeleteProject(project.id)
                      }}
                      type="button"
                    >
                      {deletingProjectId === project.id ? 'Удаляем...' : 'Удалить'}
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

export default Projects
