import { FormEvent, useEffect, useState } from 'react'
import { api, type AuditRow, type DirectoryUser, type Product, type Role } from '../api'
import { changePassword } from '../api'

export function UsersPage() {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  useEffect(() => {
    void api.users.list().then(setUsers)
    void api.roles().then(setRoles)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const roleId = String(form.get('roleId') ?? '')
    await api.users.create({
      firstName: form.get('firstName'),
      lastName: form.get('lastName'),
      email: form.get('email'),
      password: form.get('password'),
      roleIds: roleId ? [roleId] : [],
    })
    setUsers(await api.users.list())
    event.currentTarget.reset()
  }

  return (
    <>
      <h2>Utilisateurs</h2>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Prénom <input name="firstName" required />
        </label>
        <label>
          Nom <input name="lastName" required />
        </label>
        <label>
          E-mail <input name="email" type="email" required />
        </label>
        <label>
          Mot de passe initial <input name="password" type="password" minLength={12} required />
        </label>
        <label>
          Rôle
          <select name="roleId" defaultValue="">
            <option value="">Aucun</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Créer</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>E-mail</th>
            <th>Rôles</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                {user.firstName} {user.lastName}
              </td>
              <td>{user.email}</td>
              <td>{user.roles.map((entry) => entry.role.name).join(', ') || '—'}</td>
              <td>{user.isActive ? 'Actif' : 'Inactif'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  useEffect(() => {
    void api.products.list().then(setProducts)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await api.products.create({
      sku: form.get('sku'),
      name: form.get('name'),
      unitPrice: Number(form.get('unitPrice')),
    })
    setProducts(await api.products.list())
    event.currentTarget.reset()
  }

  return (
    <>
      <h2>Catalogue</h2>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Référence <input name="sku" required />
        </label>
        <label>
          Nom <input name="name" required />
        </label>
        <label>
          Prix <input name="unitPrice" type="number" min={0} step="0.01" required />
        </label>
        <button type="submit">Ajouter</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Nom</th>
            <th>Prix</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.sku}</td>
              <td>{product.name}</td>
              <td>{String(product.unitPrice)}</td>
              <td>{product.status}</td>
            </tr>
          ))}
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
