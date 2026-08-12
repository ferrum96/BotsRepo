import { Navigate, Route, Routes } from 'react-router-dom'

import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useDashboardSocket } from './hooks/useDashboardSocket'
import { LoginPage } from './pages/LoginPage'
import { BlacklistPage } from './pages/BlacklistPage'
import { InactiveMembersPage } from './pages/InactiveMembersPage'
import { MembersPage } from './pages/MembersPage'

function DashboardRoutes() {
  useDashboardSocket()

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/members" replace />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/inactive-members" element={<InactiveMembersPage />} />
        <Route path="/blacklist" element={<BlacklistPage />} />
        <Route path="*" element={<Navigate to="/members" replace />} />
      </Routes>
    </DashboardLayout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/*" element={<DashboardRoutes />} />
      </Route>
    </Routes>
  )
}
