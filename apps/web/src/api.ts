export interface PermissionGrant {
  resource: string
  action: string
  scope: 'OWN' | 'TEAM' | 'ALL'
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  teamId: string | null
  roles: string[]
  permissions: PermissionGrant[]
}

export interface DuplicateCandidate {
  id: string
  type: 'LEAD' | 'CONTACT' | 'ORGANIZATION'
  title: string
  score: number
  reason: string
}

export interface Lead {
  id: string
  firstName: string
  lastName: string
  companyName: string | null
  email: string | null
  phone: string | null
  source: string
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED'
  score: number
  assignedUser?: { id: string; firstName: string; lastName: string } | null
  organization?: { id: string; name: string; isClient: boolean } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  interactions?: Interaction[]
}

export interface CreateLeadDto {
  firstName: string
  lastName: string
  companyName?: string | null
  email?: string | null
  phone?: string | null
  source: string
}

export interface UpdateLeadDto extends Partial<CreateLeadDto> {
  status?: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED'
  score?: number
  assignedUserId?: string | null
}

export interface Organization {
  id: string
  name: string
  industry: string | null
  address: string | null
  phone: string | null
  email: string | null
  isClient: boolean
  status: string
  contacts?: Contact[]
  leads?: Lead[]
  interactions?: Interaction[]
  _count?: { contacts: number; leads: number; interactions: number }
}

export interface CreateOrganizationDto {
  name: string
  industry?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  isClient: boolean
  status: string
}

export interface UpdateOrganizationDto extends Partial<CreateOrganizationDto> {}

export interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  preferences: string | null
  organizationId: string | null
  organization?: { id: string; name: string; isClient: boolean } | null
  interactions?: Interaction[]
}

export interface CreateContactDto {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  jobTitle?: string | null
  organizationId?: string | null
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}

export interface Interaction {
  id: string
  channel: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'WHATSAPP'
  direction: 'INBOUND' | 'OUTBOUND'
  occurredAt: string
  summary: string
  user?: { firstName: string; lastName: string } | null
}

export interface Product {
  id: string
  sku: string
  name: string
  description: string | null
  unitPrice: string | number
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
}

export interface CreateProductDto {
  sku: string
  name: string
  description?: string | null
  unitPrice: number
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

export interface DirectoryUser {
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  team?: { id: string; name: string } | null
  roles: Array<{ role: { id: string; code: string; name: string } }>
}

export interface Role {
  id: string
  code: string
  name: string
}

export interface SearchHit {
  type: 'LEAD' | 'CONTACT' | 'ORGANIZATION' | 'PRODUCT'
  id: string
  title: string
  subtitle?: string | null
}

export interface AuditRow {
  id: string
  occurredAt: string
  action: string
  entityType: string
  entityId: string | null
  actor?: { email: string; firstName: string; lastName: string } | null
}

export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown> | null

  constructor(status: number, message: string, body: Record<string, unknown> | null = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

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
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (GATEWAY_STATUSES.includes(res.status) || (res.status >= 500 && body === null)) {
      throw new ApiUnreachableError()
    }
    const rawMessage = body?.message
    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : Array.isArray(rawMessage)
          ? rawMessage.filter((m): m is string => typeof m === 'string').join(', ')
          : res.statusText
    throw new ApiError(res.status, message, body)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

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

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<void>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export const api = {
  search: (q: string) => request<{ results: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`),
  leads: {
    list: (search = '') =>
      request<Lead[]>(
        `/leads${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    get: (id: string) => request<Lead>(`/leads/${id}`),
    create: (body: CreateLeadDto) =>
      request<Lead>('/leads', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateLeadDto) =>
      request<Lead>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    qualify: (id: string) => request<Lead>(`/leads/${id}/qualify`, { method: 'POST' }),
    convert: (id: string) =>
      request<{ lead: Lead; organization: Organization; contact: Contact }>(`/leads/${id}/convert`, { method: 'POST' }),
  },
  organizations: {
    list: (clientsOnly = false) =>
      request<Organization[]>(`/organizations${clientsOnly ? '?isClient=true' : ''}`),
    get: (id: string) => request<Organization>(`/organizations/${id}`),
    create: (body: CreateOrganizationDto) =>
      request<Organization>('/organizations', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateOrganizationDto) =>
      request<Organization>(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<void>(`/organizations/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    list: (orgId?: string, search = '') =>
      request<Contact[]>(
        `/contacts${orgId ? `?organizationId=${orgId}` : ''}${search ? `${orgId ? '&' : '?'}search=${encodeURIComponent(search)}` : ''}`,
      ),
    get: (id: string) => request<Contact>(`/contacts/${id}`),
    create: (body: CreateContactDto) =>
      request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateContactDto) =>
      request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<void>(`/contacts/${id}`, { method: 'DELETE' }),
  },
  interactions: {
    create: (body: Record<string, unknown>) =>
      request<Interaction>('/interactions', { method: 'POST', body: JSON.stringify(body) }),
  },
  products: {
    list: () => request<Product[]>('/products'),
    get: (id: string) => request<Product>(`/products/${id}`),
    create: (body: CreateProductDto) =>
      request<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateProductDto) =>
      request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  users: {
    list: () => request<DirectoryUser[]>('/users'),
    create: (body: Record<string, unknown>) =>
      request<DirectoryUser>('/users', { method: 'POST', body: JSON.stringify(body) }),
  },
  roles: () => request<Role[]>('/roles'),
  importLeads: (rows: Record<string, unknown>[]) =>
    request<{ results: Array<{ index: number; status: string; message?: string }> }>('/imports/leads', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
  merge: (body: { type: DuplicateCandidate['type']; keepId: string; dropId: string }) =>
    request('/duplicates/merge', { method: 'POST', body: JSON.stringify(body) }),
  audit: () => request<AuditRow[]>('/audit'),
}

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

export function can(user: User, resource: string, action: string): boolean {
  return user.permissions.some((grant) => grant.resource === resource && grant.action === action)
}

export function candidatesOf(error: unknown): DuplicateCandidate[] {
  if (error instanceof ApiError && error.status === 409) {
    return (error.body?.candidates as DuplicateCandidate[]) || []
  }
  return []
}
