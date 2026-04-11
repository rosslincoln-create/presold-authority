import { Hono } from 'hono'
import { authMiddleware } from '../middleware/authMiddleware'

type Env = {
  DB: D1Database
  KV: KVNamespace
  JWT_SECRET: string
}

const assessments = new Hono<{ Bindings: Env }>()

// All routes require auth
assessments.use('*', authMiddleware)

// ─────────────────────────────────────────────
// POST /api/assessments
// Save or overwrite an assessment for this user
// ─────────────────────────────────────────────
assessments.post('/', async (c) => {
  try {
    const userId = c.get('userId' as never) as string
    const body = await c.req.json() as {
      assessment_type: string
      responses: Record<string, number>
    }

    const { assessment_type, responses } = body

    if (!assessment_type || !responses || typeof responses !== 'object') {
      return c.json({ error: 'assessment_type and responses are required' }, 400)
    }

    const VALID_TYPES = ['positioning-gap', 'authority-signals']
    if (!VALID_TYPES.includes(assessment_type)) {
      return c.json({ error: 'Invalid assessment_type' }, 400)
    }

    // Validate dimensions for positioning-gap
    if (assessment_type === 'positioning-gap') {
      const required = [
        'positioning_clarity',
        'authority_signals',
        'content_relevance',
        'inbound_conversion',
        'boundary_language'
      ]
      for (const key of required) {
        const val = responses[key]
        if (typeof val !== 'number' || val < 1 || val > 10) {
          return c.json({ error: `Invalid value for ${key} — must be 1–10` }, 400)
        }
      }
    }

    // Calculate score (0–100 average)
    const vals = Object.values(responses).filter(v => typeof v === 'number')
    const score = vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10)
      : 0

    // Identify gaps (below threshold 7)
    const GAP_THRESHOLD = 7
    const DIMENSION_NOTES: Record<string, string> = {
      positioning_clarity: 'Your positioning statement and differentiators are the first things to install. Lesson 4 builds these directly.',
      authority_signals: 'Your profile headline, About section, and pinned post are your primary trust signals. Lesson 5 installs these.',
      content_relevance: 'Decision-stage content attracts serious clients and filters casual browsers. Lesson 6 builds your content pillars.',
      inbound_conversion: 'A clear DM → clarity → next step flow prevents warm leads from going cold. Lesson 7 installs this.',
      boundary_language: 'Professional boundary language filters tire-kickers before they reach your calendar. Lesson 8 covers this.'
    }

    const gaps: Array<{ dimension: string; score: number; note: string }> = []
    for (const [key, val] of Object.entries(responses)) {
      if (typeof val === 'number' && val < GAP_THRESHOLD) {
        gaps.push({
          dimension: key,
          score: val,
          note: DIMENSION_NOTES[key] || ''
        })
      }
    }

    // Build gap report text
    const gapReport = gaps.length > 0
      ? `Your assessment identified ${gaps.length} gap${gaps.length > 1 ? 's' : ''} below the threshold of ${GAP_THRESHOLD}/10:\n\n` +
        gaps.map(g => `• ${g.dimension.replace(/_/g, ' ')}: ${g.score}/10 — ${g.note}`).join('\n')
      : 'No critical gaps identified. All dimensions are at or above the threshold of 7/10.'

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Upsert: delete existing then insert (D1 SQLite doesn't support ON CONFLICT for non-unique)
    await c.env.DB.prepare(
      `DELETE FROM assessments WHERE user_id = ? AND assessment_type = ?`
    ).bind(userId, assessment_type).run()

    await c.env.DB.prepare(
      `INSERT INTO assessments (id, user_id, assessment_type, responses, score, gaps, gap_report, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      assessment_type,
      JSON.stringify(responses),
      score,
      JSON.stringify(gaps),
      gapReport,
      now
    ).run()

    // Mark lesson_progress.builder_completed = 1 for lesson-1
    const lessonId = assessment_type === 'positioning-gap' ? 'lesson-1' : 'lesson-2'
    const progressId = crypto.randomUUID()

    await c.env.DB.prepare(
      `INSERT INTO lesson_progress (id, user_id, lesson_id, builder_completed, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET builder_completed = 1, updated_at = excluded.updated_at`
    ).bind(progressId, userId, lessonId, now).run()

    return c.json({
      id,
      assessment_type,
      responses,
      score,
      gaps,
      gap_report: gapReport
    })

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('POST /api/assessments:', err)
    return c.json({ error: 'Internal server error', detail }, 500)
  }
})

// ─────────────────────────────────────────────
// GET /api/assessments?type=positioning-gap
// Return saved assessment for this user and type
// ─────────────────────────────────────────────
assessments.get('/', async (c) => {
  try {
    const userId = c.get('userId' as never) as string
    const type = c.req.query('type')

    if (!type) {
      // Return all assessments for this user
      const rows = await c.env.DB.prepare(
        `SELECT id, assessment_type, responses, score, gaps, gap_report, created_at
         FROM assessments WHERE user_id = ? ORDER BY created_at DESC`
      ).bind(userId).all()

      return c.json(rows.results.map(row => ({
        ...row,
        responses: JSON.parse(row.responses as string),
        gaps: JSON.parse(row.gaps as string)
      })))
    }

    const row = await c.env.DB.prepare(
      `SELECT id, assessment_type, responses, score, gaps, gap_report, created_at
       FROM assessments WHERE user_id = ? AND assessment_type = ? LIMIT 1`
    ).bind(userId, type).first() as Record<string, unknown> | null

    if (!row) {
      return c.json(null, 404)
    }

    return c.json({
      ...row,
      responses: JSON.parse(row.responses as string),
      gaps: JSON.parse(row.gaps as string)
    })

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('GET /api/assessments:', err)
    return c.json({ error: 'Internal server error', detail }, 500)
  }
})

export default assessments
