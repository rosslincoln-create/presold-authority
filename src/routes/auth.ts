import { Hono } from 'hono'
import { Env } from '../index'
import {
  hashPassword, verifyPassword, createJWT, generateId,
  setSessionCookie, clearSessionCookie, getSessionCookie,
  verifyJWT, createSession, deleteSession, deleteAllUserSessions
} from '../lib/auth'
import { authMiddleware } from '../middleware/authMiddleware'

const auth = new Hono<{ Bindings: Env }>()

// ─── POST /api/auth/activate ──────────────────────────────────────────────────

auth.post('/activate', async (c) => {
  try {
    const { token, password } = await c.req.json<{ token: string; password: string }>()

    if (!token || !password) {
      return c.json({ error: 'Token and password are required' }, 400)
    }

    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400)
    }

    // Look up activation token in KV
    const tokenData = await c.env.KV.get(`activation:${token}`)
    if (!tokenData) {
      return c.json({ error: 'Activation link is invalid or has expired. Please contact support.' }, 400)
    }

    const { email, expiresAt } = JSON.parse(tokenData) as {
      email: string
      stripeSessionId: string
      expiresAt: string
    }

    // Check token hasn't expired
    if (new Date(expiresAt) < new Date()) {
      await c.env.KV.delete(`activation:${token}`)
      return c.json({ error: 'Activation link has expired. Please contact support.' }, 400)
    }

    // Find the pending user
    const user = await c.env.DB.prepare(
      'SELECT id, email, role, subscription_tier, user_status FROM users WHERE email = ? AND user_status = ?'
    ).bind(email, 'pending_activation').first<{
      id: string
      email: string
      role: string
      subscription_tier: string
      user_status: string
    }>()

    if (!user) {
      return c.json({ error: 'Account not found or already activated' }, 400)
    }

    // Hash password and activate account
    const passwordHash = await hashPassword(password)

    await c.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, user_status = 'active', access_granted_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(passwordHash, user.id).run()

    // Delete used activation token
    await c.env.KV.delete(`activation:${token}`)

    // Create session
    const sessionId = generateId()
    const jwtToken = await createJWT({
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      tier: user.subscription_tier
    }, c.env.JWT_SECRET)

    await createSession(c.env.KV, sessionId, {
      userId: user.id,
      email: user.email,
      role: user.role,
      tier: user.subscription_tier,
      userStatus: 'active',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })

    setSessionCookie(c, jwtToken)

    return c.json({
      success: true,
      redirectTo: '/onboarding',
      user: { email: user.email, role: user.role }
    })

  } catch (error) {
    console.error('Activation error:', error)
    return c.json({ error: 'Activation failed. Please try again.' }, 500)
  }
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    // Find user
    const user = await c.env.DB.prepare(
      'SELECT id, email, password_hash, role, subscription_tier, user_status, access_revoked_at FROM users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first<{
      id: string
      email: string
      password_hash: string | null
      role: string
      subscription_tier: string
      user_status: string
      access_revoked_at: string | null
    }>()

    // Timing-safe: always hash even on not found (prevents email enumeration)
    const dummyHash = '$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxx'
    const hashToCheck = user?.password_hash || dummyHash
    const passwordValid = await verifyPassword(password, hashToCheck)

    if (!user || !passwordValid) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    if (user.user_status === 'pending_activation') {
      return c.json({ error: 'Your account has not been activated yet. Please check your email for the activation link.' }, 401)
    }

    if (user.user_status === 'suspended' || user.access_revoked_at !== null) {
      return c.json({ error: 'Your account access has been revoked. Please contact support.' }, 401)
    }

    if (user.user_status !== 'active') {
      return c.json({ error: 'Account unavailable. Please contact support.' }, 401)
    }

    if (!user.password_hash) {
      return c.json({ error: 'Account setup incomplete. Please use your activation link.' }, 401)
    }

    // Update last active
    await c.env.DB.prepare(
      'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(user.id).run()

    // Create session
    const sessionId = generateId()
    const jwtToken = await createJWT({
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      tier: user.subscription_tier
    }, c.env.JWT_SECRET)

    await createSession(c.env.KV, sessionId, {
      userId: user.id,
      email: user.email,
      role: user.role,
      tier: user.subscription_tier,
      userStatus: 'active',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })

    setSessionCookie(c, jwtToken)

    return c.json({
      success: true,
      redirectTo: '/dashboard',
      user: { email: user.email, role: user.role }
    })

  } catch (error) {
    console.error('Login error:', error)
    return c.json({ error: 'Login failed. Please try again.' }, 500)
  }
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

