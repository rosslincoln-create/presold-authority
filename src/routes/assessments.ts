import { Hono } from 'hono'
import { Env } from '../index'
import { authMiddleware } from '../middleware/authMiddleware'
import { generateId } from '../lib/auth'

const assessments = new Hono<{ Bindings: Env }>()

// GET /api/assessments — get all assessments for user
assessments.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string

  try {
    const results = await c.env.DB.prepare(
      `SELECT id, assessment_type, responses, score, gaps, gap_report, created_at
       FROM assessments
       WHERE user_id = ?
       ORDER BY created_at DESC`
    ).bind(userId).all()

    return c.json({ assessments: results.results })
  } catch (err) {
    console.error('assessments GET error', err)
    return c.json({ error: 'Failed to load assessments' }, 500)
  }
})

// GET /api/assessments/:type — get latest assessment of a given type
assessments.get('/:type', authMiddleware, async (c) => {
  const userId = c.get('userId') as string
  const type = c.req.param('type')

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, assessment_type, responses, score, gaps, gap_report, created_at
       FROM assessments
       WHERE user_id = ? AND assessment_type = ?
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(userId, type).first()

    if (!result) return c.json({ assessment: null })
    return c.json({ assessment: result })
  } catch (err) {
    console.error('assessments GET/:type error', err)
    return c.json({ error: 'Failed to load assessment' }, 500)
  }
})

// POST /api/assessments — submit assessment responses
// Body: { assessment_type: string, responses: object }
assessments.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string

  try {
    const { assessment_type, responses } = await c.req.json() as {
      assessment_type: string
      responses: Record<string, number>
    }

    if (!assessment_type || !responses) {
      return c.json({ error: 'assessment_type and responses are required' }, 400)
    }

    if (assessment_type === 'positioning-gap') {
      return handlePositioningGap(c, userId, responses)
    }

    if (assessment_type === 'authority-signals') {
      return c.json({ error: 'authority-signals is handled by Lesson 2 (Sprint 6C)' }, 400)
    }

    return c.json({ error: 'Unknown assessment type' }, 400)
  } catch (err) {
    console.error('assessments POST error', err)
    return c.json({ error: 'Failed to save assessment' }, 500)
  }
})

