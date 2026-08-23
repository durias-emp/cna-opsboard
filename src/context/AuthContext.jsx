import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Login is switched on by VITE_AUTH_ENABLED=true (Vercel env var). Until then the
// app keeps the old name-picker. The database lockdown (migrations/2026-08-22-auth-lockdown.sql)
// is what actually enforces access; this flag only decides which screen the user sees.
export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(AUTH_ENABLED)

  useEffect(() => {
    if (!AUTH_ENABLED) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session ?? null); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('cna_identity')
    window.location.reload()
  }, [])

  const value = useMemo(() => ({
    enabled: AUTH_ENABLED,
    session,
    user:   session?.user ?? null,
    email:  session?.user?.email ?? null,
    loading,
    signIn,
    signOut,
  }), [session, loading, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// Access token for calling our own API routes / Edge Functions as the logged-in user.
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
