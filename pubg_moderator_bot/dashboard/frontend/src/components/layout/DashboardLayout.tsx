import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 md:ml-sidebar flex flex-col min-h-screen">
        <main className="flex-1 p-container lg:p-stack-lg">
          {children}
        </main>
      </div>
    </div>
  )
}
