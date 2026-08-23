import type { AppRouteHandler } from '../../lib/types.js'
import type { HealthRoute } from './health.routes.js'

export const healthHandler: AppRouteHandler<HealthRoute> = (c) => {
  return c.json(
    {
      status: 'ok',
      environment: c.env?.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
    200,
  )
}
