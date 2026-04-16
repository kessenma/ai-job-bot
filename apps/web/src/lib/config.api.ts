import { createServerFn } from '@tanstack/react-start'
import { getAllConfig, getConfigValue, setConfigValue, setConfigBatch, deleteConfigValue } from './config.server.ts'

export const getAppConfig = createServerFn({ method: 'GET' }).handler(async () => {
  return getAllConfig()
})

export const getAppConfigValue = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    return getConfigValue(data.key)
  })

export const setAppConfig = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; value: string }) => data)
  .handler(async ({ data }) => {
    await setConfigValue(data.key, data.value)
    return { ok: true }
  })

export const setAppConfigBatch = createServerFn({ method: 'POST' })
  .inputValidator((data: { entries: { key: string; value: string }[] }) => data)
  .handler(async ({ data }) => {
    await setConfigBatch(data.entries)
    return { ok: true }
  })

export const deleteAppConfig = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    await deleteConfigValue(data.key)
    return { ok: true }
  })
