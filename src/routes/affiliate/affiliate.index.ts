import { createRouter } from '../../lib/create-app.js'
import { conversionReportsHandler, convertLinkHandler } from './affiliate.handlers.js'
import { conversionReportsRoute, convertLinkRoute } from './affiliate.routes.js'

const router = createRouter()
  .openapi(convertLinkRoute, convertLinkHandler)
  .openapi(conversionReportsRoute, conversionReportsHandler)

export default router
