import { Routes, Route } from 'react-router-dom'
import { AircraftProvider } from './context/AircraftContext'
import AircraftBar from './components/AircraftBar'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Flights from './pages/Flights'
import Maintenance from './pages/Maintenance'
import Fuel from './pages/Fuel'
import Invoices from './pages/Invoices'

export default function App() {
  return (
    <AircraftProvider>
      <div className="page-shell bg-navy-950">
        <AircraftBar />

        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/flights" element={<Flights />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/fuel" element={<Fuel />} />
            <Route path="/invoices" element={<Invoices />} />
          </Routes>
        </main>

        <BottomNav />
      </div>
    </AircraftProvider>
  )
}
