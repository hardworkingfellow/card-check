import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleAlert, ShieldCheck } from 'lucide-react'
import { apiRequest } from './apiClient'
import type { AuthUser } from './authTypes'
import { useAuth } from './useAuth'
import { BrandLogo } from './components'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <main className="account-page"><div className="account-auth-card">Loading administrator access…</div></main>
  if (user?.role !== 'admin') return <Navigate to="/admin/sign-in" replace />
  return children
}

export function AdminSignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user, loading, refresh } = useAuth()

  if (!loading && user?.role === 'admin') return <Navigate to="/admin" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await apiRequest<{ user: AuthUser }>('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Administrator sign-in failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="account-page">
      <div className="account-auth-card">
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to home</Link>
        <BrandLogo />
        <span className="eyebrow">RESTRICTED ACCESS</span>
        <h1>Administrator sign in.</h1>
        <p>This sign-in is for the site administrator only. Public card submissions do not require an account.</p>
        <form className="account-form" onSubmit={(event) => void submit(event)}>
          <label>
            Administrator email
            <input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Administrator password
            <input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Signing in…' : <>Sign in to dashboard <ArrowRight size={16} /></>}
          </button>
        </form>
        <p className="account-privacy"><ShieldCheck size={14} /> Administrator credentials are configured privately on the server.</p>
      </div>
    </main>
  )
}
