import { createServerFn } from '@tanstack/react-start'
import { loadJobs } from './jobs.server.ts'

export const getJobs = createServerFn({ method: 'GET' }).handler(async () => {
  return loadJobs()
})
