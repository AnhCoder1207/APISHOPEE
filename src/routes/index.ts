import { createRouter } from '../lib/create-app'
import app from './app/app.index'
import admin from './admin/admin.index'
import auth from './auth/auth.index'
import health from './health/health.index'
import v1 from './v1/v1.index'

const router = createRouter()
  .route('/api', health)
  .route('/api/auth', auth)
  .route('/api/app', app)
  .route('/api/admin', admin)
  .route('/api/v1', v1)

export default router
