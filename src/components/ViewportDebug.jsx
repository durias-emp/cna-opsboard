import { useEffect, useState } from 'react'

// TEMPORARY DIAGNOSTIC — renders only on *.trycloudflare.com (the phone-preview
// tunnel). Shows live viewport numbers and paints the page root red so a dead
// band at the bottom is attributable: red band = page-painted (layout math),
// black band = outside the web view (OS chrome / letterbox).
export default function ViewportDebug() {
  const [n, setN] = useState({})

  useEffect(() => {
    document.documentElement.style.background = '#dc2626'   // red tell-tale
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;height:100dvh;width:0;top:0;left:0;pointer-events:none;'
    const inset = document.createElement('div')
    inset.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);width:0;pointer-events:none;'
    document.body.append(probe, inset)

    function read() {
      setN({
        inner:  `${window.innerWidth}×${window.innerHeight}`,
        vv:     window.visualViewport ? `${Math.round(window.visualViewport.width)}×${Math.round(window.visualViewport.height)} @${Math.round(window.visualViewport.offsetTop)}` : 'n/a',
        screen: `${window.screen.width}×${window.screen.height}`,
        docEl:  document.documentElement.clientHeight,
        body:   document.body.getBoundingClientRect().height,
        dvh:    probe.getBoundingClientRect().height,
        safeB:  inset.getBoundingClientRect().height,
        scrollY: window.scrollY,
        standalone: window.navigator.standalone === true ? 'yes' : 'no',
      })
    }
    read()
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('resize', read)
    window.visualViewport?.addEventListener('scroll', read)
    const t = setInterval(read, 1500)
    return () => { clearInterval(t); window.removeEventListener('resize', read) }
  }, [])

  return (
    <div style={{
      position: 'fixed', top: 60, left: 8, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', color: '#4ade80',
      font: '11px/1.5 monospace', padding: '8px 10px', borderRadius: 8,
      pointerEvents: 'none', whiteSpace: 'pre',
    }}>
{`inner:   ${n.inner}
visualVP:${n.vv}
screen:  ${n.screen}
docEl h: ${n.docEl}
body h:  ${Math.round(n.body ?? 0)}
100dvh:  ${Math.round(n.dvh ?? 0)}
safe-btm:${Math.round(n.safeB ?? 0)}
scrollY: ${n.scrollY}
PWA:     ${n.standalone}`}
    </div>
  )
}
