import { useEffect, useRef, useState } from 'react'

// iOS large-title header: starts big, and once the large title scrolls out of
// view a compact frosted bar fades in at the top with the centered title —
// the Settings/Mail navigation-bar pattern. Works inside any scroll container
// (an IntersectionObserver on a sentinel, no scroll listeners).
export default function PageHeader({ title, sub, action, right }) {
  const sentinel = useRef(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      {/* Compact frosted bar — appears when the large title scrolls away */}
      <div
        className={`fixed top-0 left-0 right-0 z-[60] flex items-center justify-center
                    transition-opacity duration-200 ${compact ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          minHeight: 'calc(env(safe-area-inset-top, 0px) + 3.4rem)',
          background: 'rgba(23,23,23,0.94)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <p className="py-2.5 text-[15px] font-semibold text-white">{title}</p>
      </div>

      <div ref={sentinel} aria-hidden className="h-px" />

      {/* Large title row */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {right ?? (action && (
          <button className="fab" onClick={action.onClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {action.label}
          </button>
        ))}
      </div>
    </>
  )
}
