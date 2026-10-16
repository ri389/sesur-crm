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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown }
    const message = typeof body.message === 'string' ? body.message : res.statusText
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
