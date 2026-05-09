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
        tail_number: 'C-GOPF',
        make_model: 'Bell 206B3 JetRanger',
        hobbs_current: 17502.8,
      },
      { onConflict: 'tail_number', ignoreDuplicates: true }
    )

  if (error && error.code !== '42P01') {
    // 42P01 = table does not exist yet; silently skip if schema not deployed
    console.error('Seed error:', error.message)
  }
}
