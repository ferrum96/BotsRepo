import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/members', label: 'Участники', icon: 'group' },
  { to: '/blacklist', label: 'Blacklist', icon: 'block' },
  { to: '/inactive', label: 'Неактивные', icon: 'person_off' },
]

export function Sidebar() {
  return (
    <nav className="hidden md:flex flex-col h-full py-stack-lg bg-surface-1 border-r border-outline-level w-sidebar fixed left-0 top-0 z-50">
      <div className="px-container mb-stack-lg">
        <div className="flex items-center gap-stack-md">
          <div className="w-10 h-10 rounded bg-electric flex items-center justify-center text-black font-bold">
            BB
          </div>
          <div>
            <h1 className="text-headline-lg text-electric">BB Clan</h1>
            <p className="text-label-caps font-mono text-on-surface-variant">Command Center</p>
          </div>
        </div>
      </div>
      <ul className="flex flex-col flex-grow">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-stack-md px-container py-stack-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? 'text-electric border-electric bg-surface-variant'
                    : 'text-on-surface-variant border-transparent hover:bg-surface-variant'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
