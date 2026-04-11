import { createMiddleware } from 'hono/factory'
import { Env } from '../index'
import { verifyJWT, getSessionCookie, getSession, clearSessionCookie } from '../lib/auth'

export type AuthVariables = {
  userId: string
  email: string
  role: string
  tier: string
  sessionId: string
}

// Helper: return 401 JSON for API routes, redirect for page routes.
// Use full URL pathname: when this app is mounted under e.g. /api/auth, c.req.path
// is often the stripped path (/check), not /api/auth/check — so startsWith('/api/') would be wrong.
function authFailResponse(c: any, status: 401 | 403 = 401, message = 'Valid session required') {
  let pathname = '/'
  try {
    pathname = new URL(c.req.url).pathname
  } catch {
    pathname = typeof c.req.path === 'string' ? c.req.path : '/'
  }
  if (pathname.startsWith('/api/')) {
    return c.json({ error: 'Unauthorized', message }, status)
  } else {
    return c.redirect('/login')
  }
}

export const authMiddleware = createMiddleware<{
  Bindings: Env
  Variables: AuthVariables
}>(async (c, next) => {
  const token = getSessionCookie(c)

  // No cookie present
  if (!token) {
    return authFailResponse(c)
  }

  // Validate JWT signature
  const payload = await verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) {
    clearSessionCookie(c)
    return authFailResponse(c)
  }

  // Check KV session exists
  const session = await getSession(c.env.KV, payload.sessionId)
  if (!session) {
    clearSessionCookie(c)
    return authFailResponse(c)
  }

  // Check user_status = 'active'
  if (session.userStatus !== 'active') {
    clearSessionCookie(c)
    return authFailResponse(c)
  }

  // Check access_revoked_at IS NULL in D1
  const user = await c.env.DB.prepare(
    'SELECT access_revoked_at FROM users WHERE id = ?'
  ).bind(payload.userId).first<{ access_revoked_at: string | null }>()

  if (!user || user.access_revoked_at !== null) {
    clearSessionCookie(c)
    return authFailResponse(c)
  }

  // All checks passed — set context variables
  c.set('userId', payload.userId)
  c.set('email', payload.email)
  c.set('role', payload.role)
  c.set('tier', payload.tier)
  c.set('sessionId', payload.sessionId)

  await next()
})

export const adminMiddleware = createMiddleware<{
  Bindings: Env
  Variables: AuthVariables
}>(async (c, next) => {
  const role = c.get('role')
  if (role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
