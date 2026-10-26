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

export interface SearchHit {
  type: 'LEAD' | 'CONTACT' | 'ORGANIZATION' | 'PRODUCT' | 'OPPORTUNITY'
  id: string
  title: string
  subtitle?: string | null
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
  bypassDuplicateWarning?: boolean
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

export type QuoteStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'

export interface QuoteItem {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  discount: number
  totalLine: number
}

export interface Quote {
  id: string
  quoteNumber: string
  organizationId: string
  contactId?: string | null
  status: QuoteStatus
  items: QuoteItem[]
  subTotal: number
  totalDiscount: number
  taxAmount: number
  totalTTC: number
  createdAt: string
  updatedAt: string
  createdBy: string
}
export interface QuoteApprovalDecisionDto {
  comments?: string;
}

export interface CreateQuoteDto {
  organizationId: string
  contactId?: string
  items: {
    productId: string
    quantity: number
    discount?: number
  }[]
  globalDiscount?: number
}

export interface UpdateQuoteDto {
  items?: {
    productId: string
    quantity: number
    discount?: number
  }[]
  globalDiscount?: number
}
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

export interface Opportunity {
  id: string
  name: string
  description: string | null
  amount: string | number
  probability: number
  expectedCloseDate: string | null
  stage: 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
  lostReason: string | null
  organizationId: string | null
  organization?: { id: string; name: string } | null
  contactId: string | null
  ownerUserId: string
  owner?: { id: string; firstName: string; lastName: string; teamId: string | null }
  createdByUserId: string
}

export interface CreateOpportunityDto {
  name: string
  description?: string
  amount?: string
  probability?: number
  expectedCloseDate?: string
  leadId?: string
  organizationId?: string
  contactId?: string
  ownerUserId?: string
}

export interface UpdateOpportunityDto extends Partial<CreateOpportunityDto> {}

export interface OpportunityListResponse {
  data: Opportunity[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface UpdateOpportunityStageDto {
  stage: Opportunity['stage']
  lostReason?: string
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type CalendarEventType = 'MEETING' | 'CALL' | 'REMINDER' | 'OTHER'
export type CalendarEventStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export interface CrmTask {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueAt: string | null
  completedAt: string | null
  assignedUserId: string | null
  assignedUser?: { id: string; firstName: string; lastName: string } | null
  createdBy?: { id: string; firstName: string; lastName: string }
  opportunity?: { id: string; name: string } | null
  organization?: { id: string; name: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  quote?: { id: string; number: string } | null
}

export interface CreateTaskDto {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  assignedUserId?: string | null
  opportunityId?: string | null
  organizationId?: string | null
  contactId?: string | null
  quoteId?: string | null
}

export type UpdateTaskDto = Partial<CreateTaskDto>

export interface TaskListResponse {
  data: CrmTask[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  type: CalendarEventType
  status: CalendarEventStatus
  startAt: string
  endAt: string
  allDay: boolean
  ownerUserId: string
  owner?: { id: string; firstName: string; lastName: string }
  opportunity?: { id: string; name: string } | null
  organization?: { id: string; name: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
}

export interface CreateCalendarEventDto {
  title: string
  description?: string | null
  type?: CalendarEventType
  startAt: string
  endAt: string
  allDay?: boolean
  ownerUserId?: string
  opportunityId?: string | null
  organizationId?: string | null
  contactId?: string | null
}

export type UpdateCalendarEventDto = Partial<CreateCalendarEventDto> & {
  status?: CalendarEventStatus
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface TicketComment {
  id: string
  body: string
  createdAt: string
  author: { id: string; firstName: string; lastName: string }
}

export interface TicketHistoryEntry {
  id: string
  action: string
  occurredAt: string
  actor?: { id: string; firstName: string; lastName: string } | null
}

export interface SupportTicket {
  id: string
  number: string
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  slaResponseDueAt: string | null
  slaResolutionDueAt: string | null
  escalatedAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  assignedUserId: string | null
  assignedUser?: { id: string; firstName: string; lastName: string } | null
  createdBy?: { id: string; firstName: string; lastName: string }
  organizationId: string | null
  organization?: { id: string; name: string } | null
  contactId: string | null
  contact?: { id: string; firstName: string; lastName: string } | null
  comments?: TicketComment[]
  history?: TicketHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface CreateTicketDto {
  title: string
  description?: string | null
  priority?: TicketPriority
  slaResponseDueAt?: string | null
  slaResolutionDueAt?: string | null
  assignedUserId?: string | null
  organizationId?: string | null
  contactId?: string | null
}

export type UpdateTicketDto = Partial<CreateTicketDto> & { status?: TicketStatus }
export type TicketListResponse = {
  data: SupportTicket[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type ContractStatus = 'ACTIVE' | 'TERMINATED'

export interface ContractRecord {
  id: string
  number: string
  name: string
  description: string | null
  value: string | number
  currency: string
  startsAt: string
  expiresAt: string
  status: ContractStatus
  organizationId: string
  organization?: { id: string; name: string; isClient: boolean }
  createdBy?: { id: string; firstName: string; lastName: string }
}

export interface CreateContractDto {
  name: string
  description?: string | null
  value: string
  currency?: string
  startsAt: string
  expiresAt: string
  organizationId: string
}

export type UpdateContractDto = Partial<CreateContractDto> & { status?: ContractStatus }
export type ContractListResponse = {
  data: ContractRecord[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export type IntegrationDeliveryStatus = 'QUEUED' | 'PROCESSING' | 'DELIVERED' | 'DEAD'
export interface IntegrationAttempt {
  attempt: number
  succeeded: boolean
  statusCode: number | null
  error: string | null
  occurredAt: string
}
export interface IntegrationDelivery {
  id: string
  eventType: string
  entityType: string
  entityId: string | null
  status: IntegrationDeliveryStatus
  attemptCount: number
  nextAttemptAt: string
  lastError: string | null
  responseStatus: number | null
  deliveredAt: string | null
  createdAt: string
  attempts: IntegrationAttempt[]
}
export interface IntegrationStatus {
  webhook: {
    configured: boolean
    endpoint: string | null
    signature: string
    retryMaxAttempts: number
  }
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
    update: (id: string, body: Record<string, unknown>) =>
      request<DirectoryUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  },
  opportunities: {
    list: (page = 1, limit = 20) =>
      request<OpportunityListResponse>(`/opportunities?page=${page}&limit=${limit}`),
    get: (id: string) => request<Opportunity>(`/opportunities/${id}`),
    create: (body: CreateOpportunityDto) =>
      request<Opportunity>('/opportunities', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateStage: (id: string, body: UpdateOpportunityStageDto) =>
      request<Opportunity>(`/opportunities/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  tasks: {
    list: (page = 1, limit = 50) =>
      request<TaskListResponse>(`/tasks?page=${page}&limit=${limit}`),
    create: (body: CreateTaskDto) =>
      request<CrmTask>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateTaskDto) =>
      request<CrmTask>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    list: (from: string, to: string) =>
      request<CalendarEvent[]>(`/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    create: (body: CreateCalendarEventDto) =>
      request<CalendarEvent>('/calendar/events', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateCalendarEventDto) =>
      request<CalendarEvent>(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/calendar/events/${id}`, { method: 'DELETE' }),
  },
  tickets: {
    list: (filters: Record<string, string | number | boolean | undefined> = {}) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') query.set(key, String(value))
      }
      return request<TicketListResponse>(`/tickets?${query.toString()}`)
    },
    get: (id: string) => request<SupportTicket>(`/tickets/${id}`),
    create: (body: CreateTicketDto) =>
      request<SupportTicket>('/tickets', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateTicketDto) =>
      request<SupportTicket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    addComment: (id: string, body: string) =>
      request<TicketComment>(`/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    setEscalated: (id: string, escalated: boolean) =>
      request<SupportTicket>(`/tickets/${id}/escalation`, { method: 'PATCH', body: JSON.stringify({ escalated }) }),
    delete: (id: string) => request<void>(`/tickets/${id}`, { method: 'DELETE' }),
  },
  contracts: {
    list: (filters: Record<string, string | number | undefined> = {}) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') query.set(key, String(value))
      }
      return request<ContractListResponse>(`/contracts?${query.toString()}`)
    },
    get: (id: string) => request<ContractRecord>(`/contracts/${id}`),
    create: (body: CreateContractDto) =>
      request<ContractRecord>('/contracts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateContractDto) =>
      request<ContractRecord>(`/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/contracts/${id}`, { method: 'DELETE' }),
  },
  integrations: {
    status: () => request<IntegrationStatus>('/integrations/status'),
    deliveries: () => request<IntegrationDelivery[]>('/integrations/deliveries'),
    replay: (id: string) =>
      request<{ id: string; status: IntegrationDeliveryStatus }>(`/integrations/deliveries/${id}/replay`, { method: 'POST' }),
  },
  
  quotes: {
    list: () => request<Quote[]>('/quotes'),
    get: (id: string) => request<Quote>(`/quotes/${id}`),
    create: (body: CreateQuoteDto) =>
      request<Quote>('/quotes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateQuoteDto) =>
      request<Quote>(`/quotes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
          submitForApproval: (id: string) =>
      request<Quote>(`/quotes/${id}/submit-for-approval`, {
        method: 'POST',
      }),

    approve: (id: string, body: QuoteApprovalDecisionDto) =>
      request<Quote>(`/quotes/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    reject: (id: string, body: QuoteApprovalDecisionDto) =>
      request<Quote>(`/quotes/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

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
  return user.permissions?.some((grant) => grant.resource === resource && grant.action === action) ?? false
}

export function candidatesOf(error: unknown): DuplicateCandidate[] {
  if (error instanceof ApiError && error.status === 409) {
    return (error.body?.candidates as DuplicateCandidate[]) || []
  }
  return []
}
