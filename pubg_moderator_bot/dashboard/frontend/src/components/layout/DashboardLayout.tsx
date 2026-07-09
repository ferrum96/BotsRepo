import { ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isCollapsed={isDesktopCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        onToggleCollapse={() => setIsDesktopCollapsed((prev) => !prev)}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      {isMobileSidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Закрыть меню"
        />
      )}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${isDesktopCollapsed ? 'md:ml-[88px]' : 'md:ml-sidebar'
          }`}
      >
        <header className="md:hidden sticky top-0 z-30 bg-[#060b14] border-b border-outline-level px-container py-3">
          <div className="flex items-center justify-between">
            <button
              className="btn-ghost"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Открыть меню"
            >
              <span className="material-symbols-outlined text-[22px]">menu</span>
            </button>
            <h1 className="text-electric font-semibold tracking-wide">BB Clan</h1>
            <div className="w-9" />
          </div>
        </header>
        <main className="flex-1 p-container lg:p-stack-lg">
          {children}
        </main>
      </div>
    </div>
  )
}
