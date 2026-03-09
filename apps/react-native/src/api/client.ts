const DEFAULT_PORT = 3001

let serverPort: number = DEFAULT_PORT

export function setServerPort(port: number) {
  serverPort = port
}

export function getBaseUrl(): string {
  return `http://localhost:${serverPort}`
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}
