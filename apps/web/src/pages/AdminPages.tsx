import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, can, type AuditRow, type DirectoryUser, type InvitationEmailIndex, type InvitationRecord, type Product, type Role, type User } from '../api'
import { changePassword } from '../api'

function invitationEmailsFromInput(value: string): string[] {
  return value.split(/[\s,;]+/u).map((email) => email.trim().toLowerCase()).filter(Boolean)
}

function validateInvitationEmails(value: string, index: InvitationEmailIndex): string {
  const emails = invitationEmailsFromInput(value)
  if (emails.length === 0) return value.trim() ? 'Saisissez au moins une adresse e-mail.' : ''
  if (emails.length > 50) return 'Vous pouvez envoyer jusqu’à 50 invitations à la fois.'
  const invalid = emails.filter((email) => {
    const input = document.createElement('input')
    input.type = 'email'
    input.value = email
    return !input.checkValidity()
  })
  if (invalid.length > 0) return `Adresse${invalid.length > 1 ? 's' : ''} invalide${invalid.length > 1 ? 's' : ''} : ${invalid.join(', ')}`
  if (new Set(emails).size !== emails.length) return 'Une même adresse apparaît plusieurs fois dans la liste.'
  const reserved = new Set([...index.registered, ...index.pending])
  const used = emails.filter((email) => reserved.has(email))
  return used.length > 0
    ? `Adresse${used.length > 1 ? 's' : ''} déjà utilisée${used.length > 1 ? 's' : ''} ou invitée${used.length > 1 ? 's' : ''} : ${used.join(', ')}`
    : ''
}

