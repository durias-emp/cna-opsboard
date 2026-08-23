import { supabase } from './supabase'

// Soft-delete helpers that work BEFORE and AFTER
// migrations/2026-08-22-flight-hours-atomic-soft-delete.sql has been run.
//
// Postgres error 42703 = "column does not exist"; PostgREST PGRST204 = column not in schema
// cache. Either means the migration hasn't run yet → fall back to the old behaviour.

const MISSING_COLUMN = err => err && (err.code === '42703' || err.code === 'PGRST204')

// Run a select that hides soft-deleted rows; falls back to the unfiltered query pre-migration.
// build(filtered) must return the query builder, adding .is('deleted_at', null) only when filtered=true.
export async function selectLive(build) {
  let res = await build(true)
  if (res.error && MISSING_COLUMN(res.error)) res = await build(false)
  return res
}

// Mark a row deleted (recoverable); hard-deletes only if the column doesn't exist yet.
export async function softDelete(table, id) {
  let { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error && MISSING_COLUMN(error)) {
    ;({ error } = await supabase.from(table).delete().eq('id', id))
  }
  return { error }
}

// True when an rpc() error means the function hasn't been created yet.
export const RPC_MISSING = err => err && (err.code === 'PGRST202' || /could not find the function/i.test(err.message ?? ''))
