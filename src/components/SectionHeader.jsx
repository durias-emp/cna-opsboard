export default function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="label">{title}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-[11px] font-medium text-accent active:opacity-70 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
