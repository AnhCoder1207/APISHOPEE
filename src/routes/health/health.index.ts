import { createRouter } from '../../lib/create-app.js'
import { healthHandler } from './health.handlers.js'
import { healthRoute } from './health.routes.js'

const router = createRouter().openapi(healthRoute, healthHandler)

export default router
