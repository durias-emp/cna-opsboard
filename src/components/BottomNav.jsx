import { NavLink } from 'react-router-dom'

const TABS = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/flights',
    label: 'Flights',
    icon: (
      <img src="/helicopter.png" alt="helicopter" className="w-5 h-5 object-contain"
        style={{ filter: 'brightness(0) invert(1)' }} />
    ),
  },
  {
    to: '/maintenance',
    label: 'Maintenance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    to: '/fuel',
    label: 'Fuel',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        {/* Pump body with rounded top */}
        <path d="M4 22V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17" />
        {/* Base */}
        <line x1="3" y1="22" x2="16" y2="22" />
        {/* Screen/display */}
        <rect x="6" y="6" width="7" height="5" rx="1" />
        {/* Nozzle arm: horizontal then curves down */}
        <path d="M15 7h2a2 2 0 0 1 2 2v8a2 2 0 0 0 2 2" />
        {/* Grip handle at top */}
        <line x1="15" y1="5" x2="18" y2="3" />
      </svg>
    ),
  },
  {
    to: '/invoices',
    label: 'Invoices',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  return (
    <nav className="pill-nav">
      {TABS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        >
          {icon}
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
