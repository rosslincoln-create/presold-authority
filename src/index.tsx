import { Hono } from 'hono'
import auth from './routes/auth'
import billing from './routes/billing'
import { authMiddleware } from './middleware/authMiddleware'

export type Env = {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  BROWSER: Fetcher
  OPENAI_API_KEY: string
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
// ─── Public Page Routes ───────────────────────────────────────────────────────
app.get('/login', (c) => c.redirect('/login.html', 302))
app.get('/signup', (c) => c.redirect('/signup.html', 302))
app.get('/forgot-password', (c) => c.redirect('/forgot-password.html', 302))
app.get('/reset-password', (c) => c.redirect('/reset-password.html', 302))
app.get('/checkout', (c) => c.redirect('/checkout.html', 302))
app.get('/', (c) => c.redirect('/index.html', 302))

// ─── Pass-through for static HTML files ──────────────────────────────────────
app.get('/*.html', async (c, next) => { await next() })
app.get('/*.css', async (c, next) => { await next() })

// ─── Public API Routes ────────────────────────────────────────────────────────
app.route('/api/auth', auth)
app.route('/api/billing', billing)

// ─── Protected Routes ─────────────────────────────────────────────────────────
app.get('/dashboard', authMiddleware, (c) => c.text('Dashboard — Sprint 5'))
app.get('/onboarding', authMiddleware, (c) => c.text('Onboarding — Sprint 4'))
app.get('/lessons', authMiddleware, (c) => c.text('Lessons — Sprint 5'))
app.get('/assets', authMiddleware, (c) => c.text('Assets — Sprint 8'))
app.get('/account', authMiddleware, (c) => c.text('Account — Sprint 5'))

export default app
