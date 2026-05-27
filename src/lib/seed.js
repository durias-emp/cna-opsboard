import { supabase } from './supabase'

/**
 * Seeds the aircraft table with the default Bell 206B3 if it doesn't exist.
 * Safe to call on every app load — uses upsert on tail_number.
 */
export async function seedAircraft() {
  const { error } = await supabase
    .from('aircraft')
    .upsert(
      {
        tail_number: 'YS-CNA',
        make_model: 'Bell 206B3 JetRanger',
        hobbs_current: 17538.0,
        cycles_current: 25868,
      },
      { onConflict: 'tail_number', ignoreDuplicates: true }
    )

  if (error && error.code !== '42P01') {
    console.error('Seed error:', error.message)
  }
}

/**
 * Seeds all maintenance items from the Bell 206B3 maintenance tracking Excel.
 * Safe to call multiple times — uses description+aircraft_id as conflict key via is_active check.
 * Only inserts if the table is empty for this aircraft.
 */
export async function seedMaintenanceItems(aircraftId) {
  // Check if already seeded
  const { count } = await supabase
    .from('maintenance_items')
    .select('*', { count: 'exact', head: true })
    .eq('aircraft_id', aircraftId)

  if (count > 0) return

  const items = buildMaintenanceItems(aircraftId)
  const { error } = await supabase.from('maintenance_items').insert(items)
  if (error) console.error('Maintenance seed error:', error.message)
}

