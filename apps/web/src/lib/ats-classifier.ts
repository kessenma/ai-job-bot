import type { ATSPlatform } from './types.ts'

const ATS_PATTERNS: [RegExp, ATSPlatform][] = [
  [/recruitee\.com/, 'recruitee'],
  [/greenhouse\.io/, 'greenhouse'],
  [/lever\.co/, 'lever'],
  [/ashbyhq\.com/, 'ashby'],
  [/join\.com/, 'join'],
  [/personio\.de/, 'personio'],
  [/smartrecruiters\.com/, 'smartrecruiters'],
  [/workable\.com/, 'workable'],
  [/myworkdayjobs\.com/, 'workday'],
  [/linkedin\.com/, 'linkedin'],
]

export function classifyATS(url: string): ATSPlatform {
  for (const [pattern, platform] of ATS_PATTERNS) {
    if (pattern.test(url)) return platform
  }
  return 'unknown'
}

export const ATS_DIFFICULTY: Record<ATSPlatform, 'easy' | 'medium' | 'hard'> = {
  recruitee: 'easy',
  join: 'easy',
  lever: 'easy',
  personio: 'medium',
  greenhouse: 'medium',
  ashby: 'medium',
  smartrecruiters: 'medium',
  workable: 'medium',
  workday: 'hard',
  linkedin: 'hard',
  unknown: 'hard',
}
