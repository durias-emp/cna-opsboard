import { useRef, useState, useCallback } from 'react'

// Native-sheet gesture physics (modeled on iOS UISheetPresentationController / Vaul):
// - 1:1 finger tracking from ANYWHERE on the sheet (not just the grabber),
//   engaging only when the inner scroller is at its top so scrolling still works
// - a fast downward flick dismisses regardless of distance (velocity-aware),
//   a slow drag needs ~30% of the sheet's height
// - upward drag rubber-bands with progressive resistance
// - release hands off to the CSS spring curve on .drawer-panel

const VELOCITY_DISMISS = 0.6    // px/ms — a flick
const DISTANCE_DISMISS = 0.30   // fraction of sheet height for a slow drag

export function useDrawerSwipe(onClose) {
  const gesture = useRef(null)
  const [dragY, setDragY] = useState(0)

  const onTouchStart = useCallback(e => {
    if (gesture.current) return   // handle + panel both fire; first one wins
    const panel = e.currentTarget.closest('.drawer-panel') ?? e.currentTarget
    gesture.current = {
      panel,
      startY:  e.touches[0].clientY,
      panelH:  panel.getBoundingClientRect().height || 600,
      scroller: panel.querySelector('.overflow-y-auto'),
      engaged: false,
      dead:    false,
      samples: [{ y: e.touches[0].clientY, t: e.timeStamp }],
    }
  }, [])

  const onTouchMove = useCallback(e => {
    const g = gesture.current
    if (!g || g.dead) return
    const y = e.touches[0].clientY
    g.samples.push({ y, t: e.timeStamp })
    if (g.samples.length > 6) g.samples.shift()
    const dy = y - g.startY

    if (!g.engaged) {
      const inScroller = g.scroller && g.scroller.contains(e.target)
      const atTop      = !g.scroller || g.scroller.scrollTop <= 0
      if (inScroller && !atTop) { g.dead = true; return }      // let the list scroll
      if (Math.abs(dy) < 6) return                              // not a drag yet
      if (dy < 0 && inScroller) { g.dead = true; return }       // upward in list = scroll
      g.engaged = true
      // Glass: thicken the frost while the sheet moves (blur every frame on a
      // moving layer is expensive; is-moving swaps to a cheap 2px radius)
      g.panel?.classList.add('is-moving')
    }
    // 1:1 downward; progressive resistance upward
    setDragY(dy >= 0 ? dy : dy / (1 + Math.abs(dy) / 24))
  }, [])

  const onTouchEnd = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    if (!g || !g.engaged) { setDragY(0); return }
    const s     = g.samples
    const dt    = Math.max(s[s.length - 1].t - s[0].t, 1)
    const v     = (s[s.length - 1].y - s[0].y) / dt   // px/ms, + = downward
    const dyNow = s[s.length - 1].y - g.startY
    setDragY(0)   // the spring on .drawer-panel takes it from here
    // Let the settle spring finish under the cheap blur, then restore the frost
    setTimeout(() => g.panel?.classList.remove('is-moving'), 520)
    if (v > VELOCITY_DISMISS || dyNow > g.panelH * DISTANCE_DISMISS) onClose()
  }, [onClose])

  // While dragging: follow the finger, no transition.
  // At rest: the .drawer-panel spring curve owns the motion.
  const panelStyle = dragY !== 0
    ? { transform: `translateY(${dragY}px)`, transition: 'none' }
    : {}

  const props = { onTouchStart, onTouchMove, onTouchEnd }
  return { handleProps: props, panelProps: props, panelStyle }
}
