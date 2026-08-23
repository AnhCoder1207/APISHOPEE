import { OpenAPIHono } from '@hono/zod-openapi'
import { ZodError } from 'zod'
import { AppError } from './errors'
import type { AppBindings, AppOpenAPI } from './types'

export function createRouter(): AppOpenAPI {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dữ liệu yêu cầu không hợp lệ',
              issues: result.error.issues,
            },
          },
          400,
        )
      }
    },
  })
}

export function createApp(): AppOpenAPI {
  const app = createRouter()

  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Không tìm thấy tài nguyên: ${c.req.path}`,
        },
      },
      404,
    )
  })

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        err.status,
      )
    }

    if (err instanceof ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu yêu cầu không hợp lệ',
            details: err.issues,
          },
        },
        422,
      )
    }

    const isDev = c.env?.NODE_ENV !== 'production'
    console.error('Unhandled application error', {
      name: err.name,
      message: err.message,
      stack: isDev ? err.stack : undefined,
    })
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: isDev ? err.message || 'Đã xảy ra lỗi máy chủ nội bộ' : 'Đã xảy ra lỗi máy chủ nội bộ',
          stack: isDev ? err.stack : undefined,
        },
      },
      500,
    )
  })

  return app
}
