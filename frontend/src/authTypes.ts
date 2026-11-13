export type AuthUser = {
  id: string
  name: string
  email: string
  role: 'admin'
}

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  error: string
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
