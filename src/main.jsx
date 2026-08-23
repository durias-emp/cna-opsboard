import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

// iOS keyboard-close re-anchor: when the on-screen keyboard dismisses in a
// standalone PWA, WebKit sometimes leaves the page scrolled/shifted, which
// shows as a dead black band at the bottom. When the visual viewport returns
// to (roughly) full height, snap the window back to the origin.
if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (window.visualViewport.height >= window.innerHeight - 1) {
      window.scrollTo(0, 0)
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
