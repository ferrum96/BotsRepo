import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-[#060b14]">
        <div className="text-on-surface-variant">Загрузка...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
