import { z } from 'zod'
import { createRouter } from '../../lib/create-app.js'
import { requireApiKey } from '../../lib/auth.js'
import { AppError } from '../../lib/errors.js'
import { performConversionReport, performLinkConversion } from '../../services/affiliate-operations.js'

const subIdSchema = z.string().max(100).regex(/^[A-Za-z0-9]*$/, 'Sub ID chỉ được chứa chữ và số').optional()

const convertSchema = z.object({
  connectionId: z.string().uuid().optional(),
  originalLinks: z.array(z.string().url()).min(1).max(5),
  subId1: subIdSchema,
  subId2: subIdSchema,
  subId3: subIdSchema,
  subId4: subIdSchema,
  subId5: subIdSchema,
})

const reportSchema = z.object({
  connectionId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.union([z.literal(20), z.literal(40), z.literal(100)]).default(20),
  page: z.number().int().min(1).default(1),
  orderId: z.string().max(100).optional(),
  status: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
})

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Dữ liệu gửi lên chưa hợp lệ', parsed.error.issues)
  return parsed.data
}

const router = createRouter()

router.options('*', (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Max-Age', '86400')
  return c.body(null, 204)
})

router.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  await next()
})
router.use('*', requireApiKey)

router.post('/affiliate/convert-link', async (c) => {
  const input = await parseBody(c.req.raw, convertSchema)
  return c.json({ success: true, data: await performLinkConversion(c, input) })
})

router.post('/affiliate/conversion-reports', async (c) => {
  const input = await parseBody(c.req.raw, reportSchema)
  return c.json({ success: true, data: await performConversionReport(c, input) })
})

export default router
