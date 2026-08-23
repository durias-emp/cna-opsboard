import { useTeam } from '../context/TeamContext'

export default function IdentityScreen({ takenNames, onSelect, registering, error }) {
  const { names: TEAM } = useTeam()
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
         style={{ background: '#0a0a0c' }}>

      {/* Logo */}
      <img src="/cna-logo.png" alt="CNA" className="w-16 h-16 object-contain mb-8 opacity-90" />

      {/* Heading */}
      <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Welcome to CNA OS</h1>
      <p className="text-sm text-white/40 mb-10 text-center">
        Who are you? We'll send task notifications to this device.
      </p>

      {/* Team grid */}
      <div className="w-full max-w-sm space-y-2.5">
        {TEAM.map(name => {
          const taken = takenNames.includes(name)
          return (
            <button
              key={name}
              onClick={() => !taken && !registering && onSelect(name)}
              disabled={taken || registering}
              className="w-full py-3.5 px-5 rounded-2xl text-left font-semibold text-sm
                         transition-all active:scale-[0.98]"
              style={{
                background:  taken ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
                color:       taken ? 'rgba(255,255,255,0.2)'  : 'white',
                border:      taken ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.1)',
                cursor:      taken ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{name}</span>
              {taken && (
                <span className="float-right text-xs font-normal"
                      style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Registered
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {registering && (
        <div className="mt-8 flex items-center gap-2 text-white/40 text-sm">
          <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          Setting up notifications…
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-6 text-xs text-red-400 text-center max-w-xs">{error}</p>
      )}

      {/* Note for regular browser (non-PWA) */}
      {'PushManager' in window ? null : (
        <p className="mt-8 text-[11px] text-white/25 text-center max-w-xs leading-relaxed">
          For push notifications, add this app to your Home Screen first.
          You can still identify yourself now.
        </p>
      )}

      {/* Skip */}
      <button
        onClick={() => onSelect(null)}
        disabled={registering}
        className="mt-6 text-xs text-white/20 active:text-white/40 transition-colors">
        Skip for now
      </button>
    </div>
  )
}
