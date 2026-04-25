import { Hono } from 'hono'
import { Env } from '../index'
import { authMiddleware } from '../middleware/authMiddleware'
import { hashPassword, verifyPassword } from '../lib/auth'

const account = new Hono<{ Bindings: Env }>()

account.use('/*', authMiddleware)

// ─── GET /api/account ─────────────────────────────────────────────────────────

account.get('/', async (c) => {
  try {
    const userId = c.get('userId' as never) as string

    const user = await c.env.DB.prepare(`
      SELECT id, email, full_name, subscription_tier, access_granted_at
      FROM users
      WHERE id = ?
    `).bind(userId).first<{
      id: string
      email: string
      full_name: string | null
      subscription_tier: string
      access_granted_at: string | null
    }>()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    const card = await c.env.DB.prepare(`
      SELECT market_location
      FROM context_cards
      WHERE user_id = ?
      ORDER BY version DESC
      LIMIT 1
    `).bind(userId).first<{ market_location: string | null }>()

    return c.json({
      fullName: user.full_name,
      email: user.email,
      marketLocation: card?.market_location ?? null,
      subscriptionTier: user.subscription_tier,
      accessGrantedAt: user.access_granted_at
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('GET /api/account:', detail)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── PATCH /api/account/profile ───────────────────────────────────────────────

account.patch('/profile', async (c) => {
  try {
    const userId = c.get('userId' as never) as string

    let body: { fullName?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''

    if (!fullName) {
      return c.json({ error: 'Full name is required' }, 400)
    }

    if (fullName.length > 100) {
      return c.json({ error: 'Full name must be 100 characters or fewer' }, 400)
    }

    const result = await c.env.DB.prepare(`
      UPDATE users
      SET full_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(fullName, userId).run()

    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({ success: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('PATCH /api/account/profile:', detail)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── POST /api/account/change-password ────────────────────────────────────────

account.post('/change-password', async (c) => {
  try {
    const userId = c.get('userId' as never) as string

    let body: { currentPassword?: unknown; newPassword?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current and new password are required' }, 400)
    }

    if (newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters' }, 400)
    }

    const user = await c.env.DB.prepare(`
      SELECT password_hash
      FROM users
      WHERE id = ?
    `).bind(userId).first<{ password_hash: string | null }>()

    if (!user || !user.password_hash) {
      return c.json({ error: 'Account password not set. Please contact support.' }, 400)
    }

    const valid = await verifyPassword(currentPassword, user.password_hash)
    if (!valid) {
      return c.json({ error: 'Current password is incorrect' }, 400)
    }

    const newHash = await hashPassword(newPassword)

    await c.env.DB.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newHash, userId).run()

    return c.json({ success: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('POST /api/account/change-password:', detail)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default account
