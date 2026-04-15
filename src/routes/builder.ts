import { Hono } from 'hono'
import { authMiddleware } from '../middleware/authMiddleware'
import { callOpenAI } from '../lib/openai'

const builder = new Hono<{ Bindings: any }>()

builder.use('/*', authMiddleware)

/** Maps lesson IDs to generated_assets.asset_type (extend as new builders ship). */
const LESSON_ID_TO_ASSET_TYPE: Record<string, string> = {
  'lesson-4': 'positioning',
  'lesson-5': 'profile-copy',
  'lesson-6': 'content-pillars',
  'lesson-7-posts': 'posts-10',
  'lesson-7-dm': 'dm-flow',
  'lesson-8': 'boundary-library',
}

function assetTypeForLesson(lessonId: string): string | null {
  return LESSON_ID_TO_ASSET_TYPE[lessonId] ?? null
}

const RATE_LIMIT_KEY_PREFIX = 'ai-rate-limit:'
const GENERATIONS_PER_WINDOW = 20
const WINDOW_SECONDS = 86400

async function logAiGenFailed(
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

// POST /api/builder/generate
builder.post('/generate', async (c) => {
  const userId = c.get('userId' as never) as string
  let body: { lessonId?: string; additionalInput?: Record<string, unknown> }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const lessonId = body.lessonId
  if (!lessonId || typeof lessonId !== 'string') {
    return c.json({ error: 'lessonId is required' }, 400)
  }

  const lesson = await c.env.DB.prepare(`
    SELECT builder_prompt_template, output_schema FROM lessons WHERE id = ? AND is_active = 1
  `).bind(lessonId).first<{ builder_prompt_template: string | null; output_schema: string | null }>()

  if (!lesson || lesson.builder_prompt_template == null) {
    return c.json({ error: 'Builder not available for this lesson' }, 400)
  }

  const assetType = assetTypeForLesson(lessonId)
  if (!assetType) {
    return c.json({ error: 'Builder not available for this lesson' }, 400)
  }

  const contextCard = await c.env.DB.prepare(
    'SELECT * FROM context_cards WHERE user_id = ?'
  ).bind(userId).first() as Record<string, unknown> | null

  if (!contextCard) {
    return c.json({ error: 'Please complete your Context Card before generating' }, 400)
  }

  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`
  const nowSec = Math.floor(Date.now() / 1000)

  const rawRate = await c.env.KV.get(rateKey)
  let rateState: { count: number; resetAt: number }

  if (rawRate) {
    try {
      rateState = JSON.parse(rawRate) as { count: number; resetAt: number }
    } catch {
      rateState = { count: 0, resetAt: nowSec + WINDOW_SECONDS }
    }
    if (nowSec >= rateState.resetAt) {
      rateState = { count: 0, resetAt: nowSec + WINDOW_SECONDS }
    }
  } else {
    rateState = { count: 0, resetAt: nowSec + WINDOW_SECONDS }
  }

  if (rateState.count >= GENERATIONS_PER_WINDOW && nowSec < rateState.resetAt) {
    return c.json({ error: 'Daily generation limit reached. Resets in 24 hours.' }, 429)
  }

  rateState.count += 1
  await c.env.KV.put(rateKey, JSON.stringify(rateState), { expirationTtl: WINDOW_SECONDS })

  const systemPrompt = lesson.builder_prompt_template.replace(
    '{context_card}',
    JSON.stringify(contextCard)
  )

  const userMessage =
    'Generate the positioning assets for this agent based on the context provided.'

  let rawOutput: string
  try {
    rawOutput = await callOpenAI(
      systemPrompt,
      userMessage,
      c.env.OPENAI_API_KEY
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAiGenFailed(c.env.DB, userId, lessonId, message)
    return c.json({ error: 'Generation failed. Please try again.' }, 500)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAiGenFailed(c.env.DB, userId, lessonId, message)
    return c.json({ error: 'Generation failed. Please try again.' }, 500)
  }

  const maxRow = await c.env.DB.prepare(`
    SELECT MAX(version) as max_version FROM generated_assets
    WHERE user_id = ? AND asset_type = ?
  `).bind(userId, assetType).first<{ max_version: number | null }>()

  const nextVersion = (maxRow?.max_version ?? 0) + 1

  await c.env.DB.prepare(`
    UPDATE generated_assets SET is_current = 0
    WHERE user_id = ? AND asset_type = ?
  `).bind(userId, assetType).run()

  const assetId = crypto.randomUUID()
  const inputSnapshot = JSON.stringify(contextCard)
  const rawOutputStr = rawOutput

  await c.env.DB.prepare(`
    INSERT INTO generated_assets
    (id, user_id, lesson_id, asset_type, version, input_snapshot, raw_output, edited_content, is_current, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).bind(
    assetId,
    userId,
    lessonId,
    assetType,
    nextVersion,
    inputSnapshot,
    rawOutputStr,
    rawOutputStr
  ).run()

  return c.json({
    success: true,
    assetId,
    version: nextVersion,
    output: parsed,
  })
})

// GET /api/builder/outputs/:assetType
builder.get('/outputs/:assetType', async (c) => {
  const userId = c.get('userId' as never) as string
  const assetType = c.req.param('assetType')

  const row = await c.env.DB.prepare(`
    SELECT id, version, raw_output, edited_content, created_at, updated_at
    FROM generated_assets
    WHERE user_id = ? AND asset_type = ? AND is_current = 1
  `).bind(userId, assetType).first<{
    id: string
    version: number
    raw_output: string | null
    edited_content: string | null
    created_at: string
    updated_at: string
  }>()

  if (!row) {
    return c.json({ output: null })
  }

  let output: unknown
  try {
    output = row.edited_content ? JSON.parse(row.edited_content) : null
  } catch {
    output = null
  }

  return c.json({
    assetId: row.id,
    version: row.version,
    output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
})

// PUT /api/builder/outputs/:assetId
builder.put('/outputs/:assetId', async (c) => {
  const userId = c.get('userId' as never) as string
  const assetId = c.req.param('assetId')

  let body: { editedContent?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (body.editedContent === undefined || body.editedContent === null) {
    return c.json({ error: 'editedContent is required' }, 400)
  }

  const editedJson = JSON.stringify(body.editedContent)

  const result = await c.env.DB.prepare(`
    UPDATE generated_assets
    SET edited_content = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).bind(editedJson, assetId, userId).run()

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({ success: true })
})

export default builder
