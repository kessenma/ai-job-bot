import type { ATSHandler } from './base.ts'
import { joinHandler } from './join.ts'
import { recruiteeHandler } from './recruitee.ts'
import { workdayHandler } from './workday.ts'

export { detectCaptcha, fillField, uploadFile } from './base.ts'
export type { ATSHandler, ApplyProfile, ApplyResult, WorkExperienceEntry, EducationEntry } from './base.ts'

export const handlers: ATSHandler[] = [recruiteeHandler, joinHandler, workdayHandler]

export function getHandler(url: string): ATSHandler | undefined {
  return handlers.find((h) => h.canHandle(url))
}
