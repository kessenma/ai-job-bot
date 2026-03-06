import type { ATSHandler } from './base.ts'
import { joinHandler } from './join.ts'
import { recruiteeHandler } from './recruitee.ts'

export { detectCaptcha, fillField, uploadFile } from './base.ts'
export type { ATSHandler } from './base.ts'

export const handlers: ATSHandler[] = [recruiteeHandler, joinHandler]

export function getHandler(url: string): ATSHandler | undefined {
  return handlers.find((h) => h.canHandle(url))
}
