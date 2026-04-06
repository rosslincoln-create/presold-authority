-- ─── Sprint 5: Dashboard and Lesson Shell ─────────────────────────────────────
-- Adds columns required by Sprint 5 API routes.
-- Uses ALTER TABLE ADD COLUMN (safe - no-op if column already exists in D1).

-- ─── Users: add full_name ─────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN full_name TEXT;

-- ─── Lessons: add Sprint 5 columns ───────────────────────────────────────────
ALTER TABLE lessons ADD COLUMN module_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lessons ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lessons ADD COLUMN transcript TEXT;

-- ─── Lesson Progress: replace Sprint 1 schema with Sprint 5 columns ──────────
-- Sprint 1 had: status, started_at, user_inputs
-- Sprint 5 needs: video_watch_percent, is_complete, builder_completed, notes
ALTER TABLE lesson_progress ADD COLUMN video_watch_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN is_complete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN builder_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN notes TEXT;

-- ─── Generated Assets: add is_current flag ────────────────────────────────────
ALTER TABLE generated_assets ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1;

-- ─── Lessons: update seed data with module assignments ────────────────────────
-- Map 8 lessons across 5 modules per the Pre-Sold Authority curriculum
UPDATE lessons SET module_number = 1, sort_order = 1, is_active = 1 WHERE id = 'lesson-1';
UPDATE lessons SET module_number = 1, sort_order = 2, is_active = 1 WHERE id = 'lesson-2';
UPDATE lessons SET module_number = 2, sort_order = 3, is_active = 1 WHERE id = 'lesson-3';
UPDATE lessons SET module_number = 2, sort_order = 4, is_active = 1 WHERE id = 'lesson-4';
UPDATE lessons SET module_number = 3, sort_order = 5, is_active = 1 WHERE id = 'lesson-5';
UPDATE lessons SET module_number = 3, sort_order = 6, is_active = 1 WHERE id = 'lesson-6';
UPDATE lessons SET module_number = 4, sort_order = 7, is_active = 1 WHERE id = 'lesson-7';
UPDATE lessons SET module_number = 5, sort_order = 8, is_active = 1 WHERE id = 'lesson-8';
