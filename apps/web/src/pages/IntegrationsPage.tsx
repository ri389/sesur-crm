import { useEffect, useState } from 'react'
import { api, ApiError, can, type IntegrationDelivery, type IntegrationStatus, type User } from '../api'

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Impossible de charger les intégrations.'
}

function statusLabel(status: IntegrationDelivery['status']): string {
  return {
    QUEUED: 'En attente',
    PROCESSING: 'En cours',
    DELIVERED: 'Livrée',
    DEAD: 'Échec définitif',
  }[status]
}

function dateLabel(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('fr-FR')
}

export function IntegrationsPage({ user }: { user: User }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [deliveries, setDeliveries] = useState<IntegrationDelivery[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setError('')
    void Promise.all([api.integrations.status(), api.integrations.deliveries()])
      .then(([connection, rows]) => {
        if (!active) return
        setStatus(connection)
        setDeliveries(rows)
      })
      .catch((err: unknown) => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [refresh])

  async function replay(id: string) {
    setBusyId(id)
    setError('')
    try {
      await api.integrations.replay(id)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId('')
    }
  }

  if (!can(user, 'integration', 'read')) return <p role="alert">Vous n’avez pas accès aux intégrations.</p>
  const counts = {
    queued: deliveries.filter((item) => item.status === 'QUEUED' || item.status === 'PROCESSING').length,
    delivered: deliveries.filter((item) => item.status === 'DELIVERED').length,
    dead: deliveries.filter((item) => item.status === 'DEAD').length,
  }

  return (
    <>
      <header className="page-head">
        <div><h2>Intégrations et livraisons</h2><p>État du webhook, journal des tentatives et reprise des erreurs.</p></div>
        <button type="button" className="btn-secondary" onClick={() => setRefresh((value) => value + 1)}>Actualiser</button>
      </header>
      {error && <p role="alert" className="form-error">{error}</p>}
      <section className="detail-grid">
        <article className="detail-section">
          <h3>Webhook sortant signé</h3>
          {status ? <>
            <p><strong>État :</strong> {status.webhook.configured ? 'Configuré' : 'Désactivé'}</p>
            <p><strong>Point de terminaison :</strong> {status.webhook.endpoint ?? 'Non configuré'}</p>
            <p><strong>Signature :</strong> {status.webhook.signature}</p>
            <p><strong>Tentatives avant abandon :</strong> {status.webhook.retryMaxAttempts}</p>
          </> : <p>Chargement…</p>}
          {!status?.webhook.configured && <p className="activity-meta">Renseignez INTEGRATION_WEBHOOK_URL et INTEGRATION_WEBHOOK_SECRET dans le fichier .env de l’API pour activer l’envoi.</p>}
        </article>
        <article className="detail-section">
          <h3>Résumé des 100 dernières livraisons</h3>
          <p>{counts.queued} en attente · {counts.delivered} livrées · {counts.dead} en échec définitif</p>
        </article>
      </section>
      <section className="activity-list" aria-label="Journal des livraisons d’intégrations">
        {deliveries.length === 0 ? <p>Aucune livraison enregistrée.</p> : deliveries.map((delivery) => (
          <article className="activity-card" key={delivery.id}>
            <div>
              <h3>{delivery.eventType}</h3>
              <p className="activity-meta">{delivery.entityType} · {delivery.entityId ?? '—'} · {dateLabel(delivery.createdAt)}</p>
              <p><span className={`status-badge ${delivery.status === 'DELIVERED' ? 'success' : delivery.status === 'DEAD' ? 'danger' : 'warning'}`}>{statusLabel(delivery.status)}</span> · {delivery.attemptCount} tentative(s){delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ''}</p>
              {delivery.lastError && <p className="form-error">{delivery.lastError}</p>}
              {delivery.attempts.map((attempt) => <small className="activity-meta" key={`${delivery.id}-${attempt.attempt}`}>Tentative {attempt.attempt} · {dateLabel(attempt.occurredAt)} · {attempt.succeeded ? 'réussie' : attempt.error ?? `HTTP ${attempt.statusCode ?? '—'}`}</small>)}
            </div>
            {delivery.status === 'DEAD' && can(user, 'integration', 'replay') && <button type="button" className="btn-secondary" disabled={busyId === delivery.id} aria-busy={busyId === delivery.id || undefined} onClick={() => void replay(delivery.id)}>{busyId === delivery.id && <span className="button-spinner" aria-hidden="true" />} {busyId === delivery.id ? 'Relance…' : 'Rejouer'}</button>}
          </article>
        ))}
      </section>
    </>
  )
}
