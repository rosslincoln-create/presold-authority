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
// Authority Signals scoring (Lesson 2)
// Input: Record<string, boolean>
// Output: score 0–100, gaps array, gap_report string
// ─────────────────────────────────────────────
function scoreAuthoritySignals(responses: Record<string, boolean>): {
  score: number
  gaps: Array<{ category: string; missing: string[]; remediation: string }>
  gapReport: string
} {
  const CATEGORIES = [
    {
      key: 'profile',
      label: 'Profile & Headline',
      questions: [
        { key: 'headline_niche', text: 'Headline mentions a specific niche or target client type' },
        { key: 'photo_professional', text: 'Profile photo looks professional and approachable' },
        { key: 'bio_differentiated', text: 'Bio explains what makes you different, not just credentials' },
      ],
      remediation:
        'Update your LinkedIn headline to name your specific client type and the outcome you deliver. ' +
        'A professional headshot signals authority before a single word is read. ' +
        'Your bio should answer: "Why you, not the agent next door?" — Lessons 4 and 5 install these directly.',
    },
    {
      key: 'content',
      label: 'Content & Posts',
      questions: [
        { key: 'content_expertise', text: 'You post content demonstrating expertise, not just listings' },
        { key: 'posting_frequency', text: 'You post at least once per week consistently' },
        { key: 'content_engagement', text: 'Posts attract engagement from your ideal client type' },
      ],
      remediation:
        'Shift from listing posts to decision-stage content: market insights, process explanations, ' +
        'buyer/seller mistake guides. Module 3 and the Content Pillars builder give you your full topic map.',
    },
    {
      key: 'messaging',
      label: 'Messaging & Positioning',
      questions: [
        { key: 'positioning_statement', text: 'You have a clear one-sentence positioning statement' },
        { key: 'ten_second_clarity', text: 'Prospects understand your specialty within 10 seconds of your profile' },
        { key: 'cross_platform_consistency', text: 'Your messaging is consistent across all platforms' },
      ],
      remediation:
        'The Lesson 4 builder generates your positioning statement in minutes. ' +
        'Once you have it, deploy it to your LinkedIn headline, bio, email signature, and pinned post. ' +
        'Consistency is what makes the authority signal compound.',
    },
    {
      key: 'process',
      label: 'Process & Boundaries',
      questions: [
        { key: 'intake_process', text: 'You have a documented client intake or onboarding process' },
        { key: 'written_standards', text: 'You have written agreements or standards of engagement' },
        { key: 'pre_hire_communication', text: 'You communicate your process to prospects before they hire you' },
      ],
      remediation:
        'A visible process is one of the strongest trust signals available. ' +
        'It tells prospects: "This person is organised, professional, and in control." ' +
        'Lesson 8 covers the boundary language that communicates process without sounding rigid.',
    },
    {
      key: 'proof',
      label: 'Social Proof & Credibility',
      questions: [
        { key: 'testimonials', text: 'You have at least 5 written testimonials publicly visible' },
        { key: 'case_studies', text: 'You have at least one case study or results-based story' },
        { key: 'recognition', text: 'You have third-party recognition: press, awards, or certifications' },
      ],
      remediation:
        'Testimonials are trust currency. If you have them, surface them on LinkedIn, pinned posts, ' +
        'and one-pager inserts. Lesson 5 includes proof cue prompts that work even with a smaller portfolio.',
    },
  ]

  let totalYes = 0
  const gaps: Array<{ category: string; missing: string[]; remediation: string }> = []
  const gapLines: string[] = []

  for (const cat of CATEGORIES) {
    const yesCount = cat.questions.filter((q) => responses[q.key] === true).length
    totalYes += yesCount

    const missing = cat.questions
      .filter((q) => responses[q.key] !== true)
      .map((q) => q.text)

    // Flag as a gap if 2 or more questions in this category are missing
    if (missing.length >= 2) {
      gaps.push({ category: cat.label, missing, remediation: cat.remediation })
      gapLines.push(
        `${cat.label} (${yesCount}/3 signals present)\n` +
        `Missing: ${missing.join('; ')}\n` +
        `Action: ${cat.remediation}`
      )
    } else if (missing.length === 1) {
      gapLines.push(
        `${cat.label} (${yesCount}/3 signals present)\n` +
        `One gap remaining: ${missing[0]}`
      )
    }
  }

  const score = Math.round((totalYes / 15) * 100)

  const gapReport =
    gapLines.length > 0
      ? `Authority Signal Audit — Score: ${score}/100\n\n${gapLines.join('\n\n')}`
      : `Strong Authority Signal Profile — Score: ${score}/100\n\nAll major authority signals are in place. ` +
        `Focus on content consistency and your DM path to compound your advantage.`

  return { score, gaps, gapReport }
}

