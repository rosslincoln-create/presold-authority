import { Hono } from 'hono'
import auth from './routes/auth'
import billing from './routes/billing'
import contextCard from './routes/contextCard'
import lessons from './routes/lessons'
import dashboard from './routes/dashboard'
import { authMiddleware } from './middleware/authMiddleware'
import assessments from './routes/assessments'
import builder from './routes/builder'
import admin from './routes/admin'

export type Env = {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  BROWSER: Fetcher
  OPENAI_API_KEY: string
  STRIPE_PRICE_ID: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  RESEND_API_KEY: string
  JWT_SECRET: string
  ADMIN_EMAIL: string
  ENVIRONMENT: string
  APP_URL: string
}

const app = new Hono<{ Bindings: Env }>()

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString()
  })
})

app.get('/api/settings/:key', async (c) => {
  const key = c.req.param('key')
  const row = await c.env.DB
    .prepare('SELECT key, value FROM app_settings WHERE key = ?')
    .bind(key)
    .first() as { key: string; value: string | null } | null
  if (!row) return c.json({ error: 'Setting not found' }, 404)
  return c.json({ key: row.key, value: row.value })
})

// ─── Public API Routes ────────────────────────────────────────────────────────
app.route('/api/auth', auth)
app.route('/api/billing', billing)
app.route('/api/context-card', contextCard)
app.route('/api/lessons', lessons)
app.route('/api/dashboard', dashboard)
app.route('/api/assessments', assessments)
app.route('/api/builder', builder)
app.route('/api/admin', admin)

// ─── Protected Routes ─────────────────────────────────────────────────────────
app.get('/dashboard', authMiddleware, (c) => c.redirect('/dashboard.html'))
app.get('/onboarding', authMiddleware, (c) => c.redirect('/onboarding.html'))
app.get('/lessons', authMiddleware, (c) => c.redirect('/lessons.html'))
app.get('/lessons/:id', authMiddleware, (c) => {
  const id = c.req.param('id')
  return c.redirect(`/lessons/lesson.html?id=${id}`)
})
app.get('/assets', authMiddleware, (c) => c.text('Assets — Sprint 8'))
app.get('/account', authMiddleware, (c) => c.text('Account — Sprint 5'))

export default app
