import { useState } from 'react'
import CrestHeader from '../components/CrestHeader'
import PageHeader from '../components/PageHeader'
import { useAircraft } from '../context/AircraftContext'
import { useIsManagement } from '../context/TeamContext'
import { useFinanceSummary } from '../hooks/useFinanceSummary'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import { formatDate } from '../lib/utils'

// Finance: the money of running the aircraft, computed from what the app
// already logs. Ledger shows every captured money event (flight prices, fuel
// purchases, maintenance actuals). Costs and P&L grow in Phases 2 and 5.
// Management only; everything displayed here is NET USD unless tagged.

const usd = n => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const KIND = {
  flight: { chip: 'Flight', chipBg: 'bg-accent/15 text-accent' },
  fuel:   { chip: 'Fuel',   chipBg: 'bg-white/[0.08] text-white/60' },
  income: { chip: 'Income', chipBg: 'bg-emerald-400/15 text-emerald-400' },
}

function LedgerRow({ e }) {
  const k = KIND[e.kind] ?? { chip: e.chip ?? e.kind, chipBg: 'bg-white/[0.08] text-white/60' }
  const isIncome = (e.net ?? 0) > 0
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{e.label}</p>
          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide flex-shrink-0 ${k.chipBg}`}>
            {e.chip ?? k.chip}
          </span>
          {e.pending && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide flex-shrink-0 bg-amber-400/15 text-amber-300">
              pending
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-0.5 truncate">
          {formatDate(e.date)}{e.detail ? ` · ${e.detail}` : ''}{e.invoice ? ` · #${e.invoice}` : ''}
        </p>
      </div>
      <p className={`text-sm font-bold tabular-nums flex-shrink-0
        ${e.net == null ? 'text-white/20' : isIncome ? 'text-emerald-400' : 'text-white/80'}`}>
        {e.net == null ? 'no price' : `${isIncome ? '+' : '−'}${usd(e.net)}`}
      </p>
    </div>
  )
}

export default function Finance() {
  const isManagement = useIsManagement()
  const { selectedAircraft } = useAircraft()
  const fin = useFinanceSummary(selectedAircraft?.id)
  const maintItems = useMaintenanceItems(selectedAircraft?.id,
    selectedAircraft?.hobbs_current, selectedAircraft?.cycles_current)
  const [tab, setTab] = useState('ledger')

  if (!isManagement) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <p className="text-sm text-white/35 text-center">Finance is available to management only.</p>
      </div>
    )
  }

  const reserves = maintItems.items.filter(i => i.estimated_cost != null)
  const commercial = (selectedAircraft?.finance_mode ?? 'commercial') === 'commercial'

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <CrestHeader />
      <PageHeader title="Finance" sub={`${selectedAircraft?.tail_number} · net USD`} />

      {/* Month hero */}
      <div className="px-4 mt-3">
        <div className="card !p-4">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest text-center">This month</p>
          <p className={`text-3xl font-bold text-center mt-1.5 tabular-nums
            ${fin.month.netTotal >= 0 ? 'text-white' : 'text-red-400'}`}>
            {fin.month.netTotal < 0 ? '−' : ''}{usd(fin.month.netTotal)}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            {commercial && (
              <div>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{usd(fin.month.revenueNet)}</p>
                <p className="text-[10px] text-white/30 uppercase tracking-wide mt-0.5">Revenue</p>
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-white tabular-nums">{usd(fin.month.spendNet)}</p>
              <p className="text-[10px] text-white/30 uppercase tracking-wide mt-0.5">Spent</p>
            </div>
            <div>
              <p className="text-sm font-bold text-white tabular-nums">{fin.month.hours.toFixed(1)}h</p>
              <p className="text-[10px] text-white/30 uppercase tracking-wide mt-0.5">Flown</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-4 flex gap-1.5">
        {[['ledger', 'Ledger'], ['costs', 'Costs'], ['pnl', 'P&L']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors
              ${tab === id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Ledger: every captured money event, newest first */}
      {tab === 'ledger' && (
        <div className="px-4 mt-3 pb-6">
          {fin.loading ? (
            <p className="text-xs text-white/30 text-center py-10">Loading…</p>
          ) : fin.entries.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-10 leading-relaxed">
              Nothing captured yet. Prices, fuel purchases and maintenance costs
              appear here as they are logged.
            </p>
          ) : (
            <div className="card !p-0 divide-y divide-white/[0.05]">
              {fin.entries.slice(0, 60).map(e => <LedgerRow key={e.id} e={e} />)}
            </div>
          )}
          <p className="text-[10px] text-white/20 text-center mt-3 leading-relaxed">
            Derived from flights, fuel and maintenance records. Gross figures shown net of IVA (13/113).
          </p>
        </div>
      )}

      {/* Costs: reserves captured so far; rates and cost per hour arrive in Phase 2 */}
      {tab === 'costs' && (
        <div className="px-4 mt-3 pb-6 space-y-3">
          <div className="card">
            <p className="label mb-2">Reserves set</p>
            {reserves.length === 0 ? (
              <p className="text-xs text-white/30 leading-relaxed">
                No reserves yet. Set them per item in Maintenance: expand an item
                and tap Reserve.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {reserves.map(i => (
                  <div key={i.id} className="flex items-center justify-between py-2.5 gap-3">
                    <p className="text-xs text-white/70 truncate">{i.description}</p>
                    <p className="text-xs font-bold text-accent tabular-nums flex-shrink-0">{usd(Number(i.estimated_cost))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <p className="text-xs text-white/30 leading-relaxed">
              Rates, cost per hour and reserve vs actual arrive with the cost
              engine (Phase 2).
            </p>
          </div>
        </div>
      )}

      {/* P&L placeholder */}
      {tab === 'pnl' && (
        <div className="px-4 mt-3 pb-6">
          <div className="card">
            <p className="text-xs text-white/30 leading-relaxed">
              The monthly P&L with PDF export arrives in Phase 5, once the
              ledger and the cost engine are complete.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
