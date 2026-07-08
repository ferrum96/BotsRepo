import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/members', label: 'Members', icon: 'person_add' },
  { to: '/blacklist', label: 'Blacklist', icon: 'block' },
]

function ClanLogo() {
  return (
    <div className="w-11 h-11 rounded bg-[#0d1528] border border-outline-level flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(0,240,255,0.15)]">
      <span className="material-symbols-outlined text-electric text-[26px] icon-thin">shield</span>
    </div>
  )
}

export function Sidebar() {
  return (
    <nav className="hidden md:flex flex-col h-full py-stack-lg bg-[#060b14] border-r border-outline-level w-sidebar fixed left-0 top-0 z-50">
      <div className="px-container mb-stack-lg">
        <div className="flex items-center gap-stack-md">
          <ClanLogo />
          <div>
            <h1 className="text-[22px] leading-tight font-bold text-electric tracking-tight">
              BB Clan
            </h1>
            <p className="text-[10px] font-mono text-on-surface tracking-[0.22em] uppercase mt-0.5">
              Command Center
            </p>
          </div>
        </div>
      </div>
      <ul className="flex flex-col flex-grow gap-1">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-container py-3 transition-colors border-l-[3px] ${
                  isActive
                    ? 'text-white font-semibold border-electric bg-white/[0.03]'
                    : 'text-on-surface-variant border-transparent hover:text-on-surface hover:bg-white/[0.02]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`material-symbols-outlined text-[22px] icon-thin ${
                      isActive ? 'text-white' : 'text-on-surface-variant'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
