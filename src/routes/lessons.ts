import { Hono } from 'hono'
import { authMiddleware } from '../middleware/authMiddleware'
import { generateId } from '../lib/auth'

const lessons = new Hono<{ Bindings: any }>()

lessons.use('/*', authMiddleware)

// GET /api/lessons — all lessons with user progress
lessons.get('/', async (c) => {
  const userId = c.get('userId' as never) as string

  const result = await c.env.DB.prepare(`
    SELECT 
      l.id, l.module_number, l.lesson_number, l.title, l.description,
      l.video_url, l.sort_order, l.is_active, l.is_locked,
      lp.video_watch_percent, lp.is_complete, lp.builder_completed,
      lp.notes, lp.completed_at
    FROM lessons l
    LEFT JOIN lesson_progress lp 
      ON l.id = lp.lesson_id AND lp.user_id = ?
    WHERE l.is_active = 1
    ORDER BY l.module_number, l.lesson_number
  `).bind(userId).all()

  const modules: Record<number, any[]> = {}
  for (const lesson of result.results as any[]) {
    const mod = lesson.module_number
    if (!modules[mod]) modules[mod] = []
    modules[mod].push({
      ...lesson,
      video_watch_percent: lesson.video_watch_percent ?? 0,
      is_complete: !!lesson.is_complete,
      builder_completed: !!lesson.builder_completed
    })
  }

  return c.json({ modules })
})

// GET /api/lessons/:id/progress — current lesson_progress row (e.g. notes)
lessons.get('/:id/progress', async (c) => {
  const userId = c.get('userId' as never) as string
  const lessonId = c.req.param('id')

  const row = await c.env.DB.prepare(`
    SELECT id, user_id, lesson_id, video_watch_percent, is_complete, builder_completed,
           notes, completed_at, created_at, updated_at
    FROM lesson_progress
    WHERE user_id = ? AND lesson_id = ?
  `).bind(userId, lessonId).first() as Record<string, unknown> | null

  if (!row) {
    return c.json({
      notes: '',
      video_watch_percent: 0,
      is_complete: false,
      builder_completed: false
    })
  }

  return c.json({
    ...row,
    video_watch_percent: row.video_watch_percent ?? 0,
    is_complete: !!row.is_complete,
    builder_completed: !!row.builder_completed,
    notes: row.notes ?? ''
  })
})

// GET /api/lessons/:id — single lesson with prev/next navigation
lessons.get('/:id', async (c) => {
  const userId = c.get('userId' as never) as string
  const lessonId = c.req.param('id')

  const lesson = await c.env.DB.prepare(`
    SELECT 
      l.id, l.module_number, l.lesson_number, l.title, l.description,
      l.video_url, l.transcript, l.sort_order,
      lp.video_watch_percent, lp.is_complete, lp.builder_completed,
      lp.notes, lp.completed_at
    FROM lessons l
    LEFT JOIN lesson_progress lp 
      ON l.id = lp.lesson_id AND lp.user_id = ?
    WHERE l.id = ? AND l.is_active = 1
  `).bind(userId, lessonId).first() as any

  if (!lesson) {
    return c.json({ error: 'Lesson not found' }, 404)
  }

  const allLessons = await c.env.DB.prepare(`
    SELECT id, module_number, lesson_number, title
    FROM lessons WHERE is_active = 1
    ORDER BY module_number, lesson_number
  `).all()

  const list = allLessons.results as any[]
  const idx = list.findIndex(l => l.id === lessonId)
  const prevLesson = idx > 0 ? list[idx - 1] : null
  const nextLesson = idx < list.length - 1 ? list[idx + 1] : null

  return c.json({
    lesson: {
      ...lesson,
      video_watch_percent: lesson.video_watch_percent ?? 0,
      is_complete: !!lesson.is_complete,
      builder_completed: !!lesson.builder_completed,
      notes: lesson.notes ?? ''
    },
    navigation: { prevLesson, nextLesson }
  })
})

// POST /api/lessons/:id/progress — save progress
lessons.post('/:id/progress', async (c) => {
  const userId = c.get('userId' as never) as string
  const lessonId = c.req.param('id')
  const body = await c.req.json()

  const existing = await c.env.DB.prepare(`
    SELECT id FROM lesson_progress WHERE user_id = ? AND lesson_id = ?
  `).bind(userId, lessonId).first<{ id: string }>()

  const now = new Date().toISOString()
  const isComplete = body.is_complete ? 1 : 0

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE lesson_progress SET
        video_watch_percent = COALESCE(?, video_watch_percent),
        is_complete = COALESCE(?, is_complete),
        builder_completed = COALESCE(?, builder_completed),
        notes = COALESCE(?, notes),
        completed_at = CASE 
          WHEN ? = 1 AND completed_at IS NULL THEN ? 
          ELSE completed_at END,
        updated_at = ?
      WHERE user_id = ? AND lesson_id = ?
    `).bind(
      body.video_watch_percent ?? null,
      body.is_complete !== undefined ? isComplete : null,
      body.builder_completed !== undefined ? (body.builder_completed ? 1 : 0) : null,
      body.notes ?? null,
      isComplete, now,
      now,
      userId, lessonId
    ).run()
  } else {
    const id = generateId()
    await c.env.DB.prepare(`
      INSERT INTO lesson_progress (
        id, user_id, lesson_id, video_watch_percent, is_complete,
        builder_completed, notes, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, lessonId,
      body.video_watch_percent ?? 0,
      isComplete,
      body.builder_completed ? 1 : 0,
      body.notes ?? null,
      body.is_complete ? now : null,
      now, now
    ).run()
  }

  await c.env.DB.prepare(
    'UPDATE users SET last_active_at = ? WHERE id = ?'
  ).bind(now, userId).run()

  return c.json({ success: true })
})

export default lessons
