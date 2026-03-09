// Keywords that signal a rejection email
const REJECTION_KEYWORDS = [
  'unfortunately',
  'regret to inform',
  'regret',
  'will not be moving forward',
  'won\'t be moving forward',
  'aren\'t moving forward',
  'are not moving forward',
  'not be proceeding',
  'decided not to proceed',
  'not to move forward',
  'other candidates',
  'decided to go with',
  'move forward with other',
  'pursuing other candidates',
  'not the right fit',
  'not a match',
  'unable to offer',
  'will not be offering',
  'position has been filled',
  'after careful consideration',
  'we have decided to',
  'not selected',
  'did not select',
  'we will not',
  'we won\'t',
  'your application was not',
  'your application has not been',
  'thank you for your interest, however',
  'at this time we',
  'not able to move',
]

// Keywords that signal an interview/positive response
const INTERVIEW_KEYWORDS = [
  'schedule an interview',
  'schedule a call',
  'invite you to interview',
  'like to invite you',
  'would love to chat',
  'meet with our team',
  'technical interview',
  'coding challenge',
  'take-home assignment',
  'phone screen',
  'video interview',
  'meet the team',
  'would like to discuss your',
  'move forward with your',
  'moving forward with you',
  'pleased to inform',
  'happy to inform',
  'congratulations',
  'offer letter',
  'we\'d like to proceed',
  'availability for an interview',
  'book a time',
  'calendly',
]

// Keywords that signal an application confirmation/acknowledgment
const APPLICATION_KEYWORDS = [
  'thank you for applying',
  'thanks for applying',
  'thank you for your application',
  'thanks for your application',
  'application received',
  'application has been received',
  'application was received',
  'we have received your application',
  'we received your application',
  'application submitted',
  'application has been submitted',
  'successfully applied',
  'successfully submitted',
  'your application for',
  'confirming your application',
  'confirm your application',
  'application confirmation',
  'thank you for your interest in',
  'thanks for your interest in',
  'thank you for submitting',
  'thanks for submitting',
]

export type EmailClassification = 'rejection' | 'interview' | 'applied' | 'other'

export function classifyEmail(subject: string, snippet: string, body?: string): {
  classification: EmailClassification
  matchedKeywords: string[]
} {
  const text = `${subject} ${snippet} ${body ?? ''}`.toLowerCase()
  const matchedRejection: string[] = []
  const matchedInterview: string[] = []
  const matchedApplied: string[] = []

  for (const kw of REJECTION_KEYWORDS) {
    if (text.includes(kw)) matchedRejection.push(kw)
  }
  for (const kw of INTERVIEW_KEYWORDS) {
    if (text.includes(kw)) matchedInterview.push(kw)
  }
  for (const kw of APPLICATION_KEYWORDS) {
    if (text.includes(kw)) matchedApplied.push(kw)
  }

  // Priority: rejection > interview > applied > other
  if (matchedRejection.length > 0 && matchedRejection.length >= matchedInterview.length) {
    return { classification: 'rejection', matchedKeywords: matchedRejection }
  }
  if (matchedInterview.length > 0 && matchedApplied.length === 0) {
    return { classification: 'interview', matchedKeywords: matchedInterview }
  }
  if (matchedApplied.length > 0) {
    if (matchedInterview.length > matchedApplied.length) {
      return { classification: 'interview', matchedKeywords: matchedInterview }
    }
    return { classification: 'applied', matchedKeywords: matchedApplied }
  }
  return { classification: 'other', matchedKeywords: [] }
}

// Common legal suffixes that add noise to Gmail search
const COMPANY_SUFFIXES = /\b(gmbh|inc\.?|llc|ltd\.?|ag|se|co\.?|corp\.?|plc|s\.?a\.?|b\.?v\.?|n\.?v\.?|pty|e\.?v\.?|kg|ohg|ug)\b/gi

export function cleanCompanyName(name: string): string {
  return name.replace(COMPANY_SUFFIXES, '').replace(/[.,]+$/, '').trim()
}

export function emailMatchesCompany(from: string, subject: string, snippet: string, companyName: string): boolean {
  const cleaned = cleanCompanyName(companyName).toLowerCase()
  const text = `${from} ${subject} ${snippet}`.toLowerCase()

  if (cleaned.length <= 3) {
    const regex = new RegExp(`\\b${cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return regex.test(text)
  }

  return text.includes(cleaned)
}
