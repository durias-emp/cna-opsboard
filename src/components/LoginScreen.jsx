import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Enter your email and password'); return }
    setBusy(true); setError(null)
    try { await signIn(email, password) }
    catch (err) { setError(err.message === 'Invalid login credentials' ? 'Wrong email or password' : err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
         style={{ background: '#0a0a0c' }}>
      <img src="/cna-logo.png" alt="CNA" className="h-10 mb-8 opacity-90" />
      <h1 className="text-2xl font-bold text-white mb-1">Sign in</h1>
      <p className="text-sm text-white/40 mb-8">CNA OpsBoard is for Cielo Norte Aviación staff.</p>

      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <input type="email" autoComplete="username" inputMode="email" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)}
          className="input-field w-full" autoFocus />
        <input type="password" autoComplete="current-password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)}
          className="input-field w-full" />
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-white text-black text-sm font-semibold active:scale-[0.98] disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-[11px] text-white/25 mt-8 text-center max-w-xs">
        No account? Ask Diego — logins are created by the office, not self-registered.
      </p>
    </div>
  )
}
