import { createRouter } from '../lib/create-app.js'
import app from './app/app.index.js'
import admin from './admin/admin.index.js'
import auth from './auth/auth.index.js'
import health from './health/health.index.js'
import v1 from './v1/v1.index.js'

const router = createRouter()
  .route('/api', health)
  .route('/api/auth', auth)
  .route('/api/app', app)
  .route('/api/admin', admin)
  .route('/api/v1', v1)

export default router
