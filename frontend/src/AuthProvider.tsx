import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { apiRequest, ApiRequestError } from './apiClient'
import { AuthContext } from './authContext'
import type { AuthUser } from './authTypes'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const authRequestId = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++authRequestId.current
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<{ user: AuthUser }>('/api/admin/auth/me')
      if (requestId === authRequestId.current) setUser(result.user)
    } catch (requestError) {
      if (requestId !== authRequestId.current) return
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        setUser(null)
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Could not load administrator access.')
      }
    } finally {
      if (requestId === authRequestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const requestId = ++authRequestId.current
    apiRequest<{ user: AuthUser }>('/api/admin/auth/me')
      .then((result) => {
        if (active && requestId === authRequestId.current) setUser(result.user)
      })
      .catch((requestError: unknown) => {
        if (!active || requestId !== authRequestId.current) return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          setUser(null)
        } else {
          setError(requestError instanceof Error ? requestError.message : 'Could not load administrator access.')
        }
      })
      .finally(() => {
        if (active && requestId === authRequestId.current) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const signOut = useCallback(async () => {
    authRequestId.current += 1
    await apiRequest('/api/admin/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
