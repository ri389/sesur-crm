import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, can, type AuditRow, type DirectoryUser, type Product, type Role, type User } from '../api'
import { changePassword } from '../api'

export function UsersPage({ user: currentUser }: { user: User }) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null)
  const [error, setError] = useState('')

  const loadDirectory = useCallback(async () => {
    const [nextUsers, nextRoles] = await Promise.all([api.users.list(), api.roles()])
    setUsers(nextUsers)
    setRoles(nextRoles)
  }, [])

  useEffect(() => {
    void loadDirectory()
  }, [loadDirectory])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const form = new FormData(element)
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
      } else {
        await api.users.create({
          ...fields,
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
        })
      }
      await loadDirectory()
      setEditingUser(null)
      setError('')
      element.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer cet utilisateur.')
    }
  }

  async function remove(userToRemove: DirectoryUser) {
    if (!window.confirm(`Supprimer le compte de ${userToRemove.firstName} ${userToRemove.lastName} ?`)) return
    try {
      await api.users.delete(userToRemove.id)
      await loadDirectory()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de supprimer cet utilisateur.')
    }
  }

  const canEditForm = editingUser
    ? can(currentUser, 'user', 'update')
    : can(currentUser, 'user', 'create')

  return (
    <>
      <h2>Utilisateurs</h2>
      {canEditForm && (
        <form className="form" key={editingUser?.id ?? 'new-user'} onSubmit={(e) => void submit(e)}>
          <h3>{editingUser ? `Modifier ${editingUser.firstName} ${editingUser.lastName}` : 'Créer un utilisateur'}</h3>
          <label>
            Prénom <input name="firstName" defaultValue={editingUser?.firstName} required />
          </label>
          <label>
            Nom <input name="lastName" defaultValue={editingUser?.lastName} required />
          </label>
          {!editingUser && (
            <>
              <label>
                E-mail <input name="email" type="email" required />
              </label>
              <label>
                Mot de passe initial <input name="password" type="password" minLength={12} required />
              </label>
            </>
          )}
          <fieldset>
            <legend>Rôles</legend>
            {roles.map((role) => (
              <label key={role.id}>
                <input
                  type="checkbox"
                  name="roleIds"
                  value={role.id}
                  defaultChecked={editingUser?.roles.some((entry) => entry.role.id === role.id) ?? false}
                />
                {role.name}
              </label>
            ))}
          </fieldset>
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
            {editingUser && <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>Annuler</button>}
            <button type="submit">{editingUser ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
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
                  {can(currentUser, 'user', 'update') && <button type="button" onClick={() => setEditingUser(userRow)}>Modifier</button>}{' '}
                  {can(currentUser, 'user', 'delete') && userRow.id !== currentUser.id && (
                    <button type="button" onClick={() => void remove(userRow)}>Supprimer</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function ProductsPage({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([])
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    void loadProducts()
  }, [])

  async function loadProducts() {
    setProducts(await api.products.list())
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const status = String(form.get('status') || 'ACTIVE') as Product['status']
    const data = {
      sku: String(form.get('sku')),
      name: String(form.get('name')),
      description: String(form.get('description') ?? ''),
      unitPrice: Number(form.get('unitPrice')),
      status,
    }

    if (editingProduct) {
      await api.products.update(editingProduct.id, data)
    } else {
      await api.products.create(data)
    }
    
    await loadProducts()
    event.currentTarget.reset()
    setIsAdding(false)
    setEditingProduct(null)
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
                <button type="button" className="btn-secondary" onClick={() => { setIsAdding(false); setEditingProduct(null); }}>Annuler</button>
                <button type="submit">Enregistrer</button>
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
    const res = await api.importLeads(rows)
    setResult(
      res.results
        .map((row) => `Ligne ${row.index + 1} : ${row.status}${row.message ? ` (${row.message})` : ''}`)
        .join('\n'),
    )
  }

  return (
    <>
      <h2>Import de prospects</h2>
      <p>Une ligne par prospect, colonnes séparées par un point-virgule : prénom ; nom ; entreprise ; e-mail ; téléphone.</p>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Données
          <textarea name="csv" rows={8} required placeholder="Awa;Diallo;SESUR;awa@sesur.bj;+22990000000" />
        </label>
        <button type="submit">Importer</button>
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await changePassword(String(form.get('currentPassword')), String(form.get('newPassword')))
    setMessage('Mot de passe mis à jour. Reconnectez-vous.')
    onPasswordChanged()
  }
  return (
    <>
      <h2>Mon profil</h2>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Mot de passe actuel <input name="currentPassword" type="password" required />
        </label>
        <label>
          Nouveau mot de passe <input name="newPassword" type="password" minLength={12} required />
        </label>
        <button type="submit">Changer le mot de passe</button>
      </form>
      {message && <p>{message}</p>}
    </>
  )
}
