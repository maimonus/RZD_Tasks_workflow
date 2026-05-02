import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react'
import api, { AUTH_TOKEN_STORAGE_KEY } from '../api/api'
import type { LoginPayload, RegisterPayload, User } from '../types'

interface AuthContextValue {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const logout = () => {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setToken(null)
    setUser(null)
  }

  const refreshProfile = async () => {
    const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)

    if (!storedToken) {
      setUser(null)
      setToken(null)
      setIsLoading(false)
      return
    }

    try {
      const { data } = await api.get<User>('/auth/me')
      setToken(storedToken)
      setUser(data)
    } catch {
      logout()
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (payload: LoginPayload) => {
    const { data } = await api.post<{ access_token: string }>('/auth/login', payload)
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.access_token)
    setToken(data.access_token)
    await refreshProfile()
  }

  const register = async (payload: RegisterPayload) => {
    await api.post('/auth/register', payload)
  }

  useEffect(() => {
    void refreshProfile()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: Boolean(token && user),
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider')
  }

  return context
}
