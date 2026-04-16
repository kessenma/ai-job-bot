import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { searchRouter } from './search/router'
import { scrapeRouter } from './scrape/router'
import { applyRouter } from './apply/router'
import { handlers } from './apply/handlers/index.ts'
import { eventBus } from './shared/event-bus'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

// Generic SSE stream endpoint — any flow that emits to the event bus can be observed here
app.get('/stream/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  return streamSSE(c, async (stream) => {
    let done = false
    const unsub = eventBus.subscribe(sessionId, async (event) => {
      try {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event), id: String(event.timestamp) })
      } catch { /* stream closed */ }
      if (event.type === 'done' || event.type === 'error') done = true
    })
    while (!done && !c.req.raw.signal.aborted) {
      await stream.sleep(500)
    }
    unsub()
  })
})

app.get('/handlers', (c) => {
  return c.json(handlers.map((h) => h.name))
})

app.route('/', searchRouter)
app.route('/', scrapeRouter)
app.route('/', applyRouter)

const port = Number(process.env.PORT || 8084)
console.log(`Playwright service listening on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
