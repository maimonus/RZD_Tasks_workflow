import { useEffect, useState, startTransition } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '../../api/api'
import { useAuth } from '../../store/authStore'
import type { Role } from '../../types'
import { roleLabel } from '../../utils/labels'

interface AuthPageProps {
  mode: 'login' | 'register'
}

const AuthPage = ({ mode }: AuthPageProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login, register } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState<number | ''>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'register') {
      return
    }

    const loadRoles = async () => {
      try {
        const { data } = await api.get<Role[]>('/roles')
        setRoles(data)
        setRoleId(data[0]?.id ?? '')
      } catch {
        setError('Не удалось загрузить список ролей. Попробуйте еще раз.')
      }
    }

    void loadRoles()
  }, [mode])

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      if (mode === 'login') {
        await login({ email, password })
      } else {
        if (!roleId) {
          throw new Error('Выберите роль')
        }

        await register({
          email,
          full_name: fullName,
          password,
          role_id: roleId,
          manager_id: null,
        })

        await login({ email, password })
      }

      startTransition(() => {
        navigate('/tasks', { replace: true })
      })
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(caughtError.response?.data?.detail ?? 'Не удалось выполнить запрос')
      } else if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Не удалось выполнить запрос')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7f7_0%,#f4e2e3_30%,#d22630_100%)] px-4 py-10 text-slate-100">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/60 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden p-10 md:block">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),transparent_32%,rgba(210,38,48,0.3)_72%,rgba(123,18,27,0.5)_100%)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-sky-300">Finance OPS</p>
              <h1 className="mt-6 max-w-md font-serif text-5xl leading-tight text-white">
                Безопасные задачи для финансовых команд.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
                Войдите, чтобы управлять процессами, назначать задачи по ролям и вести согласования в одном месте.
              </p>
            </div>
            <div className="grid gap-4 text-sm text-slate-300">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                Руководящие роли могут создавать и назначать задачи.
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                Исполнители видят только свою очередь задач.
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/95 p-8 text-slate-900 shadow-xl">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">
              {mode === 'login' ? 'С возвращением' : 'Создание аккаунта'}
            </p>
            <h2 className="mt-4 font-serif text-4xl">
              {mode === 'login' ? 'Вход' : 'Регистрация'}
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              {mode === 'login'
                ? 'Используйте рабочий аккаунт, чтобы продолжить.'
                : 'Выберите роль, чтобы включились корректные права на задачи.'}
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              {mode === 'register' ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">ФИО</span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Иванов Иван"
                    required
                  />
                </label>
              ) : null}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Эл. почта</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Пароль</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 8 символов"
                  minLength={8}
                  required
                />
              </label>

              {mode === 'register' ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Роль</span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                    value={roleId}
                    onChange={(event) => setRoleId(Number(event.target.value))}
                    required
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {roleLabel(role.name)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
              </button>
            </form>

            <p className="mt-6 text-sm text-slate-500">
              {mode === 'login' ? 'Нет аккаунта?' : 'Уже зарегистрированы?'}{' '}
              <Link
                className="font-semibold text-sky-700 transition hover:text-sky-500"
                to={mode === 'login' ? '/register' : '/login'}
              >
                {mode === 'login' ? 'Регистрация' : 'Вход'}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

export default AuthPage