export function UsersPage({ user: currentUser }: { user: User }) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [invitations, setInvitations] = useState<InvitationRecord[]>([])
  const [directoryLoaded, setDirectoryLoaded] = useState(false)
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invitationValidationError, setInvitationValidationError] = useState('')
  const [invitationSentTo, setInvitationSentTo] = useState<string[]>([])
  const [invitationEmails, setInvitationEmails] = useState('')
  const [statusClock, setStatusClock] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [resendingId, setResendingId] = useState('')
  const [removingUserId, setRemovingUserId] = useState('')
  const closeConfirmationRef = useRef<HTMLButtonElement>(null)
  const inviteButtonRef = useRef<HTMLButtonElement>(null)
  const formCloseRef = useRef<HTMLButtonElement>(null)
  const formDialogRef = useRef<HTMLElement>(null)

  const loadDirectory = useCallback(async () => {
    const [nextUsers, nextRoles, nextInvitations] = await Promise.all([
      api.users.list(),
      api.roles(),
      api.users.invitations(),
    ])
    setUsers(nextUsers)
    setRoles(nextRoles)
    setInvitations(nextInvitations)
    setDirectoryLoaded(true)
  }, [])

  const closeConfirmation = useCallback(() => {
    setInvitationSentTo([])
    window.requestAnimationFrame(() => inviteButtonRef.current?.focus())
  }, [])

  function openInvitationForm() {
    setEditingUser(null)
    setInvitationEmails('')
    setInvitationValidationError('')
    setError('')
    setNotice('')
    setFormModalOpen(true)
  }

  function openUserEditor(userToEdit: DirectoryUser) {
    setEditingUser(userToEdit)
    setInvitationValidationError('')
    setError('')
    setNotice('')
    setFormModalOpen(true)
  }

  function closeUserForm() {
    if (submitting) return
    setFormModalOpen(false)
    setEditingUser(null)
    setInvitationValidationError('')
  }

  useEffect(() => {
    void loadDirectory().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger les utilisateurs et les invitations.')
    })
  }, [loadDirectory])

  useEffect(() => {
    const timer = window.setInterval(() => setStatusClock(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!formModalOpen) return
    formCloseRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeUserForm()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = formDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [formModalOpen, submitting])

  useEffect(() => {
    if (invitationSentTo.length === 0) return
    closeConfirmationRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirmation()
      if (event.key === 'Tab') {
        event.preventDefault()
        closeConfirmationRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [invitationSentTo, closeConfirmation])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    setSubmitting(true)
    setError('')
    setInvitationValidationError('')
    const fields = {
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      roleIds: form.getAll('roleIds').map(String).filter(Boolean),
    }

    try {
      if (editingUser) {
        await api.users.update(editingUser.id, {
          ...fields,
          isActive: form.get('isActive') === 'true',
        })
        await loadDirectory()
        setEditingUser(null)
        setFormModalOpen(false)
        setError('')
        setNotice('Les modifications ont été enregistrées.')
        element.reset()
      } else {
        const emailInput = String(form.get('emails') ?? '')
        const currentEmailIndex = await api.users.invitationEmailIndex()
        const emailError = validateInvitationEmails(emailInput, currentEmailIndex)
        if (emailError) {
          setInvitationValidationError(emailError)
          setSubmitting(false)
          return
        }
        const emails = invitationEmailsFromInput(emailInput)

        const result = await api.users.createMany({
          emails,
          roleId: String(form.get('roleId') ?? ''),
        })
        const delivered = result.filter((entry) => entry.success)
        const failed = result.filter((entry) => !entry.success)
        setEditingUser(null)
        setNotice(failed.length > 0 ? `${delivered.length} invitation(s) envoyée(s) ; ${failed.length} échec(s).` : '')
        setError(failed.map((entry) => `${entry.email} : ${entry.error}`).join(' · '))
        setInvitationSentTo(delivered.map((entry) => entry.email))
        if (delivered.length > 0) {
          setInvitationEmails('')
          element.reset()
          setFormModalOpen(false)
        }
        void loadDirectory().catch(() => {
          if (delivered.length > 0) setNotice(`${delivered.length} invitation(s) envoyée(s) ; la liste n’a pas pu être actualisée.`)
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer cet utilisateur.')
      setNotice('')
    } finally {
      setSubmitting(false)
    }
  }

  async function resendInvitation(invitation: InvitationRecord) {
    setResendingId(invitation.id)
    setError('')
    setNotice('')
    try {
      await api.users.resendInvitation(invitation.id)
      await loadDirectory()
      setNotice(`Une nouvelle invitation a été envoyée à ${invitation.email}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de renvoyer cette invitation.')
    } finally {
      setResendingId('')
    }
  }

  async function remove(userToRemove: DirectoryUser) {
    const confirmation = import.meta.env.DEV
      ? `Supprimer définitivement le compte de ${userToRemove.firstName} ${userToRemove.lastName} ?\n\nLes invitations et accès liés seront supprimés. Les actions d’audit resteront conservées sous leur identifiant historique.`
      : `Désactiver le compte de ${userToRemove.firstName} ${userToRemove.lastName} ?\n\nLe compte ne pourra plus se connecter et ses sessions seront révoquées.`
    if (!window.confirm(confirmation)) return
    setRemovingUserId(userToRemove.id)
    try {
      await api.users.delete(userToRemove.id)
      await loadDirectory()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de supprimer cet utilisateur.')
    } finally {
      setRemovingUserId('')
    }
  }

  const canEditForm = editingUser
    ? can(currentUser, 'user', 'update')
    : can(currentUser, 'user', 'create')
  return (
    <>
      <header className="page-header users-page-heading">
        <div>
          <h2>Utilisateurs</h2>
          <p>Gérez les comptes, les rôles et les invitations de votre équipe.</p>
        </div>
        {can(currentUser, 'user', 'create') && <button ref={inviteButtonRef} type="button" className="button" onClick={openInvitationForm}>Inviter de nouveaux utilisateurs</button>}
      </header>
      {notice && <p role="status" className="form-success">{notice}</p>}
      {error && !formModalOpen && <p role="alert" className="form-error">{error}</p>}
      {formModalOpen && canEditForm && (
        <div className="modal-overlay users-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUserForm() }}>
          <section ref={formDialogRef} className="modal users-invitation-modal" role="dialog" aria-modal="true" aria-labelledby="users-form-modal-title">
            <header className="users-form-modal-heading">
              <div>
                <span>{editingUser ? 'MODIFICATION DU COMPTE' : 'NOUVELLE INVITATION'}</span>
                <h3 id="users-form-modal-title">{editingUser ? `Modifier ${editingUser.firstName} ${editingUser.lastName}` : 'Inviter des utilisateurs'}</h3>
              </div>
              <button ref={formCloseRef} type="button" className="users-modal-close" aria-label="Fermer le formulaire" disabled={submitting} onClick={closeUserForm}>×</button>
            </header>
            {error && <p role="alert" className="form-error">{error}</p>}
            <form className="form users-invitation-form" key={editingUser?.id ?? 'new-user'} onSubmit={(e) => void submit(e)}>
          {!editingUser ? (
            <>
              <label>
                Adresses e-mail
                <textarea name="emails" value={invitationEmails} onChange={(event) => { setInvitationEmails(event.target.value); setInvitationValidationError('') }} placeholder="un@gmail.com, deux@gmail.com" rows={3} required aria-describedby="bulk-invitation-help" aria-invalid={Boolean(invitationValidationError)} />
              </label>
              <label>
                Rôle attribué
                <select className="select-control" name="roleId" defaultValue="" required>
                  <option value="" disabled>Choisir un rôle</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
              <p className={invitationValidationError ? 'form-error' : 'form-hint'} id="bulk-invitation-help" role={invitationValidationError ? 'alert' : undefined}>{invitationValidationError || 'Séparez les adresses par une virgule, un espace ou un retour à la ligne.'}</p>
            </>
          ) : (
            <>
              <label>
                Prénom <input name="firstName" defaultValue={editingUser.firstName} required />
              </label>
              <label>
                Nom <input name="lastName" defaultValue={editingUser.lastName} required />
              </label>
              <fieldset>
                <legend>Rôles</legend>
                {roles.map((role) => (
                  <label key={role.id}>
                    <input
                      type="checkbox"
                      name="roleIds"
                      value={role.id}
                      defaultChecked={editingUser.roles.some((entry) => entry.role.id === role.id)}
                    />
                    {role.name}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {editingUser && (
            <label>
              Statut
              <select name="isActive" defaultValue={editingUser.isActive ? 'true' : 'false'}>
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="btn-secondary" disabled={submitting} onClick={closeUserForm}>Annuler</button>
            <button type="submit" disabled={submitting || (!editingUser && (!directoryLoaded || roles.length === 0))} aria-busy={submitting || undefined}>{submitting ? <><span className="button-spinner" aria-hidden="true" /> {editingUser ? 'Enregistrement…' : 'Envoi…'}</> : editingUser ? 'Enregistrer' : 'Envoyer les invitations'}</button>
          </div>
            </form>
          </section>
        </div>
      )}
      {invitationSentTo.length > 0 && (
        <div className="confirmation-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeConfirmation() }}>
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invitation-confirmation-title"
            aria-describedby="invitation-confirmation-description"
          >
            <div className="confirmation-check" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none"><path d="m14 24 7 7 14-15" /></svg>
            </div>
            <span className="confirmation-eyebrow">Confirmation</span>
            <h3 id="invitation-confirmation-title">{invitationSentTo.length === 1 ? 'Invitation envoyée !' : `${invitationSentTo.length} invitations envoyées !`}</h3>
            <p id="invitation-confirmation-description">
              {invitationSentTo.length === 1
                ? 'Le courriel d’invitation a bien été envoyé.'
                : `Les courriels d’invitation ont bien été envoyés à ${invitationSentTo.length} destinataires.`}
            </p>
            <button ref={closeConfirmationRef} type="button" onClick={closeConfirmation}>Fermer</button>
          </section>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>E-mail</th>
            <th>Rôles</th>
            <th>Statut</th>
            {(can(currentUser, 'user', 'update') || can(currentUser, 'user', 'delete')) && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((userRow) => (
            <tr key={userRow.id}>
              <td>
                {userRow.firstName} {userRow.lastName}
              </td>
              <td>{userRow.email}</td>
              <td>{userRow.roles.map((entry) => entry.role.name).join(', ') || '—'}</td>
              <td>{userRow.isActive ? 'Actif' : 'Inactif'}</td>
              {(can(currentUser, 'user', 'update') || can(currentUser, 'user', 'delete')) && (
                <td>
                  {can(currentUser, 'user', 'update') && <button type="button" onClick={() => openUserEditor(userRow)}>Modifier</button>}{' '}
                  {can(currentUser, 'user', 'delete') && userRow.id !== currentUser.id && (
                    <button type="button" disabled={Boolean(removingUserId)} aria-busy={removingUserId === userRow.id || undefined} onClick={() => void remove(userRow)}>{removingUserId === userRow.id && <span className="button-spinner" aria-hidden="true" />} {removingUserId === userRow.id ? 'Suppression…' : 'Supprimer'}</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <section className="invitation-list-section" aria-labelledby="invitation-list-title">
        <h3 id="invitation-list-title">Invitations envoyées</h3>
        <div className="table-container">
          <table>
            <thead><tr><th>Adresse e-mail</th><th>Rôle</th><th>Envoyée le</th><th>Expire le</th><th>Statut</th><th>Action</th></tr></thead>
            <tbody>
              {invitations.map((invitation) => {
                const status = invitation.acceptedAt
                  ? 'approved'
                  : new Date(invitation.expiresAt).getTime() <= statusClock
                    ? 'expired'
                    : 'pending'
                return (
                  <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td>{invitation.role.name}</td>
                  <td><time dateTime={invitation.createdAt}>{new Date(invitation.createdAt).toLocaleString('fr-FR')}</time></td>
                  <td><time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString('fr-FR')}</time></td>
                  <td><span className={`status-badge ${status === 'approved' ? 'success' : status === 'expired' ? 'warning' : ''}`}>{status === 'approved' ? 'Acceptée' : status === 'expired' ? 'Expirée' : 'En attente'}</span></td>
                  <td>{status !== 'approved' && can(currentUser, 'user', 'create') ? <button type="button" className="btn-secondary" disabled={Boolean(resendingId)} aria-busy={resendingId === invitation.id || undefined} onClick={() => void resendInvitation(invitation)}>{resendingId === invitation.id ? <><span className="button-spinner" aria-hidden="true" /> Envoi…</> : 'Renvoyer'}</button> : '—'}</td>
                  </tr>
                )
              })}
              {invitations.length === 0 && <tr><td colSpan={6} className="centered">Aucune invitation envoyée.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export function ProductsPage({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([])
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadProducts()
  }, [])

  async function loadProducts() {
    setProducts(await api.products.list())
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
    const status = String(form.get('status') || 'ACTIVE') as Product['status']
    const data = {
      sku: String(form.get('sku')),
      name: String(form.get('name')),
      description: String(form.get('description') ?? ''),
      unitPrice: Number(form.get('unitPrice')),
      status,
    }

    setSaving(true)
    setError('')
    try {
      if (editingProduct) {
        await api.products.update(editingProduct.id, data)
      } else {
        await api.products.create(data)
      }
      await loadProducts()
      element.reset()
      setIsAdding(false)
      setEditingProduct(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer le produit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Catalogue Produits</h2>
        {can(user, 'product', 'create') && (
          <button type="button" onClick={() => setIsAdding(true)}>+ Ajouter un produit</button>
        )}
      </div>

      {(can(user, 'product', 'create') || can(user, 'product', 'update')) && (isAdding || editingProduct) && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editingProduct ? 'Modifier le produit' : 'Nouveau produit'}</h3>
            {error && <p role="alert" className="form-error">{error}</p>}
            <form className="form" onSubmit={(e) => void submit(e)}>
              <label>
                Référence (SKU)
                <input name="sku" defaultValue={editingProduct?.sku} required disabled={!!editingProduct} />
              </label>
              <label>
                Nom
                <input name="name" defaultValue={editingProduct?.name} required />
              </label>
              <label>
                Description
                <textarea name="description" defaultValue={editingProduct?.description ?? ''} />
              </label>
              <label>
                Prix Unitaire
                <input name="unitPrice" type="number" min={0} step="0.01" defaultValue={editingProduct?.unitPrice} required />
              </label>
              <label>
                Statut
                <select name="status" defaultValue={editingProduct?.status || 'ACTIVE'}>
                  <option value="ACTIVE">Actif</option>
                  <option value="INACTIVE">Inactif</option>
                  <option value="ARCHIVED">Archivé</option>
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setIsAdding(false); setEditingProduct(null); }}>Annuler</button>
                <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Nom</th>
            <th>Prix</th>
            <th>Statut</th>
            {can(user, 'product', 'update') && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td><strong>{product.sku}</strong></td>
              <td>{product.name}</td>
              <td>{new Intl.NumberFormat('fr-BJ', { style: 'currency', currency: 'XOF' }).format(Number(product.unitPrice))}</td>
              <td>
                <span className={`badge badge-${product.status.toLowerCase()}`}>
                  {product.status}
                </span>
              </td>
              {can(user, 'product', 'update') && (
                <td><button type="button" onClick={() => setEditingProduct(product)}>Modifier</button></td>
              )}
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={can(user, 'product', 'update') ? 5 : 4} className="centered">Aucun produit trouvé.</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

export function ImportPage() {
  const [result, setResult] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('csv') ?? '')
    const rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [firstName, lastName, companyName, email, phone] = line.split(';')
        return { firstName, lastName, companyName, email, phone }
      })
    setSaving(true)
    setError('')
    try {
      const res = await api.importLeads(rows)
      setResult(
        res.results
          .map((row) => `Ligne ${row.index + 1} : ${row.status}${row.message ? ` (${row.message})` : ''}`)
          .join('\n'),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’importer les prospects.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h2>Import de prospects</h2>
      <p>Une ligne par prospect, colonnes séparées par un point-virgule : prénom ; nom ; entreprise ; e-mail ; téléphone.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Données
          <textarea name="csv" rows={8} required placeholder="Awa;Diallo;SESUR;awa@sesur.bj;+22990000000" />
        </label>
        <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Importation…' : 'Importer'}</button>
      </form>
      {result && <pre>{result}</pre>}
    </>
  )
}

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  useEffect(() => {
    void api.audit().then(setRows)
  }, [])
  return (
    <>
      <h2>Journal d’audit</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Cible</th>
            <th>Auteur</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.occurredAt).toLocaleString('fr-FR')}</td>
              <td>{row.action}</td>
              <td>
                {row.entityType} {row.entityId ?? ''}
              </td>
              <td>{row.actor ? `${row.actor.firstName} ${row.actor.lastName}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function ProfilePage({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await changePassword(String(form.get('currentPassword')), String(form.get('newPassword')))
      setMessage('Mot de passe mis à jour. Reconnectez-vous.')
      onPasswordChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le mot de passe.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <h2>Mon profil</h2>
      {error && <p role="alert" className="form-error">{error}</p>}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Mot de passe actuel <input name="currentPassword" type="password" required />
        </label>
        <label>
          Nouveau mot de passe <input name="newPassword" type="password" minLength={8} required />
        </label>
        <p className="form-hint">8 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.</p>
        <button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="button-spinner" aria-hidden="true" />} {saving ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
      </form>
      {message && <p>{message}</p>}
    </>
  )
}
