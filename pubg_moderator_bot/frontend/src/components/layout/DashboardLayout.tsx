import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 md:ml-sidebar flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 mt-16 p-container lg:p-stack-lg">
          {children}
        </main>
      </div>
    </div>
  )
}
