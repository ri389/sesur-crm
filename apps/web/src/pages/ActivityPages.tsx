import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  api,
  ApiError,
  can,
  type CalendarEvent,
  type CalendarEventStatus,
  type CalendarEventType,
  type CrmTask,
  type DirectoryUser,
  type TaskPriority,
  type TaskStatus,
  type User,
} from '../api'

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Une erreur est survenue.'
}

function dateTime(value: string | null | undefined): string {
  if (!value) return 'Sans échéance'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date invalide' : date.toLocaleString('fr-FR')
}

function taskStatusLabel(status: TaskStatus): string {
  return {
    TODO: 'À faire',
    IN_PROGRESS: 'En cours',
    DONE: 'Terminée',
    CANCELLED: 'Annulée',
  }[status]
}

export function TasksPage({ user }: { user: User }) {
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    void api.tasks.list(page)
      .then((result) => {
        if (!active) return
        setTasks(result.data)
        setTotalPages(result.pagination.totalPages)
      })
      .catch((err: unknown) => {
        if (active) setError(messageOf(err))
      })
    return () => { active = false }
  }, [page, refresh])

  useEffect(() => {
    if (!can(user, 'user', 'read')) return
    void api.users.list().then(setUsers).catch(() => setUsers([]))
  }, [user])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const dueAt = String(data.get('dueAt') ?? '')
    const assignedUserId = String(data.get('assignedUserId') ?? user.id)
    try {
      await api.tasks.create({
        title: String(data.get('title') ?? '').trim(),
        description: String(data.get('description') ?? '').trim() || null,
        priority: String(data.get('priority') ?? 'NORMAL') as TaskPriority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        assignedUserId: assignedUserId || user.id,
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

  async function changeStatus(task: CrmTask, status: TaskStatus) {
    setError('')
    try {
      await api.tasks.update(task.id, { status })
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function remove(task: CrmTask) {
    if (!window.confirm(`Archiver la tâche « ${task.title} » ?`)) return
    setError('')
    setArchivingId(task.id)
    try {
      await api.tasks.delete(task.id)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setArchivingId('')
    }
  }

  if (!can(user, 'task', 'read')) return <p role="alert">Vous n’avez pas accès aux tâches.</p>

  return (
    <>
      <header className="page-head">
        <div>
          <h2>Tâches</h2>
          <p>Vos tâches et celles de votre équipe selon vos permissions.</p>
        </div>
      </header>
      {error && <p role="alert" className="form-error">{error}</p>}

      {can(user, 'task', 'create') && (
        <form className="form-grid activity-form" onSubmit={(event) => void submit(event)}>
          <h3>Nouvelle tâche</h3>
          <label className="stack">Titre *<input name="title" required maxLength={200} /></label>
          <label className="stack">Description<textarea name="description" maxLength={5000} rows={3} /></label>
          <div className="form-row">
            <label className="stack">
              Échéance<input name="dueAt" type="datetime-local" />
            </label>
            <label className="stack">
              Priorité
              <select name="priority" defaultValue="NORMAL">
                <option value="LOW">Basse</option>
                <option value="NORMAL">Normale</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select>
            </label>
            {can(user, 'user', 'read') && users.length > 0 && (
              <label className="stack">
                Responsable
                <select name="assignedUserId" defaultValue={user.id}>
                  {users.filter((entry) => entry.isActive).map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.firstName} {entry.lastName}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Créer la tâche'}</button>
        </form>
      )}

      <section className="activity-list" aria-label="Liste des tâches">
        {tasks.length === 0 ? <p>Aucune tâche à afficher.</p> : tasks.map((task) => (
          <article className="activity-card" key={task.id}>
            <div>
              <h3>{task.title}</h3>
              {task.description && <p>{task.description}</p>}
              <p className="activity-meta">
                {dateTime(task.dueAt)} · {task.priority} · Responsable :{' '}
                {task.assignedUser ? `${task.assignedUser.firstName} ${task.assignedUser.lastName}` : 'Non attribuée'}
              </p>
              {task.opportunity && <p className="activity-meta">Opportunité : {task.opportunity.name}</p>}
              {task.organization && <p className="activity-meta">Client : {task.organization.name}</p>}
              {task.contact && <p className="activity-meta">Contact : {task.contact.firstName} {task.contact.lastName}</p>}
              {task.quote && <p className="activity-meta">Devis : {task.quote.number}</p>}
            </div>
            <div className="activity-actions">
              {can(user, 'task', 'update') && (
                <label>
                  <span className="sr-only">État de {task.title}</span>
                  <select value={task.status} onChange={(event) => void changeStatus(task, event.target.value as TaskStatus)}>
                    {(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const).map((status) => (
                      <option key={status} value={status}>{taskStatusLabel(status)}</option>
                    ))}
                  </select>
                </label>
              )}
              {can(user, 'task', 'delete') && <button type="button" className="linkish" disabled={Boolean(archivingId)} aria-busy={archivingId === task.id || undefined} onClick={() => void remove(task)}>{archivingId === task.id && <span className="button-spinner" aria-hidden="true" />} {archivingId === task.id ? 'Archivage…' : 'Archiver'}</button>}
            </div>
          </article>
        ))}
      </section>

      {totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination des tâches">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Précédent</button>
          <span>Page {page} sur {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Suivant</button>
        </nav>
      )}
    </>
  )
}

type CalendarView = 'day' | 'week' | 'month'

function getCalendarRange(anchor: Date, view: CalendarView) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const end = new Date(start)
  if (view === 'day') {
    end.setDate(end.getDate() + 1)
  } else if (view === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  } else {
    start.setDate(1)
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1)
  }
  end.setMilliseconds(end.getMilliseconds() - 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

function shiftCalendar(date: Date, view: CalendarView, direction: number): Date {
  const next = new Date(date)
  if (view === 'day') next.setDate(next.getDate() + direction)
  else if (view === 'week') next.setDate(next.getDate() + 7 * direction)
  else next.setMonth(next.getMonth() + direction)
  return next
}

function eventTypeLabel(type: CalendarEventType): string {
  return { MEETING: 'Rendez-vous', CALL: 'Appel', REMINDER: 'Rappel', OTHER: 'Autre' }[type]
}

function calendarDayKey(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CalendarPage({ user }: { user: User }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [view, setView] = useState<CalendarView>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState('')
  const range = getCalendarRange(anchor, view)

  useEffect(() => {
    let active = true
    setError('')
    void api.calendar.list(range.from, range.to)
      .then((result) => { if (active) setEvents(result) })
      .catch((err: unknown) => { if (active) setError(messageOf(err)) })
    return () => { active = false }
  }, [range.from, range.to, refresh])

  useEffect(() => {
    if (!can(user, 'user', 'read')) return
    void api.users.list().then(setUsers).catch(() => setUsers([]))
  }, [user])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const startAt = String(data.get('startAt') ?? '')
    const endAt = String(data.get('endAt') ?? '')
    try {
      await api.calendar.create({
        title: String(data.get('title') ?? '').trim(),
        description: String(data.get('description') ?? '').trim() || null,
        type: String(data.get('type') ?? 'MEETING') as CalendarEventType,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        ownerUserId: String(data.get('ownerUserId') ?? user.id) || user.id,
      })
      form.reset()
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(event: CalendarEvent, status: CalendarEventStatus) {
    setError('')
    try {
      await api.calendar.update(event.id, { status })
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function remove(event: CalendarEvent) {
    if (!window.confirm(`Archiver l’événement « ${event.title} » ?`)) return
    setError('')
    setArchivingId(event.id)
    try {
      await api.calendar.delete(event.id)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setArchivingId('')
    }
  }

  const rangeLabel = view === 'day'
    ? anchor.toLocaleDateString('fr-FR', { dateStyle: 'full' })
    : view === 'week'
      ? `Semaine du ${new Date(range.from).toLocaleDateString('fr-FR')}`
      : anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const eventsByDay = events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
    const key = calendarDayKey(event.startAt)
    ;(groups[key] ??= []).push(event)
    return groups
  }, {})

  if (!can(user, 'calendar', 'read')) return <p role="alert">Vous n’avez pas accès à l’agenda.</p>

  return (
    <>
      <header className="page-head">
        <div><h2>Agenda</h2><p>Rendez-vous, appels et rappels.</p></div>
      </header>
      <div className="calendar-toolbar">
        <div className="button-group" aria-label="Vue de l’agenda">
          {(['day', 'week', 'month'] as const).map((item) => (
            <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>
              {{ day: 'Jour', week: 'Semaine', month: 'Mois' }[item]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAnchor((date) => shiftCalendar(date, view, -1))}>Précédent</button>
        <strong>{rangeLabel}</strong>
        <button type="button" onClick={() => setAnchor((date) => shiftCalendar(date, view, 1))}>Suivant</button>
        <button type="button" className="linkish" onClick={() => setAnchor(new Date())}>Aujourd’hui</button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}

      {can(user, 'calendar', 'create') && (
        <form className="form-grid activity-form" onSubmit={(event) => void submit(event)}>
          <h3>Planifier un événement</h3>
          <label className="stack">Titre *<input name="title" required maxLength={200} /></label>
          <label className="stack">Description / compte rendu<textarea name="description" maxLength={5000} rows={3} /></label>
          <div className="form-row">
            <label className="stack">Type<select name="type" defaultValue="MEETING"><option value="MEETING">Rendez-vous</option><option value="CALL">Appel</option><option value="REMINDER">Rappel</option><option value="OTHER">Autre</option></select></label>
            <label className="stack">Début *<input name="startAt" type="datetime-local" required /></label>
            <label className="stack">Fin *<input name="endAt" type="datetime-local" required /></label>
            {can(user, 'user', 'read') && users.length > 0 && (
              <label className="stack">Responsable<select name="ownerUserId" defaultValue={user.id}>{users.filter((entry) => entry.isActive).map((entry) => <option key={entry.id} value={entry.id}>{entry.firstName} {entry.lastName}</option>)}</select></label>
            )}
          </div>
          <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Ajouter à l’agenda'}</button>
        </form>
      )}

      <section className="activity-list" aria-label="Événements de l’agenda">
        {events.length === 0 ? <p>Aucun événement sur cette période.</p> : Object.entries(eventsByDay).map(([day, dayEvents]) => (
          <section className="calendar-day" key={day}>
            <h3>{new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            {dayEvents.map((event) => (
              <article className="activity-card" key={event.id}>
                <div>
                  <h3>{event.title}</h3>
                  <p className="activity-meta">{new Date(event.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – {new Date(event.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {eventTypeLabel(event.type)} · {event.owner ? `${event.owner.firstName} ${event.owner.lastName}` : ''}</p>
                  {event.description && <p>{event.description}</p>}
                  {event.organization && <p className="activity-meta">Client : {event.organization.name}</p>}
                  {event.opportunity && <p className="activity-meta">Opportunité : {event.opportunity.name}</p>}
                </div>
                <div className="activity-actions">
                  {can(user, 'calendar', 'update') && (
                    <label><span className="sr-only">État de {event.title}</span><select value={event.status} onChange={(input) => void setStatus(event, input.target.value as CalendarEventStatus)}><option value="SCHEDULED">Planifié</option><option value="COMPLETED">Terminé</option><option value="CANCELLED">Annulé</option></select></label>
                  )}
                  {can(user, 'calendar', 'delete') && <button type="button" className="linkish" disabled={Boolean(archivingId)} aria-busy={archivingId === event.id || undefined} onClick={() => void remove(event)}>{archivingId === event.id && <span className="button-spinner" aria-hidden="true" />} {archivingId === event.id ? 'Archivage…' : 'Archiver'}</button>}
                </div>
              </article>
            ))}
          </section>
        ))}
      </section>
    </>
  )
}
