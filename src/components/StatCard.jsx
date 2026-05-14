export default function StatCard({ icon, label, value, sub, trend, accent = false, onClick }) {
  return (
    <div className={`stat-card ${onClick ? 'cursor-pointer active:opacity-80 transition-opacity select-none' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className={`icon-box w-9 h-9 ${accent ? 'bg-accent/15' : 'bg-navy-700'}`}>
          <span className={accent ? 'text-accent' : 'text-slate-400'}>{icon}</span>
        </div>
        {trend !== undefined && (
          <span className={`badge ${trend >= 0 ? 'badge-green' : 'badge-red'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div>
        <p className="label mb-1">{label}</p>
        <p className="text-xl font-bold text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis">{value ?? '—'}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
