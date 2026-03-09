import { createHmac } from 'node:crypto'
import { getCookie, setCookie, deleteCookie } from 'vinxi/http'

const COOKIE_NAME = 'session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getAppPassword(): string {
  const pw = process.env.APP_PASSWORD
  if (!pw) throw new Error('APP_PASSWORD env var is not set')
  return pw
}

function makeSessionToken(): string {
  return createHmac('sha256', getAppPassword()).update('session').digest('hex')
}

export function verifyPassword(password: string): boolean {
  return password === getAppPassword()
}

export function isSessionValid(): boolean {
  try {
    const cookie = getCookie(COOKIE_NAME)
    return cookie === makeSessionToken()
  } catch {
    return false
  }
}

export function createSession(): void {
  setCookie(COOKIE_NAME, makeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export function destroySession(): void {
  deleteCookie(COOKIE_NAME)
}
