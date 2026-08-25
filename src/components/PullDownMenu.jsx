import { useEffect, useRef, useState } from 'react'

// iOS-style pull-down menu (UIMenu look): dark translucent sheet, rounded 14pt,
// hairline separators, checkmark on the selected row, springs open from the trigger.
// Usage:
//   <PullDownMenu
//     items={[{ key, label, checked, onSelect }]}
//     trigger={open => <button>YS-CNA ⌄</button>}
//   />
export default function PullDownMenu({ items, trigger, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      {trigger(() => setOpen(o => !o))}

      {open && (
        <div
          className={`absolute top-full mt-2 z-[90] min-w-[13rem] overflow-hidden rounded-2xl
                      shadow-[0_16px_48px_rgba(0,0,0,0.55)] ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{
            // iOS system-material menu: translucent enough that the frost is
            // visibly doing the work, huge radius, saturation lift, hairline
            // light edge. Not tied to the app glass number — system menus
            // don't thin out.
            background: 'rgba(37, 37, 40, 0.60)',
            backdropFilter: 'blur(50px) saturate(210%)',
            WebkitBackdropFilter: 'blur(50px) saturate(210%)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            transformOrigin: align === 'right' ? 'top right' : 'top left',
            animation: 'menu-in 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
          }}
        >
          {items.map((item, i) => (
            <button
              key={item.key ?? item.label}
              onClick={() => { setOpen(false); item.onSelect?.() }}
              className={`w-full flex items-center gap-2.5 px-4 py-3 text-left select-none
                          active:bg-white/[0.08] transition-colors
                          ${i > 0 ? 'border-t border-white/[0.08]' : ''}`}
            >
              <span className="w-4 flex-shrink-0 text-white">
                {item.checked && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                    strokeLinecap="round" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
                )}
              </span>
              <span className="text-[16px] text-white">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
