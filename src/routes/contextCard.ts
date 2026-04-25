import { Hono } from 'hono'
import { authMiddleware } from '../middleware/authMiddleware'
import { generateId } from '../lib/auth'

// Use the same Env type pattern as existing routes
const contextCard = new Hono<{ Bindings: any }>()

contextCard.use('/*', authMiddleware)

// ─── GET /api/context-card/export ─────────────────────────────────────────────
// Must be registered before GET / to avoid routing conflicts
contextCard.get('/export', async (c) => {
  const userId = c.get('userId' as never) as string

  const card = await c.env.DB.prepare(
    'SELECT * FROM context_cards WHERE user_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(userId).first() as Record<string, any> | null

  if (!card) {
    return c.json({ error: 'No context card found' }, 404)
  }

  // Parse JSON array fields for export
  const parseField = (val: any) => {
    if (!val) return []
    try { return JSON.parse(val) } catch { return [] }
  }

  const exported = {
    ...card,
    client_types: parseField(card.client_types),
    strengths: parseField(card.strengths),
    values: parseField(card.values),
    proof_points: parseField(card.proof_points),
    _meta: {
      userId,
      exportedAt: new Date().toISOString(),
      version: card.version
    }
  }

  return c.json({ export: exported })
})

// ─── GET /api/context-card ────────────────────────────────────────────────────
contextCard.get('/', async (c) => {
  const userId = c.get('userId' as never) as string

  const card = await c.env.DB.prepare(
    'SELECT * FROM context_cards WHERE user_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(userId).first() as Record<string, any> | null

  if (!card) {
    return c.json({}, 200)
  }

  // Parse JSON array fields before returning to frontend
  const parseField = (val: any) => {
    if (!val) return []
    try { return JSON.parse(val) } catch { return [] }
  }

  return c.json({
    contextCard: {
      ...card,
      client_types: parseField(card.client_types),
      strengths: parseField(card.strengths),
      values: parseField(card.values),
      proof_points: parseField(card.proof_points)
    }
  })
})

// ─── POST /api/context-card ───────────────────────────────────────────────────
contextCard.post('/', async (c) => {
  const userId = c.get('userId' as never) as string
  const body = await c.req.json()

  // Validate required fields if marking complete
  if (body.is_complete) {
    const required = ['full_name', 'market_location', 'agent_role', 'brokerage_name', 'phone']
    const missing = required.filter(f => !body[f])
    if (missing.length > 0) {
      return c.json({
        error: 'Missing required fields',
        missing
      }, 400)
    }
  }

  // Stringify array fields for SQLite storage
  const stringify = (val: any) => {
    if (!val) return null
    if (Array.isArray(val)) return JSON.stringify(val)
    return val
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM context_cards WHERE user_id = ? LIMIT 1'
  ).bind(userId).first<{ id: string }>()

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE context_cards SET
        full_name = COALESCE(?, full_name),
        market_location = COALESCE(?, market_location),
        agent_role = COALESCE(?, agent_role),
        years_experience = COALESCE(?, years_experience),
        client_types = COALESCE(?, client_types),
        price_range = COALESCE(?, price_range),
        serious_client_definition = COALESCE(?, serious_client_definition),
        anti_client_description = COALESCE(?, anti_client_description),
        strengths = COALESCE(?, strengths),
        "values" = COALESCE(?, "values"),
        process_step_1 = COALESCE(?, process_step_1),
        process_step_2 = COALESCE(?, process_step_2),
        process_step_3 = COALESCE(?, process_step_3),
        boundary_statement = COALESCE(?, boundary_statement),
        transactions_range = COALESCE(?, transactions_range),
        proof_points = COALESCE(?, proof_points),
        testimonial_snippets = COALESCE(?, testimonial_snippets),
        brokerage_name = COALESCE(?, brokerage_name),
        licence_number = COALESCE(?, licence_number),
        phone = COALESCE(?, phone),
        website_url = COALESCE(?, website_url),
        social_profile_url = COALESCE(?, social_profile_url),
        broker_disclaimer = COALESCE(?, broker_disclaimer),
        state_province = COALESCE(?, state_province),
        tone_preference = COALESCE(?, tone_preference),
        words_to_use = COALESCE(?, words_to_use),
        words_to_avoid = COALESCE(?, words_to_avoid),
        cta_preference = COALESCE(?, cta_preference),
        cta_next_step = COALESCE(?, cta_next_step),
        is_complete = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(
      body.full_name ?? null, body.market_location ?? null,
      body.agent_role ?? null, body.years_experience ?? null,
      stringify(body.client_types), body.price_range ?? null,
      body.serious_client_definition ?? null, body.anti_client_description ?? null,
      stringify(body.strengths), stringify(body.values),
      body.process_step_1 ?? null, body.process_step_2 ?? null, body.process_step_3 ?? null,
      body.boundary_statement ?? null, body.transactions_range ?? null,
      stringify(body.proof_points), body.testimonial_snippets ?? null,
      body.brokerage_name ?? null, body.licence_number ?? null,
      body.phone ?? null, body.website_url ?? null,
      body.social_profile_url ?? null, body.broker_disclaimer ?? null,
      body.state_province ?? null,
      body.tone_preference ?? null, body.words_to_use ?? null,
      body.words_to_avoid ?? null, body.cta_preference ?? null,
      body.cta_next_step ?? null,
      body.is_complete ? 1 : 0,
      userId
    ).run()

    // Sync full_name to users table so dashboard greeting and account page
    // reflect the canonical name. Only update when caller actually supplied it.
    if (typeof body.full_name === 'string' && body.full_name.trim() !== '') {
      await c.env.DB.prepare(
        'UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(body.full_name.trim(), userId).run()
    }

    return c.json({ success: true, id: existing.id })

  } else {
    const id = generateId()

    await c.env.DB.prepare(`
      INSERT INTO context_cards (
        id, user_id, full_name, market_location, agent_role, years_experience,
        client_types, price_range, serious_client_definition, anti_client_description,
        strengths, "values", process_step_1, process_step_2, process_step_3,
        boundary_statement, transactions_range, proof_points, testimonial_snippets,
        brokerage_name, licence_number, phone, website_url,
        social_profile_url, broker_disclaimer, state_province,
        tone_preference, words_to_use, words_to_avoid,
        cta_preference, cta_next_step, is_complete, version,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, 1,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).bind(
      id, userId,
      body.full_name ?? null, body.market_location ?? null,
      body.agent_role ?? null, body.years_experience ?? null,
      stringify(body.client_types), body.price_range ?? null,
      body.serious_client_definition ?? null, body.anti_client_description ?? null,
      stringify(body.strengths), stringify(body.values),
      body.process_step_1 ?? null, body.process_step_2 ?? null, body.process_step_3 ?? null,
      body.boundary_statement ?? null, body.transactions_range ?? null,
      stringify(body.proof_points), body.testimonial_snippets ?? null,
      body.brokerage_name ?? null, body.licence_number ?? null,
      body.phone ?? null, body.website_url ?? null,
      body.social_profile_url ?? null, body.broker_disclaimer ?? null,
      body.state_province ?? null,
      body.tone_preference ?? null, body.words_to_use ?? null,
      body.words_to_avoid ?? null, body.cta_preference ?? null,
      body.cta_next_step ?? null,
      body.is_complete ? 1 : 0
    ).run()

    // Sync full_name to users table so dashboard greeting and account page
    // reflect the canonical name. Only update when caller actually supplied it.
    if (typeof body.full_name === 'string' && body.full_name.trim() !== '') {
      await c.env.DB.prepare(
        'UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(body.full_name.trim(), userId).run()
    }

    return c.json({ success: true, id })
  }
})

export default contextCard