// ─────────────────────────────────────────────
// POST /api/assessments
// Save or overwrite an assessment for this user
// ─────────────────────────────────────────────
assessments.post('/', async (c) => {
  try {
    const userId = c.get('userId' as never) as string
    const body = await c.req.json() as {
      assessment_type: string
      responses: Record<string, number | boolean>
    }

    const { assessment_type, responses } = body

    if (!assessment_type || !responses || typeof responses !== 'object') {
      return c.json({ error: 'assessment_type and responses are required' }, 400)
    }

    const VALID_TYPES = ['positioning-gap', 'authority-signals']
    if (!VALID_TYPES.includes(assessment_type)) {
      return c.json({ error: 'Invalid assessment_type' }, 400)
    }

    let score: number
    let gaps: unknown[]
    let gapReport: string

    // ── Lesson 2: Authority Signals (yes/no boolean responses) ──────
    if (assessment_type === 'authority-signals') {
      const booleanResponses = responses as Record<string, boolean>
      const result = scoreAuthoritySignals(booleanResponses)
      score = result.score
      gaps = result.gaps
      gapReport = result.gapReport

    // ── Lesson 1: Positioning Gap (1–10 numeric slider responses) ───
    } else {
      const required = [
        'positioning_clarity',
        'authority_signals',
        'content_relevance',
        'inbound_conversion',
        'boundary_language'
      ]
      for (const key of required) {
        const val = (responses as Record<string, number>)[key]
        if (typeof val !== 'number' || val < 1 || val > 10) {
          return c.json({ error: `Invalid value for ${key} — must be 1–10` }, 400)
        }
      }

      const vals = Object.values(responses).filter(v => typeof v === 'number') as number[]
      score = vals.length > 0
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10)
        : 0

      const GAP_THRESHOLD = 7
      const DIMENSION_NOTES: Record<string, string> = {
        positioning_clarity: 'Your positioning statement and differentiators are the first things to install. Lesson 4 builds these directly.',
        authority_signals: 'Your profile headline, About section, and pinned post are your primary trust signals. Lesson 5 installs these.',
        content_relevance: 'Decision-stage content attracts serious clients and filters casual browsers. Lesson 6 builds your content pillars.',
        inbound_conversion: 'A clear DM → clarity → next step flow prevents warm leads from going cold. Lesson 7 installs this.',
        boundary_language: 'Professional boundary language filters tire-kickers before they reach your calendar. Lesson 8 covers this.'
      }

      const numericGaps: Array<{ dimension: string; score: number; note: string }> = []
      for (const [key, val] of Object.entries(responses)) {
        if (typeof val === 'number' && val < GAP_THRESHOLD) {
          numericGaps.push({
            dimension: key,
            score: val,
            note: DIMENSION_NOTES[key] || ''
          })
        }
      }

      gaps = numericGaps
      gapReport = numericGaps.length > 0
        ? `Your assessment identified ${numericGaps.length} gap${numericGaps.length > 1 ? 's' : ''} below the threshold of ${GAP_THRESHOLD}/10:\n\n` +
          numericGaps.map(g => `• ${g.dimension.replace(/_/g, ' ')}: ${g.score}/10 — ${g.note}`).join('\n')
        : 'No critical gaps identified. All dimensions are at or above the threshold of 7/10.'
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Upsert: delete existing then insert
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

    // Mark lesson_progress.builder_completed = 1
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
// GET /api/assessments?type=authority-signals
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
