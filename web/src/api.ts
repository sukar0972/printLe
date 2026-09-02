export type CurrentUser = { id: string; email: string; displayName: string; role: 'ADMIN' | 'OPERATOR' | 'MANAGER' | 'USER'; passwordChangeRequired?: boolean }
export type Job = { id: string; filename: string; sizeBytes: number; pages: number; copies: number; colorMode: string; duplexMode: string; status: string; createdAt: string; cupsJobId?: number; cupsQueue?: string; ippStateReasons?: string; submittedAt?: string; completedAt?: string; expiresAt?: string; printerId?: string; printerName?: string; estimatedCost?: number; costRateVersion?: number; pricedAt?: string; attempt: number; manualPhase?: string; oddCupsJobId?: number; evenCupsJobId?: number }
export type Quota = { limit: number; used: number; pending: number; remaining: number | null; exempt: boolean }
export type ManagedUser = { id: string; email: string; displayName: string; role: CurrentUser['role']; status: 'ACTIVE' | 'SUSPENDED'; monthlyPageQuota: number | null; quotaExempt: boolean; createdAt: string; lastSignedInAt?: string; passwordChangeRequired?: boolean }
export type Printer = { id: string; name: string; description?: string; status: 'ONLINE' | 'OFFLINE' | 'ERROR'; cupsQueue?: string; location?: string; enabled: boolean; maintenance: boolean; colorCapable: boolean; duplexCapable: boolean; mediaSupported?: string; stateReasons?: string; errorPolicy: 'ALLOW' | 'WARN' | 'BLOCK'; transport?: string; vendorId?: string; productId?: string; deviceSerial?: string; ieee1284DeviceId?: string; lastSeenAt?: string; monoPageRate: number; colorPageRate: number; rateVersion: number }
export type GroupMember = { id: string; email: string; displayName: string }
export type Group = { id: string; name: string; monthlyPageQuota: number | null; builtIn: boolean; members: GroupMember[] }
export type AclRule = { id?: string; principalType: 'USER' | 'GROUP'; principalId: string; permission: 'VIEW' | 'SUBMIT' | 'RELEASE_OWN' | 'RELEASE_ANY' | 'MANAGE' }
export type ReportJob = { id: string; completedAt: string; user: string; printer?: string; printedPages: number; colorMode: string; estimatedCost: number; rateVersion?: number }
export type Report = { completedJobs: number; printedPages: number; estimatedCost: number; jobs: ReportJob[] }
export type InstanceSettings = { defaultMonthlyPageQuota: number; quotaTimezone: string; heldJobTtlHours: number; completedRetentionHours: number; failedRetentionHours: number; maxCopies: number; maxPagesPerJob: number; colorPrintingAllowed: boolean; updatedAt: string }
export type Diagnostics = { database: string; storage: string; printNode: string; discoveredPrinters: number }

let csrfToken: string | undefined

async function csrf() {
  if (csrfToken) return csrfToken
  const response = await fetch('/api/auth/csrf', { credentials: 'include' })
  csrfToken = (await response.json()).token
  if (!csrfToken) throw new Error('Could not establish a secure session')
  return csrfToken
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-XSRF-TOKEN', await csrf())
  const response = await fetch(path, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? body.detail ?? `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  me: () => request<CurrentUser>('/api/auth/me'),
  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ email, password })
    const result = await request<{ authenticated: boolean }>('/api/auth/login', { method: 'POST', body })
    csrfToken = undefined
    return result
  },
  logout: async () => { await request<void>('/api/auth/logout', { method: 'POST' }); csrfToken = undefined },
  changePassword: (body: object) => request<void>('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  jobs: () => request<Job[]>('/api/jobs'),
  quota: () => request<Quota>('/api/jobs/quota'),
  upload: (form: FormData) => request<Job>('/api/jobs', { method: 'POST', body: form }),
  cancel: (id: string) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
  release: (id: string, printerId?: string) => request<Job>(`/api/jobs/${id}/release${printerId ? `?printerId=${encodeURIComponent(printerId)}` : ''}`, { method: 'POST' }),
  retry: (id: string) => request<Job>(`/api/jobs/${id}/retry`, { method: 'POST' }),
  flip: (id: string) => request<Job>(`/api/jobs/${id}/flip`, { method: 'POST' }),
  printers: () => request<Printer[]>('/api/printers'),
  syncPrinters: () => request<Printer[]>('/api/printers/sync', { method: 'POST' }),
  updatePrinter: (id: string, body: object) => request<Printer>(`/api/printers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  printerAcl: (id: string) => request<AclRule[]>(`/api/printers/${id}/acl`),
  replacePrinterAcl: (id: string, body: AclRule[]) => request<AclRule[]>(`/api/printers/${id}/acl`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  users: () => request<ManagedUser[]>('/api/admin/users'),
  createUser: (body: object) => request<ManagedUser>('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  updateUser: (id: string, body: object) => request<ManagedUser>(`/api/admin/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  resetUserPassword: (id: string, temporaryPassword: string) => request<void>(`/api/admin/users/${id}/password-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ temporaryPassword }) }),
  adjustQuota: (id: string, body: object) => request<void>(`/api/admin/users/${id}/quota-adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  groups: () => request<Group[]>('/api/admin/groups'),
  createGroup: (body: object) => request<Group>('/api/admin/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  updateGroup: (id: string, body: object) => request<Group>(`/api/admin/groups/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteGroup: (id: string) => request<void>(`/api/admin/groups/${id}`, { method: 'DELETE' }),
  addGroupMember: (groupId: string, userId: string) => request<void>(`/api/admin/groups/${groupId}/members/${userId}`, { method: 'PUT' }),
  removeGroupMember: (groupId: string, userId: string) => request<void>(`/api/admin/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  report: () => request<Report>('/api/admin/reports'),
  settings: () => request<InstanceSettings>('/api/admin/system/settings'),
  updateSettings: (body: object) => request<InstanceSettings>('/api/admin/system/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  diagnostics: () => request<Diagnostics>('/api/admin/system/diagnostics'),
}
