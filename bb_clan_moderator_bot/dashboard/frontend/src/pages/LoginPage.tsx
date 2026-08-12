import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const loginError = await login(username.trim(), password)
      if (loginError) {
        setError(loginError)
        return
      }
      navigate('/', { replace: true })
    } catch {
      setError('Не удалось войти. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] min-h-screen flex items-center justify-center bg-[#060b14] px-4">
      <div className="w-full max-w-sm bg-[#0d1528] border border-outline-level rounded-xl shadow-[0_0_24px_rgba(0,240,255,0.08)] p-6 animate-fade-in">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 rounded bg-[#0d1528] border border-outline-level flex items-center justify-center mx-auto mb-3 shadow-[0_0_18px_rgba(0,240,255,0.15)]">
            <span className="material-symbols-outlined text-electric text-[28px] icon-thin">shield</span>
          </div>
          <h1 className="text-2xl font-bold text-electric tracking-tight">BB Clan</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Войдите, чтобы продолжить</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-on-surface">
              Логин
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className="input-dark w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              required
              disabled={submitting || loading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-on-surface">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="input-dark w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              disabled={submitting || loading}
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full disabled:opacity-50"
            disabled={submitting || loading}
          >
            {submitting ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
