
import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  ApiError,
  can,
  type Organization,
  type Product,
  type Quote,
  type User,
  type QuoteApprovalDecisionDto,
} from '../api'
import { MetricCards } from '../components/MetricCards'

const STATUS_LABEL: Record<Quote['status'], string> = {
  DRAFT: 'Brouillon',
  PENDING_APPROVAL: 'En attente de validation',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  SENT: 'Envoyé',
  ACCEPTED: 'Accepté',
  DECLINED: 'Refusé par le client',
  EXPIRED: 'Expiré',
  CANCELLED: 'Annulé',
}

const money = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(value)

const date = (value: string) =>
  new Intl.DateTimeFormat('fr-FR').format(new Date(value))

export function QuotesPage({ user }: { user: User }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [organizations, setOrganizations] = useState<Organization[]>([])

  const loadQuotes = () => {
    setLoading(true)
    api.quotes.list()
      .then(setQuotes)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les devis.'),
      )
      .finally(() => setLoading(false))
  }

 useEffect(() => {
  loadQuotes()

  api.organizations
    .list(true)
    .then(setOrganizations)
    .catch(() => {})
}, [])
  const filtered = quotes.filter((quote) =>
    `${quote.quoteNumber} ${quote.organizationId} ${STATUS_LABEL[quote.status]}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const visibleAmount = filtered.reduce((total, quote) => total + (Number(quote.totalTTC) || 0), 0)

  return (
    <>
      <header className="page-head">
        <div>
          <h2>Devis</h2>
          <p>Gestion des propositions commerciales.</p>
        </div>
        {can(user, 'quote', 'create') && (
          <a className="button" href="#/quotes/nouveau">+ Nouveau devis</a>
        )}
      </header>

      <MetricCards items={[
        { label: 'Devis affichés', value: filtered.length, detail: 'selon la recherche', tone: 'blue' },
        { label: 'En validation', value: filtered.filter((quote) => quote.status === 'PENDING_APPROVAL').length, detail: 'à traiter', tone: 'amber' },
        { label: 'Acceptés', value: filtered.filter((quote) => quote.status === 'ACCEPTED').length, detail: 'par les clients', tone: 'mint' },
        { label: 'Montant affiché', value: money(visibleAmount), detail: 'total TTC · XOF', tone: 'violet' },
      ]} />

      <div className="filters">
        <input
          className="filter"
          aria-label="Rechercher un devis"
          placeholder="Rechercher un numéro ou un statut..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p role="alert" className="form-error">{error}</p>}
      {loading ? <p>Chargement des devis...</p> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Statut</th>
                <th>Total TTC</th>
                <th>Créé le</th>
                
              </tr>
            </thead>
            <tbody>
              {filtered.map((quote) => (
               <tr key={quote.id}>
                <td>
                  <a href={`#/quotes/${quote.id}`}>
                   <strong>{quote.quoteNumber}</strong>
                  </a>
                </td>
                <td>{organizations.find((org) => org.id === quote.organizationId)?.name || quote.organizationId}</td>
                <td>{STATUS_LABEL[quote.status]}</td>
                 <td>
                  <strong>{money(quote.totalTTC)}</strong>
                </td>
                <td>{date(quote.createdAt)}</td>
               
              </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p>Aucun devis trouvé.</p>}
        </div>
      )}
    </>
  )
}

