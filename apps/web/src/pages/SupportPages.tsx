import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  api,
  ApiError,
  can,
  type ContractRecord,
  type ContractStatus,
  type Organization,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
  type User,
} from '../api'
import { MetricCards } from '../components/MetricCards'

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Une erreur est survenue.'
}

function ticketStatusLabel(status: TicketStatus): string {
  return {
    OPEN: 'Ouvert',
    IN_PROGRESS: 'En cours',
    WAITING_CUSTOMER: 'En attente du client',
    RESOLVED: 'Résolu',
    CLOSED: 'Clôturé',
  }[status]
}

function priorityLabel(priority: TicketPriority): string {
  return { LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente' }[priority]
}

function slaIsOverdue(ticket: SupportTicket): boolean {
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') return false
  const now = Date.now()
  return [ticket.slaResponseDueAt, ticket.slaResolutionDueAt]
    .some((dueAt) => dueAt !== null && new Date(dueAt).getTime() < now)
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return 'Non définie'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date invalide' : date.toLocaleString('fr-FR')
}

function localDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function durationUntil(value: string): string {
  const delta = new Date(value).getTime() - Date.now()
  const absoluteMinutes = Math.floor(Math.abs(delta) / 60000)
  const days = Math.floor(absoluteMinutes / 1440)
  const hours = Math.floor((absoluteMinutes % 1440) / 60)
  const minutes = absoluteMinutes % 60
  const duration = `${days ? `${days} j ` : ''}${hours} h ${minutes} min`
  return delta < 0 ? `En retard de ${duration}` : `Temps restant : ${duration}`
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
      <span>Page {page} sur {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Suivant</button>
    </nav>
  )
}

export function TicketsPage({ user }: { user: User }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [contacts, setContacts] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])
  const [organizationId, setOrganizationId] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [sla, setSla] = useState('')
  const [escalated, setEscalated] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState('')

  useEffect(() => {
    if (!can(user, 'organization', 'read')) return
    void api.organizations.list(true).then(setOrganizations).catch(() => setOrganizations([]))
  }, [user])

  useEffect(() => {
    if (!organizationId || !can(user, 'contact', 'read')) {
      setContacts([])
      return
    }
    void api.contacts.list(organizationId).then(setContacts).catch(() => setContacts([]))
  }, [organizationId, user])

  useEffect(() => {
    let active = true
    const handle = window.setTimeout(() => {
      setError('')
      void api.tickets.list({
        page,
        status: status || undefined,
        priority: priority || undefined,
        sla: sla || undefined,
        escalated: escalated === '' ? undefined : escalated === 'true',
        search: search.trim() || undefined,
      }).then((result) => {
        if (!active) return
        setTickets(result.data)
        setTotalPages(result.pagination.totalPages)
      }).catch((err: unknown) => {
        if (active) setError(messageOf(err))
      })
    }, 180)
    return () => { active = false; window.clearTimeout(handle) }
  }, [page, status, priority, sla, escalated, search, refresh])

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const responseDue = String(data.get('slaResponseDueAt') ?? '')
    const resolutionDue = String(data.get('slaResolutionDueAt') ?? '')
    try {
      await api.tickets.create({
        title: String(data.get('title') ?? '').trim(),
        description: String(data.get('description') ?? '').trim() || null,
        priority: String(data.get('priority') ?? 'NORMAL') as TicketPriority,
        ...(responseDue ? { slaResponseDueAt: new Date(responseDue).toISOString() } : {}),
        ...(resolutionDue ? { slaResolutionDueAt: new Date(resolutionDue).toISOString() } : {}),
        organizationId: String(data.get('organizationId') ?? '') || null,
        contactId: String(data.get('contactId') ?? '') || null,
      })
      form.reset()
      setOrganizationId('')
      setPage(1)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  async function archiveTicket(ticket: SupportTicket) {
    if (!window.confirm(`Archiver le ticket ${ticket.number} ?`)) return
    setArchivingId(ticket.id)
    try {
      await api.tickets.delete(ticket.id)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setArchivingId('')
    }
  }

  if (!can(user, 'ticket', 'read')) return <p role="alert">Vous n’avez pas accès aux tickets SAV.</p>

  return (
    <>
      <header className="page-head">
        <div><h2>Tickets SAV</h2><p>File d’attente, priorité et échéances SLA.</p></div>
      </header>
      {error && <p role="alert" className="form-error">{error}</p>}

      {can(user, 'ticket', 'create') && (
        <form className="form-grid activity-form" onSubmit={(event) => void createTicket(event)}>
          <h3>Nouveau ticket</h3>
          <label className="stack">Objet *<input name="title" required maxLength={200} /></label>
          <label className="stack">Description<textarea name="description" maxLength={10000} rows={3} /></label>
          <div className="form-row">
            <label className="stack">Priorité<select name="priority" defaultValue="NORMAL"><option value="LOW">Basse</option><option value="NORMAL">Normale</option><option value="HIGH">Haute</option><option value="URGENT">Urgente</option></select></label>
            <label className="stack">Client<select name="organizationId" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Non rattaché</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
            {contacts.length > 0 && <label className="stack">Contact<select name="contactId" defaultValue=""><option value="">Aucun</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}</option>)}</select></label>}
          </div>
          <div className="form-row">
            <label className="stack">Échéance de première réponse<input name="slaResponseDueAt" type="datetime-local" /></label>
            <label className="stack">Échéance de résolution<input name="slaResolutionDueAt" type="datetime-local" /></label>
          </div>
          <small>Sans date personnalisée, l’échéance est calculée automatiquement selon la priorité (délais 24 h/24).</small>
          <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Création…' : 'Créer le ticket'}</button>
        </form>
      )}

      <section className="filters" aria-label="Filtres des tickets">
        <input className="filter" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Numéro, sujet ou client" aria-label="Rechercher un ticket" />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="Filtrer par état">
          <option value="">Tous les états</option><option value="OPEN">Ouverts</option><option value="IN_PROGRESS">En cours</option><option value="WAITING_CUSTOMER">En attente du client</option><option value="RESOLVED">Résolus</option><option value="CLOSED">Clôturés</option>
        </select>
        <select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1) }} aria-label="Filtrer par priorité">
          <option value="">Toutes les priorités</option><option value="LOW">Basse</option><option value="NORMAL">Normale</option><option value="HIGH">Haute</option><option value="URGENT">Urgente</option>
        </select>
        <select value={sla} onChange={(event) => { setSla(event.target.value); setPage(1) }} aria-label="Filtrer par SLA">
          <option value="">Tous les SLA</option><option value="OVERDUE">En retard</option><option value="ON_TRACK">Dans les délais</option><option value="NONE">Sans échéance</option>
        </select>
        <select value={escalated} onChange={(event) => { setEscalated(event.target.value); setPage(1) }} aria-label="Filtrer par escalade">
          <option value="">Escaladés et non escaladés</option><option value="true">Escaladés</option><option value="false">Non escaladés</option>
        </select>
      </section>

      <MetricCards items={[
        { label: 'Tickets affichés', value: tickets.length, detail: 'page courante', tone: 'blue' },
        { label: 'SLA en retard', value: tickets.filter(slaIsOverdue).length, detail: 'sur cette page', tone: 'amber' },
        { label: 'Escaladés', value: tickets.filter((ticket) => Boolean(ticket.escalatedAt)).length, detail: 'sur cette page', tone: 'violet' },
        { label: 'Priorité urgente', value: tickets.filter((ticket) => ticket.priority === 'URGENT').length, detail: 'sur cette page', tone: 'mint' },
      ]} label="Indicateurs de la file de tickets" />

      <section className="activity-list" aria-label="File d’attente des tickets">
        {tickets.length === 0 ? <p>Aucun ticket ne correspond aux filtres.</p> : tickets.map((ticket) => (
          <article className="activity-card" key={ticket.id}>
            <div>
              <h3><a href={`#/sav/tickets/${ticket.id}`}>{ticket.number} · {ticket.title}</a></h3>
              <p className="activity-meta">{ticket.organization?.name ?? 'Client non rattaché'} · {ticketStatusLabel(ticket.status)} · Priorité {priorityLabel(ticket.priority)}</p>
              <p className="activity-meta">Assigné à {ticket.assignedUser ? `${ticket.assignedUser.firstName} ${ticket.assignedUser.lastName}` : 'Personne'} · Créé le {dateLabel(ticket.createdAt)}</p>
              {ticket.slaResolutionDueAt && <p className={slaIsOverdue(ticket) ? 'sla-late' : 'activity-meta'}>{durationUntil(ticket.slaResolutionDueAt)} (résolution)</p>}
              <div className="activity-meta">
                {slaIsOverdue(ticket) && <span className="status-badge danger">SLA en retard</span>}{ticket.escalatedAt && <span className="status-badge warning">Escaladé</span>}
              </div>
            </div>
            <div className="activity-actions">
              {can(user, 'ticket', 'update') && <label><span className="sr-only">État de {ticket.number}</span><select value={ticket.status} onChange={(event) => void api.tickets.update(ticket.id, { status: event.target.value as TicketStatus }).then(() => setRefresh((value) => value + 1)).catch((err: unknown) => setError(messageOf(err)))}>{(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const).map((item) => <option key={item} value={item}>{ticketStatusLabel(item)}</option>)}</select></label>}
              {can(user, 'ticket', 'delete') && <button className="linkish" type="button" disabled={Boolean(archivingId)} aria-busy={archivingId === ticket.id || undefined} onClick={() => void archiveTicket(ticket)}>{archivingId === ticket.id && <span className="button-spinner" aria-hidden="true" />} {archivingId === ticket.id ? 'Archivage…' : 'Archiver'}</button>}
            </div>
          </article>
        ))}
      </section>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </>
  )
}

