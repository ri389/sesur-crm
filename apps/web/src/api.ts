export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  roles: string[]
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** L'API n'a pas pu être jointe : arrêtée, réseau coupé, ou proxy sans réponse de sa part. */
export class ApiUnreachableError extends Error {}

const GATEWAY_STATUSES = [502, 503, 504]

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiUnreachableError()
  }
  if (!res.ok) {
    // Les erreurs de l'API sont toujours en JSON : une erreur 5xx sans JSON vient du proxy (Vite, nginx).
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null
    if (GATEWAY_STATUSES.includes(res.status) || (res.status >= 500 && body === null)) {
      throw new ApiUnreachableError()
    }
    const message = typeof body?.message === 'string' ? body.message : res.statusText
    throw new ApiError(res.status, message)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Utilisateur de la session en cours, ou null si personne n'est connecté. */
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return (await request<{ user: User }>('/auth/me')).user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function login(email: string, password: string): Promise<User> {
  const { user } = await request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return user
}

export async function logout(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST' })
}

/** Message pour une panne côté serveur ; en développement, indique où chercher. */
export function describeServerError(error: unknown): string {
  if (error instanceof ApiUnreachableError) {
    return (
      'Le serveur est injoignable. Réessayez dans un instant.' +
      (import.meta.env.DEV ? ' En local : l’API est-elle lancée (pnpm dev:api) ?' : '')
    )
  }
  return (
    'Erreur interne du serveur. Si elle persiste, prévenez le service informatique.' +
    (import.meta.env.DEV ? ' En local : voir les erreurs dans le terminal de pnpm dev:api.' : '')
  )
}
