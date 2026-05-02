import { NavLink } from 'react-router-dom'

import { useAuth } from '../../store/authStore'

const APPROVALS_ALLOWED_ROLES = ['Admin', 'FinancialDirector', 'Manager'] as const

const Sidebar = () => {
  const { user } = useAuth()
  const canSeeApprovals = APPROVALS_ALLOWED_ROLES.includes(user?.role?.name as (typeof APPROVALS_ALLOWED_ROLES)[number])

  const links = [
    { label: 'Панель', to: '/dashboard' },
    { label: 'Задачи', to: '/tasks' },
    { label: 'Проекты', to: '/projects' },
    { label: 'Архив', to: '/archive' },
    { label: 'Календарь', to: '/calendar' },
    ...(canSeeApprovals ? [{ label: 'Согласования', to: '/approvals' }] : []),
    { label: 'Конструктор процессов', to: '/workflow-builder' },
  ]

  return (
    <aside className="sticky top-0 h-screen w-72 overflow-y-auto border-r border-slate-200 bg-slate-950 text-white">
      <div className="border-b border-white/10 px-6 py-8">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Finance OPS</p>
        <h1 className="mt-4 font-serif text-3xl">Центр управления</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Задачи, согласования и планирование для финансовых операций с учетом ролей.
        </p>
      </div>

      <nav className="space-y-1 px-4 py-6">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                isActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