export function QuoteFormPage({ user }: { user: User }) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [contactId, setContactId] = useState('')
  const [items, setItems] = useState<Array<{ productId: string; quantity: number }>>([
    { productId: '', quantity: 1 },
  ])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.organizations.list(true)
      .then(setOrganizations)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les clients.'),
      )
    api.products.list()
      .then(setProducts)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les produits.'),
      )
  }, [])

  const activeProducts = products.filter((product) => product.status === 'ACTIVE')
  const selectedOrganization = organizations.find((org) => org.id === organizationId)
  const contacts = selectedOrganization?.contacts ?? []

  const estimatedTotal = items.reduce((sum, item) => {
    const product = activeProducts.find((p) => p.id === item.productId)
    return sum + (product ? Number(product.unitPrice) * item.quantity : 0)
  }, 0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    const validItems = items.filter((item) => item.productId && item.quantity > 0)
    if (!organizationId || validItems.length === 0) {
      setError('Sélectionnez un client et au moins un produit avec une quantité valide.')
      return
    }

    setSaving(true)
    try {
      const quote = await api.quotes.create({
        organizationId,
        ...(contactId ? { contactId } : {}),
        items: validItems,
      })
      window.location.hash = `#/quotes/${quote.id}`
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La création du devis a échoué.')
    } finally {
      setSaving(false)
    }
  }

  if (!can(user, 'quote', 'create')) {
    return <p role="alert">Vous n'avez pas la permission de créer un devis.</p>
  }

  return (
    <>
      <header className="page-head">
        <h2>Nouveau devis</h2>
        <a href="#/quotes">Retour aux devis</a>
      </header>

      {error && <p role="alert" className="form-error">{error}</p>}

      <form className="form-grid" onSubmit={submit}>
        <label className="stack">
          Client *
          <select
            required
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value)
              setContactId('')
            }}
          >
            <option value="">Sélectionner un client</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </label>

        <label className="stack">
          Contact
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Aucun contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName} {contact.lastName}
              </option>
            ))}
          </select>
        </label>

        <h3>Produits</h3>
        {items.map((item, index) => (
          <div className="form-grid" key={index}>
            <label className="stack">
              Produit *
              <select
                required
                value={item.productId}
                onChange={(e) =>
                  setItems((current) => current.map((row, i) =>
                    i === index ? { ...row, productId: e.target.value } : row,
                  ))
                }
              >
                <option value="">Sélectionner un produit</option>
                {activeProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — {money(Number(product.unitPrice))}
                  </option>
                ))}
              </select>
            </label>

            <label className="stack">
              Quantité *
              <input
                type="number"
                min="1"
                required
                value={item.quantity}
                onChange={(e) =>
                  setItems((current) => current.map((row, i) =>
                    i === index
                      ? { ...row, quantity: Math.max(1, Number(e.target.value)) }
                      : row,
                  ))
                }
              />
            </label>

            {items.length > 1 && (
              <button
                type="button"
                className="linkish"
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              >
                Supprimer cette ligne
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          className="button"
          onClick={() => setItems((current) => [...current, { productId: '', quantity: 1 }])}
        >
          + Ajouter un produit
        </button>

        <p><strong>Total estimé : {money(estimatedTotal)}</strong></p>
        <p>Le total définitif sera calculé par le serveur lors de l'enregistrement.</p>

        <div>
          <button type="submit" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Créer le devis'}
          </button>
          {' '}
          <a href="#/quotes">Annuler</a>
        </div>
      </form>
    </>
  )
}

export function QuoteDetailPage({
  id,
  user,
}: {
  id: string
  user: User
}) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [comments, setComments] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    let active = true

    api.quotes
      .get(id)
      .then((data) => {
        if (active) setQuote(data)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Impossible de charger ce devis.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id])
 async function handleQuoteAction(
    action: 'submit' | 'approve' | 'reject',
  ) {
    if (!quote || processing) return

    setProcessing(true)
    setError('')
    setActionMessage('')

    try {
      let updatedQuote: Quote

      if (action === 'submit') {
        updatedQuote = await api.quotes.submitForApproval(quote.id)
      } else {
        const body: QuoteApprovalDecisionDto = {
          comments: comments.trim() || undefined,
        }

        if (action === 'approve') {
          updatedQuote = await api.quotes.approve(quote.id, body)
        } else {
          if (!comments.trim()) {
            setError('Indique un motif avant de rejeter le devis.')
            return
          }

          updatedQuote = await api.quotes.reject(quote.id, body)
        }
      }

      setQuote(updatedQuote)
      setComments('')
      setActionMessage(
        action === 'submit'
          ? 'Le devis a été soumis à validation.'
          : action === 'approve'
            ? 'Le devis a été approuvé.'
            : 'Le devis a été rejeté et renvoyé pour correction.',
      )
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Une erreur est survenue lors du traitement du devis.",
      )
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <p>Chargement du devis...</p>

  if (error || !quote) {
    return (
      <>
        <h2>Devis introuvable</h2>
        <p role="alert" className="form-error">
          {error || 'Ce devis est introuvable.'}
        </p>
        <a href="#/quotes">Retour aux devis</a>
      </>
    )
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h2>Devis {quote.quoteNumber}</h2>
          <p>Créé le {date(quote.createdAt)}</p>
        </div>
        <a className="button" href="#/quotes">
          Retour aux devis
        </a>
      </header>

      <section className="card">
        <div className="card-body">
          <h3>Informations générales</h3>
          <p>
            <strong>Client :</strong> {quote.organizationId}
          </p>
          <p>
            <strong>Statut :</strong> {STATUS_LABEL[quote.status]}
          </p>
                    {quote.status === 'DRAFT' &&
            can(user, 'quote', 'update') && (
              <p>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => void handleQuoteAction('submit')}
                >
                  {processing ? 'Traitement...' : 'Soumettre à validation'}
                </button>
              </p>
            )}

          {quote.status === 'PENDING_APPROVAL' &&
            can(user, 'quote', 'approve') && (
              <div className="form-group">
                <label htmlFor="quote-approval-comments">
                  Commentaire (obligatoire pour un rejet)
                </label>
                <textarea
                  id="quote-approval-comments"
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Commentaire ou motif du rejet..."
                  disabled={processing}
                />

                <div className="form-actions">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => void handleQuoteAction('approve')}
                  >
                    Approuver
                  </button>

                  <button
                    type="button"
                    disabled={processing || !comments.trim()}
                    onClick={() => void handleQuoteAction('reject')}
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            )}

          {actionMessage && (
            <p role="status">{actionMessage}</p>
          )}

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
      {quote.status === 'DRAFT' && can(user, 'quote', 'update') && (
          <p>
            <a className="button" href={`#/quotes/${quote.id}/modifier`}>
            Modifier le devis
            </a>
          </p>
    )} 
          <p>
            <strong>Numéro :</strong> {quote.quoteNumber}
          </p>
          <p>
            <strong>Dernière modification :</strong> {date(quote.updatedAt)}
          </p>
        </div>
      </section>

      <h3>Produits du devis</h3>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Prix unitaire</th>
              <th>Quantité</th>
              <th>Remise</th>
              <th>Total ligne</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, index) => (
              <tr key={`${item.productId ?? item.productName}-${index}`}>
                <td>{item.productName}</td>
                <td>{money(item.unitPrice)}</td>
                <td>{item.quantity}</td>
                <td>{item.discount}%</td>
                <td>{money(item.totalLine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card">
        <div className="card-body">
          <h3>Récapitulatif financier</h3>
          <p>
            Sous-total : <strong>{money(quote.subTotal)}</strong>
          </p>
          <p>
            Remise totale : <strong>{money(quote.totalDiscount)}</strong>
          </p>
          <p>
            Taxes : <strong>{money(quote.taxAmount)}</strong>
          </p>
          <p>
            Total TTC : <strong>{money(quote.totalTTC)}</strong>
          </p>
        </div>
      </section>

      {quote.status === 'DRAFT' && can(user, 'quote', 'update') && (
        <p>
          Ce devis est encore en brouillon et peut être modifié.
        </p>
      )}
    </>
  )
}


export function QuoteEditPage({
  id,
  user,
}: {
  id: string
  user: User
}) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [contactId, setContactId] = useState('')
  const [items, setItems] = useState<
    { productId: string; quantity: number; discount: number }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    Promise.all([
      api.quotes.get(id),
      api.organizations.list(true),
      api.products.list(),
    ])
      .then(([loadedQuote, loadedOrganizations, loadedProducts]) => {
        if (!active) return

        setQuote(loadedQuote)
        setOrganizations(loadedOrganizations)
        setProducts(loadedProducts)
        setOrganizationId(loadedQuote.organizationId)
        setContactId(loadedQuote.contactId ?? '')
        setItems(
          loadedQuote.items.map((item) => ({
            productId: item.productId ?? '',
            quantity: item.quantity,
            discount: item.discount,
          })),
        )
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Impossible de charger le devis.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id])

  const estimatedTotal = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId)
    if (!product) return sum

    const subtotal = Number(product.unitPrice) * item.quantity
    const discounted = subtotal * (1 - item.discount / 100)

    return sum + discounted * 1.18
  }, 0)

  const updateItem = (
    index: number,
    changes: Partial<(typeof items)[number]>,
  ) => {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, ...changes } : item,
      ),
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!quote || quote.status !== 'DRAFT') {
      setError('Seuls les devis en brouillon peuvent être modifiés.')
      return
    }

    const validItems = items.filter(
      (item) =>
        item.productId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.discount) &&
        item.discount >= 0 &&
        item.discount <= 100,
    )

    if (validItems.length === 0) {
      setError('Ajoutez au moins un produit avec une quantité valide.')
      return
    }

    if (validItems.length !== items.length) {
      setError('Vérifiez les produits, quantités et remises.')
      return
    }

    setSaving(true)

    try {
      await api.quotes.update(id, {
        items: validItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          discount: item.discount,
        })),
      })

      window.location.hash = `#/quotes/${id}`
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'La modification du devis a échoué.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Chargement du devis...</p>

  if (error && !quote) {
    return (
      <>
        <h2>Impossible de modifier le devis</h2>
        <p role="alert" className="form-error">{error}</p>
        <a href="#/quotes">Retour aux devis</a>
      </>
    )
  }

  if (!quote) return <p>Devis introuvable.</p>

  if (quote.status !== 'DRAFT') {
    return (
      <>
        <h2>Modification impossible</h2>
        <p>Seuls les devis en brouillon peuvent être modifiés.</p>
        <a href={`#/quotes/${id}`}>Retour au devis</a>
      </>
    )
  }

  if (!can(user, 'quote', 'update')) {
    return <p role="alert">Vous n'avez pas la permission de modifier ce devis.</p>
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h2>Modifier le devis {quote.quoteNumber}</h2>
          <p>Modifiez les produits, quantités et remises.</p>
        </div>
        <a className="button" href={`#/quotes/${id}`}>Annuler</a>
      </header>

      {error && <p role="alert" className="form-error">{error}</p>}

      <form className="form-grid" onSubmit={submit}>
        <label className="stack">
          Client
          <select
            value={organizationId}
            disabled
            aria-label="Client du devis"
          >
            {organizations
              .filter((org) => org.id === organizationId)
              .map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            {!organizations.some((org) => org.id === organizationId) && (
              <option value={organizationId}>{organizationId}</option>
            )}
          </select>
        </label>

        <label className="stack">
          Contact
          <select value={contactId} disabled aria-label="Contact du devis">
            <option value="">{contactId || 'Aucun contact'}</option>
          </select>
        </label>

        <h3>Produits</h3>

        {items.map((item, index) => (
          <div className="form-grid" key={`${index}-${item.productId}`}>
            <label className="stack">
              Produit
              <select
                required
                value={item.productId}
                onChange={(e) =>
                  updateItem(index, { productId: e.target.value })
                }
              >
                <option value="">Sélectionner un produit</option>
                {products
                  .filter(
                    (product) =>
                      product.status === 'ACTIVE' ||
                      product.id === item.productId,
                  )
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {money(Number(product.unitPrice))}
                    </option>
                  ))}
              </select>
            </label>

            <label className="stack">
              Quantité
              <input
                type="number"
                min="1"
                step="1"
                required
                value={item.quantity}
                onChange={(e) =>
                  updateItem(index, {
                    quantity: Number(e.target.value),
                  })
                }
              />
            </label>

            <label className="stack">
              Remise (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={item.discount}
                onChange={(e) =>
                  updateItem(index, {
                    discount: Number(e.target.value),
                  })
                }
              />
            </label>

            <button
              type="button"
              className="linkish"
              onClick={() =>
                setItems((current) =>
                  current.filter((_, i) => i !== index),
                )
              }
            >
              Supprimer
            </button>
          </div>
        ))}

        <button
          type="button"
          className="button"
          onClick={() =>
            setItems((current) => [
              ...current,
              { productId: '', quantity: 1, discount: 0 },
            ])
          }
        >
          + Ajouter un produit
        </button>

        <p>
          Total TTC estimé, taxes incluses à 18 % :
          {' '}
          <strong>{money(estimatedTotal)}</strong>
        </p>
        <p>Le montant définitif sera recalculé par le serveur.</p>

        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </button>
      </form>
    </>
  )
}
