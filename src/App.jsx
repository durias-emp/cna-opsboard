import { lazy, Suspense, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AircraftProvider, useAircraft } from './context/AircraftContext'
import { TeamProvider, useTeam } from './context/TeamContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'
// Each page is its own chunk so the first paint doesn't download the whole app
const Dashboard   = lazy(() => import('./pages/Dashboard'))
const Flights     = lazy(() => import('./pages/Flights'))
const Maintenance = lazy(() => import('./pages/Maintenance'))
const Fuel        = lazy(() => import('./pages/Fuel'))
const Employees   = lazy(() => import('./pages/Employees'))
const MapPage     = lazy(() => import('./pages/MapPage'))
import IdentityScreen from './components/IdentityScreen'
import ConnectionError from './components/ConnectionError'
import LoginScreen from './components/LoginScreen'
import NotLinkedScreen from './components/NotLinkedScreen'
import { usePushRegistration } from './hooks/usePushRegistration'

// Shown instead of the app when the aircraft row can't be loaded
function ConnectionGate({ children }) {
  const { error, loading, refreshAircraft } = useAircraft()
  if (error && !loading) return <ConnectionError message={error} onRetry={refreshAircraft} />
  return children
}

function Shell() {
  const { pathname } = useLocation()
  return (
    <div className="page-shell bg-navy-950">
      <main className="flex-1 overflow-hidden flex flex-col">
        <Suspense fallback={<div className="flex-1" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flights" element={<Flights />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/fuel" element={<Fuel />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
        </Suspense>
      </main>
      {pathname !== '/map' && <BottomNav />}
    </div>
  )
}

// ── Login mode (VITE_AUTH_ENABLED=true) ──────────────────────────────────────
// Session → roster member by email → that name becomes this device's identity
// (task assignment, push target, management check) with no name-picker.
function AuthenticatedApp() {
  const { session, email, loading: authLoading } = useAuth()
  const team = useTeam()
  const { identity, register } = usePushRegistration()
  const { refreshAircraft } = useAircraft()
  const member = email ? team.byEmail(email) : null
  const registered = useRef(false)

  // Data loaded before sign-in was blocked by RLS — reload it once we have a session
  const lastSession = useRef(null)
  useEffect(() => {
    const id = session?.user?.id ?? null
    if (id && id !== lastSession.current) { lastSession.current = id; team.refresh(); refreshAircraft() }
  }, [session, team, refreshAircraft])

  useEffect(() => {
    if (!member || registered.current) return
    if (identity !== member.name) { registered.current = true; register(member.name) }
  }, [member, identity, register])

  if (authLoading || team.loading) return <div className="fixed inset-0" style={{ background: '#0a0a0c' }} />
  if (!session) return <LoginScreen />
  if (!member)  return <NotLinkedScreen />
  return <ConnectionGate><Shell /></ConnectionGate>
}

// ── Legacy mode (no login): one-time name pick per device ────────────────────
function LegacyApp() {
  const { needsSetup, takenNames, register, registering, error } = usePushRegistration()

  async function handleIdentitySelect(name) {
    if (name) {
      await register(name)
    } else {
      localStorage.setItem('cna_identity', '__skipped__')   // don't ask again
      window.location.reload()
    }
  }

  return (
    <>
      <ConnectionGate><Shell /></ConnectionGate>
      {needsSetup && (
        <IdentityScreen takenNames={takenNames} onSelect={handleIdentitySelect}
          registering={registering} error={error} />
      )}
    </>
  )
}

export default function App() {
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true'
  return (
    <AuthProvider>
      <TeamProvider>
        <AircraftProvider>
          {authEnabled ? <AuthenticatedApp /> : <LegacyApp />}
        </AircraftProvider>
      </TeamProvider>
    </AuthProvider>
  )
}
