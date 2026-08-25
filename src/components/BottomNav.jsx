import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'

const TABS = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    to: '/fuel',
    label: 'Fuel',
    icon: (
      <img src="/gasoline-pump.png" alt="fuel" className="w-5 h-5 object-contain"
        style={{ filter: 'brightness(0) invert(1)' }} />
    ),
  },
  {
    to: '/employees',
    label: 'Team',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  // Instagram behavior: scrolling down anywhere contracts the capsule
  // (labels collapse, pill shrinks); scrolling up — or reaching the top —
  // expands it again. Scroll events don't bubble, so listen in capture.
  const [compact, setCompact] = useState(false)
  const lastTop = useRef(new WeakMap())

  // While the capsule animates between states, thicken the frost (is-moving):
  // blurring a moving layer every frame is expensive, and the class swaps to a
  // cheap 2px blur without ever removing backdrop-filter (the WebKit trap).
  const [moving, setMoving] = useState(false)
  const moveTimer = useRef(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    setMoving(true)
    clearTimeout(moveTimer.current)
    moveTimer.current = setTimeout(() => setMoving(false), 480)
    return () => clearTimeout(moveTimer.current)
  }, [compact])

  useEffect(() => {
    function onScroll(e) {
      const el = e.target
      if (!(el instanceof Element) || el.scrollHeight <= el.clientHeight + 40) return
      const prev = lastTop.current.get(el) ?? 0
      const top  = el.scrollTop
      lastTop.current.set(el, top)
      if (top < 32) { setCompact(false); return }
      const dy = top - prev
      if (dy > 4)  setCompact(true)
      if (dy < -4) setCompact(false)
    }
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [])

  return (
    <div className="nav-dock">
    <nav className={`pill-nav${compact ? ' compact' : ''}${moving ? ' is-moving' : ''}`} onClick={() => setCompact(false)}>
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
    </div>
  )
}
