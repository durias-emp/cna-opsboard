export default function PageHeader({ title, sub, action }) {
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
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
