import { Hono } from 'hono'
import { Env } from '../index'
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware'
import { callOpenAI } from '../lib/openai'
import { deleteAllUserSessions } from '../lib/auth'

const admin = new Hono<{ Bindings: Env }>()

admin.use('/*', authMiddleware, adminMiddleware)

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

async function logAdminPreviewFailed(
  db: D1Database,
  userId: string,
  lessonId: string,
  errorMessage: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO system_events (id, event_type, user_id, reference_id, error_message, created_at)
    VALUES (?, 'ai_gen_failed', ?, ?, ?, datetime('now'))
  `).bind(crypto.randomUUID(), userId, lessonId, errorMessage).run()
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

admin.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT key, value, updated_at FROM app_settings ORDER BY key'
  ).all<{ key: string; value: string | null; updated_at: string | null }>()

  return c.json({ settings: rows.results ?? [] })
})

admin.patch('/settings/:key', async (c) => {
  const key = c.req.param('key')

  let body: { value?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.value !== 'string') {
    return c.json({ error: 'value is required' }, 400)
  }

  const result = await c.env.DB.prepare(`
    UPDATE app_settings
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `).bind(body.value, key).run()

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Setting not found' }, 404)
  }

  return c.json({ success: true, key, value: body.value })
})

// ─── PROMPTS ─────────────────────────────────────────────────────────────────

admin.get('/lessons/:id/prompts', async (c) => {
  const lessonId = c.req.param('id')
  try {
    const lesson = await c.env.DB.prepare(`
      SELECT id, title, builder_prompt_template, builder_prompt_draft, output_schema
      FROM lessons
      WHERE id = ?
    `).bind(lessonId).first<{
      id: string
      title: string
      builder_prompt_template: string | null
      builder_prompt_draft: string | null
      output_schema: string | null
    }>()

    if (!lesson) {
      return c.json({ error: 'Lesson not found' }, 404)
    }

    if (!lesson.builder_prompt_template && !lesson.builder_prompt_draft) {
      return c.json({ lesson, versions: [], no_builder: true })
    }

    const versionsResult = await c.env.DB.prepare(`
      SELECT id, prompt_text, published_at, published_by, is_active, version
      FROM prompt_versions
      WHERE lesson_id = ?
      ORDER BY published_at DESC
    `).bind(lessonId).all()

    return c.json({
      lesson,
      versions: versionsResult.results ?? []
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('GET /admin/lessons/:id/prompts error:', message)
    return c.json({ error: message }, 500)
  }
})

admin.post('/lessons/:id/prompts/draft', async (c) => {
  const lessonId = c.req.param('id')

  let body: { draftText?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.draftText !== 'string') {
    return c.json({ error: 'draftText is required' }, 400)
  }

  const draftValue = body.draftText.trim() === '' ? null : body.draftText

  const result = await c.env.DB.prepare(`
    UPDATE lessons
    SET builder_prompt_draft = ?
    WHERE id = ?
  `).bind(draftValue, lessonId).run()

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Lesson not found' }, 404)
  }

  return c.json({ success: true })
})

admin.post('/lessons/:id/prompts/preview', async (c) => {
  const lessonId = c.req.param('id')
  const userId = c.get('userId')

  let body: { draftText?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.draftText !== 'string') {
    return c.json({ error: 'draftText is required' }, 400)
  }

  const sampleContextCard = {
    full_name: 'Sarah Mitchell',
    market_location: 'Austin, TX',
    agent_role: 'hybrid',
    years_experience: '8',
    client_types: ['buyers', 'sellers'],
    price_range: '$400k-$800k',
    serious_client_definition: 'Pre-approved buyers, sellers with realistic price expectations',
    strengths: ['local market knowledge', 'process transparency', 'negotiation skill'],
    values: ['honesty', 'boundaries', 'education-first'],
    process_step_1: 'Clarity call to understand goals',
    process_step_2: 'Market analysis and strategy',
    process_step_3: 'Guided execution with weekly updates',
    boundary_statement: 'I only work with buyers who are pre-approved for finance',
    tone_preference: 'calm_advisor',
    cta_preference: 'dm_keyword',
    brokerage_name: 'Realty Austin',
    phone: '512-555-0147',
    proof_points: [
      '150+ transactions completed',
      'Top 10% producer in Austin MLS 2023',
      '98% client satisfaction score'
    ]
  }

  const resolvedPrompt = body.draftText
    .replaceAll('{context_card}', JSON.stringify(sampleContextCard))
    .replaceAll('{positioning_statement}', '')
    .replaceAll('{differentiators}', '')
    .replaceAll('{prior_asset}', '')

  try {
    const output = await callOpenAI(
      resolvedPrompt,
      'Return the output as a JSON object.',
      c.env.OPENAI_API_KEY,
      'gpt-4o-mini'
    )
    return c.json({ output })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAdminPreviewFailed(c.env.DB, userId, lessonId, message)
    return c.json({ error: `Preview failed: ${message}` }, 500)
  }
})

admin.post('/lessons/:id/prompts/publish', async (c) => {
  const lessonId = c.req.param('id')
  const publishedBy = c.get('userId')

  let body: { draftText?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.draftText !== 'string') {
    return c.json({ error: 'draftText is required' }, 400)
  }

  const current = await c.env.DB.prepare(`
    SELECT builder_prompt_template
    FROM lessons
    WHERE id = ?
  `).bind(lessonId).first<{ builder_prompt_template: string | null }>()

  if (!current) {
    return c.json({ error: 'Lesson not found' }, 404)
  }

  await c.env.DB.prepare(`
    INSERT INTO prompt_versions
      (id, lesson_id, prompt_text, published_at, published_by, is_active)
    VALUES
      (?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
  `).bind(
    crypto.randomUUID(),
    lessonId,
    current.builder_prompt_template ?? '',
    publishedBy
  ).run()

  const update = await c.env.DB.prepare(`
    UPDATE lessons
    SET builder_prompt_template = ?,
        builder_prompt_draft = NULL
    WHERE id = ?
  `).bind(body.draftText, lessonId).run()

  if (!update.success || (update.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Lesson not found' }, 404)
  }

  return c.json({ success: true })
})

admin.post('/lessons/:id/prompts/:versionId/rollback', async (c) => {
  const lessonId = c.req.param('id')
  const versionId = c.req.param('versionId')
  const publishedBy = c.get('userId')

  const target = await c.env.DB.prepare(`
    SELECT id, prompt_text
    FROM prompt_versions
    WHERE id = ? AND lesson_id = ?
  `).bind(versionId, lessonId).first<{ id: string; prompt_text: string }>()

  if (!target) {
    return c.json({ error: 'Version not found' }, 404)
  }

  const current = await c.env.DB.prepare(`
    SELECT builder_prompt_template
    FROM lessons
    WHERE id = ?
  `).bind(lessonId).first<{ builder_prompt_template: string | null }>()

  if (!current) {
    return c.json({ error: 'Lesson not found' }, 404)
  }

  await c.env.DB.prepare(`
    INSERT INTO prompt_versions
      (id, lesson_id, prompt_text, published_at, published_by, is_active)
    VALUES
      (?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
  `).bind(
    crypto.randomUUID(),
    lessonId,
    current.builder_prompt_template ?? '',
    publishedBy
  ).run()

  await c.env.DB.prepare(`
    UPDATE lessons
    SET builder_prompt_template = ?,
        builder_prompt_draft = NULL
    WHERE id = ?
  `).bind(target.prompt_text, lessonId).run()

  return c.json({ success: true })
})

// ─── STUDENTS ────────────────────────────────────────────────────────────────

admin.get('/users', async (c) => {
  const search = c.req.query('search')?.trim()
  const status = c.req.query('status')?.trim()
  const tier = c.req.query('tier')?.trim()

  const page = parsePositiveInt(c.req.query('page'), 1)
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 25), 100)
  const offset = (page - 1) * limit

  const where: string[] = [`u.role = 'student'`]
  const binds: unknown[] = []

  if (search) {
    where.push('u.email LIKE ?')
    binds.push(`%${search}%`)
  }
  if (status && status !== 'All' && status !== 'all') {
    where.push('u.user_status = ?')
    binds.push(status)
  }
  if (tier && tier !== 'All' && tier !== 'all') {
    where.push('u.subscription_tier = ?')
    binds.push(tier)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`

  const totalRow = await c.env.DB.prepare(`
    SELECT COUNT(*) as total
    FROM users u
    ${whereSql}
  `).bind(...binds).first<{ total: number }>()

  const total = Number(totalRow?.total ?? 0)

  const rows = await c.env.DB.prepare(`
    SELECT
      u.id, u.email, u.full_name, u.subscription_tier,
      u.user_status, u.created_at, u.last_active_at,
      u.access_granted_at,
      (SELECT COUNT(*) FROM lesson_progress lp
        WHERE lp.user_id = u.id AND lp.is_complete = 1) as lessons_complete,
      (SELECT COUNT(*) FROM generated_assets ga
        WHERE ga.user_id = u.id AND ga.is_current = 1) as assets_generated
    FROM users u
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all()

  return c.json({
    users: rows.results ?? [],
    total,
    page,
    limit
  })
})

admin.get('/users/:id', async (c) => {
  const userId = c.req.param('id')

  const user = await c.env.DB.prepare(`
    SELECT *
    FROM users
    WHERE id = ?
  `).bind(userId).first()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  const lessonProgress = await c.env.DB.prepare(`
    SELECT *
    FROM lesson_progress
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).bind(userId).all()

  const assets = await c.env.DB.prepare(`
    SELECT *
    FROM generated_assets
    WHERE user_id = ? AND is_current = 1
    ORDER BY updated_at DESC
  `).bind(userId).all()

  return c.json({
    user,
    lessonProgress: lessonProgress.results ?? [],
    assets: assets.results ?? []
  })
})

admin.post('/users/:id/revoke', async (c) => {
  const userId = c.req.param('id')

  const result = await c.env.DB.prepare(`
    UPDATE users
    SET access_revoked_at = CURRENT_TIMESTAMP,
        user_status = 'suspended'
    WHERE id = ?
  `).bind(userId).run()

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'User not found' }, 404)
  }

  await deleteAllUserSessions(c.env.KV, userId)

  return c.json({ success: true })
})

