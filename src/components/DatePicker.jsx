/**
 * DatePicker — shows a styled display div with an invisible native
 * <input type="date"> overlaid on top. The OS date picker opens on tap,
 * but we control all the visual rendering so nothing overflows the screen.
 */
export default function DatePicker({ value, onChange, className = '' }) {
  function formatDisplay(dateStr) {
    if (!dateStr) return 'Select date'
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className={`relative ${className}`}>
      {/* Styled display — pointer-events-none so the hidden input captures taps */}
      <div className="input-field w-full flex items-center justify-between select-none pointer-events-none">
        <span className={value ? 'text-white' : 'text-white/25'}>
          {formatDisplay(value)}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
          strokeLinecap="round" className="w-4 h-4 text-white/25 flex-shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>

      {/* Invisible native input — covers the display and opens the OS picker on tap */}
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ WebkitAppearance: 'none', appearance: 'none' }}
      />
    </div>
  )
}
