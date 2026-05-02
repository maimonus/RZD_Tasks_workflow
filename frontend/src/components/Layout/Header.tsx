import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import api from '../../api/api'
import { useAuth } from '../../store/authStore'
import { roleLabel } from '../../utils/labels'

const BellIcon = ({ active }: { active: boolean }) => {
  const colorClass = active ? 'text-rose-600' : 'text-slate-500'
  return (
    <svg className={`h-5 w-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 16V11.5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v1.18C7.64 5.86 6 8.42 6 11.5V16l-2 2h16l-2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const Header = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  const [unreadCount, setUnreadCount] = useState(0)

  const hasUnread = useMemo(() => unreadCount > 0, [unreadCount])

  const refreshUnreadCount = async () => {
    try {
      const { data } = await api.get<{ unread: number }>('/notifications/unread-count')
      setUnreadCount(data.unread)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshUnreadCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname])

  useEffect(() => {
    const onNotificationsChanged = () => {
      void refreshUnreadCount()
    }

    window.addEventListener('notifications:changed', onNotificationsChanged)
    return () => {
      window.removeEventListener('notifications:changed', onNotificationsChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm text-slate-500">Пользователь</p>
        <p className="text-xl font-semibold text-slate-900">{user?.full_name ?? 'Неизвестно'}</p>
        <p className="text-sm text-slate-500">
          {roleLabel(user?.role?.name)} • {user?.email ?? 'Нет эл. почты'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
          onClick={() => navigate('/notifications')}
        >
          <span className="sr-only">Уведомления</span>
          <div className="flex items-center gap-2">
            <BellIcon active={hasUnread} />
            <span className="hidden sm:inline">Уведомления</span>
          </div>

          {hasUnread ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
          ) : null}
        </button>

        <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-600">Рабочая область</div>

        <button
          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
          type="button"
        >
          Выйти
        </button>
      </div>
    </header>
  )
}

export default Header
