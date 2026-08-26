import { useEffect, useState } from 'react'
import { useTeam } from '../context/TeamContext'
import { CNA_LOGO } from '../assets/brand'

export default function IdentityScreen({ takenNames, onSelect, registering, error }) {
  const { names: TEAM } = useTeam()
  // Inline two-tap confirm for registered names — window.confirm() is silently
  // swallowed by iOS home-screen web apps, so no native dialogs here
  const [confirming, setConfirming] = useState(null)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(null), 5000)
    return () => clearTimeout(t)
  }, [confirming])
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
         style={{ background: '#171717' }}>

      {/* Logo */}
      <img src={CNA_LOGO} alt="CNA" className="w-16 h-16 object-contain mb-8 opacity-90" />

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
              onClick={() => {
                if (registering) return
                // A registered name is still selectable — clearing the browser
                // cache wipes the local identity while the registration row
                // survives, and that person must be able to claim themselves
                // back. First tap arms, second tap within 5 s confirms.
                if (taken && confirming !== name) { setConfirming(name); return }
                onSelect(name)
              }}
              disabled={registering}
              className="w-full py-3.5 px-5 rounded-2xl text-left font-semibold text-sm
                         transition-all active:scale-[0.98]"
              style={{
                background:  confirming === name ? 'rgba(44,185,189,0.15)'
                           : taken ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
                color:       taken && confirming !== name ? 'rgba(255,255,255,0.55)' : 'white',
                border:      confirming === name ? '1px solid rgba(44,185,189,0.5)'
                           : taken ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span>{confirming === name ? `Tap again to continue as ${name}` : name}</span>
              {taken && confirming !== name && (
                <span className="float-right text-xs font-normal"
                      style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Registered
                </span>
              )}
              {confirming === name && (
                <span className="block text-[11px] font-normal mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Notifications will move to this device
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
