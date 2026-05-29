import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const IDENTITY_KEY   = 'cna_identity'   // localStorage key for this device's name
const VAPID_PUBLIC   = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Convert base64url string → Uint8Array (required for push subscription)
function urlBase64ToUint8Array(base64String) {
  const padding  = '='.repeat((4 - base64String.length % 4) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushRegistration() {
  const [identity,    setIdentity]    = useState(() => localStorage.getItem(IDENTITY_KEY))
  const [takenNames,  setTakenNames]  = useState([])
  const [registering, setRegistering] = useState(false)
  const [error,       setError]       = useState(null)

  const needsSetup = !identity

  // Load taken names from Supabase when setup is needed
  useEffect(() => {
    if (!needsSetup) return
    supabase
      .from('device_tokens')
      .select('name')
      .then(({ data }) => {
        if (data) setTakenNames(data.map(r => r.name))
      })
  }, [needsSetup])

  async function register(name) {
    setRegistering(true)
    setError(null)
    try {
      // 1. Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // 2. Request push permission + subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })

      // 3. Save subscription to Supabase (upsert so re-registering on new phone works)
      const { error: dbErr } = await supabase
        .from('device_tokens')
        .upsert(
          { name, subscription: sub.toJSON(), updated_at: new Date().toISOString() },
          { onConflict: 'name' }
        )
      if (dbErr) throw new Error(dbErr.message)

      // 4. Store identity locally — never ask again on this device
      localStorage.setItem(IDENTITY_KEY, name)
      setIdentity(name)

    } catch (e) {
      // Permission denied or other error
      if (e.name === 'NotAllowedError') {
        // Still save identity even if push is denied — useful for future
        localStorage.setItem(IDENTITY_KEY, name)
        setIdentity(name)
      } else {
        setError(e.message ?? 'Registration failed')
      }
    } finally {
      setRegistering(false)
    }
  }

  return { identity, needsSetup, takenNames, register, registering, error }
}
