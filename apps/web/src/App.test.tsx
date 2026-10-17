import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

const USER = {
  id: '01a145bd-8ea8-7612-b61e-840261588c56',
  email: 'awa.kone@sesur.bj',
  firstName: 'Awa',
  lastName: 'Koné',
  roles: [],
}

/** `proxyError` : réponse vide en text/plain, comme le proxy Vite quand l'API est arrêtée. */
type Route = { status: number; body?: unknown; proxyError?: true }

function json({ status, body, proxyError }: Route): Response {
  if (proxyError) return new Response(null, { status, headers: { 'Content-Type': 'text/plain' } })
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Simule l'API : chaque route renvoie la prochaine réponse de sa file. */
function mockApi(routes: Record<string, Route[]>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const next = routes[key]?.shift()
    if (!next) throw new Error(`appel inattendu : ${key}`)
    return json(next)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const HEALTH = { 'GET /api/health': [{ status: 200, body: { status: 'ok' } }] }
const UNAUTHORIZED = { status: 401, body: { message: 'Authentification requise' } }

function renderApp() {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Adresse e-mail'), email)
  await user.type(screen.getByLabelText('Mot de passe'), password)
  await user.click(screen.getByRole('button', { name: 'Se connecter' }))
  return user
}

describe('Connexion', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    cleanup()
  })

  it('affiche le formulaire quand aucune session n’est ouverte', async () => {
    mockApi({ 'GET /api/auth/me': [UNAUTHORIZED] })
    renderApp()
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy()
    expect(screen.queryByText('Mes priorités')).toBeNull()
  })

  it('ouvre directement l’espace de travail si la session est valide', async () => {
    mockApi({ 'GET /api/auth/me': [{ status: 200, body: { user: USER } }], ...HEALTH })
    renderApp()
    expect(await screen.findByText('Awa Koné')).toBeTruthy()
    expect(screen.queryByLabelText('Mot de passe')).toBeNull()
  })

  it('envoie les identifiants et affiche l’espace de travail après connexion', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': [UNAUTHORIZED],
      'POST /api/auth/login': [{ status: 200, body: { user: USER } }],
      ...HEALTH,
    })
    renderApp()
    await fillAndSubmit('awa.kone@sesur.bj', 'une phrase de passe solide')

    expect(await screen.findByText('Awa Koné')).toBeTruthy()
    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login')
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      email: 'awa.kone@sesur.bj',
      password: 'une phrase de passe solide',
    })
  })

  it('affiche « Identifiants invalides » et vide le mot de passe en cas de refus', async () => {
    mockApi({
      'GET /api/auth/me': [UNAUTHORIZED],
      'POST /api/auth/login': [{ status: 401, body: { message: 'Identifiants invalides' } }],
    })
    renderApp()
    await fillAndSubmit('awa.kone@sesur.bj', 'mauvais mot de passe')

    expect((await screen.findByRole('alert')).textContent).toBe('Identifiants invalides.')
    expect((screen.getByLabelText('Mot de passe') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Awa Koné')).toBeNull()
  })

  it('signale un serveur injoignable', async () => {
    mockApi({ 'GET /api/auth/me': [UNAUTHORIZED] })
    renderApp()
    await screen.findByLabelText('Adresse e-mail')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await fillAndSubmit('awa.kone@sesur.bj', 'une phrase de passe solide')

    expect((await screen.findByRole('alert')).textContent).toMatch(/serveur est injoignable/)
  })

  it('distingue une erreur interne de l’API d’une API arrêtée derrière le proxy', async () => {
    mockApi({
      'GET /api/auth/me': [UNAUTHORIZED],
      'POST /api/auth/login': [
        { status: 500, body: { statusCode: 500, message: 'Internal server error' } },
        { status: 500, proxyError: true },
      ],
    })
    renderApp()
    const user = await fillAndSubmit('awa.kone@sesur.bj', 'une phrase de passe solide')
    expect((await screen.findByRole('alert')).textContent).toMatch(/Erreur interne du serveur/)

    await user.type(screen.getByLabelText('Mot de passe'), 'une phrase de passe solide')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/serveur est injoignable/)
  })

  it('signale une API injoignable dès le chargement, sans afficher le formulaire', async () => {
    mockApi({ 'GET /api/auth/me': [{ status: 500, proxyError: true }] })
    renderApp()
    expect((await screen.findByRole('alert')).textContent).toMatch(/serveur est injoignable/)
    expect(screen.queryByLabelText('Mot de passe')).toBeNull()
  })

  it('revient au formulaire après déconnexion', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': [{ status: 200, body: { user: USER } }],
      'POST /api/auth/logout': [{ status: 204 }],
      ...HEALTH,
    })
    renderApp()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/logout')).toBe(true)
  })
})
