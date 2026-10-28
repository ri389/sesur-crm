import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { describeServerError, fetchCurrentUser, login, logout, verifyTotp } from '../api'
import { AuthContext, type AuthState } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchCurrentUser()
      .then((user) => {
        if (!cancelled) setState(user ? { status: 'authenticated', user } : { status: 'anonymous' })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: describeServerError(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const challenge = await login(email, password)
    setState({ status: 'totp-challenge', challenge, flow: 'login' })
  }, [])

  const startTotpEnrollment = useCallback((challenge: NonNullable<Extract<AuthState, { status: 'totp-challenge' }>['challenge']>) => {
    setState({ status: 'totp-challenge', challenge, flow: 'registration' })
  }, [])

  const verifyCode = useCallback(async (code: string) => {
    if (state.status !== 'totp-challenge') throw new Error('Aucune vérification TOTP en cours.')
    const user = await verifyTotp(state.challenge.challengeToken, code)
    setState({ status: 'authenticated', user })
  }, [state])

  const cancelTotp = useCallback(() => setState({ status: 'anonymous' }), [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } finally {
      setState({ status: 'anonymous' })
    }
  }, [])

  const value = useMemo(() => ({
    state,
    signIn,
    startTotpEnrollment,
    verifyTotp: verifyCode,
    cancelTotp,
    signOut,
  }), [state, signIn, startTotpEnrollment, verifyCode, cancelTotp, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
