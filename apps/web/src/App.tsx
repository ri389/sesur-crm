import { useEffect, useState } from 'react'
import type { User } from './api'
import { LoginPage } from './LoginPage'
import { useAuth } from './auth/useAuth'

type ApiState = 'loading' | 'ok' | 'error'

const NAV_ITEMS = ['Mes priorités', 'Prospects', 'Clients', 'Opportunités', 'Tickets SAV', 'Administration']

function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [apiState, setApiState] = useState<ApiState>('loading')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setApiState(res.ok ? 'ok' : 'error'))
      .catch(() => setApiState('error'))
  }, [])

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>SESUR CRM</h1>
        <nav aria-label="Navigation principale">
          {NAV_ITEMS.map((label) => (
            <a key={label} href="#">
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <button type="button" onClick={onSignOut}>
            Se déconnecter
          </button>
        </header>
        <h2>Mes priorités</h2>
        <p>Les écrans métier arrivent avec les lots 1 et 2.</p>
        <p role="status">
          État de l'API :{' '}
          {apiState === 'loading' && 'vérification…'}
          {apiState === 'ok' && <span className="status-ok">disponible</span>}
          {apiState === 'error' && <span className="status-error">indisponible</span>}
        </p>
      </main>
    </div>
  )
}

function App() {
  const { state, signOut } = useAuth()

  switch (state.status) {
    case 'loading':
      return <p className="centered">Chargement…</p>
    case 'error':
      return (
        <p role="alert" className="centered">
          Le serveur ne répond pas. Rechargez la page dans un instant.
        </p>
      )
    case 'anonymous':
      return <LoginPage />
    case 'authenticated':
      return <Workspace user={state.user} onSignOut={() => void signOut()} />
  }
}

export default App
