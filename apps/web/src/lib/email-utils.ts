/** Extract a clean email address from a raw string like "email (Name)" */
export function extractCleanEmail(raw: string): string {
  const match = raw.match(/[\w.+-]+@[\w.-]+\.\w+/)
  return match ? match[0].trim() : raw
}

/** Extract a display name from a LinkedIn profile URL */
export function extractRecruiterName(linkedinUrl?: string): string | undefined {
  if (!linkedinUrl) return undefined
  const slug = linkedinUrl.match(/linkedin\.com\/in\/([\w-]+)/)?.[1]
  if (!slug) return undefined
  return slug
    .split('-')
    .filter((s) => s.length > 1 && !/^\d+/.test(s))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}
