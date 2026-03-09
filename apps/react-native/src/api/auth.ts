import { api } from './client'

export async function getAuthUrl(): Promise<string> {
  const res = await api<{ url: string }>('/api/auth/url')
  return res.url
}

export async function exchangeAuthCode(code: string): Promise<void> {
  await api('/api/auth/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function getAuthStatus(): Promise<{ configured: boolean; authenticated: boolean }> {
  return api('/api/auth/status')
}

export async function disconnectAuth(): Promise<void> {
  await api('/api/auth/disconnect', { method: 'POST' })
}