// ----------------------------------------------------------------
// Lesson 1: Positioning Gap Assessment
// 5 dimensions rated 1–10
// Scores → gap map → stored in assessments table
// ----------------------------------------------------------------
async function handlePositioningGap(c: any, userId: string, responses: Record<string, number>) {
  const dimensions = [
    { key: 'clarity', label: 'Positioning Clarity', description: 'How clearly you communicate who you help and what you stand for' },
    { key: 'differentiation', label: 'Differentiation', description: 'How distinctly you stand out from other agents in your market' },
    { key: 'authority_signals', label: 'Authority Signals', description: 'The strength of trust indicators in your profile, content, and messaging' },
    { key: 'content_consistency', label: 'Content Consistency', description: 'How consistently your content attracts decision-stage clients' },
    { key: 'boundary_confidence', label: 'Boundary Confidence', description: 'How clearly you filter low-intent prospects without losing business' },
  ]

  // Validate all 5 dimensions are present and 1–10
  for (const dim of dimensions) {
    const val = responses[dim.key]
    if (val === undefined || typeof val !== 'number' || val < 1 || val > 10) {
      return c.json({ error: `Invalid or missing score for dimension: ${dim.key} (must be 1–10)` }, 400)
    }
  }

  // Calculate total score (out of 50)
  const total = dimensions.reduce((sum, d) => sum + responses[d.key], 0)
  const score = Math.round((total / 50) * 100) // Convert to 0–100

  // Identify gaps (score < 7 = gap)
  const gapThreshold = 7
  const gaps = dimensions
    .filter(d => responses[d.key] < gapThreshold)
    .map(d => ({
      key: d.key,
      label: d.label,
      score: responses[d.key],
      gap: gapThreshold - responses[d.key],
      description: d.description,
    }))
    .sort((a, b) => a.score - b.score) // Biggest gaps first

  // Generate gap report text
  const gapReport = generateGapReport(responses, gaps, dimensions, score)

  const id = generateId()

  await c.env.DB.prepare(
    `INSERT INTO assessments (id, user_id, assessment_type, responses, score, gaps, gap_report, created_at)
     VALUES (?, ?, 'positioning-gap', ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    userId,
    JSON.stringify(responses),
    score,
    JSON.stringify(gaps),
    gapReport
  ).run()

  // Mark lesson 1 builder as completed in lesson_progress
  // lesson_id for L1 is seeded as 'lesson-1'
  try {
    await c.env.DB.prepare(
      `INSERT INTO lesson_progress (id, user_id, lesson_id, builder_completed, updated_at)
       VALUES (?, ?, 'lesson-1', 1, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET
         builder_completed = 1,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(generateId(), userId, ).run()
  } catch (progressErr) {
    // Non-fatal — assessment is saved regardless
    console.error('Failed to update lesson_progress for L1', progressErr)
  }

  return c.json({
    success: true,
    assessment: {
      id,
      assessment_type: 'positioning-gap',
      score,
      gaps,
      gap_report: gapReport,
    }
  })
}

function generateGapReport(
  responses: Record<string, number>,
  gaps: Array<{ key: string; label: string; score: number; gap: number; description: string }>,
  dimensions: Array<{ key: string; label: string; description: string }>,
  score: number
): string {
  const level = score >= 80 ? 'Strong' : score >= 60 ? 'Developing' : score >= 40 ? 'Emerging' : 'Foundation'

  let report = `POSITIONING GAP REPORT\n`
  report += `Overall Score: ${score}/100 — ${level} Authority Foundation\n\n`

  report += `DIMENSION SCORES:\n`
  for (const dim of dimensions) {
    const s = responses[dim.key]
    const bar = '█'.repeat(s) + '░'.repeat(10 - s)
    report += `${dim.label.padEnd(26)} ${bar} ${s}/10\n`
  }

  if (gaps.length === 0) {
    report += `\nNO CRITICAL GAPS IDENTIFIED\nYour current positioning foundation is strong across all five dimensions. The next step is generating your positioning statement in Lesson 4.\n`
  } else {
    report += `\nGAPS TO ADDRESS (${gaps.length} dimension${gaps.length > 1 ? 's' : ''} below threshold):\n\n`
    for (const gap of gaps) {
      report += `⚠ ${gap.label} — ${gap.score}/10\n`
      report += `  ${gap.description}\n`
      report += `  Gap: ${gap.gap} point${gap.gap > 1 ? 's' : ''} below the authority threshold\n\n`
    }

    report += `WHAT THIS MEANS:\n`
    if (gaps.find(g => g.key === 'clarity')) {
      report += `• Your positioning lacks the clarity that makes prospects instantly understand who you serve. This is the most critical gap — fix this first in Lesson 3's Context Card review.\n`
    }
    if (gaps.find(g => g.key === 'differentiation')) {
      report += `• You haven't yet built clear differentiation from other agents. Your Lesson 4 positioning statement will address this directly.\n`
    }
    if (gaps.find(g => g.key === 'authority_signals')) {
      report += `• Your authority signals (profile, content, messaging) need strengthening. Lessons 4–6 are designed specifically to fix this.\n`
    }
    if (gaps.find(g => g.key === 'content_consistency')) {
      report += `• Inconsistent content means your audience can't form a clear impression of you. Lessons 6–7 will give you a sustainable content system.\n`
    }
    if (gaps.find(g => g.key === 'boundary_confidence')) {
      report += `• Without clear boundaries, you attract tire-kickers by default. Lesson 8's Boundary Language Library solves this.\n`
    }
  }

  report += `\nNEXT STEP: Continue to Lesson 2 → Visibility vs. Authority`

  return report
}

export default assessments
