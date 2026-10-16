import { useEffect, useState } from 'react'

type ApiState = 'loading' | 'ok' | 'error'

const NAV_ITEMS = ['Mes priorités', 'Prospects', 'Clients', 'Opportunités', 'Tickets SAV', 'Administration']

function App() {
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
        <h2>Mes priorités</h2>
        <p>Gabarit d'interface du socle technique. Les écrans métier arrivent avec les lots 1 et 2.</p>
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

export default App
