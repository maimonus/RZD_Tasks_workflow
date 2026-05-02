import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import ProtectedRoute from './components/auth/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import TaskList from './pages/Tasks/TaskList'
import Projects from './pages/Projects/Projects'
import ProjectDetailPage from './pages/Projects/ProjectDetail'
import CalendarPage from './pages/Calendar/Calendar'
import Approvals from './pages/Approvals/Approvals'
import WorkflowBuilder from './pages/WorkflowBuilder/WorkflowBuilder'
import ArchivePage from './pages/Archive/Archive'
import AuthPage from './pages/Auth/AuthPage'
import Notifications from './pages/Notifications/Notifications'

const AppShell = () => {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex">
        <Sidebar />
        <div className="flex-1">
          <Header />
          <main className="p-6">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/kanban" element={<Navigate to="/tasks" replace />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/workflow-builder" element={<WorkflowBuilder />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