function buildMaintenanceItems(aircraftId) {
  const a = aircraftId

  // Helper: compute due_date from last_complied_date + months
  function dueDate(lastDate, months) {
    if (!lastDate || !months) return null
    const d = new Date(lastDate)
    d.setMonth(d.getMonth() + months)
    return d.toISOString().slice(0, 10)
  }

  // Helper: compute due_at_hours
  function dueHours(lastHours, interval) {
    if (!lastHours || !interval) return null
    return Math.round((lastHours + interval) * 10) / 10
  }

  return [

    // ─────────────────────────────────────────────────────────────
    // SHEET 1: DUE BY DATE — Periodic Inspections
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: '6', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '12 Month Airframe Inspection',
      reference: 'Bell 206 MM 5-33', calendar_interval_months: 12,
      last_complied_date: '2025-10-08', last_complied_hours: null,
      due_date: dueDate('2025-10-08', 12), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '7', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '12 Month Component Operation Inspection',
      reference: 'Bell 206 MM 5-34', calendar_interval_months: 12,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 12), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '13', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '1200 HR/24 Mth. Cyclic Stick',
      reference: 'Bell 206 MM 5-30 / ASB 206-23-142',
      calendar_interval_months: 24, hours_interval: 1200,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 24), due_at_hours: dueHours(17410.8, 1200),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: '14', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '24 Month Flight Control Bolt Inspection',
      reference: 'Bell 206 MM 5-35 / ASB 206-89-48', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '15', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '24 Month Fuel System Inspection',
      reference: 'Bell 206 MM 5-35', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '16', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '24 Mth / 1200 HR T/R Control Tube Inspection',
      reference: 'Bell 206 MM 5-40',
      calendar_interval_months: 24, hours_interval: 1200,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 24), due_at_hours: dueHours(17410.8, 1200),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: '17', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '24 Month Altimeter Recertification',
      reference: 'CARS STD 571 Appendix B', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '18', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '24 Month Transponder Recertification',
      reference: 'CARS STD 571 Appendix F', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '19', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '24 Month Altitude Encoder Recertification',
      reference: 'CARS STD 571 Appendix F', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '20', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '24 Month Pitot Leak Check',
      reference: 'CARS 571 Appendix B', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '21', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: 'Battery Capacity Check',
      reference: 'PN RG206 / SN 41179586', calendar_interval_months: 6,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 6), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '22', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '406 ELT Recertification (SN S1840501-01)',
      reference: 'CAR 625 C-12', calendar_interval_months: 12,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 12), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '23', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: 'Fire Extinguisher Inspection',
      reference: 'PN A344 T / SN E-2814481', calendar_interval_months: 12,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 12), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '24', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: 'First Aid Kit Inspection',
      reference: 'CARS 625 Appendix C', calendar_interval_months: 12,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 12), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '25', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: 'Compass Swing',
      reference: 'CARS 625 Appendix C', calendar_interval_months: 12,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 12), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '26', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: '406 ELT Performance Test (SN 400579)',
      reference: 'CAR 625 C-12', calendar_interval_months: 24,
      last_complied_date: '2025-10-08',
      due_date: dueDate('2025-10-08', 24), source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: '27', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE', description: 'Transponder / Alt / Encoder Correlation Check',
      reference: 'CARS STD 571 Appendix F', calendar_interval_months: 24,
      last_complied_date: '2025-05-30',
      due_date: dueDate('2025-05-30', 24), source_ref: 'Maint.1/3',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 1: DUE BY DATE — Retirements
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: '28', category: 'retirement', event_type: 'Retire',
      limit_type: 'DATE', description: 'Retention Strap SN LPFS10511',
      reference: 'Bell 206 MM Table 4-1', calendar_interval_months: 48,
      last_complied_date: '2022-09-28',
      due_date: dueDate('2022-09-28', 48), source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '29', category: 'retirement', event_type: 'Retire',
      limit_type: 'DATE', description: 'Retention Strap SN LPFS10507',
      reference: 'Bell 206 MM Table 4-1', calendar_interval_months: 48,
      last_complied_date: '2022-09-22',
      due_date: dueDate('2022-09-22', 48), source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '30', category: 'retirement', event_type: 'Retire',
      limit_type: 'DATE', description: 'ELT Battery Replacement',
      reference: 'Replacement', calendar_interval_months: 48,
      last_complied_date: '2024-06-01',
      due_date: dueDate('2024-06-01', 48), source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '31', category: 'retirement', event_type: 'Retire',
      limit_type: 'DATE', description: 'Fire Extinguisher Replacement',
      reference: 'Replacement', calendar_interval_months: 144,
      last_complied_date: '2018-01-01',
      due_date: dueDate('2018-01-01', 144), source_ref: 'Maint.2/3',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 1: DUE BY DATE — Airframe Component (calendar)
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: '41', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'DATE', description: 'Onboard Systems Overhaul',
      reference: 'ICA 123-024-00', calendar_interval_months: 60,
      last_complied_date: '2023-08-07',
      due_date: dueDate('2023-08-07', 60), source_ref: 'AF Comp.2/2',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 2: DUE BY HOURS — Periodic Inspections
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: '36', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '100 HR Engine Scavenge Oil Flow Check',
      reference: 'Bell MM', hours_interval: 100, calendar_interval_months: 12,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17410.8, 100),
      source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '39', category: 'periodic', event_type: 'Retire',
      limit_type: 'DATE_OR_HOURS', description: '200 HR Engine Oil / Nicad Filter',
      reference: 'Rolls Royce MM', hours_interval: 200, calendar_interval_months: 12,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17410.8, 200),
      source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '41b', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '300 HR Fuel Nozzle Inspection',
      reference: 'Bell 206 MM', hours_interval: 300, calendar_interval_months: 12,
      last_complied_date: '2025-10-08', last_complied_hours: 17410.8,
      due_date: dueDate('2025-10-08', 12), due_at_hours: dueHours(17410.8, 300),
      source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '41c', category: 'periodic', event_type: 'Inspection',
      limit_type: 'ON_CONDITION', description: 'Free Wheel Oil Check',
      reference: 'AD CF-2016-13R1 / Bell 206 MM 5-50A',
      notes: 'Only applies anytime the freewheel oil supply is opened upstream of the restrictor or the disconnection, replacement or reconnection of fitting, hose or comp. between restrictor and filter',
      source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '48', category: 'periodic', event_type: 'Inspection',
      limit_type: 'HOURS', description: '600 HR Scavenge Oil Filter Test',
      reference: 'Bell 206 MM', hours_interval: 600,
      last_complied_date: '2023-08-26', last_complied_hours: 17084.9,
      due_at_hours: dueHours(17084.9, 600), source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '50', category: 'periodic', event_type: 'Inspection',
      limit_type: 'HOURS', description: '1200 HR Main Rotor Hub Inspection',
      reference: 'Bell 206 MM 5-39', hours_interval: 1200,
      last_complied_date: '2023-05-01', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 1200), source_ref: 'Maint.2/3',
    },
    {
      aircraft_id: a, item_number: '52', category: 'periodic', event_type: 'Inspection',
      limit_type: 'HOURS', description: '1200 HR Main Rotor Yoke Inspection',
      reference: 'Bell 206 MM', hours_interval: 1200,
      last_complied_date: '2023-05-01', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 1200), source_ref: 'Maint.2/3',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 2: DUE BY HOURS — Major Component Inspections
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: '54', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: '1500 HR Freewheel Mid Life Inspection',
      reference: 'Bell 206 MM 5-41', hours_interval: 1500,
      last_complied_date: '2022-03-05', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 1500), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '55', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: '1500 HR M/R Transmission Inspection',
      reference: 'Bell 206 MM 5-41', hours_interval: 1500,
      last_complied_date: '2019-07-19', last_complied_hours: 16074.6,
      due_at_hours: dueHours(16074.6, 1500), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '56', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: '1500 HR Mast Mid Life Inspection',
      reference: 'Bell 206 MM 5-41', hours_interval: 1500,
      last_complied_date: '2024-09-17', last_complied_hours: 17378.4,
      due_at_hours: dueHours(17378.4, 1500), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '57', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: '3000 HR T/R Gearbox Mid Life Inspection',
      reference: 'Bell 206 MM 5-44', hours_interval: 3000,
      last_complied_date: '2018-04-17', last_complied_hours: 15522.4,
      due_at_hours: dueHours(15522.4, 3000), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '58', category: 'engine', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'Compressor Case Halves Inspection',
      hours_interval: 1750,
      last_complied_date: '2024-04-04', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 1750), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '59', category: 'engine', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'Turbine Mid Life Inspection',
      hours_interval: 1750,
      last_complied_date: '2024-07-05', last_complied_hours: 17271,
      due_at_hours: dueHours(17271, 1750), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '60', category: 'engine', event_type: 'Inspection',
      limit_type: 'HOURS', description: '3rd Stage Turbine Wheel Inspection',
      reference: 'IAW RR AD 2022-10-06', hours_interval: 1775,
      last_complied_date: '2014-02-03', last_complied_hours: 16202.9,
      due_at_hours: dueHours(16202.9, 1775), source_ref: 'Maint.3/3',
    },
    {
      aircraft_id: a, item_number: '61', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'FDC Aerofilter Inspection (1206A2-541R/L)',
      reference: 'STC SR00180SE / 1206 Series ICA-1', hours_interval: 300,
      last_complied_date: '2024-09-02', last_complied_hours: 17370.2,
      due_at_hours: dueHours(17370.2, 300), source_ref: 'Maint.3/3',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 2: DUE BY HOURS — Airframe Components
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: 'AF-1', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'M/R Blade #1',
      part_number: '206-010-200-149', serial_number: 'BH483961', hours_interval: 5000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20628.6, source_ref: 'AF Comp.1/2', // 768.8h already on blade at install
    },
    {
      aircraft_id: a, item_number: 'AF-2', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'M/R Blade #2',
      part_number: '206-010-200-149', serial_number: 'BH481812', hours_interval: 5000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20628.6, source_ref: 'AF Comp.1/2', // 768.8h already on blade at install
    },
    {
      aircraft_id: a, item_number: 'AF-3', category: 'airframe', event_type: 'Retire',
      limit_type: 'ON_CONDITION', description: 'Mast Pole',
      part_number: '206-010-332-121', serial_number: 'NFS-10156',
      last_complied_date: '2023-01-10', last_complied_hours: 17378.7,
      notes: 'On Condition — no numeric limit', source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-4', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Swash Plate Assy',
      part_number: '206-010-450-113', serial_number: 'GDJG10134', hours_interval: 4800,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20874.6, source_ref: 'AF Comp.1/2', // 322.8h already on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-5', category: 'airframe', event_type: 'Retire',
      limit_type: 'ON_CONDITION', description: 'Support Assembly',
      part_number: '206-010-452-113', serial_number: 'A-2657',
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      notes: 'On Condition — no numeric limit', source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-6', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Swash Plate Sleeve',
      part_number: '206-010-454-109', serial_number: 'RE-7267', hours_interval: 14400,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 25830.5, source_ref: 'AF Comp.1/2', // 4966.9h already on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-7', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Main Rotor Head/ Hub',
      part_number: '206-011-100-137', serial_number: 'JILM02322', hours_interval: 2400,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 18315.2, source_ref: 'AF Comp.1/2', // 814.9h already on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-8', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'M/R Trunnion',
      part_number: '206-011-113-105', serial_number: 'HB3901', hours_interval: 4800,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 18886.8, source_ref: 'AF Comp.1/2', // 2643.3h already on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-9', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'M/R Yoke Assembly',
      part_number: '206-011-149-105', serial_number: 'HB4661', hours_interval: 2400,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 2400), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-10', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Retention Strap SN LPFS10511',
      part_number: '206-310-004-103', serial_number: 'LPFS10511', hours_interval: 1200,
      last_complied_date: '2022-09-28', last_complied_hours: 16874.3,
      due_at_hours: dueHours(16874.3, 1200), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-11', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Retention Strap SN LPFS10507',
      part_number: '206-310-004-104', serial_number: 'LPFS10507', hours_interval: 1200,
      last_complied_date: '2022-09-28', last_complied_hours: 16874.3,
      due_at_hours: dueHours(16874.3, 1200), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-12', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Latch Bolt #1',
      part_number: '206-011-260-103', serial_number: 'SU11483', hours_interval: 2500,
      last_complied_date: '2022-09-28', last_complied_hours: 16874.3,
      due_at_hours: dueHours(16874.3, 2500), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-13', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Latch Bolt #2',
      part_number: '206-011-260-103', serial_number: 'SU11484', hours_interval: 2500,
      last_complied_date: '2022-09-28', last_complied_hours: 16874.3,
      due_at_hours: dueHours(16874.3, 2500), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-14', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Retention Fitting #1',
      part_number: '206-011-150-105', serial_number: 'HB16609', hours_interval: 2400,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 18315.2, source_ref: 'AF Comp.1/2', // 814.9h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-15', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Retention Fitting #2',
      part_number: '206-011-150-105', serial_number: 'HB14463', hours_interval: 2400,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 18315.2, source_ref: 'AF Comp.1/2', // 814.9h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-16', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Retention Pin #1',
      part_number: '206-011-125-105', serial_number: 'DI41296', hours_interval: 2500,
      last_complied_date: '2022-09-28', last_complied_hours: 16874.3,
      due_at_hours: 19281.1, source_ref: 'AF Comp.1/2', // 93.2h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-17', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Retention Pin #2',
      part_number: '206-011-125-105', serial_number: 'DI34061', hours_interval: 2500,
      last_complied_date: '2022-09-28', last_complied_hours: 16874.3,
      due_at_hours: 19281.1, source_ref: 'AF Comp.1/2', // 93.2h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-18', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'M/R Grip Assembly #1',
      part_number: '206-011-132-113A', serial_number: 'HB6617', hours_interval: 4800,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 20526.2, source_ref: 'AF Comp.1/2', // 1003.9h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-19', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'M/R Grip Assembly #2',
      part_number: '206-011-132-113A', serial_number: 'HB6564', hours_interval: 4800,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 20526.2, source_ref: 'AF Comp.1/2', // 1003.9h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-20', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Swash Plate Lever',
      part_number: '206-010-467-105', serial_number: 'REFS5849', hours_interval: 4800,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20874.6, source_ref: 'AF Comp.1/2', // 322.8h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-21', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Link Collective Assy',
      part_number: '206-010-407-001', serial_number: 'REFS7440', hours_interval: 4800,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20874.6, source_ref: 'AF Comp.1/2', // 322.8h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-22', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'M/R Mast Assembly',
      part_number: '206-040-002-109', serial_number: 'FAJF10111', hours_interval: 3000,
      last_complied_date: '2024-09-17', last_complied_hours: 17378.4,
      due_at_hours: dueHours(17378.4, 3000), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-23', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Lower CollectiveTube',
      part_number: '206-001-194-001', serial_number: 'USFS5083', hours_interval: 4800,
      last_complied_date: '2021-04-20', last_complied_hours: 16403.6,
      due_at_hours: dueHours(16403.6, 4800), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-24', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'M/R Drive Shaft Inspection',
      part_number: '206-040-015-103', serial_number: 'A1162', hours_interval: 600,
      last_complied_date: '2025-02-20', last_complied_hours: 17200.3,
      due_at_hours: dueHours(17200.3, 600), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-25', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'M/R Transmission',
      part_number: '206-040-002-025', serial_number: 'BKW10994', hours_interval: 4500,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: dueHours(16397.4, 4500), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-25b', category: 'airframe', event_type: 'Retire',
      limit_type: 'ON_CONDITION', description: 'Gearbox',
      part_number: '6894171', serial_number: 'CAG-36508',
      last_complied_date: '2022-02-14', last_complied_hours: 16730.1,
      notes: 'TRACK:9486.1:3331.3', // AC hours at ref : Since OH hours at ref (live computed)
      is_active: true, source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-26', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Free Wheel Assembly',
      part_number: '206-040-270-003', serial_number: 'BMB 12191', hours_interval: 3000,
      last_complied_date: '2022-03-21', last_complied_hours: 16730.1,
      due_at_hours: 18522.4, source_ref: 'AF Comp.1/2', // 1207.7h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-27', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Free Wheel Clutch',
      part_number: 'CL42250-1', serial_number: 'FD20759', hours_interval: 3000,
      last_complied_date: '2022-03-23', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 3000), source_ref: 'AF Comp.1/2',
    },
    {
      aircraft_id: a, item_number: 'AF-28', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'T/R Blade #1',
      part_number: '2062200-301', serial_number: 'D152', hours_interval: 5000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20522.4, source_ref: 'AF Comp.2/2', // 875h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-29', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'T/R Blade #2',
      part_number: '2062200-301', serial_number: 'D148', hours_interval: 5000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20522.4, source_ref: 'AF Comp.2/2', // 875h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-30', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'T/R Gear Box',
      part_number: '206-040-400-107', serial_number: 'ALO12036', hours_interval: 6000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 21522.4, source_ref: 'AF Comp.2/2', // 875h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-31', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'T/R Yoke',
      part_number: '206-011-819-109', serial_number: 'HBFS6758', hours_interval: 5000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20522.4, source_ref: 'AF Comp.2/2', // 875h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-32', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'T/R Hub Assembly',
      part_number: '206-011-810-115', serial_number: 'AAG50370', hours_interval: 2400,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 17922.4, source_ref: 'AF Comp.2/2', // 875h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-33', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Hydraulic Servo #1',
      part_number: '206-076-031-013', serial_number: '3951', hours_interval: 3600,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 18754.6, source_ref: 'AF Comp.2/2', // 1242.8h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-34', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Hydraulic Servo #2',
      part_number: '206-076-031-013', serial_number: '471', hours_interval: 3600,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 18159.0, source_ref: 'AF Comp.2/2', // 1838.4h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-35', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Hydraulic Servo #3',
      part_number: '206-076-031-023', serial_number: 'RH-0880', hours_interval: 3600,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 18967.3, source_ref: 'AF Comp.2/2', // 1030.1h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-36', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Hyd. Pump & Reservoir',
      part_number: '206-076-022-101', serial_number: 'FB02084', hours_interval: 3600,
      last_complied_date: '2021-07-12', last_complied_hours: 16560.4,
      due_at_hours: 20160.4, source_ref: 'AF Comp.2/2', // Time=0, new at install
    },
    {
      aircraft_id: a, item_number: 'AF-37', category: 'airframe', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Servo Support',
      part_number: '206-001-566-101', serial_number: 'TI105', hours_interval: 10000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 19995.4, source_ref: 'AF Comp.2/2', // 6402h on part at install
    },
    {
      aircraft_id: a, item_number: 'AF-38', category: 'airframe', event_type: 'Replace',
      limit_type: 'HOURS', description: 'Ignitor Plug',
      part_number: 'CH34168', serial_number: 'CAE833537', hours_interval: 600,
      last_complied_date: '2023-08-11', last_complied_hours: 17062.8,
      due_at_hours: dueHours(17062.8, 600), source_ref: 'AF Comp.2/2',
    },
    {
      aircraft_id: a, item_number: 'AF-39', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Starter Generator',
      part_number: '23032-027', serial_number: '19407', hours_interval: 1000,
      last_complied_date: '2023-08-30', last_complied_hours: 17085.2,
      due_at_hours: dueHours(17085.2, 1000), source_ref: 'AF Comp.2/2',
    },
    {
      aircraft_id: a, item_number: 'AF-40', category: 'airframe', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Cargo Hook',
      part_number: '528-029-00', serial_number: '1898', hours_interval: 1000,
      last_complied_date: '2023-08-07', last_complied_hours: 17060.7,
      due_at_hours: dueHours(17060.7, 1000), source_ref: 'AF Comp.2/2',
    },
    {
      aircraft_id: a, item_number: 'AF-44', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'FDC Aerofilter Left (1206A2-541L)',
      part_number: '1206A2-541L', serial_number: '102b7', hours_interval: 300,
      last_complied_date: '2024-09-02', last_complied_hours: 17370.2,
      due_at_hours: dueHours(17370.2, 300), source_ref: 'AF Comp.2/2',
    },
    {
      aircraft_id: a, item_number: 'AF-45', category: 'airframe', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'FDC Aerofilter Right (1206A2-541R)',
      part_number: '1206A2-541R', serial_number: '102b7', hours_interval: 300,
      last_complied_date: '2024-09-02', last_complied_hours: 17370.2,
      due_at_hours: dueHours(17370.2, 300), source_ref: 'AF Comp.2/2',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 2: DUE BY HOURS — Engine Components
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: 'ENG-1', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Compressor',
      part_number: '6890550', serial_number: 'CAC39110F', hours_interval: 3500,
      last_complied_date: '2022-04-19', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 3500), source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'ENG-2', category: 'engine', event_type: 'Inspection',
      limit_type: 'HOURS', description: 'Compressor Case Halves',
      part_number: '23057142', serial_number: 'SET42843', hours_interval: 1750,
      last_complied_date: '2022-04-19', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 1750), source_ref: 'Engine Comp.',
    },
    // ENG-9 and ENG-10 replaced by AF-25b (single Gearbox card with TRACK format)
    {
      aircraft_id: a, item_number: 'ENG-11', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Turbine Assembly',
      part_number: '23069745', serial_number: 'CAT-80143', hours_interval: 3500,
      last_complied_date: '2024-07-05', last_complied_hours: 17271,
      due_at_hours: 17958.4, source_ref: 'Engine Comp.', // 2812.6h on part at last overhaul → 17271 − 2812.6 + 3500 = 17958.4
    },
    {
      aircraft_id: a, item_number: 'ENG-17', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Governor Assembly',
      part_number: 'M250-10844', serial_number: '23334', hours_interval: 2000,
      last_complied_date: '2024-08-02', last_complied_hours: 17320.8,
      due_at_hours: 19021.7, source_ref: 'Engine Comp.', // 299.1h on part at last overhaul → 17320.8 − 299.1 + 2000 = 19021.7
    },
    {
      aircraft_id: a, item_number: 'ENG-18', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Fuel Control',
      part_number: 'M250-10816', serial_number: '307686', hours_interval: 2500,
      last_complied_date: '2022-04-19', last_complied_hours: 16731.3,
      due_at_hours: 19226.3, source_ref: 'Engine Comp.', // 5h on part at last overhaul → 16731.3 − 5 + 2500 = 19226.3
    },
    {
      aircraft_id: a, item_number: 'ENG-19', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Bleed Valve',
      part_number: '23053176', serial_number: 'FF32863', hours_interval: 1500,
      last_complied_date: '2022-03-22', last_complied_hours: 16730.1,
      due_at_hours: dueHours(16730.1, 1500), source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'ENG-20', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS', description: 'Fuel Pump',
      part_number: '6899253', serial_number: 'SERT110712', hours_interval: 4000,
      last_complied_date: '2021-03-23', last_complied_hours: 16397.4,
      due_at_hours: 20322.0, source_ref: 'Engine Comp.', // 75.4h on part at install → 16397.4 − 75.4 + 4000 = 20322.0
    },
    {
      aircraft_id: a, item_number: 'ENG-21', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS', description: 'Fuel Nozzle',
      part_number: '23077068', serial_number: 'AG59597', hours_interval: 2500,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_at_hours: dueHours(17410.8, 2500), source_ref: 'Engine Comp.',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 3: BOTH — Periodic (Date OR Hours, stored as one record)
    // Already merged above where applicable. Remaining unique ones:
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: 'B-1', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '50 Hour / 12 Mth. Lube',
      reference: 'Bell 206 MM Table 12-6', calendar_interval_months: 12, hours_interval: 50,
      last_complied_date: '2025-11-11', last_complied_hours: 17468.7,
      due_date: dueDate('2025-11-11', 12), due_at_hours: dueHours(17468.7, 50),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-4', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '12 Mth / 100 HR A/F Periodic Inspection',
      reference: 'Bell 206 MM 5-20', calendar_interval_months: 12, hours_interval: 100,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17410.8, 100),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-5', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '12 Mth / 300 HR Periodic Inspection',
      reference: 'Bell 206 MM 5-29', calendar_interval_months: 12, hours_interval: 300,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17410.8, 300),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-8', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '12 Mth / 300 HR T/R Driveshaft Inspection',
      reference: 'AD CF-2022-33 / ASB 206-20-139', calendar_interval_months: 12, hours_interval: 300,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17410.8, 300),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-9', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '12 Mth / 600 HR Main Driveshaft Inspection',
      reference: 'Bell 206 MM 5-38', calendar_interval_months: 12, hours_interval: 600,
      last_complied_date: '2025-10-08', last_complied_hours: 17433.9,
      due_date: dueDate('2025-10-08', 12), due_at_hours: dueHours(17433.9, 600),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-10', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '100 Hour / 12 Mth. Engine',
      reference: 'Rolls Royce MM Table 603', calendar_interval_months: 12, hours_interval: 100,
      last_complied_date: '2025-05-30', last_complied_hours: 17433.9,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17433.9, 100),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-11', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '200 Hour / 12 Mth. Engine',
      reference: 'Bell 206 MM', calendar_interval_months: 12, hours_interval: 200,
      last_complied_date: '2025-05-30', last_complied_hours: 17410.8,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17410.8, 200),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-11b', category: 'periodic', event_type: 'Inspection',
      limit_type: 'ON_CONDITION', description: '200 Hour Engine Inspection',
      reference: 'RR MM Table 602 Item 32',
      notes: 'N/A by Part Number — Refer to CEB 1051',
      is_active: true, source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: 'B-13', category: 'periodic', event_type: 'Inspection',
      limit_type: 'ON_CONDITION', description: '500 Hour/1Year',
      reference: 'RR MM Table 602 Item 42',
      notes: 'N/A by Serial Number — Refer to CEB 1120/1158',
      is_active: true, source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: 'B-14', category: 'periodic', event_type: 'Inspection',
      limit_type: 'ON_CONDITION', description: '1000 Hour Engine Inspection',
      reference: 'RR MM Table 602 Item 46',
      notes: 'N/A — CEB 1330 Complied with',
      is_active: true, source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: 'B-15', category: 'periodic', event_type: 'Inspection',
      limit_type: 'ON_CONDITION', description: '1500 Hour Engine Inspection',
      reference: 'RR MM Table 602 Item 47',
      notes: 'N/A — CEB 1330 Complied with',
      is_active: true, source_ref: 'Maint.1/3',
    },
    {
      aircraft_id: a, item_number: 'B-12', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '300 Hour / 12 Mth. Engine',
      reference: 'Rolls Royce MM', calendar_interval_months: 12, hours_interval: 300,
      last_complied_date: '2025-05-30', last_complied_hours: 17433.9,
      due_date: dueDate('2025-05-30', 12), due_at_hours: dueHours(17433.9, 300),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-2', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '12 Mth / 100 HR Installed ICA Kits',
      reference: 'ICA Kit Check Sheets', calendar_interval_months: 12, hours_interval: 100,
      last_complied_date: '2025-10-08', last_complied_hours: 17410.8,
      due_date: dueDate('2025-10-08', 12), due_at_hours: dueHours(17410.8, 100),
      source_ref: 'Maint.1/3+2/3',
    },
    {
      aircraft_id: a, item_number: 'B-3', category: 'periodic', event_type: 'Inspection',
      limit_type: 'DATE_OR_HOURS', description: '12 Mth / 300 HR Installed ICA Kits',
      reference: 'ICA Kit Check Sheets', calendar_interval_months: 12, hours_interval: 300,
      last_complied_date: '2025-10-08', last_complied_hours: 17410.8,
      due_date: dueDate('2025-10-08', 12), due_at_hours: dueHours(17410.8, 300),
      source_ref: 'Maint.1/3+2/3',
    },

    // ─────────────────────────────────────────────────────────────
    // SHEET 3: BOTH — Engine Components (Hours AND Cycles)
    // ─────────────────────────────────────────────────────────────
    {
      aircraft_id: a, item_number: 'EC-3', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Impeller',
      part_number: '23079638', serial_number: 'KR122194',
      hours_interval: 12500, cycles_interval: 25000,
      last_complied_date: '2022-04-22', last_complied_hours: 6210.1, last_complied_cycles: 6303,
      due_at_hours: 18710.1, due_at_cycles: 31303,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-4', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Compr. 1st Stg Wheel',
      part_number: 'E23057111', serial_number: 'TB2-1470',
      hours_interval: 15000, cycles_interval: 30000,
      last_complied_date: '2022-03-31', last_complied_hours: 15711.1, last_complied_cycles: 19535,
      due_at_hours: dueHours(15711.1, 15000), due_at_cycles: 49535,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-5', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Compr. 2/3 Stg Wheel',
      part_number: 'E23057112', serial_number: 'TB3-1164',
      hours_interval: 15000, cycles_interval: 30000,
      last_complied_date: '2022-03-31', last_complied_hours: 15711.1, last_complied_cycles: 19535,
      due_at_hours: dueHours(15711.1, 15000), due_at_cycles: 49535,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-6', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Compr. 4th Stg Wheel',
      part_number: '23079058', serial_number: 'QC18229',
      hours_interval: 15000, cycles_interval: 30000,
      last_complied_date: '2007-11-14', last_complied_hours: 12225.1, last_complied_cycles: 13659,
      due_at_hours: dueHours(12225.1, 15000), due_at_cycles: 43659,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-7', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Compr. 5th Stg Wheel',
      part_number: 'E23057115', serial_number: 'TB5-1201',
      hours_interval: 15000, cycles_interval: 30000,
      last_complied_date: '2022-03-31', last_complied_hours: 15711.1, last_complied_cycles: 19535,
      due_at_hours: dueHours(15711.1, 15000), due_at_cycles: 49535,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-8', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Compr. 6th Stg Wheel',
      part_number: 'E23057116', serial_number: 'TB6-1158',
      hours_interval: 15000, cycles_interval: 30000,
      last_complied_date: '2022-03-31', last_complied_hours: 15711.1, last_complied_cycles: 19535,
      due_at_hours: dueHours(15711.1, 15000), due_at_cycles: 49535,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-12', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Turbine 1st Stage Wheel',
      part_number: 'M250-10223', serial_number: 'X637065',
      hours_interval: 2025, cycles_interval: 3000,
      last_complied_date: '2024-07-05', last_complied_hours: 15952.9, last_complied_cycles: 23805,
      due_at_hours: dueHours(15952.9, 2025), due_at_cycles: 23805 + 3000,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-13', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Turbine 2nd Stage Wheel',
      part_number: '23073854', serial_number: 'X657016',
      hours_interval: 2025, cycles_interval: 3000,
      last_complied_date: '2024-07-05', last_complied_hours: 15952.9, last_complied_cycles: 23805,
      due_at_hours: dueHours(15952.9, 2025), due_at_cycles: 23805 + 3000,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-14', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Turbine 3rd Stage Wheel',
      part_number: '23065818', serial_number: 'X655568',
      hours_interval: 1775, cycles_interval: 6000,
      last_complied_date: '2024-07-05', last_complied_hours: 16202.9, last_complied_cycles: 23805,
      due_at_hours: dueHours(16202.9, 1775), due_at_cycles: 23805 + 6000,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-15', category: 'engine', event_type: 'Retire',
      limit_type: 'HOURS_AND_CYCLES', description: 'Turbine 4th Stage Wheel',
      part_number: 'M250-10445', serial_number: 'X652426',
      hours_interval: 4550, cycles_interval: 6000,
      last_complied_date: '2024-07-05', last_complied_hours: 16202.9, last_complied_cycles: 23805,
      due_at_hours: dueHours(16202.9, 4550), due_at_cycles: 23805 + 6000,
      source_ref: 'Engine Comp.',
    },
    {
      aircraft_id: a, item_number: 'EC-16', category: 'engine', event_type: 'Overhaul',
      limit_type: 'HOURS_AND_CYCLES', description: 'Fuel Nozzle Diaphragm',
      part_number: 'M250-10550', serial_number: 'MA232580',
      hours_interval: 2025, cycles_interval: 3000,
      last_complied_date: '2022-04-19', last_complied_hours: 15952.9, last_complied_cycles: 23805,
      due_at_hours: dueHours(15952.9, 2025), due_at_cycles: 23805 + 3000,
      source_ref: 'Engine Comp.',
    },
  ]
}
