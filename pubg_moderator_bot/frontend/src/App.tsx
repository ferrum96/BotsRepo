import { Navigate, Route, Routes } from 'react-router-dom'

import { DashboardLayout } from './components/layout/DashboardLayout'
import { BlacklistPage } from './pages/BlacklistPage'
import { InactivePage } from './pages/InactivePage'
import { MembersPage } from './pages/MembersPage'

export default function App() {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/members" replace />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/blacklist" element={<BlacklistPage />} />
        <Route path="/inactive" element={<InactivePage />} />
        <Route path="*" element={<Navigate to="/members" replace />} />
      </Routes>
    </DashboardLayout>
  )
}
