// Full-screen "can't reach the server" state. Replaces the old silent fallback
// that showed a fake aircraft at stale hours when Supabase was unreachable.
export default function ConnectionError({ message, onRetry }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-8 text-center"
         style={{ background: '#171717' }}>
      <div className="w-14 h-14 rounded-full bg-white/[0.06] flex items-center justify-center mb-5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-white/40">
          <path d="M1 1l22 22" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <p className="text-base font-bold text-white">Can't reach the server</p>
      <p className="text-sm text-white/40 mt-2 max-w-xs">
        Aircraft data couldn't be loaded, so nothing is shown rather than risk showing stale hours.
      </p>
      {message && <p className="text-[11px] text-white/25 mt-3 font-mono break-all max-w-xs">{message}</p>}
      <button onClick={onRetry}
        className="mt-6 px-6 py-2.5 rounded-2xl bg-white text-black text-sm font-semibold active:scale-[0.98]">
        Try again
      </button>
    </div>
  )
}
