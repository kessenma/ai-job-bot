import { createServerFn } from '@tanstack/react-start'
import {
  isSheetsConfigured,
  getSheetUrl,
  saveSheetUrl,
  clearSheetUrl,
  debugSheetData,
} from './sheets.server.ts'
import { isAuthenticated } from './gmail.server.ts'

export const getSheetsStatus = createServerFn({ method: 'GET' }).handler(() => {
  return {
    configured: isSheetsConfigured(),
    authenticated: isAuthenticated(),
    sheetUrl: getSheetUrl(),
  }
})

export const setSheetsUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => data)
  .handler(({ data }) => {
    saveSheetUrl(data.url)
    return { success: true }
  })

export const removeSheetsUrl = createServerFn({ method: 'POST' }).handler(() => {
  clearSheetUrl()
  return { success: true }
})

export const getSheetDebug = createServerFn({ method: 'GET' }).handler(async () => {
  return debugSheetData()
})
