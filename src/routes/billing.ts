import { Hono } from 'hono'
import Stripe from 'stripe'
import { Env } from '../index'
import { generateId } from '../lib/auth'
import { sendActivationEmail } from '../lib/email'

const billing = new Hono<{ Bindings: Env }>()

// ─── POST /api/billing/create-checkout-session ────────────────────────────────
//
// Creates a Stripe Checkout Session for the $147 one-time purchase.
// Returns { url } which the frontend uses to redirect to Stripe.

billing.post('/checkout', async (c) => {
  try {
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil'
    })

    const appUrl = c.env.APP_URL || 'https://app.presoldauthority.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: c.env.STRIPE_PRICE_ID || 'price_1TJWloCdeMuozQNnswb8N2TZ',
          quantity: 1
        }
      ],
      success_url: `${appUrl}/signup?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_creation: 'always',
      metadata: {
        product: 'presold-authority-system',
        tier: 'founder'
      }
    })

    return c.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed'
    console.error('[billing] create-checkout-session error:', message)
    return c.json({ error: 'Unable to start checkout. Please try again.' }, 500)
  }
})

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
//
// Stripe sends signed webhook events here.
// Handles: checkout.session.completed
//   1. Verifies Stripe signature
//   2. Creates user record in D1 (status = pending_activation)
//   3. Writes activation token to KV (48hr TTL)
//   4. Sends E1 activation email via Resend

billing.post('/webhook', async (c) => {
  try {
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil'
    })

    const body = await c.req.text()
    const signature = c.req.header('stripe-signature')

    if (!signature) {
      return c.json({ error: 'Missing Stripe signature' }, 400)
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signature verification failed'
      console.error('[billing] webhook signature error:', message)
      return c.json({ error: 'Invalid signature' }, 400)
    }

    // ─── Handle: checkout.session.completed ───────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      const email = session.customer_details?.email
      if (!email) {
        console.error('[billing] webhook: no customer email in session', session.id)
        return c.json({ error: 'No customer email' }, 400)
      }

      const stripeSessionId = session.id
      const stripeCustomerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id ?? null

      // Check if user already exists (idempotency guard)
      const existing = await c.env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).bind(email).first<{ id: string }>()

      let userId: string

      if (existing) {
        // User already exists — could be a duplicate webhook. Update stripe fields only.
        userId = existing.id
        await c.env.DB.prepare(`
          UPDATE users
          SET stripe_session_id = ?, stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(stripeSessionId, stripeCustomerId, userId).run()
      } else {
        // Create new user in pending_activation state
        userId = generateId()
        await c.env.DB.prepare(`
          INSERT INTO users (id, email, role, subscription_tier, user_status, stripe_session_id, stripe_customer_id)
          VALUES (?, ?, 'student', 'founder', 'pending_activation', ?, ?)
        `).bind(userId, email, stripeSessionId, stripeCustomerId).run()
      }

      // Generate activation token and store in KV (48 hour TTL)
      const activationToken = generateId()
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      await c.env.KV.put(
        `activation:${activationToken}`,
        JSON.stringify({ email, stripeSessionId, expiresAt }),
        { expirationTtl: 48 * 60 * 60 } // 48 hours in seconds
      )

      // Build activation URL and send E1 email
      const appUrl = c.env.APP_URL || 'https://app.presoldauthority.com'
      const activationUrl = `${appUrl}/signup?token=${activationToken}`

      const emailResult = await sendActivationEmail({
        to: email,
        activationUrl,
        resendApiKey: c.env.RESEND_API_KEY
      })

      if (!emailResult.success) {
        // Log email failure but do NOT fail the webhook — user can request resend
        console.error('[billing] webhook: activation email failed for', email, emailResult.error)
      }

      // Log to email_log table (best-effort)
      try {
        await c.env.DB.prepare(`
          INSERT INTO email_log (id, user_id, email_type, to_email, status, sent_at)
          VALUES (?, ?, 'activation', ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          generateId(),
          userId,
          email,
          emailResult.success ? 'sent' : 'failed'
        ).run()
      } catch (logErr) {
        console.error('[billing] webhook: email_log insert failed:', logErr)
      }

      return c.json({ received: true })
    }

    // Acknowledge other event types without processing
    return c.json({ received: true })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing error'
    console.error('[billing] webhook error:', message)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

export default billing
