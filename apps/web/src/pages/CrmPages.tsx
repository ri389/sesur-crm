import { FormEvent, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  can,
  candidatesOf,
  type Contact,
  type DuplicateCandidate,
  type Interaction,
  type Lead,
  type Organization,
  type User,
} from '../api'

const LEAD_LABEL: Record<Lead['status'], string> = {
  NEW: 'Nouveau',
  CONTACTED: 'Contacté',
  QUALIFIED: 'Qualifié',
  UNQUALIFIED: 'Non qualifié',
  CONVERTED: 'Converti',
}

type CreateLeadDto = Parameters<typeof api.leads.create>[0]

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
}: {
  candidates: DuplicateCandidate[]
  onKeep?: (candidate: DuplicateCandidate) => void
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
                <button type="button" className="linkish" onClick={() => onKeep(candidate)}>
                  Fusionner vers cette fiche
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

  useEffect(() => {
    if (query.trim().length < 2 || !can(user, 'search', 'read')) {
      setHits([])
      return
    }
    const handle = window.setTimeout(() => {
      void api.search(query).then((res) => setHits(res.results))
    }, 250)
    return () => window.clearTimeout(handle)
  }, [query, user])

  const hrefFor = (type: string, id: string) => {
    if (type === 'LEAD') return `#/leads/${id}`
    if (type === 'CONTACT') return `#/contacts/${id}`
    if (type === 'ORGANIZATION') return `#/clients/${id}`
    return '#/admin/produits'
  }

  return (
    <>
      <h2>Mes priorités</h2>
      <p>Recherchez un prospect, un client, un contact ou un produit.</p>
      {can(user, 'search', 'read') && (
        <label className="stack">
          Recherche globale
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, e-mail, entreprise…" />
        </label>
      )}
      <ul className="plain">
        {hits.map((hit) => (
          <li key={`${hit.type}-${hit.id}`}>
            <a href={hrefFor(hit.type, hit.id)}>
              {hit.title}
              {hit.subtitle ? ` — ${hit.subtitle}` : ''} ({hit.type})
            </a>
          </li>
        ))}
      </ul>
    </>
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
    }
    setError(null)
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
    }
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
            onKeep={async (c) => {
              if (confirm(`Fusionner avec ${c.title} ?`)) {
                await api.merge({ type: c.type, keepId: c.id, dropId: 'NEW' })
                window.location.hash = `#/leads/${c.id}`
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
          <button type="submit">Enregistrer le prospect</button>
          {pending && (
            <button 
              type="button" 
              className="btn-warning" 
              onClick={() => void api.leads.create({ ...pending, bypassDuplicateWarning: true } as any).then((lead) => {
                window.location.hash = `#/leads/${lead.id}`
              })}
            >
              Créer malgré les doublons
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    await api.interactions.create({
      ...target,
      channel: data.get('channel'),
      summary: data.get('summary'),
    })
    window.location.reload()
  }
  return (
    <form className="form inline" onSubmit={(e) => void submit(e)}>
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
      <button type="submit">Ajouter une interaction</button>
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

  useEffect(() => {
    void api.leads.get(id).then(setLead).catch(setError)
  }, [id])

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
      <div className="actions">
        {can(user, 'lead', 'update') && lead.status !== 'CONVERTED' && (
          <button type="button" onClick={() => void api.leads.qualify(lead.id).then(setLead)}>
            Qualifier
          </button>
        )}
        {can(user, 'lead', 'convert') && lead.status !== 'CONVERTED' && (
          <button
            type="button"
            onClick={() =>
              void api.leads.convert(lead.id).then((res) => {
                window.location.hash = `#/clients/${res.organization.id}`
              })
            }
          >
            Convertir en client
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
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
          <button type="submit">Enregistrer</button>
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

  useEffect(() => {
    void api.organizations.list().then(setOrgs)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
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
          <button type="submit">Enregistrer</button>
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