auth.post('/logout', async (c) => {
  try {
    const token = getSessionCookie(c)

    if (token) {
      const payload = await verifyJWT(token, c.env.JWT_SECRET)
      if (payload) {
        await deleteSession(c.env.KV, payload.sessionId, payload.userId)
      }
    }

    clearSessionCookie(c)
    return c.json({ success: true, redirectTo: '/login' })

  } catch {
    // Always clear cookie even on error
    clearSessionCookie(c)
    return c.json({ success: true, redirectTo: '/login' })
  }
})

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

auth.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>()

    if (!email) {
      return c.json({ error: 'Email is required' }, 400)
    }

    // Always return success to prevent email enumeration
    const user = await c.env.DB.prepare(
      'SELECT id, email FROM users WHERE email = ? AND user_status = ?'
    ).bind(email.toLowerCase().trim(), 'active').first<{ id: string; email: string }>()

    if (user) {
      const resetToken = generateId()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

      await c.env.KV.put(
        `password-reset:${resetToken}`,
        JSON.stringify({ userId: user.id, expiresAt }),
        { expirationTtl: 3600 }
      )

      // Log for dev testing — Sprint 3 will wire actual email
      if (c.env.ENVIRONMENT === 'development') {
        console.log(`[DEV] Password reset token for ${email}: ${resetToken}`)
        console.log(`[DEV] Reset URL: /reset-password?token=${resetToken}`)
      }
    }

    return c.json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.'
    })

  } catch (error) {
    console.error('Forgot password error:', error)
    return c.json({ error: 'Request failed. Please try again.' }, 500)
  }
})

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

auth.post('/reset-password', async (c) => {
  try {
    const { token, password } = await c.req.json<{ token: string; password: string }>()

    if (!token || !password) {
      return c.json({ error: 'Token and password are required' }, 400)
    }

    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400)
    }

    const tokenData = await c.env.KV.get(`password-reset:${token}`)
    if (!tokenData) {
      return c.json({ error: 'Reset link is invalid or has expired.' }, 400)
    }

    const { userId, expiresAt } = JSON.parse(tokenData) as { userId: string; expiresAt: string }

    if (new Date(expiresAt) < new Date()) {
      await c.env.KV.delete(`password-reset:${token}`)
      return c.json({ error: 'Reset link has expired. Please request a new one.' }, 400)
    }

    const passwordHash = await hashPassword(password)

    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(passwordHash, userId).run()

    // Delete used reset token
    await c.env.KV.delete(`password-reset:${token}`)

    // Invalidate all existing sessions for security
    await deleteAllUserSessions(c.env.KV, userId)

    return c.json({
      success: true,
      message: 'Password updated successfully.',
      redirectTo: '/login'
    })

  } catch (error) {
    console.error('Reset password error:', error)
    return c.json({ error: 'Reset failed. Please try again.' }, 500)
  }
})

// ─── GET /api/auth/check-activation ──────────────────────────────────────────

auth.get('/check-activation', async (c) => {
  const token = c.req.query('token')

  if (!token) {
    return c.json({ valid: false, pending: false })
  }

  let tokenData: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000))
    }
    tokenData = await c.env.KV.get(`activation:${token}`)
    if (tokenData) break
  }

  if (!tokenData) {
    return c.json({ valid: false, pending: true }) // pending=true triggers polling
  }

  const { expiresAt } = JSON.parse(tokenData)
  if (new Date(expiresAt) < new Date()) {
    return c.json({ valid: false, pending: false })
  }

  return c.json({ valid: true, pending: false })
})

// ─── GET /api/auth/check ──────────────────────────────────────────────────────
// Used by frontend auth guard scripts to verify session validity.
// authMiddleware handles the actual check — if we reach here, user is authenticated.

auth.get('/check', authMiddleware, async (c) => {
  const userId = c.get('userId' as never) as string
  return c.json({ authenticated: true, userId })
})

// ─── POST /api/auth/test-create-activation (DEVELOPMENT ONLY) ────────────────

auth.post('/test-create-activation', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not found' }, 404)
  }

  try {
    const { email } = await c.req.json<{ email: string }>()
    const userId = generateId()
    const activationToken = generateId()

    // Create pending user
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, role, user_status, subscription_tier, created_at)
       VALUES (?, ?, 'student', 'pending_activation', 'founder', CURRENT_TIMESTAMP)`
    ).bind(userId, email.toLowerCase().trim()).run()

    // Create activation token in KV (48h TTL)
    await c.env.KV.put(
      `activation:${activationToken}`,
      JSON.stringify({
        email: email.toLowerCase().trim(),
        stripeSessionId: 'test_session',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      }),
      { expirationTtl: 172800 }
    )

    return c.json({
      success: true,
      activationUrl: `/signup?token=${activationToken}`,
      token: activationToken,
      userId
    })

  } catch (error) {
    console.error('Test activation error:', error)
    return c.json({ error: 'Failed to create test activation' }, 500)
  }
})

export default auth
