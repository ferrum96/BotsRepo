import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getToken, login as apiLogin, me as apiMe, setToken, type AuthUser } from '../api/client'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<string | null>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    apiMe()
      .then((data) => setUser(data.user))
      .catch(() => {
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    try {
      const result = await apiLogin(username.trim(), password)
      setToken(result.token)
      setUser(result.user)
      return null
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        return 'Неверный логин или пароль'
      }
      return 'Не удалось войти. Попробуйте ещё раз.'
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
