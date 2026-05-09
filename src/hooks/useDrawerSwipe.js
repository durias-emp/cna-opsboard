import { useRef, useState, useCallback } from 'react'

const CLOSE_THRESHOLD = 80 // px dragged down to trigger close

/**
 * Attach to the drawer panel + drag-handle to get swipe-to-close.
 *
 * Usage:
 *   const { handleProps, panelStyle } = useDrawerSwipe(onClose)
 *
 *   <div className="drawer-panel …" style={panelStyle}>
 *     <div className="… drag-handle …" {...handleProps} />
 *     …
 *   </div>
 */
export function useDrawerSwipe(onClose) {
  const startY     = useRef(null)
  const [dragY, setDragY] = useState(0)

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setDragY(delta)
  }, [])

  const onTouchEnd = useCallback(() => {
    const captured = dragY
    setDragY(0)
    startY.current = null
    if (captured > CLOSE_THRESHOLD) onClose()
  }, [dragY, onClose])

  // While dragging: follow the finger with no CSS transition.
  // At rest: return empty so the drawer-panel CSS classes control open/close.
  const panelStyle = dragY > 0
    ? { transform: `translateY(${dragY}px)`, transition: 'transform 0ms' }
    : {}

  const handleProps = { onTouchStart, onTouchMove, onTouchEnd }

  return { handleProps, panelStyle }
}
