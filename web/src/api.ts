export type CurrentUser = { id: string; email: string; displayName: string; role: 'ADMIN' | 'OPERATOR' | 'MANAGER' | 'USER' }
export type Job = { id: string; filename: string; sizeBytes: number; pages: number; copies: number; colorMode: string; duplexMode: string; status: string; createdAt: string; cupsJobId?: number; cupsQueue?: string; ippStateReasons?: string; submittedAt?: string; completedAt?: string }
export type Quota = { limit: number; used: number; pending: number; remaining: number | null; exempt: boolean }
export type ManagedUser = { id: string; email: string; displayName: string; role: CurrentUser['role']; status: 'ACTIVE' | 'SUSPENDED'; monthlyPageQuota: number | null; quotaExempt: boolean; createdAt: string }

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
    return request<{ authenticated: boolean }>('/api/auth/login', { method: 'POST', body })
  },
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  jobs: () => request<Job[]>('/api/jobs'),
  quota: () => request<Quota>('/api/jobs/quota'),
  upload: (form: FormData) => request<Job>('/api/jobs', { method: 'POST', body: form }),
  cancel: (id: string) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
  release: (id: string) => request<Job>(`/api/jobs/${id}/release`, { method: 'POST' }),
  users: () => request<ManagedUser[]>('/api/admin/users'),
  createUser: (body: object) => request<ManagedUser>('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
}
