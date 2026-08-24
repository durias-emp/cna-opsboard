// iOS-style action sheet: slide-up groups, red destructive rows, separate
// Cancel button, safe-area padding. Used for every destructive confirmation.
export default function ActionSheet({ open, title, actions = [], onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" style={{ animation: 'sheet-fade 0.2s ease' }} />
      <div className="relative px-2.5 select-none"
           style={{
             paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.6rem)',
             animation: 'sheet-up 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)',
           }}
           onClick={e => e.stopPropagation()}>

        <div className="rounded-2xl overflow-hidden"
             style={{ background: 'rgba(44,44,46,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          {title && (
            <p className="px-4 py-3 text-center text-[13px] text-white/50 border-b border-white/[0.08]">
              {title}
            </p>
          )}
          {actions.map((a, i) => (
            <button
              key={a.label}
              onClick={() => { onClose(); a.onPress?.() }}
              className={`w-full py-3.5 text-center text-[17px] active:bg-white/[0.08] transition-colors
                          ${i > 0 || title ? 'border-t border-white/[0.08]' : ''}
                          ${a.destructive ? 'text-red-400' : 'text-white'}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <button onClick={onClose}
          className="mt-2 w-full py-3.5 rounded-2xl text-center text-[17px] font-semibold text-white
                     active:bg-navy-700 transition-colors"
          style={{ background: 'rgba(44,44,46,0.98)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
