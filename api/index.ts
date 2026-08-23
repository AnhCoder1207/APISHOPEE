import type { ExecutionContext } from 'hono'
import app from '../src/index'
import type { AppBindings } from '../src/lib/types'

function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

export default async function handler(request: Request): Promise<Response> {
  const pendingTasks: Promise<unknown>[] = []
  const executionContext: ExecutionContext = {
    props: {},
    passThroughOnException() {},
    waitUntil(promise) {
      pendingTasks.push(promise)
    },
  }
  const bindings = {
    ...process.env,
    CLIENT_IP: getClientIp(request),
  } as AppBindings['Bindings']

  const response = await app.fetch(request, bindings, executionContext)
  await Promise.allSettled(pendingTasks)
  return response
}
