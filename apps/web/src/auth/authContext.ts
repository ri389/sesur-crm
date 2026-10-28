import { createContext } from 'react'
import type { TotpChallenge, User } from '../api'

export type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'anonymous' }
  | { status: 'totp-challenge'; challenge: TotpChallenge; flow: 'login' | 'registration' }
  | { status: 'authenticated'; user: User }

export interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  startTotpEnrollment: (challenge: TotpChallenge) => void
  verifyTotp: (code: string) => Promise<void>
  cancelTotp: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
