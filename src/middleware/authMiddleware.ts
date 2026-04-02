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

export const authMiddleware = createMiddleware<{
  Bindings: Env
  Variables: AuthVariables
}>(async (c, next) => {
  const token = getSessionCookie(c)

  // No cookie present
  if (!token) {
    return c.redirect('/login')
  }

  // Validate JWT signature
  const payload = await verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) {
    clearSessionCookie(c)
    return c.redirect('/login')
  }

  // Check KV session exists
  const session = await getSession(c.env.KV, payload.sessionId)
  if (!session) {
    clearSessionCookie(c)
    return c.redirect('/login')
  }

  // Check user_status = 'active'
  if (session.userStatus !== 'active') {
    clearSessionCookie(c)
    return c.redirect('/login')
  }

  // Check access_revoked_at IS NULL in D1
  const user = await c.env.DB.prepare(
    'SELECT access_revoked_at FROM users WHERE id = ?'
  ).bind(payload.userId).first<{ access_revoked_at: string | null }>()

  if (!user || user.access_revoked_at !== null) {
    clearSessionCookie(c)
    return c.redirect('/login')
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
