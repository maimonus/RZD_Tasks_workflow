import axios from 'axios'

export const AUTH_TOKEN_STORAGE_KEY = 'finance_auth_token'

// Определяем baseURL на основе окружения
const getBaseURL = () => {
  // Сначала проверяем явно установленную переменную окружения
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  // Если DEV режим, используем localhost:8000
  if (import.meta.env.DEV) {
    return 'http://localhost:8000'
  }

  // Для production режима, используем относительный путь через proxy
  return '/backend'
}

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
