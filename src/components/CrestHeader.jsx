import { useEffect, useRef, useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import PullDownMenu from './PullDownMenu'

// App-wide header: CNA crest pinned top-center, shrinking under the finger as
// the page scrolls (scroll-driven, like the tab bar), with the aircraft pill
// switcher centered below it riding away with the content.
//
// Must be rendered as a direct child of the page's scroll container — the
// scroll listener attaches to the anchor row's parent element.
export default function CrestHeader() {
  const { aircraft, selectedAircraft, setSelectedAircraft } = useAircraft()
  const anchor = useRef(null)
  // 0 = at rest (large crest, no backdrop), 1 = fully compact
  const [p, setP] = useState(0)

  useEffect(() => {
    const scroller = anchor.current?.parentElement
    if (!scroller) return
    const onScroll = () => setP(Math.min(Math.max(scroller.scrollTop / 56, 0), 1))
    scroller.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  const switcherItems = aircraft.map(a => ({
    key: a.id,
    label: a.tail_number,
    checked: a.id === selectedAircraft?.id,
    onSelect: () => setSelectedAircraft(a),
  }))

  const chipBody = onClick => (
    <button onClick={onClick} disabled={!onClick}
      className="flex items-center gap-2 bg-white/[0.07] rounded-full px-3 py-1.5 select-none active:opacity-70">
      <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" />
      </span>
      <span className="text-xs font-semibold text-white">{selectedAircraft?.tail_number ?? '—'}</span>
      {onClick && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" className="w-3 h-3 text-white/40"><path d="M6 9l6 6 6-6" /></svg>
      )}
    </button>
  )

  const chip = switcherItems.length
    ? <PullDownMenu items={switcherItems} align="right" trigger={toggle => chipBody(toggle)} />
    : chipBody(null)

  // Frosted, not darkened: the blur carries the readability, the tint is
  // barely there, and the mask fades the whole thing out so no strip edge
  // ever cuts the content. Never 'none' — the WebKit permanent-loss trap.
  const blur = `blur(calc(var(--glass-blur) * ${p.toFixed(3)})) saturate(${100 + Math.round(80 * p)}%)`

  return (
    <>
      {/* Crest bar — always pinned; shrinks and gains frosted glass on scroll */}
      <div
        className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: `linear-gradient(to bottom, rgba(23,23,23,${(0.9 * p).toFixed(3)}) 0px, rgba(23,23,23,0) 2.4rem),
                       rgba(var(--glass-rgb), calc(var(--glass-opacity) * ${p.toFixed(3)}))`,
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
          maskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)',
          paddingBottom: '1.4rem',
          marginBottom: '-1.4rem',
        }}
      >
        <div className="flex items-center justify-center" style={{ padding: `${0.8 - 0.2 * p}rem 0` }}>
          <img src="/cna-mark-white.png" alt="CNA" className="opacity-90 select-none" draggable="false"
            style={{ height: `${1.5 - 0.5 * p}rem` }} />
        </div>
      </div>

      {/* In-flow row — the aircraft pill scrolls away with the page */}
      <div ref={anchor} className="relative flex items-center justify-center px-4"
        style={{ paddingTop: '3.4rem', paddingBottom: '0.4rem' }}>
        {chip}
      </div>
    </>
  )
}
