/**
 * Parses a raw job description into structured sections:
 * - companyInfo: introductory company information (usually at the top)
 * - skills: requirements, qualifications, skills (usually bulleted)
 * - pay: salary, compensation, hourly rate information
 * - other: everything else (responsibilities, benefits, etc.)
 */

// Known section header keywords (EN/DE) — used for both line-based and inline detection
const SECTION_KEYWORDS = [
  // Skills/requirements
  'Requirements', 'Qualifications', 'Skills', 'What You Bring', "What You'll Need",
  "What We're Looking For", 'Your Profile', 'Must-Have', 'Must Have', 'Nice-to-Have', 'Nice to Have',
  'Was du mitbringst', 'Dein Profil', 'Anforderungen', 'Qualifikationen',
  'Was wir erwarten', 'Das bringst du mit', 'Voraussetzungen',
  'Bonus / Optional Skills', 'Bonus Skills', 'Optional Skills',
  // Company info
  'About Us', 'About the Company', 'Who We Are', 'Our Company', 'Company Overview',
  'Über uns', 'Wer wir sind', 'Unser Unternehmen', 'Das sind wir',
  'Job Description', 'Description',
  // Pay/compensation
  'Compensation', 'Salary', 'Pay', 'Salary Range', 'Compensation Package',
  'Gehalt', 'Vergütung', 'Bezahlung',
  // Other (responsibilities, benefits, etc.)
  'Responsibilities', 'Key Responsibilities', "What You'll Do", 'Your Role', 'Tasks',
  'Benefits', 'Perks', 'What We Offer', 'How to Apply',
  'Aufgaben', 'Deine Aufgaben', 'Was wir bieten', 'Deine Rolle', 'Ihre Aufgaben',
  'Wir bieten', 'Our Offer', 'The Role', 'About the Role',
  'Role Summary',
]

// Lines that are page UI noise — strip these from parsed output
const NOISE_LINES = /^\s*(?:share this job|apply for this job|apply now|save job|print job|back to jobs?|← back)\s*$/i

