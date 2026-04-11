import { Hono } from 'hono'
import { authMiddleware } from '../middleware/authMiddleware'
import type { Env } from '../index'

const dashboard = new Hono<{ Bindings: Env }>()

dashboard.use('/*', authMiddleware)

dashboard.get('/', async (c) => {
  try {
    const userId = c.get('userId' as never) as string

    const user = await c.env.DB.prepare(`
    SELECT id, email, full_name, subscription_tier, created_at, last_active_at
    FROM users WHERE id = ?
  `).bind(userId).first() as Record<string, unknown> | null

    const contextCard = await c.env.DB.prepare(`
    SELECT is_complete, updated_at FROM context_cards WHERE user_id = ? LIMIT 1
  `).bind(userId).first() as Record<string, unknown> | null

    const progress = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_lessons,
      SUM(CASE WHEN lp.is_complete = 1 THEN 1 ELSE 0 END) as completed_lessons,
      SUM(CASE WHEN lp.builder_completed = 1 THEN 1 ELSE 0 END) as builders_completed
    FROM lessons l
    LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
    WHERE l.is_active = 1
  `).bind(userId).first() as Record<string, unknown> | null

    const lessonsResult = await c.env.DB.prepare(`
    SELECT 
      l.id, l.module_number, l.lesson_number, l.title,
      l.sort_order, l.is_locked,
      lp.is_complete, lp.builder_completed, lp.video_watch_percent
    FROM lessons l
    LEFT JOIN lesson_progress lp 
      ON l.id = lp.lesson_id AND lp.user_id = ?
    WHERE l.is_active = 1
    ORDER BY l.module_number, l.lesson_number
  `).bind(userId).all()

    const assets = await c.env.DB.prepare(`
    SELECT COUNT(*) as total FROM generated_assets 
    WHERE user_id = ? AND is_current = 1
  `).bind(userId).first() as Record<string, unknown> | null

    const downloads = await c.env.DB.prepare(`
    SELECT COUNT(*) as total FROM download_events WHERE user_id = ?
  `).bind(userId).first() as Record<string, unknown> | null

    const totalLessons = Number(progress?.total_lessons ?? 8) || 8
    const completedLessons = Number(progress?.completed_lessons ?? 0) || 0
    const denom = totalLessons > 0 ? totalLessons : 1

    return c.json({
      user: {
        email: user?.email,
        full_name: user?.full_name,
        subscription_tier: user?.subscription_tier,
        member_since: user?.created_at
      },
      progress: {
        completed_lessons: completedLessons,
        total_lessons: totalLessons,
        progress_percent: Math.round((completedLessons / denom) * 100),
        builders_completed: Number(progress?.builders_completed ?? 0) || 0,
        assets_generated: Number(assets?.total ?? 0) || 0,
        downloads: Number(downloads?.total ?? 0) || 0
      },
      context_card_complete: !!contextCard?.is_complete,
      lessons: (lessonsResult.results as Record<string, unknown>[]).map((l) => ({
        ...l,
        is_complete: !!l.is_complete,
        builder_completed: !!l.builder_completed,
        video_watch_percent: l.video_watch_percent ?? 0
      }))
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('GET /api/dashboard:', err)
    return c.json({ error: 'Internal server error', detail }, 500)
  }
})

export default dashboard
