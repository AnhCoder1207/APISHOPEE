import { serve, type HttpBindings } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config } from 'dotenv'
import { Hono, type ExecutionContext } from 'hono'
import workerApp from './index'
import { closeDatabases } from './lib/db'
import type { AppBindings } from './lib/types'

const envFile = process.env.ENV_FILE || (process.env.NODE_ENV === 'development' ? '.dev.vars' : '.env.production')
config({ path: envFile, quiet: true })

const app = new Hono<AppBindings>()
const staticFiles = serveStatic<AppBindings>({
  root: './public',
  onFound: (path, c) => {
    const revalidate = path.endsWith('index.html') || path.endsWith('app.js') || path.endsWith('styles.css')
    c.header('Cache-Control', revalidate ? 'no-cache' : 'public, max-age=3600')
  },
})
const spaFallback = serveStatic<AppBindings>({
  path: './public/index.html',
  onFound: (_path, c) => c.header('Cache-Control', 'no-cache'),
})

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('X-Frame-Options', 'DENY')
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  )
  await next()
})
app.use('*', async (c, next) => {
  if (!['GET', 'HEAD'].includes(c.req.method)) return next()
  return staticFiles(c, next)
})
app.route('/', workerApp)
app.get('*', spaFallback)

const runtimeBindings = { ...process.env } as AppBindings['Bindings']

function getClientIp(request: Request, bindings: HttpBindings): string {
  if (runtimeBindings.TRUST_PROXY === 'true') {
    const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    if (forwarded) return forwarded

    const realIp = request.headers.get('X-Real-IP')?.trim()
    if (realIp) return realIp
  }

  return bindings.incoming.socket.remoteAddress || 'unknown'
}

function createExecutionContext(): ExecutionContext {
  return {
    props: {},
    passThroughOnException() {},
    waitUntil(promise) {
      void promise.catch((error) => console.error('Background task failed', error))
    },
  }
}

const port = Number(process.env.PORT || 8787)
const hostname = process.env.HOST || '0.0.0.0'
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const server = serve(
  {
    hostname,
    port,
    fetch: (request, nodeBindings) =>
      app.fetch(
        request,
        { ...runtimeBindings, CLIENT_IP: getClientIp(request, nodeBindings as HttpBindings) },
        createExecutionContext(),
      ),
  },
  (info) => console.log(`CamLink listening on http://${hostname}:${info.port}`),
)

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down`)
  const forceExitTimer = setTimeout(() => {
    if ('closeAllConnections' in server) server.closeAllConnections()
    process.exit(1)
  }, 5_000)
  forceExitTimer.unref()
  server.close(async (error) => {
    clearTimeout(forceExitTimer)
    await closeDatabases()
    if (error) {
      console.error('Failed to stop HTTP server', error)
    }
    process.exit(error ? 1 : 0)
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
