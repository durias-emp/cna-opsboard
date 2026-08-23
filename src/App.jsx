import { Routes, Route } from 'react-router-dom'
import { AircraftProvider, useAircraft } from './context/AircraftContext'
import AircraftBar from './components/AircraftBar'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Flights from './pages/Flights'
import Maintenance from './pages/Maintenance'
import Fuel from './pages/Fuel'
import Employees from './pages/Employees'
import IdentityScreen from './components/IdentityScreen'
import ConnectionError from './components/ConnectionError'
import { usePushRegistration } from './hooks/usePushRegistration'

// Shown instead of the app when the aircraft row can't be loaded
function ConnectionGate({ children }) {
  const { error, loading, refreshAircraft } = useAircraft()
  if (error && !loading) return <ConnectionError message={error} onRetry={refreshAircraft} />
  return children
}

export default function App() {
  const { needsSetup, takenNames, register, registering, error } = usePushRegistration()

  async function handleIdentitySelect(name) {
    if (name) {
      await register(name)
    } else {
      // Skip — store a placeholder so we don't ask again
      localStorage.setItem('cna_identity', '__skipped__')
      window.location.reload()
    }
  }

  return (
    <AircraftProvider>
      <ConnectionGate>
      <div className="page-shell bg-navy-950">
        <AircraftBar />

        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/flights" element={<Flights />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/fuel" element={<Fuel />} />
            <Route path="/employees" element={<Employees />} />
          </Routes>
        </main>

        <BottomNav />
      </div>
      </ConnectionGate>

      {/* One-time identity setup — only shown on first open of a new device */}
      {needsSetup && (
        <IdentityScreen
          takenNames={takenNames}
          onSelect={handleIdentitySelect}
          registering={registering}
          error={error}
        />
      )}
    </AircraftProvider>
  )
}
