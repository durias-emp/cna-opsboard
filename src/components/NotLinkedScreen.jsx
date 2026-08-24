import { useAuth } from '../context/AuthContext'

// Logged in, but the email isn't attached to anyone on the roster (team_profiles.email).
export default function NotLinkedScreen() {
  const { email, signOut } = useAuth()
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-8 text-center"
         style={{ background: '#171717' }}>
      <p className="text-base font-bold text-white">This login isn't linked to a team member</p>
      <p className="text-sm text-white/40 mt-2 max-w-xs">
        <span className="text-white/70">{email}</span> signed in, but no one on the roster has that email.
        Ask Diego to add it to your profile.
      </p>
      <button onClick={signOut}
        className="mt-6 px-6 py-2.5 rounded-2xl bg-white/[0.08] text-white/70 text-sm font-semibold">
        Sign out
      </button>
    </div>
  )
}
