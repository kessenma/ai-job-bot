import { api } from './client'

export async function saveGoogleCredentials(clientId: string, clientSecret: string, redirectUri?: string): Promise<void> {
  await api('/api/config/google-credentials', {
    method: 'POST',
    body: JSON.stringify({ clientId, clientSecret, redirectUri }),
  })
}

export async function getConfigStatus(): Promise<{ googleConfigured: boolean; dataDir: string }> {
  return api('/api/config/status')
}
