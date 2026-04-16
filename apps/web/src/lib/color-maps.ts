import type { ProbeStatus } from '#/lib/types.ts'

/** Application status → pill/badge colors */
export const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-500/15 text-blue-700',
  applied: 'bg-blue-500/15 text-blue-700',
  rejected: 'bg-red-500/15 text-red-700',
  rejection: 'bg-red-500/15 text-red-700',
  interview: 'bg-purple-500/15 text-purple-700',
  'action needed': 'bg-orange-500/15 text-orange-700',
  'not submitted': 'bg-gray-500/15 text-gray-600',
  expired: 'bg-gray-500/15 text-gray-600',
}

/** ATS difficulty level → pill colors */
export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/15 text-green-700',
  medium: 'bg-yellow-500/15 text-yellow-700',
  hard: 'bg-red-500/15 text-red-700',
}

/** URL probe status → badge colors */
export const PROBE_BADGE_STYLES: Record<ProbeStatus, string> = {
  loaded: 'bg-green-100 text-green-700',
  blocked: 'bg-amber-100 text-amber-700',
  expired: 'bg-gray-100 text-gray-500',
  error: 'bg-red-100 text-red-700',
}

/** Email classification → pill colors */
export const CLASSIFICATION_COLORS: Record<string, string> = {
  rejection: 'bg-red-100 text-red-700',
  interview: 'bg-purple-100 text-purple-700',
  applied: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-600',
}

/** Find the matching status color key for a job's applicationStatus string */
export function getStatusColorKey(status: string): string | undefined {
  const s = status.toLowerCase()
  return Object.keys(STATUS_COLORS).find((k) => s.includes(k))
}