admin.post('/users/:id/grant', async (c) => {
  const userId = c.req.param('id')

  const result = await c.env.DB.prepare(`
    UPDATE users
    SET access_revoked_at = NULL,
        user_status = 'active'
    WHERE id = ?
  `).bind(userId).run()

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ success: true })
})

// ─── SYSTEM EVENTS ───────────────────────────────────────────────────────────

admin.get('/system-events', async (c) => {
  const eventType = c.req.query('event_type')?.trim()
  const isResolvedParam = c.req.query('is_resolved')?.trim()
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 50), 200)

  const where: string[] = []
  const binds: unknown[] = []

  if (eventType && eventType !== 'All' && eventType !== 'all') {
    where.push('event_type = ?')
    binds.push(eventType)
  }

  if (isResolvedParam == null || isResolvedParam === '' || isResolvedParam === 'false') {
    where.push('is_resolved = 0')
  } else if (isResolvedParam === 'true') {
    where.push('is_resolved = 1')
  } else if (isResolvedParam === 'all') {
    // no filter
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = await c.env.DB.prepare(`
    SELECT *
    FROM system_events
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all()

  return c.json({ events: rows.results ?? [] })
})

admin.patch('/system-events/:id', async (c) => {
  const id = c.req.param('id')

  let body: { is_resolved?: boolean }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.is_resolved !== 'boolean') {
    return c.json({ error: 'is_resolved is required' }, 400)
  }

  const resolvedInt = body.is_resolved ? 1 : 0

  const result = await c.env.DB.prepare(`
    UPDATE system_events
    SET is_resolved = ?,
        resolved_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ?
  `).bind(resolvedInt, resolvedInt, id).run()

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Event not found' }, 404)
  }

  return c.json({ success: true })
})

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

admin.get('/analytics', async (c) => {
  const totalStudentsRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM users WHERE role = 'student'"
  ).first<{ count: number }>()

  const activeLast30Row = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM lesson_progress
    WHERE updated_at >= datetime('now', '-30 days')
  `).first<{ count: number }>()

  const pendingActivationRow = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE user_status = 'pending_activation'
  `).first<{ count: number }>()

  const suspendedRow = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE user_status = 'suspended'
  `).first<{ count: number }>()

  const totalDownloadsRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM download_events'
  ).first<{ count: number }>()

  const lessonFunnel = await c.env.DB.prepare(`
    SELECT
      l.id,
      l.lesson_number,
      l.title,
      (
        SELECT COUNT(DISTINCT lp.user_id)
        FROM lesson_progress lp
        WHERE lp.lesson_id = l.id
          AND (lp.video_watch_percent > 0 OR lp.builder_completed = 1)
      ) as started,
      (
        SELECT COUNT(DISTINCT lp.user_id)
        FROM lesson_progress lp
        WHERE lp.lesson_id = l.id
          AND lp.is_complete = 1
      ) as completed
    FROM lessons l
    WHERE l.is_active = 1
    ORDER BY l.sort_order
  `).all()

  const builderUsage = await c.env.DB.prepare(`
    SELECT
      l.id,
      l.lesson_number,
      l.title,
      COUNT(ga.id) as generations,
      COUNT(CASE WHEN ga.edited_content IS NOT NULL THEN 1 END) as saves,
      COUNT(CASE WHEN ga.version > 1 THEN 1 END) as regenerations,
      (
        SELECT ga2.regeneration_reason
        FROM generated_assets ga2
        WHERE ga2.lesson_id = l.id
          AND ga2.regeneration_reason IS NOT NULL
        GROUP BY ga2.regeneration_reason
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) as top_regen_reason
    FROM lessons l
    LEFT JOIN generated_assets ga ON l.id = ga.lesson_id
    WHERE l.builder_prompt_template IS NOT NULL
    GROUP BY l.id, l.lesson_number, l.title
    ORDER BY l.sort_order
  `).all()

  const assetDownloads = await c.env.DB.prepare(`
    SELECT de.asset_type,
      COUNT(*) as total,
      COUNT(DISTINCT de.user_id) as unique_students
    FROM download_events de
    GROUP BY de.asset_type
    ORDER BY total DESC
  `).all()

  return c.json({
    total_students: Number(totalStudentsRow?.count ?? 0),
    active_last_30_days: Number(activeLast30Row?.count ?? 0),
    pending_activation: Number(pendingActivationRow?.count ?? 0),
    suspended: Number(suspendedRow?.count ?? 0),
    total_downloads: Number(totalDownloadsRow?.count ?? 0),
    lesson_funnel: lessonFunnel.results ?? [],
    builder_usage: builderUsage.results ?? [],
    asset_downloads: assetDownloads.results ?? []
  })
})

export default admin

