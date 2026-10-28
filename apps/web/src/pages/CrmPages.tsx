import {useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  api,
  ApiError,
  can,
  type Opportunity,
  type OpportunityListResponse,
  candidatesOf,
  type Contact,
  type DuplicateCandidate,
  type Interaction,
  type Lead,
  type Organization,
  type User,
} from '../api'
import { MetricCards } from '../components/MetricCards'

const LEAD_LABEL: Record<Lead['status'], string> = {
  NEW: 'Nouveau',
  CONTACTED: 'Contacté',
  QUALIFIED: 'Qualifié',
  UNQUALIFIED: 'Non qualifié',
  CONVERTED: 'Converti',
}

type CreateLeadDto = Parameters<typeof api.leads.create>[0]
type CreateOpportunityDto = Parameters<typeof api.opportunities.create>[0]

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof ApiError ? error.message : 'Une erreur est survenue.'
  return (
    <p role="alert" className="form-error">
      {message}
    </p>
  )
}

function DuplicateList({
  candidates,
  onKeep,
  busy = false,
}: {
  candidates: DuplicateCandidate[]
  onKeep?: (candidate: DuplicateCandidate) => void
  busy?: boolean
}) {
  if (candidates.length === 0) return null
  return (
    <div className="banner">
      <p>Des fiches similaires existent déjà.</p>
      <ul>
        {candidates.map((candidate) => (
          <li key={`${candidate.type}-${candidate.id}`}>
            {candidate.title} — {candidate.reason} ({candidate.score} %)
            {candidate.type === 'LEAD' && (
              <>
                {' '}
                <a href={`#/leads/${candidate.id}`}>Ouvrir</a>
              </>
            )}
            {onKeep && (
              <>
                {' '}
                <button type="button" className="linkish" disabled={busy} aria-busy={busy || undefined} onClick={() => onKeep(candidate)}>
                  {busy && <span className="button-spinner" aria-hidden="true" />} {busy ? 'Fusion…' : 'Fusionner vers cette fiche'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HomePage({ user }: { user: User }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Array<{ type: string; id: string; title: string; subtitle?: string | null }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [metrics, setMetrics] = useState<{ leads: number | null; clients: number | null; opportunities: number | null; quotes: number | null }>({
    leads: null,
    clients: null,
    opportunities: null,
    quotes: null,
  })
  const [metricsLoading, setMetricsLoading] = useState(true)

  useEffect(() => {
    let active = true
    setMetricsLoading(true)
    const count = <T,>(request: Promise<T>, select: (value: T) => number) => request.then(select).catch(() => null)

    void Promise.all([
      can(user, 'lead', 'read') ? count(api.leads.list(), (rows) => rows.length) : Promise.resolve(null),
      can(user, 'organization', 'read') ? count(api.organizations.list(true), (rows) => rows.length) : Promise.resolve(null),
      can(user, 'opportunity', 'read') ? count(api.opportunities.list(1, 1), (result) => result.pagination.total) : Promise.resolve(null),
      can(user, 'quote', 'read') ? count(api.quotes.list(), (rows) => rows.length) : Promise.resolve(null),
    ]).then(([leads, clients, opportunities, quotes]) => {
      if (active) setMetrics({ leads, clients, opportunities, quotes })
    }).finally(() => {
      if (active) setMetricsLoading(false)
    })

    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (query.trim().length < 2 || !can(user, 'search', 'read')) {
      setHits([])
      setSearchLoading(false)
      setSearchError('')
      return
    }
    let active = true
    setSearchLoading(true)
    setSearchError('')
    const handle = window.setTimeout(() => {
      void api.search(query)
        .then((res) => { if (active) setHits(res.results) })
        .catch((err: unknown) => {
          if (!active) return
          setHits([])
          setSearchError(err instanceof ApiError ? err.message : 'La recherche est temporairement indisponible.')
        })
        .finally(() => { if (active) setSearchLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(handle) }
  }, [query, user])

  const hrefFor = (type: string, id: string) => {
    if (type === 'LEAD') return `#/leads/${id}`
    if (type === 'CONTACT') return `#/contacts/${id}`
    if (type === 'ORGANIZATION') return `#/clients/${id}`
    if (type === 'OPPORTUNITY') return `#/opportunities/${id}`
    return '#/admin/produits'
  }

  const metricCards = [
    ...(can(user, 'lead', 'read') ? [{ label: 'Prospects', value: metrics.leads, detail: 'dans votre périmètre', href: '#/leads', tone: 'mint' }] : []),
    ...(can(user, 'organization', 'read') ? [{ label: 'Clients', value: metrics.clients, detail: 'organisations suivies', href: '#/clients', tone: 'blue' }] : []),
    ...(can(user, 'opportunity', 'read') ? [{ label: 'Opportunités', value: metrics.opportunities, detail: 'dans le pipeline', href: '#/opportunities', tone: 'violet' }] : []),
    ...(can(user, 'quote', 'read') ? [{ label: 'Devis', value: metrics.quotes, detail: 'tous statuts', href: '#/quotes', tone: 'amber' }] : []),
  ]

  const shortcuts = [
    ...(can(user, 'lead', 'read') ? [{ label: 'Prospects', detail: 'Suivre la qualification', href: '#/leads', icon: '↗' }] : []),
    ...(can(user, 'opportunity', 'read') ? [{ label: 'Pipeline commercial', detail: 'Voir les opportunités', href: '#/opportunities', icon: '⌁' }] : []),
    ...(can(user, 'task', 'read') ? [{ label: 'Tâches', detail: 'Organiser les prochaines actions', href: '#/taches', icon: '✓' }] : []),
    ...(can(user, 'ticket', 'read') ? [{ label: 'Support client', detail: 'Consulter les demandes', href: '#/sav/tickets', icon: '◌' }] : []),
  ]

  return (
    <div className="dashboard">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-hero-copy">
          <span className="eyebrow">Pilotage commercial · SESUR</span>
          <h2 id="dashboard-title">Bonjour, {user.firstName}.</h2>
          <p>Votre activité, vos relations et les prochaines décisions au même endroit.</p>
        </div>
        <div className="hero-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="hero-meta"><span className="live-indicator" /> Données de votre espace sécurisé</div>
      </section>

      {metricCards.length > 0 && (
        <section className="dashboard-metrics" aria-label="Indicateurs clés">
          {metricsLoading
            ? metricCards.map((metric) => <div className="metric-card metric-skeleton" key={metric.label} aria-hidden="true"><span /><strong /><small /></div>)
            : metricCards.map((metric) => (
              <a className={`metric-card metric-${metric.tone}`} href={metric.href} key={metric.label}>
                <span className="metric-label">{metric.label}</span>
                <strong className="metric-value">{metric.value ?? '—'}</strong>
                <small>{metric.value === null ? 'indisponible' : metric.detail}</small>
                <span className="metric-arrow" aria-hidden="true">↗</span>
              </a>
            ))}
        </section>
      )}

      <div className="dashboard-grid">
        {can(user, 'search', 'read') && (
          <section className="dashboard-panel search-panel" aria-labelledby="global-search-title">
            <div className="panel-heading">
              <div><span className="eyebrow">Recherche unifiée</span><h3 id="global-search-title">Retrouvez une information</h3></div>
              <span className="panel-icon" aria-hidden="true">⌕</span>
            </div>
            <label className="global-search">
              <span className="sr-only">Rechercher un prospect, client, contact, opportunité ou produit</span>
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, e-mail, entreprise…" />
              <span className="search-scope">SESUR</span>
            </label>
            {hits.length > 0 && (
              <div className="search-results" role="list" aria-label="Résultats de recherche">
                {hits.map((hit) => (
                  <a className="search-result" href={hrefFor(hit.type, hit.id)} key={`${hit.type}-${hit.id}`} role="listitem">
                    <span className="result-mark">{hit.type.charAt(0)}</span>
                    <span><strong>{hit.title}</strong><small>{hit.subtitle ?? hit.type}</small></span>
                    <span className="result-arrow" aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            )}
            {searchError && <p className="form-error" role="alert">{searchError}</p>}
            {searchLoading && <p className="search-hint" role="status">Recherche en cours…</p>}
            {!searchError && !searchLoading && query.trim().length >= 2 && hits.length === 0 && <p className="search-empty">Aucun résultat pour le moment.</p>}
            {query.trim().length < 2 && <p className="search-hint">Prospects, clients, contacts, opportunités et produits indexés.</p>}
          </section>
        )}

        <section className="dashboard-panel shortcuts-panel" aria-labelledby="shortcuts-title">
          <div className="panel-heading">
            <div><span className="eyebrow">Accès rapide</span><h3 id="shortcuts-title">Vos espaces de travail</h3></div>
            <span className="panel-icon" aria-hidden="true">✳</span>
          </div>
          {shortcuts.length > 0 ? (
            <div className="shortcut-list">
              {shortcuts.map((shortcut) => (
                <a href={shortcut.href} className="shortcut-card" key={shortcut.label}>
                  <span className="shortcut-icon" aria-hidden="true">{shortcut.icon}</span>
                  <span><strong>{shortcut.label}</strong><small>{shortcut.detail}</small></span>
                  <span className="result-arrow" aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          ) : <p className="empty-state">Aucun espace supplémentaire n’est disponible avec votre rôle.</p>}
        </section>
      </div>
    </div>
  )
}

export function LeadsPage({ user }: { user: User }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    void api.leads
      .list(search)
      .then(setLeads)
      .catch(setError)
  }, [search])

  const columns: Lead['status'][] = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']

  return (
    <>
      <header className="page-head">
        <h2>Prospects (Leads)</h2>
        {can(user, 'lead', 'create') && <a className="button" href="#/leads/nouveau">+ Nouveau prospect</a>}
      </header>
      <ErrorText error={error} />
      <MetricCards items={[
        { label: 'Prospects affichés', value: leads.length, detail: 'selon le filtre courant', tone: 'blue' },
        { label: 'À qualifier', value: leads.filter((lead) => lead.status === 'NEW').length, detail: 'nouveaux dans la file', tone: 'mint' },
        { label: 'Qualifiés', value: leads.filter((lead) => lead.status === 'QUALIFIED').length, detail: 'prêts à convertir', tone: 'violet' },
        { label: 'Convertis', value: leads.filter((lead) => lead.status === 'CONVERTED').length, detail: 'dans le périmètre chargé', tone: 'amber' },
      ]} />
      <div className="filters">
        <input
          className="filter"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par nom, entreprise..."
          aria-label="Filtrer les prospects"
        />
      </div>
      <div className="kanban" role="list">
        {columns.map((status) => (
          <section key={status} className="kanban-col" aria-label={LEAD_LABEL[status]}>
            <div className="kanban-col-header">
              <h3>{LEAD_LABEL[status]}</h3>
              <span className="count">{leads.filter((l) => l.status === status).length}</span>
            </div>
            {leads
              .filter((lead) => lead.status === status)
              .map((lead) => (
                <a key={lead.id} className="card" href={`#/leads/${lead.id}`} role="listitem">
                  <div className="card-body">
                    <strong className="card-title">
                      {lead.firstName} {lead.lastName}
                    </strong>
                    <span className="card-subtitle">{lead.companyName ?? 'Sans entreprise'}</span>
                    <div className="card-footer">
                      <span className="score">Score: {lead.score}</span>
                      <span className="source">{lead.source}</span>
                    </div>
                  </div>
                </a>
              ))}
          </section>
        ))}
      </div>
    </>
  )
}

export function LeadFormPage({ user }: { user: User }) {
  const [error, setError] = useState<unknown>(null)
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([])
  const [pending, setPending] = useState<CreateLeadDto | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>, bypass = false) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body: CreateLeadDto = {
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      companyName: String(form.get('companyName') ?? '') || undefined,
      email: String(form.get('email') ?? '') || undefined,
      phone: String(form.get('phone') ?? '') || undefined,
      source: String(form.get('source') ?? 'AUTRE'),
      ...(bypass ? { bypassDuplicateWarning: true } : {}),
    }
    setError(null)
    setSubmitting(true)
    try {
      const lead = await api.leads.create(body)
      window.location.hash = `#/leads/${lead.id}`
    } catch (err) {
      const found = candidatesOf(err)
      if (found.length > 0) {
        setCandidates(found)
        setPending(body)
      } else {
        setError(err)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!can(user, 'lead', 'create')) {
    return <p role="alert">Vous n'avez pas la permission de créer un prospect.</p>
  }

  return (
    <>
      <div className="page-header">
        <h2>Nouveau prospect</h2>
        <a href="#/leads" className="btn-secondary">Retour</a>
      </div>
      <ErrorText error={error} />
      {candidates.length > 0 && (
        <div className="warning-banner">
          <DuplicateList 
            candidates={candidates} 
            busy={submitting}
            onKeep={async (c) => {
              if (confirm(`Fusionner avec ${c.title} ?`)) {
                setSubmitting(true)
                try {
                  await api.merge({ type: c.type, keepId: c.id, dropId: 'NEW' })
                  window.location.hash = `#/leads/${c.id}`
                } catch (reason) {
                  setError(reason)
                } finally {
                  setSubmitting(false)
                }
              }
            }} 
          />
        </div>
      )}
      <form className="form" onSubmit={(e) => void submit(e, false)}>
        <div className="form-row">
          <label>
            Prénom <input name="firstName" required />
          </label>
          <label>
            Nom <input name="lastName" required />
          </label>
        </div>
        <label>
          Entreprise <input name="companyName" />
        </label>
        <div className="form-row">
          <label>
            E-mail <input name="email" type="email" />
          </label>
          <label>
            Téléphone <input name="phone" />
          </label>
        </div>
        <label>
          Source
          <select name="source" defaultValue="AUTRE">
            <option value="AUTRE">Autre</option>
            <option value="WEB">Site Web</option>
            <option value="REFERRAL">Recommandation</option>
            <option value="COLD_CALL">Appel à froid</option>
            <option value="EVENT">Événement</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" disabled={submitting} aria-busy={submitting || undefined}>{submitting && <span className="button-spinner" aria-hidden="true" />} {submitting ? 'Enregistrement…' : 'Enregistrer le prospect'}</button>
          {pending && (
            <button 
              type="button" 
              className="btn-warning" 
              disabled={submitting}
              aria-busy={submitting || undefined}
              onClick={() => {
                setError(null)
                setSubmitting(true)
                void api.leads.create({ ...pending, bypassDuplicateWarning: true })
                  .then((lead) => {
                    window.location.hash = `#/leads/${lead.id}`
                  })
                  .catch((err: unknown) => setError(err))
                  .finally(() => setSubmitting(false))
              }}
            >
              {submitting && <span className="button-spinner" aria-hidden="true" />} {submitting ? 'Création…' : 'Créer malgré les doublons'}
            </button>
          )}
        </div>
      </form>
    </>
  )
}

function InteractionForm({
  target,
}: {
  target: { leadId?: string; contactId?: string; organizationId?: string }
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setError(null)
    try {
      await api.interactions.create({
        ...target,
        channel: data.get('channel'),
        summary: data.get('summary'),
      })
      window.location.reload()
    } catch (reason) {
      setError(reason)
    } finally {
      setSaving(false)
    }
  }
  return (
    <form className="form inline" onSubmit={(e) => void submit(e)}>
      <ErrorText error={error} />
      <label>
        Canal
        <select name="channel" defaultValue="NOTE">
          <option value="CALL">Appel</option>
          <option value="EMAIL">E-mail</option>
          <option value="MEETING">Réunion</option>
          <option value="NOTE">Note</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
      </label>
      <label>
        Résumé <input name="summary" required />
      </label>
      <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Ajout…' : 'Ajouter une interaction'}</button>
    </form>
  )
}

function InteractionList({ items }: { items?: Interaction[] }) {
  if (!items?.length) return <p>Aucune interaction.</p>
  return (
    <ul className="plain">
      {items.map((item) => (
        <li key={item.id}>
          {new Date(item.occurredAt).toLocaleString('fr-FR')} — {item.channel} : {item.summary}
        </li>
      ))}
    </ul>
  )
}

export function LeadDetailPage({ id, user }: { id: string; user: User }) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [actionError, setActionError] = useState('')
  const [processingAction, setProcessingAction] = useState('')

  useEffect(() => {
    void api.leads.get(id).then(setLead).catch(setError)
  }, [id])

  async function qualifyLead() {
    if (!lead) return
    setProcessingAction('qualify')
    setActionError('')
    try {
      setLead(await api.leads.qualify(lead.id))
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Impossible de qualifier ce prospect.')
    } finally {
      setProcessingAction('')
    }
  }

  async function convertLead() {
    if (!lead) return
    setProcessingAction('convert')
    setActionError('')
    try {
      const result = await api.leads.convert(lead.id)
      window.location.hash = `#/clients/${result.organization.id}`
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Impossible de convertir ce prospect en client.')
    } finally {
      setProcessingAction('')
    }
  }

  if (error) return <ErrorText error={error} />
  if (!lead) return <p>Chargement…</p>

  return (
    <>
      <header className="page-head">
        <h2>
          {lead.firstName} {lead.lastName}
        </h2>
        <span className="badge">{LEAD_LABEL[lead.status]}</span>
      </header>
      <p>
        {lead.companyName ?? 'Sans entreprise'} · {lead.email ?? 'sans e-mail'} · {lead.phone ?? 'sans téléphone'}
      </p>
      <p>Score : {lead.score} · Source : {lead.source}</p>
      {actionError && <p role="alert" className="form-error">{actionError}</p>}
      <div className="actions">
        {can(user, 'lead', 'update') && lead.status !== 'CONVERTED' && (
          <button type="button" disabled={Boolean(processingAction)} aria-busy={processingAction === 'qualify' || undefined} onClick={() => void qualifyLead()}>
            {processingAction === 'qualify' && <span className="button-spinner" aria-hidden="true" />}{processingAction === 'qualify' ? 'Qualification…' : 'Qualifier'}
          </button>
        )}
        {can(user, 'lead', 'convert') && lead.status !== 'CONVERTED' && (
          <button type="button" disabled={Boolean(processingAction)} aria-busy={processingAction === 'convert' || undefined} onClick={() => void convertLead()}>
            {processingAction === 'convert' && <span className="button-spinner" aria-hidden="true" />}{processingAction === 'convert' ? 'Conversion…' : 'Convertir en client'}
          </button>
        )}
      </div>
      <h3>Interactions</h3>
      <InteractionList items={lead.interactions} />
      {can(user, 'interaction', 'create') && <InteractionForm target={{ leadId: lead.id }} />}
    </>
  )
}

export function ClientsPage({ user }: { user: User }) {
  const [rows, setRows] = useState<Organization[]>([])
  const [search, setSearch] = useState('')
  const [isClientFilter, setIsClientFilter] = useState(false)

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const results = await api.organizations.list(isClientFilter)
      setRows(
        results.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      )
    }, 250)
    return () => window.clearTimeout(handle)
  }, [search, isClientFilter])

  return (
    <>
      <header className="page-head">
        <h2>Clients & Organisations</h2>
        {can(user, 'organization', 'create') && (
          <a className="button" href="#/clients/nouveau">
            + Nouveau client
          </a>
        )}
      </header>
      <MetricCards items={[
        { label: 'Résultats affichés', value: rows.length, detail: 'organisations visibles', tone: 'blue' },
        { label: 'Clients', value: rows.filter((row) => row.isClient).length, detail: 'dans les résultats', tone: 'mint' },
        { label: 'Prospects', value: rows.filter((row) => !row.isClient).length, detail: 'dans les résultats', tone: 'violet' },
        { label: 'Contacts liés', value: rows.reduce((total, row) => total + (row._count?.contacts ?? 0), 0), detail: 'contacts associés', tone: 'amber' },
      ]} />
      <div className="filters">
        <input
          className="filter"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une entreprise..."
        />
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={isClientFilter}
            onChange={e => setIsClientFilter(e.target.checked)}
          />
          Clients uniquement
        </label>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Statut</th>
            <th>Contacts</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <a href={`#/clients/${row.id}`}><strong>{row.name}</strong></a>
              </td>
              <td>
                <span className={`badge ${row.isClient ? 'badge-client' : 'badge-prospect'}`}>
                  {row.isClient ? 'Client' : 'Prospect'}
                </span>
              </td>
              <td>{row._count?.contacts ?? 0} contacts</td>
              <td>
                <a href={`#/clients/${row.id}`} className="linkish">Détails</a>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="centered">Aucune organisation trouvée.</td></tr>
          )}
        </tbody>
      </table>
    </>
  )
}

export function ClientFormPage() {
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError(null)
    try {
      const org = await api.organizations.create({
        name: String(form.get('name')),
        email: String(form.get('email') ?? '') || undefined,
        phone: String(form.get('phone') ?? '') || undefined,
        isClient: form.get('isClient') === 'on',
        status: String(form.get('status') || 'ACTIF'),
      })
      window.location.hash = `#/clients/${org.id}`
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <h2>Nouvelle organisation</h2>
      <ErrorText error={error} />
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Nom de l'entreprise <input name="name" required />
        </label>
        <label>
          E-mail contact <input name="email" type="email" />
        </label>
        <label>
          Téléphone <input name="phone" />
        </label>
        <label>
          Statut <input name="status" defaultValue="ACTIF" />
        </label>
        <label className="checkbox">
          <input name="isClient" type="checkbox" defaultChecked /> Est déjà un client
        </label>
        <div className="form-actions">
          <a href="#/clients" className="btn-secondary">Annuler</a>
          <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </>
  )
}

export function ClientDetailPage({ id, user }: { id: string; user: User }) {
  const [org, setOrg] = useState<Organization | null>(null)
  useEffect(() => {
    void api.organizations.get(id).then(setOrg)
  }, [id])
  if (!org) return <p>Chargement…</p>
  return (
    <>
      <h2>{org.name}</h2>
      <p>{org.isClient ? 'Client' : 'Organisation'} · {org.email ?? 'sans e-mail'}</p>
      <h3>Contacts</h3>
      <ul className="plain">
        {org.contacts?.map((contact) => (
          <li key={contact.id}>
            <a href={`#/contacts/${contact.id}`}>
              {contact.firstName} {contact.lastName}
            </a>
          </li>
        ))}
      </ul>
      <h3>Interactions</h3>
      <InteractionList items={org.interactions} />
      {can(user, 'interaction', 'create') && <InteractionForm target={{ organizationId: org.id }} />}
    </>
  )
}

export function ContactsPage({ user }: { user: User }) {
  const [rows, setRows] = useState<Contact[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const results = await api.contacts.list()
      setRows(results.filter(r =>
        `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        (r.email && r.email.toLowerCase().includes(search.toLowerCase()))
      ))
    }, 250)
    return () => window.clearTimeout(handle)
  }, [search])

  return (
    <>
      <header className="page-head">
        <h2>Contacts</h2>
        {can(user, 'contact', 'create') && <a className="button" href="#/contacts/nouveau">Nouveau contact</a>}
      </header>
      <MetricCards items={[
        { label: 'Contacts affichés', value: rows.length, detail: 'selon la recherche', tone: 'blue' },
        { label: 'Avec e-mail', value: rows.filter((row) => Boolean(row.email)).length, detail: 'contacts joignables', tone: 'mint' },
        { label: 'Avec téléphone', value: rows.filter((row) => Boolean(row.phone)).length, detail: 'numéros renseignés', tone: 'violet' },
        { label: 'Rattachés', value: rows.filter((row) => Boolean(row.organizationId)).length, detail: 'à une organisation', tone: 'amber' },
      ]} />
      <div className="filters">
        <input
          className="filter"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un contact (nom, email)..."
        />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Organisation</th>
            <th>E-mail</th>
            <th>Téléphone</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <a href={`#/contacts/${row.id}`}>
                  <strong>{row.firstName} {row.lastName}</strong>
                </a>
              </td>
              <td>{row.organization?.name ?? '—'}</td>
              <td>{row.email ?? '—'}</td>
              <td>{row.phone ?? '—'}</td>
              <td>
                <a href={`#/contacts/${row.id}`} className="linkish">Détails</a>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="centered">Aucun contact trouvé.</td></tr>
          )}
        </tbody>
      </table>
    </>
  )
}

export function ContactFormPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void api.organizations.list().then(setOrgs)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError(null)
    try {
      const contact = await api.contacts.create({
        firstName: String(form.get('firstName')),
        lastName: String(form.get('lastName')),
        email: String(form.get('email') ?? '') || undefined,
        phone: String(form.get('phone') ?? '') || undefined,
        jobTitle: String(form.get('jobTitle') ?? '') || undefined,
        organizationId: String(form.get('organizationId') ?? '') || undefined,
      })
      window.location.hash = `#/contacts/${contact.id}`
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h2>Nouveau contact</h2>
      <ErrorText error={error} />
      <form className="form" onSubmit={(e) => void submit(e)}>
        <div className="form-row">
          <label>
            Prénom <input name="firstName" required />
          </label>
          <label>
            Nom <input name="lastName" required />
          </label>
        </div>
        <label>
          E-mail <input name="email" type="email" />
        </label>
        <label>
          Téléphone <input name="phone" />
        </label>
        <label>
          Fonction <input name="jobTitle" />
        </label>
        <label>
          Organisation
          <select name="organizationId" defaultValue="">
            <option value="">Aucune</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <a href="#/contacts" className="btn-secondary">Annuler</a>
          <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </>
  )
}

export function ContactDetailPage({ id, user }: { id: string; user: User }) {
  const [contact, setContact] = useState<Contact | null>(null)
  useEffect(() => {
    void api.contacts.get(id).then(setContact)
  }, [id])
  if (!contact) return <p>Chargement…</p>
  return (
    <>
      <h2>
        {contact.firstName} {contact.lastName}
      </h2>
      <p>
        {contact.jobTitle ?? 'Sans fonction'} · {contact.organization?.name ?? 'sans organisation'}
      </p>
      <p>Préférences : {contact.preferences ?? '—'}</p>
      <h3>Interactions</h3>
      <InteractionList items={contact.interactions} />
      {can(user, 'interaction', 'create') && <InteractionForm target={{ contactId: contact.id }} />}
    </>
  )
}

const OPPORTUNITY_STAGES = ['QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const satisfies readonly Opportunity['stage'][]

const OPPORTUNITY_LABELS: Partial<Record<Opportunity['stage'], string>> = {
  QUALIFICATION: 'Qualification',
  PROPOSAL: 'Proposition',
  NEGOTIATION: 'Négociation',
  WON: 'Gagnée',
  LOST: 'Perdue',
}

function opportunityStageLabel(stage: Opportunity['stage']) {
  return OPPORTUNITY_LABELS[stage] ?? stage
}

function opportunityAmount(amount: Opportunity['amount']) {
  const value = Number(amount)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number.isFinite(value) ? value : 0)
}

function opportunityDate(value: string | Date | null | undefined) {
  if (!value) return 'Non définie'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Non définie' : date.toLocaleDateString('fr-FR')
}

export function OpportunitiesPage({ user }: { user: User }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<OpportunityListResponse['pagination'] | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    api.opportunities.list(page)
      .then((res) => {
        if (!active) return
        setOpportunities(res.data)
        setPagination(res.pagination)
      })
      .catch((err) => {
        if (active) setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [page, refreshKey])

  async function updateStage(id: string, stage: Opportunity['stage']) {
    setError(null)
    setUpdatingId(id)
    try {
      let lostReason: string | undefined
      if (stage === 'LOST') {
        const answer = window.prompt('Indiquez le motif de perte de cette opportunité :')
        if (answer === null) return
        lostReason = answer.trim()
        if (!lostReason) {
          setError(new Error('Le motif de perte est obligatoire.'))
          return
        }
      }
      await api.opportunities.updateStage(id, { stage, ...(lostReason ? { lostReason } : {}) })
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setError(err)
    } finally {
      setUpdatingId(null)
    }
  }

  const totalAmount = opportunities.reduce((sum, opp) => sum + (Number(opp.amount) || 0), 0)
  const weightedAmount = opportunities.reduce(
    (sum, opp) => sum + (Number(opp.amount) || 0) * (Number(opp.probability) || 0) / 100,
    0,
  )
  const activeCount = opportunities.filter((opp) => !['WON', 'LOST'].includes(opp.stage)).length

  if (loading) return <p className="centered">Chargement des opportunités…</p>

  return (
    <>
      <header className="page-head">
        <h2>Opportunités</h2>
        {can(user, 'opportunity', 'create') && (
          <a className="button" href="#/opportunities/nouveau">+ Nouvelle opportunité</a>
        )}
      </header>

      <ErrorText error={error} />

      <div className="stats-grid">
        <section className="stat-card"><span>Opportunités actives (page)</span><strong>{activeCount}</strong></section>
        <section className="stat-card"><span>Valeur totale (page)</span><strong>{opportunityAmount(totalAmount)}</strong></section>
        <section className="stat-card"><span>Valeur pondérée (page)</span><strong>{opportunityAmount(weightedAmount)}</strong></section>
      </div>

      {opportunities.length === 0 ? (
        <div className="empty-state">
          <p>Aucune opportunité pour le moment.</p>
          {can(user, 'opportunity', 'create') && (
            <a className="button" href="#/opportunities/nouveau">Créer la première opportunité</a>
          )}
        </div>
      ) : (
        <div className="kanban" role="list" aria-label="Pipeline des opportunités">
          {OPPORTUNITY_STAGES.map((stage) => {
            const items = opportunities.filter((opp) => opp.stage === stage)
            return (
              <section key={stage} className="kanban-col" aria-label={opportunityStageLabel(stage)}>
                <div className="kanban-col-header">
                  <h3>{opportunityStageLabel(stage)}</h3>
                  <span className="count">{items.length}</span>
                </div>
                {items.map((opp) => (
                  <article key={opp.id} className="card" role="listitem">
                    <div className="card-body">
                      <div className="card-header">
                        <strong className="card-title">
                          <a href={`#/opportunities/${opp.id}`}>{opp.name}</a>
                        </strong>
                      </div>
                      <span className="card-subtitle">{opp.organization?.name ?? 'Sans organisation'}</span>
                      <div className="card-footer">
                        <span className="amount">{opportunityAmount(opp.amount)}</span>
                        <span className="prob">{Number(opp.probability) || 0}%</span>
                        <span className="date">{opportunityDate(opp.expectedCloseDate)}</span>
                      </div>
                      {can(user, 'opportunity', 'update') && (
                        <div className="card-actions">
                          <label>
                            <span className="sr-only">Étape de {opp.name}</span>
                            <select
                              value={opp.stage}
                              disabled={updatingId === opp.id}
                              onChange={(event) => void updateStage(opp.id, event.target.value as Opportunity['stage'])}
                            >
                              {OPPORTUNITY_STAGES.map((nextStage) => (
                                <option key={nextStage} value={nextStage}>{opportunityStageLabel(nextStage)}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav className="actions" aria-label="Pagination des opportunités">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Précédent
          </button>
          <span>
            Page {pagination.page} sur {pagination.totalPages} ({pagination.total} opportunités)
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          >
            Suivant
          </button>
        </nav>
      )}
    </>
  )
}

export function OpportunityFormPage({ user }: { user: User }) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [loadingOrganizations, setLoadingOrganizations] = useState(true)

  useEffect(() => {
    let active = true
    api.organizations.list()
      .then((rows) => { if (active) setOrganizations(rows) })
      .catch((err) => { if (active) setError(err) })
      .finally(() => { if (active) setLoadingOrganizations(false) })
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const amountValue = String(form.get('amount') ?? '').trim()
const expectedCloseDate = String(form.get('expectedCloseDate') ?? '').trim()
const organizationId = String(form.get('organizationId') ?? '').trim()

if (!amountValue || !expectedCloseDate || !organizationId) {
  setError(new Error('Le montant, la date de clôture et l’organisation sont obligatoires.'))
  return
}

const body: CreateOpportunityDto = {
  name: String(form.get('name') ?? '').trim(),
  amount: amountValue,
  probability: Number(form.get('probability')),
  expectedCloseDate,
  organizationId,
}

    setError(null)
    setSaving(true)
    try {
      const opp = await api.opportunities.create(body)
      window.location.hash = `#/opportunities/${opp.id}`
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (!can(user, 'opportunity', 'create')) {
    return <><h2>Nouvelle opportunité</h2><p role="alert">Tu n'as pas l'autorisation de créer une opportunité.</p><a href="#/opportunities" className="btn-secondary">Retour au pipeline</a></>
  }

  return (
    <>
      <div className="page-header">
        <h2>Nouvelle opportunité</h2>
        <a href="#/opportunities" className="btn-secondary">Retour</a>
      </div>
      <ErrorText error={error} />
      <form className="form" onSubmit={(event) => void submit(event)}>
        <label>
          Nom de l'opportunité <input name="name" required maxLength={200} />
        </label>
        <div className="form-row">
          <label>
            Montant estimé (€) <input name="amount" type="number" min="0" step="0.01" />
          </label>
          <label>
            Probabilité (%) <input name="probability" type="number" min="0" max="100" step="1" defaultValue="50" required />
          </label>
        </div>
        <label>
          Date de clôture prévue <input name="expectedCloseDate" type="date" />
        </label>
        <label>
          Organisation
          <select name="organizationId" defaultValue="" disabled={loadingOrganizations}>
            <option value="">Aucune organisation</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          {loadingOrganizations && <small>Chargement des organisations…</small>}
        </label>
        <div className="form-actions">
          <button type="submit" disabled={saving || loadingOrganizations} aria-busy={saving || undefined}>
            {saving && <span className="button-spinner" aria-hidden="true" />}
            {saving ? 'Enregistrement…' : "Enregistrer l'opportunité"}
          </button>
        </div>
      </form>
    </>
  )
}

export function OpportunityDetailPage({ id, user }: { id: string; user: User }) {
  const [opp, setOpp] = useState<Opportunity | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.opportunities.get(id)
      .then((row) => { if (active) setOpp(row) })
      .catch((err) => { if (active) setError(err) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  if (loading) return <p className="centered">Chargement des détails…</p>
  if (error) return <><ErrorText error={error} /><a href="#/opportunities" className="btn-secondary">Retour au pipeline</a></>
  if (!opp) return <p>Opportunité introuvable. <a href="#/opportunities">Retour au pipeline</a></p>

  return (
    <>
      <header className="page-head">
        <h2>{opp.name}</h2>
        <span className="badge">{opportunityStageLabel(opp.stage)}</span>
      </header>
      <div className="detail-grid">
        <div className="detail-section">
          <h3>Informations générales</h3>
          <p><strong>Organisation :</strong> {opp.organization?.name ?? 'Non spécifiée'}</p>
          <p><strong>Montant :</strong> {opportunityAmount(opp.amount)}</p>
          <p><strong>Probabilité :</strong> {Number(opp.probability) || 0}%</p>
          <p><strong>Date de clôture prévue :</strong> {opportunityDate(opp.expectedCloseDate)}</p>
          {opp.stage === 'LOST' && opp.lostReason && <p><strong>Motif de perte :</strong> {opp.lostReason}</p>}
          {opp.description && <p><strong>Description :</strong> {opp.description}</p>}
        </div>
        <div className="detail-section">
          <h3>Actions</h3>
          {can(user, 'opportunity', 'update') ? (
            <label>
              Étape
              <select
                value={opp.stage}
                onChange={(event) => {
                  const stage = event.target.value as Opportunity['stage']
                  let lostReason: string | undefined
                  if (stage === 'LOST') {
                    const answer = window.prompt('Indiquez le motif de perte de cette opportunité :')
                    if (answer === null) {
                      event.currentTarget.value = opp.stage
                      return
                    }
                    lostReason = answer.trim()
                    if (!lostReason) {
                      setError(new Error('Le motif de perte est obligatoire.'))
                      event.currentTarget.value = opp.stage
                      return
                    }
                  }
                  setError(null)
                  void api.opportunities.updateStage(opp.id, { stage, ...(lostReason ? { lostReason } : {}) })
                    .then(() => api.opportunities.get(id).then(setOpp))
                    .catch(setError)
                }}
              >
                {OPPORTUNITY_STAGES.map((stage) => <option key={stage} value={stage}>{opportunityStageLabel(stage)}</option>)}
              </select>
            </label>
          ) : <p>Tu peux consulter cette opportunité, mais tu ne peux pas la modifier.</p>}
        </div>
      </div>
      <div className="actions">
        <a href="#/opportunities" className="btn-secondary">Retour au pipeline</a>
      </div>
    </>
  )
}
