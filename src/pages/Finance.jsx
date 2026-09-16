import { useState } from 'react'
import CrestHeader from '../components/CrestHeader'
import PageHeader from '../components/PageHeader'
import { useAircraft } from '../context/AircraftContext'
import { useIsManagement } from '../context/TeamContext'
import { useFinanceSummary, cashSums, filterByPeriod } from '../hooks/useFinanceSummary'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import { useCostEngine } from '../hooks/useCostEngine'
import { reserveVsActual } from '../lib/financeCalc'
import RatesDrawer from '../components/RatesDrawer'
import { formatDate } from '../lib/utils'
import { HELICOPTER_ICON } from '../assets/navIcons'
import TransactionDetailSheet from '../components/TransactionDetailSheet'

// Finance: the money of running the aircraft, computed from what the app
// already logs. Ledger shows every captured money event (flight prices, fuel
// purchases, maintenance actuals). Costs and P&L grow in Phases 2 and 5.
// Management only; everything displayed here is NET USD unless tagged.

const usd = n => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Category icons: same stroke language as the rest of the app's icon set
const I = path => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">{path}</svg>
)
const CATEGORY_ICON = {
  income:       I(<><circle cx="12" cy="12" r="9" /><path d="M12 6v12M15 9.2c-.6-.8-1.7-1.2-3-1.2-1.7 0-2.8.8-2.8 2 0 2.7 6 1.3 6 4 0 1.3-1.2 2-3 2-1.5 0-2.7-.5-3.3-1.4" /></>),
  fuel:         I(<><path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" /><path d="M2 21h14" /><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3" /><path d="M6 8h6" /></>),
  maintenance:  I(<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />),
  labor:        I(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  pilot_labor:  I(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  equipment:    I(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>),
  hangar:       I(<><path d="M3 21V10l9-6 9 6v11" /><path d="M9 21v-6h6v6" /><path d="M3 21h18" /></>),
  transport:    I(<><path d="M1 8h14v8H1z" /><path d="M15 11h4l3 3v2h-7" /><circle cx="6" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></>),
  insurance:    I(<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />),
  admin:        I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>),
  taxes:        I(<><path d="M3 21h18" /><path d="M4 10h16" /><path d="M12 3L4 10h16L12 3z" /><path d="M6 10v11M10 10v11M14 10v11M18 10v11" /></>),
  misc_business: I(<><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>),
  branding:     I(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.2" /></>),
  transfer:     I(<><path d="M17 3l4 4-4 4" /><path d="M21 7H9" /><path d="M7 21l-4-4 4-4" /><path d="M3 17h12" /></>),
  reversal:     I(<><path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 4v8h8" /></>),
}
const FlightIcon = () => (
  <img src={HELICOPTER_ICON} alt="" className="w-7 h-5 object-contain opacity-70" draggable="false" />
)

function LedgerRow({ e, onOpen }) {
  const isIncome = (e.net ?? 0) > 0
  const icon = e.kind === 'flight' ? <FlightIcon />
    : (CATEGORY_ICON[e.kind] ?? CATEGORY_ICON.misc_business)
  return (
    <div className="tile" onClick={() => onOpen(e)}>
      <div className="tile-icon">{icon}</div>
      <div className="tile-body">
        <div className="min-w-0">
          <p className="tile-title truncate">{e.label}</p>
          <p className="tile-sub">
            {formatDate(e.date)}{e.detail ? ` \u00b7 ${e.detail}` : ''}
          </p>
        </div>
        <p className={`tile-value tabular-nums
          ${e.net == null ? '!text-white/25' : isIncome ? '!text-emerald-400' : ''}`}>
          {e.net == null ? 'no price' : `${isIncome ? '+' : '\u2212'}${usd(e.net)}`}
        </p>
      </div>
    </div>
  )
}

export default function Finance() {
  const isManagement = useIsManagement()
  const { selectedAircraft } = useAircraft()
  const fin = useFinanceSummary(selectedAircraft?.id)
  const maintItems = useMaintenanceItems(selectedAircraft?.id,
    selectedAircraft?.hobbs_current, selectedAircraft?.cycles_current)
  const engine = useCostEngine(selectedAircraft?.id)
  const [tab, setTab] = useState('ledger')
  const [ratesOpen, setRatesOpen] = useState(false)
  const [period, setPeriod] = useState('all')   // pills above the hero
  const [selTx, setSelTx] = useState(null)      // tapped ledger entry

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
    <div className="flex-1 overflow-y-auto nav-clearance page-ambience">
      <CrestHeader />
      <PageHeader title="Finance" sub={`${selectedAircraft?.tail_number} · net USD`} />

      {/* Period pills, dark style, right above the hero card */}
      <div className="px-4 mt-3 flex gap-2">
        {[['all', 'All'], ['this_month', 'This month'], ['last_month', 'Last month']].map(([id, label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-5 py-2.5 rounded-full text-[14px] font-semibold border transition-colors
              ${period === id
                ? 'bg-white/[0.10] border-white/25 text-white'
                : 'bg-white/[0.03] border-white/[0.08] text-white/45'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Monies hero: the liquid position, cash view (gross, what moved
          through the accounts), scoped by the pills. */}
      {(() => {
        const scoped = filterByPeriod(fin.entries, period)
        const s = cashSums(scoped)
        const eyebrow = period === 'all' ? 'Total liquid position'
          : period === 'this_month' ? 'This month' : 'Last month'
        return (
          <div className="px-4 mt-3">
            <div className="card !p-5">
              <p className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.18em] text-center">{eyebrow}</p>
              <p className={`text-4xl font-bold text-center mt-2 tabular-nums
                ${s.position >= 0 ? 'text-white' : 'text-red-400'}`}>
                {s.position < 0 ? '−' : ''}{usd(s.position)}
              </p>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div>
                  <p className="text-[13px] text-white/40 mb-0.5">Income</p>
                  <p className="text-[15px] font-bold font-mono tabular-nums text-green-400">{usd(s.incomeCash)}</p>
                </div>
                <div>
                  <p className="text-[13px] text-white/40 mb-0.5">Expenses</p>
                  <p className="text-[15px] font-bold font-mono tabular-nums text-red-400">{usd(s.expenseCash)}</p>
                </div>
                <div>
                  <p className="text-[13px] text-white/40 mb-0.5">Net</p>
                  <p className={`text-[15px] font-bold font-mono tabular-nums ${s.position >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.position < 0 ? '−' : ''}{usd(s.position)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
            // Month sections so the Monies history (Mar-May) is findable
            // below the recent activity instead of hiding under a row cap
            (() => {
              const groups = []
              for (const e of filterByPeriod(fin.entries, period)) {
                const m = (e.date ?? '').slice(0, 7)
                if (!groups.length || groups[groups.length - 1].m !== m) groups.push({ m, rows: [] })
                groups[groups.length - 1].rows.push(e)
              }
              const label = m => new Date(m + '-15T12:00:00')
                .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              return groups.map(g => (
                <div key={g.m} className="mb-3">
                  <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest px-1 mb-1.5">
                    {label(g.m)}
                  </p>
                  <div className="tile-group glass-card">
                    {g.rows.map(e => <LedgerRow key={e.id} e={e} onOpen={setSelTx} />)}
                  </div>
                </div>
              ))
            })()
          )}
          <p className="text-[10px] text-white/20 text-center mt-3 leading-relaxed">
            Derived from flights, fuel and maintenance records. Gross figures shown net of IVA (13/113).
          </p>
        </div>
      )}

      {/* Costs: the engine's answers, live */}
      {tab === 'costs' && (
        <div className="px-4 mt-3 pb-6 space-y-3">
          {engine.ratesMissing && (
            <div className="card border border-amber-400/20">
              <p className="text-xs text-amber-300 leading-relaxed">
                The cost_rates table is not migrated yet. Run
                2026-09-15-finance-phase2-cost-rates.sql; everything below uses
                fallbacks meanwhile.
              </p>
            </div>
          )}

          {/* Cost per hour breakdown */}
          <div className="card">
            <p className="label mb-3">Cost per hour</p>
            <div className="space-y-2">
              {[
                ['Fuel',     engine.fuelRate,    'actual purchases × logged burn'],
                ['Pilot',    engine.pilotRate,   'per flight hour'],
                ['Reserves', engine.reserveRate, `${reserves.length} costed item${reserves.length === 1 ? '' : 's'}`],
              ].map(([label, v, sub]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <p className="text-xs text-white/50">{label} <span className="text-white/25">· {sub}</span></p>
                  <p className="text-xs font-bold font-mono tabular-nums text-white/85">{v != null ? usd(v) : '—'}</p>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-white/[0.06]">
                <p className="text-xs font-semibold text-white/70">Variable per hour</p>
                <p className="text-xs font-bold font-mono tabular-nums text-white">{engine.variableRate != null ? usd(engine.variableRate) : '—'}</p>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs text-white/50">
                  Fixed at current pace
                  {engine.trailing?.annualized && engine.trailing.months >= 3 && (
                    <span className="text-amber-300/70"> · annualized from {engine.trailing.months} mo</span>
                  )}
                </p>
                <p className="text-xs font-bold font-mono tabular-nums text-white/85">{engine.fixedRate != null ? usd(engine.fixedRate) : '—'}</p>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-white/[0.06]">
                <p className="text-sm font-bold text-white">Fully loaded</p>
                <p className="text-base font-bold font-mono tabular-nums text-accent">
                  {engine.fullyLoaded != null ? usd(engine.fullyLoaded) : '—'}<span className="text-[10px] text-white/30 font-normal"> /h</span>
                </p>
              </div>
            </div>
          </div>

          {/* Breakeven (commercial) */}
          {commercial && (
            <div className="card">
              <p className="label mb-2">Breakeven</p>
              {engine.breakeven == null ? (
                <p className="text-xs text-white/30">Needs a target rate and the variable rate.</p>
              ) : engine.breakeven === Infinity ? (
                <p className="text-xs text-red-400 leading-relaxed">
                  The target rate does not cover the variable cost per hour.
                </p>
              ) : (
                <p className="text-xs text-white/60 leading-relaxed">
                  <span className="text-lg font-bold text-white tabular-nums">{engine.breakeven.toFixed(1)} h</span>
                  <span className="text-white/40"> per month at </span>
                  {usd(engine.targetRateNet)} net/h
                  <span className="text-white/40"> · this month: {fin.month.hours.toFixed(1)} h</span>
                </p>
              )}
            </div>
          )}

          {/* Rates */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="label">Rates</p>
              <button onClick={() => setRatesOpen(true)}
                className="px-3 py-1.5 rounded-full bg-white/[0.08] text-xs font-semibold text-white/70 active:bg-white/15">
                Edit
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                ['Fuel $/gal', engine.rates?.fuel_price_gal],
                ['Pilot /h',   engine.rates?.pilot_rate_hr],
                ['Insurance /yr', engine.rates?.insurance_year],
                ['Hangar /yr', engine.rates?.hangar_year],
                ['Other fixed /yr', engine.rates?.other_fixed_year],
                ['Target /h', engine.rates?.target_rate_hr ?? engine.targetRateNet],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-2">
                  <span className="text-white/35">{l}</span>
                  <span className="font-mono tabular-nums text-white/75">{v != null ? usd(Number(v)) : '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reserve vs actual */}
          <div className="card">
            <p className="label mb-2">Reserves · accrued since last compliance</p>
            {reserves.length === 0 ? (
              <p className="text-xs text-white/30 leading-relaxed">
                No reserves yet. Set them per item in Maintenance: expand an item
                and tap Reserve.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {reserves.map(i => {
                  const rva = reserveVsActual({
                    item: { ...i, estimated_cost: Number(i.estimated_cost) },
                    currentHours: selectedAircraft?.hobbs_current,
                  })
                  return (
                    <div key={i.id} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-white/70 truncate">{i.description}</p>
                        {rva?.accrued != null && (
                          <p className="text-[10px] text-white/30 mt-0.5">accrued {usd(rva.accrued)}</p>
                        )}
                      </div>
                      <p className="text-xs font-bold text-accent tabular-nums flex-shrink-0">{usd(Number(i.estimated_cost))}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <TransactionDetailSheet entry={selTx} open={!!selTx} onClose={() => setSelTx(null)} />

      <RatesDrawer open={ratesOpen} onClose={() => setRatesOpen(false)}
        rates={engine.rates} onSave={engine.saveRates}
        targetPlaceholder={engine.targetRateNet} />

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