const HISTORY_LABELS: Record<string, string> = {
  'ticket.created': 'Ticket créé',
  'ticket.updated': 'Ticket modifié',
  'ticket.comment_added': 'Commentaire ajouté',
  'ticket.escalated': 'Ticket escaladé',
  'ticket.auto_escalated': 'Ticket automatiquement escaladé après dépassement du SLA',
  'ticket.escalation_cleared': 'Escalade levée',
  'ticket.archived': 'Ticket archivé',
}

export function TicketDetailPage({ id, user }: { id: string; user: User }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const [processingAction, setProcessingAction] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    void api.tickets.get(id).then((row) => { if (active) setTicket(row) }).catch((err: unknown) => { if (active) setError(messageOf(err)) })
    return () => { active = false }
  }, [id, refresh])

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const body = String(data.get('body') ?? '').trim()
    if (!body) return
    setSaving(true)
    try {
      await api.tickets.addComment(id, body)
      form.reset()
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  async function updateSla(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const responseDue = String(data.get('slaResponseDueAt') ?? '')
    const resolutionDue = String(data.get('slaResolutionDueAt') ?? '')
    setSaving(true)
    setError('')
    try {
      await api.tickets.update(id, {
        slaResponseDueAt: responseDue ? new Date(responseDue).toISOString() : null,
        slaResolutionDueAt: resolutionDue ? new Date(resolutionDue).toISOString() : null,
      })
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEscalation() {
    setProcessingAction('escalate')
    setError('')
    try {
      await api.tickets.setEscalated(id, !ticket?.escalatedAt)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setProcessingAction('')
    }
  }

  if (error && !ticket) return <><p role="alert" className="form-error">{error}</p><a href="#/sav/tickets">Retour à la file</a></>
  if (!ticket) return <p>Chargement du ticket…</p>

  const isOverdue = slaIsOverdue(ticket)
  return (
    <>
      <header className="page-head">
        <div><h2>{ticket.number} · {ticket.title}</h2><p>{ticket.organization?.name ?? 'Client non rattaché'}{ticket.contact ? ` · ${ticket.contact.firstName} ${ticket.contact.lastName}` : ''}</p></div>
        <a className="btn-secondary" href="#/sav/tickets">Retour à la file</a>
      </header>
      {error && <p role="alert" className="form-error">{error}</p>}

      <div className="detail-grid">
        <section className="detail-section">
          <h3>Suivi du ticket</h3>
          <p><strong>État :</strong> {ticketStatusLabel(ticket.status)}</p>
          <p><strong>Priorité :</strong> {priorityLabel(ticket.priority)}</p>
          <p><strong>Responsable :</strong> {ticket.assignedUser ? `${ticket.assignedUser.firstName} ${ticket.assignedUser.lastName}` : 'Personne'}</p>
          <p><strong>Ouvert le :</strong> {dateLabel(ticket.createdAt)}</p>
          {ticket.resolvedAt && <p><strong>Résolu le :</strong> {dateLabel(ticket.resolvedAt)}</p>}
          {ticket.closedAt && <p><strong>Clôturé le :</strong> {dateLabel(ticket.closedAt)}</p>}
          {ticket.description && <p className="support-description">{ticket.description}</p>}
          {ticket.escalatedAt && <p><span className="status-badge warning">Escaladé le {dateLabel(ticket.escalatedAt)}</span></p>}
        </section>
        <section className="detail-section">
          <h3>Chronomètre SLA</h3>
          {ticket.slaResponseDueAt ? <p className={isOverdue && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' ? 'sla-late' : ''}><strong>Première réponse :</strong> {durationUntil(ticket.slaResponseDueAt)}</p> : <p>Pas d’échéance de réponse définie.</p>}
          {ticket.slaResolutionDueAt ? <p className={isOverdue ? 'sla-late' : ''}><strong>Résolution :</strong> {durationUntil(ticket.slaResolutionDueAt)}</p> : <p>Pas d’échéance de résolution définie.</p>}
          {can(user, 'ticket', 'update') && (
            <>
              <div className="form-row">
                <label className="stack">État<select value={ticket.status} onChange={(event) => void api.tickets.update(id, { status: event.target.value as TicketStatus }).then(() => setRefresh((value) => value + 1)).catch((err: unknown) => setError(messageOf(err)))}>{(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const).map((item) => <option key={item} value={item}>{ticketStatusLabel(item)}</option>)}</select></label>
                <label className="stack">Priorité<select value={ticket.priority} onChange={(event) => void api.tickets.update(id, { priority: event.target.value as TicketPriority }).then(() => setRefresh((value) => value + 1)).catch((err: unknown) => setError(messageOf(err)))}>{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}</select></label>
              </div>
              <form className="form-grid" onSubmit={(event) => void updateSla(event)}>
                <label className="stack">Première réponse<input name="slaResponseDueAt" type="datetime-local" defaultValue={localDateTime(ticket.slaResponseDueAt)} /></label>
                <label className="stack">Résolution<input name="slaResolutionDueAt" type="datetime-local" defaultValue={localDateTime(ticket.slaResolutionDueAt)} /></label>
                <small>Renseigner les dates et heures selon la politique SLA validée.</small>
                <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Mettre à jour les échéances'}</button>
              </form>
            </>
          )}
          {can(user, 'ticket', 'escalate') && <button type="button" className={ticket.escalatedAt ? 'btn-secondary' : 'btn-warning'} disabled={Boolean(processingAction) || saving} aria-busy={processingAction === 'escalate' || undefined} onClick={() => void toggleEscalation()}>{processingAction === 'escalate' && <span className="button-spinner" aria-hidden="true" />} {processingAction === 'escalate' ? 'Mise à jour…' : ticket.escalatedAt ? 'Lever l’escalade' : 'Escalader le ticket'}</button>}
        </section>
      </div>

      <section className="detail-section">
        <h3>Commentaires et compte rendu</h3>
        {ticket.comments?.length ? <div className="support-comments">{ticket.comments.map((comment) => <article key={comment.id}><p>{comment.body}</p><small>{comment.author.firstName} {comment.author.lastName} · {dateLabel(comment.createdAt)}</small></article>)}</div> : <p>Aucun commentaire.</p>}
        {can(user, 'ticket', 'comment') && <form className="form-grid" onSubmit={(event) => void submitComment(event)}><label className="stack">Ajouter un commentaire<textarea name="body" required maxLength={10000} rows={3} /></label><button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Envoi…' : 'Ajouter'}</button></form>}
      </section>

      <section className="detail-section">
        <h3>Historique</h3>
        {ticket.history?.length ? <ul className="support-history">{ticket.history.map((entry) => <li key={entry.id}><span>{HISTORY_LABELS[entry.action] ?? entry.action}</span><small>{entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : 'Système'} · {dateLabel(entry.occurredAt)}</small></li>)}</ul> : <p>Aucun changement enregistré.</p>}
      </section>
    </>
  )
}

function moneyLabel(value: string | number, currency: string): string {
  const amount = Number(value)
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number.isFinite(amount) ? amount : 0)
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`
  }
}

function contractExpirationLabel(contract: ContractRecord): string {
  if (contract.status === 'TERMINATED') return 'Résilié'
  const expiration = new Date(contract.expiresAt)
  if (expiration.getTime() < Date.now()) return 'Expiré'
  return 'Actif'
}

export function ContractsPage({ user }: { user: User }) {
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [status, setStatus] = useState('')
  const [expiringCount, setExpiringCount] = useState(0)
  const [expiresBefore, setExpiresBefore] = useState('')
  const [expiresAfter, setExpiresAfter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState('')

  useEffect(() => {
    if (!can(user, 'organization', 'read')) return
    void api.organizations.list(true).then(setOrganizations).catch(() => setOrganizations([]))
  }, [user])

  useEffect(() => {
    let active = true
    void api.contracts.list({ page, status: status || undefined, expiresBefore: expiresBefore || undefined, expiresAfter: expiresAfter || undefined })
      .then((result) => { if (active) { setContracts(result.data); setTotalPages(result.pagination.totalPages) } })
      .catch((err: unknown) => { if (active) setError(messageOf(err)) })
    return () => { active = false }
  }, [page, status, expiresBefore, expiresAfter, refresh])

  useEffect(() => {
    let active = true
    void api.contracts.list({ expiringWithinDays: 30, status: 'ACTIVE', limit: 1 })
      .then((result) => { if (active) setExpiringCount(result.pagination.total) })
      .catch(() => { if (active) setExpiringCount(0) })
    return () => { active = false }
  }, [refresh])

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const startsAt = String(data.get('startsAt') ?? '')
    const expiresAt = String(data.get('expiresAt') ?? '')
    try {
      await api.contracts.create({
        name: String(data.get('name') ?? '').trim(),
        description: String(data.get('description') ?? '').trim() || null,
        value: String(data.get('value') ?? ''),
        currency: String(data.get('currency') ?? 'XOF').toUpperCase(),
        startsAt: startsAt ? new Date(`${startsAt}T12:00:00`).toISOString() : '',
        expiresAt: expiresAt ? new Date(`${expiresAt}T12:00:00`).toISOString() : '',
        organizationId: String(data.get('organizationId') ?? ''),
      })
      form.reset()
      setPage(1)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  async function archiveContract(contract: ContractRecord) {
    if (!window.confirm(`Archiver le contrat ${contract.number} ?`)) return
    setArchivingId(contract.id)
    try {
      await api.contracts.delete(contract.id)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setArchivingId('')
    }
  }

  if (!can(user, 'contract', 'read')) return <p role="alert">Vous n’avez pas accès aux contrats.</p>
  return (
    <>
      <header className="page-head"><div><h2>Contrats clients</h2><p>Suivi des valeurs et dates d’échéance.</p></div></header>
      {error && <p role="alert" className="form-error">{error}</p>}
      {expiringCount > 0 && <p className="status-badge warning" role="status">{expiringCount} contrat{expiringCount > 1 ? 's' : ''} actif{expiringCount > 1 ? 's' : ''} à échéance dans les 30 prochains jours.</p>}
      {can(user, 'contract', 'create') && <form className="form-grid activity-form" onSubmit={(event) => void createContract(event)}>
        <h3>Nouveau contrat</h3>
        <div className="form-row">
          <label className="stack">Client *<select name="organizationId" required defaultValue=""><option value="" disabled>Choisir un client</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
          <label className="stack">Nom du contrat *<input name="name" required maxLength={200} /></label>
        </div>
        <label className="stack">Description<textarea name="description" rows={2} maxLength={10000} /></label>
        <div className="form-row">
          <label className="stack">Valeur *<input name="value" type="number" min="0" step="0.01" required /></label>
          <label className="stack">Devise<input name="currency" defaultValue="XOF" maxLength={3} pattern="[A-Za-z]{3}" required /></label>
          <label className="stack">Début *<input name="startsAt" type="date" required /></label>
          <label className="stack">Fin / échéance *<input name="expiresAt" type="date" required /></label>
        </div>
        <button type="submit" disabled={saving || organizations.length === 0} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Création…' : 'Créer le contrat'}</button>
      </form>}

      <section className="filters" aria-label="Filtres des contrats">
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="État du contrat"><option value="">Tous les états</option><option value="ACTIVE">Actifs</option><option value="TERMINATED">Résiliés</option></select>
        <label>Expire après <input type="date" value={expiresAfter} onChange={(event) => { setExpiresAfter(event.target.value); setPage(1) }} /></label>
        <label>Expire avant <input type="date" value={expiresBefore} onChange={(event) => { setExpiresBefore(event.target.value); setPage(1) }} /></label>
      </section>

      <MetricCards items={[
        { label: 'Contrats affichés', value: contracts.length, detail: 'page courante', tone: 'blue' },
        { label: 'Actifs', value: contracts.filter((contract) => contract.status === 'ACTIVE').length, detail: 'sur cette page', tone: 'mint' },
        { label: 'Échéance sous 30 jours', value: expiringCount, detail: 'tous contrats actifs', tone: 'amber' },
        { label: 'Résiliés', value: contracts.filter((contract) => contract.status === 'TERMINATED').length, detail: 'sur cette page', tone: 'violet' },
      ]} label="Indicateurs des contrats" />

      <section className="activity-list" aria-label="Liste des contrats">
        {contracts.length === 0 ? <p>Aucun contrat sur cette période.</p> : contracts.map((contract) => (
          <article className="activity-card" key={contract.id}>
            <div>
              <h3>{contract.number} · {contract.name}</h3>
              <p className="activity-meta">{contract.organization?.name ?? 'Client'} · {moneyLabel(contract.value, contract.currency)}</p>
              <p className="activity-meta">Du {new Date(contract.startsAt).toLocaleDateString('fr-FR')} au {new Date(contract.expiresAt).toLocaleDateString('fr-FR')} · {contractExpirationLabel(contract)}</p>
              {contract.description && <p>{contract.description}</p>}
            </div>
            <div className="activity-actions">
              {can(user, 'contract', 'update') && <label><span className="sr-only">État de {contract.number}</span><select value={contract.status} onChange={(event) => void api.contracts.update(contract.id, { status: event.target.value as ContractStatus }).then(() => setRefresh((value) => value + 1)).catch((err: unknown) => setError(messageOf(err)))}><option value="ACTIVE">Actif</option><option value="TERMINATED">Résilié</option></select></label>}
              {can(user, 'contract', 'delete') && <button className="linkish" type="button" disabled={Boolean(archivingId)} aria-busy={archivingId === contract.id || undefined} onClick={() => void archiveContract(contract)}>{archivingId === contract.id && <span className="button-spinner" aria-hidden="true" />} {archivingId === contract.id ? 'Archivage…' : 'Archiver'}</button>}
            </div>
          </article>
        ))}
      </section>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </>
  )
}