// Build a regex that matches any keyword at the start of a line
const SKILLS_HEADERS = /^\s*(?:#{1,3}\s*)?(?:requirements|qualifications|skills|what you bring|what we'?re looking for|your profile|must.have|nice.to.have|bonus\s*\/?\s*optional\s*skills|was du mitbringst|dein profil|anforderungen|qualifikationen|was wir erwarten|das bringst du mit|voraussetzungen|what you'?ll need)\s*$/i

const COMPANY_HEADERS = /^\s*(?:#{1,3}\s*)?(?:about us|about the company|who we are|our company|company overview|über uns|wer wir sind|unser unternehmen|das sind wir|about \w+|job description|description)\s*$/i

const PAY_HEADERS = /^\s*(?:#{1,3}\s*)?(?:compensation|salary|pay|salary range|compensation package|gehalt|vergütung|bezahlung)\s*$/i

const OTHER_HEADERS = /^\s*(?:#{1,3}\s*)?(?:responsibilities|key responsibilities|what you'?ll do|your role|role summary|tasks|benefits|perks|what we offer|how to apply|aufgaben|deine aufgaben|was wir bieten|deine rolle|ihre aufgaben|wir bieten|our offer|the role|about the role)\s*$/i

function isBulletLine(line: string): boolean {
  return /^\s*(?:[-•*▪▸›➤◆]|\d+[.)]\s)/.test(line)
}

function looksLikeHeader(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 3 || trimmed.length > 80) return false
  if (SKILLS_HEADERS.test(trimmed) || COMPANY_HEADERS.test(trimmed) || PAY_HEADERS.test(trimmed) || OTHER_HEADERS.test(trimmed)) {
    return true
  }
  return false
}

/**
 * Pre-process raw text to ensure known section headers appear on their own lines.
 * This handles cases where innerText fails or text is concatenated like:
 * "...user experienceRequirementsBachelor's..."
 */
function preprocess(raw: string): string {
  let text = raw

  // Sort keywords longest-first to match "Key Responsibilities" before "Responsibilities"
  const sorted = [...SECTION_KEYWORDS].sort((a, b) => b.length - a.length)

  for (const keyword of sorted) {
    // Look for the keyword NOT already at the start of a line
    // Match: any non-whitespace char before the keyword (indicating concatenation)
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(\\S)(${escaped})`, 'g')
    text = text.replace(pattern, '$1\n$2')
  }

  return text
}

interface Section {
  type: 'company' | 'skills' | 'pay' | 'other' | 'unknown'
  lines: string[]
}

export interface ParsedDescription {
  skills: string | null
  companyInfo: string | null
  pay: string | null
  other: string | null
  language: 'en' | 'de' | 'unknown'
}

export function parseJobDescription(raw: string): ParsedDescription {
  if (!raw || raw.trim().length === 0) {
    return { skills: null, companyInfo: null, pay: null, other: null, language: 'unknown' }
  }

  const processed = preprocess(raw)
  // Filter out page UI noise lines
  const lines = processed.split('\n').filter((l) => !NOISE_LINES.test(l))
  const sections: Section[] = []
  let current: Section = { type: 'unknown', lines: [] }

  for (const line of lines) {
    const trimmed = line.trim()

    // Check if this line is a section header
    if (looksLikeHeader(trimmed)) {
      // Save current section if it has content
      if (current.lines.some((l) => l.trim().length > 0)) {
        sections.push(current)
      }

      // Determine section type from header
      let type: Section['type'] = 'other'
      if (SKILLS_HEADERS.test(trimmed)) type = 'skills'
      else if (COMPANY_HEADERS.test(trimmed)) type = 'company'
      else if (PAY_HEADERS.test(trimmed)) type = 'pay'
      else if (OTHER_HEADERS.test(trimmed)) type = 'other'

      current = { type, lines: [line] }
    } else {
      current.lines.push(line)
    }
  }

  // Push final section
  if (current.lines.some((l) => l.trim().length > 0)) {
    sections.push(current)
  }

  const language = detectLanguage(raw)

  // If we only got one "unknown" section (no headers detected), try heuristic splitting
  if (sections.length === 1 && sections[0].type === 'unknown') {
    const result = heuristicSplit(lines)
    return { ...result, pay: result.pay ?? extractPayFromText(raw), language }
  }

  // If the first section is "unknown", treat it as company info (intro before any headers)
  if (sections.length > 0 && sections[0].type === 'unknown') {
    sections[0].type = 'company'
  }

  // Merge sections by type
  const companyLines: string[] = []
  const skillsLines: string[] = []
  const payLines: string[] = []
  const otherLines: string[] = []

  for (const section of sections) {
    const target =
      section.type === 'company' ? companyLines :
      section.type === 'skills' ? skillsLines :
      section.type === 'pay' ? payLines :
      otherLines
    target.push(...section.lines)
  }

  // If no explicit pay section, try to extract salary mentions from the full text
  const pay = joinOrNull(payLines) ?? extractPayFromText(raw)

  return {
    skills: joinOrNull(skillsLines),
    companyInfo: joinOrNull(companyLines),
    pay,
    other: joinOrNull(otherLines),
    language,
  }
}

/** Fallback when no section headers are detected — use bullet patterns */
function heuristicSplit(lines: string[]): {
  skills: string | null
  companyInfo: string | null
  pay: string | null
  other: string | null
} {
  // Find the first run of bullet points (likely skills/requirements)
  let bulletStart = -1
  let bulletEnd = -1

  for (let i = 0; i < lines.length; i++) {
    if (isBulletLine(lines[i])) {
      if (bulletStart === -1) bulletStart = i
      bulletEnd = i
    } else if (bulletStart !== -1 && bulletEnd !== -1) {
      // Allow small gaps (1-2 blank lines between bullets)
      const gap = lines.slice(bulletEnd + 1, i).every((l) => l.trim() === '')
      if (!gap || i - bulletEnd > 3) {
        break
      }
    }
  }

  if (bulletStart === -1) {
    // No bullets found at all — put everything in "other"
    return {
      skills: null,
      companyInfo: null,
      pay: null,
      other: joinOrNull(lines),
    }
  }

  // Include the line before bullets as a potential header
  const headerLine = bulletStart > 0 ? bulletStart - 1 : bulletStart

  const companyLines = lines.slice(0, headerLine)
  const skillsLines = lines.slice(headerLine, bulletEnd + 1)
  const otherLines = lines.slice(bulletEnd + 1)

  return {
    skills: joinOrNull(skillsLines),
    companyInfo: joinOrNull(companyLines),
    pay: null,
    other: joinOrNull(otherLines),
  }
}

/** Extract salary/pay mentions from text using regex patterns */
function extractPayFromText(text: string): string | null {
  const patterns = [
    // €53,802 or €53.802 or EUR 53,802
    /(?:€|EUR)\s*[\d.,]+(?:\s*[-–]\s*(?:€|EUR)?\s*[\d.,]+)?(?:\s*(?:per\s+(?:year|month|hour|annum)|\/\s*(?:year|month|hour|yr|mo|hr)|p\.?a\.?|annually|monthly|hourly|brutto?|netto?|gross|net))?/gi,
    // $120,000 or USD 120,000
    /(?:\$|USD)\s*[\d.,]+(?:k)?(?:\s*[-–]\s*(?:\$|USD)?\s*[\d.,]+(?:k)?)?(?:\s*(?:per\s+(?:year|month|hour|annum)|\/\s*(?:year|month|hour|yr|mo|hr)|p\.?a\.?|annually|monthly|hourly))?/gi,
    // £50,000 or GBP 50,000
    /(?:£|GBP)\s*[\d.,]+(?:\s*[-–]\s*(?:£|GBP)?\s*[\d.,]+)?(?:\s*(?:per\s+(?:year|month|hour|annum)|\/\s*(?:year|month|hour|yr|mo|hr)|p\.?a\.?|annually|monthly|hourly))?/gi,
    // "salary of/is/from XX" or "annual salary"
    /(?:(?:minimum|base|annual|yearly|monthly)\s+)?(?:gross\s+)?salary\s+(?:of|is|from|:)\s*[^\n.]{5,80}/gi,
    // German: "Gehalt" or "Vergütung" mentions
    /(?:gehalt|vergütung|bezahlung)\s*(?::|von|ab|bis)?\s*[^\n.]{5,80}/gi,
    // "XX,000 - XX,000 EUR/USD/per year" standalone
    /\b\d{2,3}[.,]\d{3}\s*[-–]\s*\d{2,3}[.,]\d{3}\s*(?:EUR|USD|GBP|CHF|€|\$|£)(?:\s*(?:per\s+(?:year|month|annum)|p\.?a\.?|annually|brutto?|gross))?/gi,
  ]

  const matches: string[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        const trimmed = line.trim()
        if (trimmed.length > 0 && !matches.includes(trimmed)) {
          matches.push(trimmed)
        }
        break // one match per line is enough
      }
    }
  }

  return matches.length > 0 ? matches.join('\n') : null
}

/** Detect whether the description is primarily in English or German */
function detectLanguage(text: string): 'en' | 'de' | 'unknown' {
  const lower = text.toLowerCase()

  // German indicator words
  const deWords = ['und', 'wir', 'sind', 'dein', 'deine', 'unser', 'unsere', 'oder', 'für', 'mit', 'bei', 'eine', 'einem', 'einen', 'aufgaben', 'erfahrung', 'kenntnisse', 'anforderungen', 'bieten', 'suchen']
  // English indicator words
  const enWords = ['and', 'the', 'you', 'your', 'our', 'with', 'for', 'this', 'that', 'are', 'will', 'have', 'experience', 'requirements', 'responsibilities', 'looking', 'offer']

  let deScore = 0
  let enScore = 0

  for (const w of deWords) {
    const re = new RegExp(`\\b${w}\\b`, 'gi')
    const count = (lower.match(re) || []).length
    deScore += count
  }
  for (const w of enWords) {
    const re = new RegExp(`\\b${w}\\b`, 'gi')
    const count = (lower.match(re) || []).length
    enScore += count
  }

  if (deScore > enScore * 1.5) return 'de'
  if (enScore > deScore * 1.5) return 'en'
  if (enScore > deScore) return 'en'
  if (deScore > enScore) return 'de'
  return 'unknown'
}

function joinOrNull(lines: string[]): string | null {
  const text = lines.join('\n').trim()
  return text.length > 0 ? text : null
}
