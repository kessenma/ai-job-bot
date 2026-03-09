import { createHmac } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const SESSION_PATH = resolve(DATA_DIR, 'uploads', '.session-token')
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

function getAppPassword(): string {
  const pw = process.env.APP_PASSWORD
  if (!pw) throw new Error('APP_PASSWORD env var is not set')
  return pw
}

export function verifyPassword(password: string): boolean {
  return password === getAppPassword()
}

export function isSessionValid(): boolean {
  try {
    if (!existsSync(SESSION_PATH)) return false
    const data = JSON.parse(readFileSync(SESSION_PATH, 'utf-8'))
    const expected = createHmac('sha256', getAppPassword()).update('session').digest('hex')
    if (data.token !== expected) return false
    if (Date.now() - data.createdAt > SESSION_MAX_AGE) {
      unlinkSync(SESSION_PATH)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function createSession(): void {
  const token = createHmac('sha256', getAppPassword()).update('session').digest('hex')
  writeFileSync(SESSION_PATH, JSON.stringify({ token, createdAt: Date.now() }))
}

export function destroySession(): void {
  if (existsSync(SESSION_PATH)) {
    unlinkSync(SESSION_PATH)
  }
}
