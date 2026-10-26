import { useState, type FormEvent } from 'react'
import { ApiError, describeServerError } from './api'
import { useAuth } from './auth/useAuth'
import sesurLogo from '../../../logo-1.png'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Identifiants invalides.'
    if (error.status === 400) return 'Vérifiez le format de l’adresse e-mail.'
    if (error.status === 403) {
      return (
        'Cette adresse du CRM n’est pas autorisée par l’API. ' +
        'L’administrateur doit configurer APP_ORIGIN avec l’adresse publique de l’interface.'
      )
    }
  }
  return describeServerError(error)
}

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(errorMessage(err))
      setPassword('')
      setShowPassword(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={handleSubmit} aria-labelledby="login-title">
        <div className="login-brand">
          <img className="login-logo" src={sesurLogo} alt="SESUR" />
          <span>SESUR <i>/</i> CRM</span>
        </div>
        <h1 id="login-title">SESUR CRM</h1>
        <p>Votre espace de pilotage commercial sécurisé.</p>
        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Mot de passe</label>
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-visibility"
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.5 12s3.4-7 9.5-7 9.5 7 9.5 7-3.4 7-9.5 7-9.5-7-9.5-7Z" />
              <circle cx="12" cy="12" r="3" />
              {!showPassword && <path d="m4 4 16 16" />}
            </svg>
          </button>
        </div>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}
