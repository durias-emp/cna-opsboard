import { useAircraft } from '../context/AircraftContext'

export default function AircraftBar() {
  const { aircraft, selectedAircraft, setSelectedAircraft, loading } = useAircraft()

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between
                 bg-navy-950 border-b border-white/[0.06]
                 px-4 py-3"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      {/* Logo */}
      <img
        src="/cna-logo.png"
        alt="Cielo Norte Aviación"
        className="h-7 w-auto max-w-[160px] select-none object-contain object-left"
        style={{ filter: 'brightness(0) invert(1)' }}
        draggable={false}
      />

      {/* Aircraft selector */}
      {loading ? (
        <div className="h-7 w-32 rounded-full bg-navy-800 animate-pulse" />
      ) : aircraft.length <= 1 ? (
        <AircraftChip aircraft={selectedAircraft} />
      ) : (
        <div className="relative">
          <select
            value={selectedAircraft?.id ?? ''}
            onChange={(e) => {
              const found = aircraft.find((a) => String(a.id) === e.target.value)
              if (found) setSelectedAircraft(found)
            }}
            className="bg-transparent text-white text-xs font-semibold outline-none
                       appearance-none cursor-pointer opacity-0 absolute inset-0 w-full h-full"
          >
            {aircraft.map((a) => (
              <option key={a.id} value={a.id} style={{ backgroundColor: '#0f172a' }}>
                {a.tail_number}
              </option>
            ))}
          </select>
          <AircraftChip aircraft={selectedAircraft} />
        </div>
      )}
    </div>
  )
}

function AircraftChip({ aircraft }) {
  if (!aircraft) return null
  return (
    <div className="flex items-center gap-2 bg-white/[0.07] border border-white/[0.08]
                    rounded-full px-3 py-1.5">
      <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" />
      </span>
      <span className="text-xs font-semibold text-white">{aircraft.tail_number}</span>
      <span className="text-[10px] text-slate-400 hidden sm:block">{aircraft.make_model}</span>
    </div>
  )
}
