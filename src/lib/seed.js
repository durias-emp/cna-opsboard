import { supabase } from './supabase'

/**
 * Seeds the aircraft table with the default YS-CNA if it doesn't already exist.
 * Safe to call on every app load — uses upsert with ignoreDuplicates so it never
 * overwrites live hobbs/cycles values.
 */
export async function seedAircraft() {
  const { error } = await supabase
    .from('aircraft')
    .upsert(
      {
        tail_number: 'YS-CNA',
        make_model: 'Bell 206B3 JetRanger',
        hobbs_current: 17502.8,
        cycles_current: 25816,
      },
      { onConflict: 'tail_number', ignoreDuplicates: true }
    )

  if (error && error.code !== '42P01') {
    console.error('Seed error:', error.message)
  }
}
