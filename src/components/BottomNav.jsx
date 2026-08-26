import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { HELICOPTER_ICON, FUEL_PUMP_ICON } from '../assets/navIcons'

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
      <img src={HELICOPTER_ICON} alt="helicopter" className="w-5 h-5 object-contain"
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
      <img src={FUEL_PUMP_ICON} alt="fuel" className="w-5 h-5 object-contain"
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

  // ── Instagram lens: the frosted blob behind the active tab. Tap a tab and
  // it glides over; grab it and drag along the bar and the app switches
  // screens live as the lens passes each tab. ──
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navRef = useRef(null)
  const activeIdx = Math.max(TABS.findIndex(t => t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)), 0)
  const [dragPx, setDragPx] = useState(null)   // null = at rest on the active tab
  const lens = useRef(null)                    // gesture state
  const suppressClick = useRef(false)

  function slotMetrics() {
    const rect = navRef.current.getBoundingClientRect()
    const padX = compact ? 5.6 : 6.4           // pill-nav horizontal padding in px
    const slotW = (rect.width - padX * 2) / TABS.length
    return { rect, padX, slotW }
  }

  function onLensTouchStart(e) {
    if (e.touches.length !== 1) return
    lens.current = { startX: e.touches[0].clientX, engaged: false, lastIdx: activeIdx }
  }

  function onLensTouchMove(e) {
    const g = lens.current
    if (!g) return
    const x = e.touches[0].clientX
    if (!g.engaged) {
      if (Math.abs(x - g.startX) < 10) return
      g.engaged = true
    }
    const { rect, padX, slotW } = slotMetrics()
    const px = Math.min(Math.max(x - rect.left - padX - slotW / 2, 0), slotW * (TABS.length - 1))
    setDragPx(px)
    const idx = Math.min(Math.max(Math.round(px / slotW), 0), TABS.length - 1)
    if (idx !== g.lastIdx) { g.lastIdx = idx; navigate(TABS[idx].to) }
  }

  function onLensTouchEnd() {
    const g = lens.current
    lens.current = null
    if (!g?.engaged) return
    suppressClick.current = true               // the tap that ends a drag is not a click
    setTimeout(() => { suppressClick.current = false }, 350)
    setDragPx(null)                            // spring home onto the active tab
  }

  const lensStyle = dragPx != null
    ? { transform: `translateX(${dragPx}px)`, transition: 'none' }
    : { transform: `translateX(${activeIdx * 100}%)` }

  return (
    <div className="nav-dock">
    <nav ref={navRef}
      className={`pill-nav${compact ? ' compact' : ''}${moving ? ' is-moving' : ''}`}
      onClick={() => setCompact(false)}
      onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation() } }}
      onTouchStart={onLensTouchStart}
      onTouchMove={onLensTouchMove}
      onTouchEnd={onLensTouchEnd}
    >
      <span className="nav-lens-track" aria-hidden>
        <span className={`nav-lens${dragPx != null ? ' dragging' : ''}`} style={lensStyle} />
      </span>
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
