import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/members', label: 'Участники группы', icon: 'person_add' },
  { to: '/inactive-members', label: 'Неактивные игроки', icon: 'hourglass_empty' },
  { to: '/blacklist', label: 'Блэклист', icon: 'block' },
]

function ClanLogo() {
  return (
    <div className="w-11 h-11 rounded bg-[#0d1528] border border-outline-level flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(0,240,255,0.15)]">
      <span className="material-symbols-outlined text-electric text-[26px] icon-thin">shield</span>
    </div>
  )
}

interface SidebarProps {
  isCollapsed: boolean
  isMobileOpen: boolean
  onToggleCollapse: () => void
  onCloseMobile: () => void
}

export function Sidebar({
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  return (
    <nav
      className={`flex flex-col h-full py-stack-lg bg-[#060b14] border-r border-outline-level fixed left-0 top-0 z-50 transition-all duration-200 ${isCollapsed ? 'md:w-[88px]' : 'md:w-sidebar'
        } w-sidebar ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
    >
      <button
        type="button"
        className={`mb-stack-lg text-left ${isCollapsed ? 'px-container md:px-4' : 'px-container'} md:cursor-pointer`}
        title={isCollapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'}
        onClick={() => {
          if (window.innerWidth >= 768) {
            onToggleCollapse()
          }
        }}
      >
        <div className={`flex items-center gap-stack-md ${isCollapsed ? 'md:justify-center' : ''}`}>
          <ClanLogo />
          <div className={isCollapsed ? 'md:hidden' : ''}>
            <h1 className="text-[22px] leading-tight font-bold text-electric tracking-tight">
              BB Clan
            </h1>
            <p className="text-[10px] font-mono text-on-surface tracking-[0.22em] uppercase mt-0.5">
              Command Center
            </p>
          </div>
        </div>
      </button>
      <ul className="flex flex-col flex-grow gap-1">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onCloseMobile}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center py-3 transition-colors border-l-[3px] ${isCollapsed ? 'px-container gap-3 md:px-6 md:gap-0' : 'px-container gap-3'} ${isActive
                  ? 'text-white font-semibold border-electric bg-white/[0.03]'
                  : 'text-on-surface-variant border-transparent hover:text-on-surface hover:bg-white/[0.02]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`material-symbols-outlined text-[22px] icon-thin ${isActive ? 'text-white' : 'text-on-surface-variant'
                      }`}
                  >
                    {item.icon}
                  </span>
                  <span className={isCollapsed ? 'md:hidden' : ''}>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
