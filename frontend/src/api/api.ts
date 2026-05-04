import axios from 'axios'

export const AUTH_TOKEN_STORAGE_KEY = 'finance_auth_token'

const api = axios.create({
  baseURL:
    (import.meta as any).env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://localhost:8000' : '/backend'),
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
