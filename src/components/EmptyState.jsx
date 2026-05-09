export default function EmptyState({ icon, message, action }) {
  return (
    <div className="card flex flex-col items-center justify-center py-14 text-center gap-4">
      <div className="icon-box w-14 h-14 bg-navy-700 rounded-2xl text-slate-500">
        {icon}
      </div>
      <p className="text-sm text-slate-400 max-w-[180px] leading-relaxed">{message}</p>
      {action && (
        <button className="fab" onClick={action.onClick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            strokeLinecap="round" className="w-4 h-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {action.label}
        </button>
      )}
    </div>
  )
}
