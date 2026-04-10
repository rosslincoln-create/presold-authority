-- Migration 0004: Verify assessments table + seed Lesson 1 data
-- Sprint 6B — Lesson 1 Builder
-- Run: wrangler d1 migrations apply presold-authority-db

-- Ensure assessments table matches PRD v3.0 schema
-- (Already created in 0001 — this is a safety check migration only)

-- Seed Lesson 1 into lessons table (if not already present via 0002)
-- lesson_id is 'lesson-1' — referenced by assessments.ts and lesson-1.html

INSERT OR IGNORE INTO lessons (
  id,
  module_id,
  module_number,
  lesson_number,
  title,
  description,
  video_url,
  transcript,
  builder_prompt_template,
  output_schema,
  sort_order,
  is_active,
  is_locked,
  created_at,
  updated_at
) VALUES (
  'lesson-1',
  'module-1',
  1,
  1,
  'The Shift — Why Good Agents Still Look Interchangeable',
  'Install the core belief: the problem isn''t effort — it''s positioning. Understand why pre-sold clients exist and what creates them.',
  NULL,
  'Welcome back. In this lesson I want to explain the real reason most agents struggle to attract serious inbound clients. It''s not because they''re not good at their job. Most agents are competent. Many are excellent. The problem is that to a prospect, most agents look interchangeable. And when you look interchangeable, the prospect''s brain does something predictable: they shop you on commission. They compare you to someone else. They keep you in the maybe column. That''s why the first conversation often feels skeptical. Now here''s the key shift: buyers and sellers decide who they trust before they reach out. They scan your profile, your posts, your signals. And they make a judgment quickly. So the goal of this program is not post more. It''s to become the safe choice before the conversation starts. That''s what I mean by pre-sold.',
  NULL,
  NULL,
  10,
  1,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Seed Lesson 2 (for sidebar navigation target)
INSERT OR IGNORE INTO lessons (
  id, module_id, module_number, lesson_number, title, description,
  sort_order, is_active, is_locked, created_at, updated_at
) VALUES (
  'lesson-2', 'module-1', 1, 2,
  'Visibility vs. Authority — What Actually Creates Trust',
  'Differentiate from generic post-daily advice. Define the 3 authority signals that change how inbound clients perceive you.',
  20, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Update appsettings with lesson count for dashboard display
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('total_lessons', '8', CURRENT_TIMESTAMP);

