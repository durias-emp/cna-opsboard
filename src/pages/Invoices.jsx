import { useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useInvoices } from '../hooks/useInvoices'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import SectionHeader from '../components/SectionHeader'
import EmptyState from '../components/EmptyState'
import InvoiceDrawer from '../components/InvoiceDrawer'

const IconDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />
  </svg>
)
const IconDollar = () => (
  <img src="/dollar-symbol.png" alt="dollar" className="w-5 h-5 object-contain"
    style={{ filter: 'brightness(0) invert(1)', opacity: 0.55 }} />
)
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)
const IconTrend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
  </svg>
)

const FILTERS = ['All', 'This month', 'Last month']

const PAYMENT_LABEL = {
  cash:     'Cash',
  card:     'Card',
  transfer: 'Transfer',
  bitcoin:  'Bitcoin',
}

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const toHobbs = mins => Math.round(mins / 6) / 10

function formatDuration(mins) {
  if (!mins) return null
  return `${toHobbs(mins).toFixed(1)}h`
}

function invoiceNum(n) {
  return `#${String(n).padStart(3, '0')}`
}

export default function Invoices() {
  const { selectedAircraft } = useAircraft()
  const { invoices, loading, stats, refresh } = useInvoices(selectedAircraft?.id)
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [editMode,       setEditMode]       = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [activeFilter,   setActiveFilter]   = useState(0)

  function openEditInvoice(inv) {
    setEditingInvoice(inv)
    setDrawerOpen(true)
  }

  function handleDrawerClose() {
    setDrawerOpen(false)
    setEditingInvoice(null)
  }

  function toggleEditMode() {
    setEditMode(v => !v)
    setEditingInvoice(null)
  }

  const now           = new Date()
  const monthStart     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const _lm            = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStart = `${_lm.getFullYear()}-${String(_lm.getMonth() + 1).padStart(2, '0')}-01`

  const filtered = invoices.filter(inv => {
    if (activeFilter === 1) return inv.date >= monthStart
    if (activeFilter === 2) return inv.date >= lastMonthStart && inv.date < monthStart
    return true
  })

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <PageHeader
        title="Invoices"
        sub={selectedAircraft?.tail_number}
        action={{ label: 'New Invoice', onClick: () => setDrawerOpen(true) }}
      />

      <div className="px-4 pb-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<IconDoc />}
            label="Total invoices"
            value={loading ? '…' : stats.total}
            sub="All time"
            accent
          />
          <StatCard
            icon={<IconCalendar />}
            label="This month"
            value={loading ? '…' : stats.monthCount}
            sub={stats.monthCount ? `$${stats.monthBilled.toLocaleString()} collected` : 'No invoices yet'}
          />
          <StatCard
            icon={<IconDollar />}
            label="Total billed"
            value={loading ? '…' : `$${stats.totalBilled.toLocaleString()}`}
            sub="All time"
          />
          <StatCard
            icon={<IconTrend />}
            label="Month revenue"
            value={loading ? '…' : `$${stats.monthBilled.toLocaleString()}`}
            sub="Current month"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              onClick={() => setActiveFilter(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors select-none
                ${i === activeFilter
                  ? 'bg-white/10 text-white border-white/15'
                  : 'bg-transparent text-white/35 border-white/[0.07]'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Invoice list */}
        <div>
          <SectionHeader
            title="Invoice log"
            action={{ label: editMode ? 'Done' : 'Edit', onClick: toggleEditMode }}
          />

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="card animate-pulse h-16" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<IconDoc />}
              message="No invoices yet. Tap New Invoice to create your first one."
              action={{ label: 'New Invoice', onClick: () => setDrawerOpen(true) }}
            />
          ) : (
            <div className="card p-0 overflow-hidden">
              {filtered.map((inv, i) => (
                <div
                  key={inv.id}
                  onClick={editMode ? () => openEditInvoice(inv) : undefined}
                  className={`flex items-center justify-between px-4 py-3.5 gap-3
                    ${i < filtered.length - 1 ? 'border-b border-white/[0.05]' : ''}
                    ${editMode ? 'cursor-pointer active:bg-white/[0.03]' : ''}`}
                >
                  {/* Edit mode indicator */}
                  {editMode && (
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 flex-shrink-0
                                    flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                        strokeLinecap="round" className="w-3 h-3 text-white/40">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-white/40">
                        {invoiceNum(inv.invoice_number)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {inv.customer_first_name} {inv.customer_last_name}
                      </p>
                      <p className="text-[11px] text-white/35 mt-0.5">
                        {formatDate(inv.date)}
                        {inv.flight_time_minutes ? ` · ${formatDuration(inv.flight_time_minutes)}` : ''}
                      </p>
                    </div>
                  </div>
                  {editMode ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      strokeLinecap="round" className="w-4 h-4 text-white/20 flex-shrink-0">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  ) : (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-white">
                        ${Number(inv.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-white/30 mt-0.5">
                        {PAYMENT_LABEL[inv.payment_method] ?? inv.payment_method}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <InvoiceDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        onSaved={refresh}
        editInvoice={editingInvoice}
      />
    </div>
  )
}
