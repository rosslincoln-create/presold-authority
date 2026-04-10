-- =============================================================================
-- Pre-Sold Authority System — Correct D1 Schema
-- Source of truth: Live presold-authority-db as at 10 April 2026
-- Verified via PRAGMA table_info() and sqlite_master queries
-- This file is a REFERENCE SNAPSHOT — do NOT run against a live database
-- Use only for fresh database setup or documentation purposes
-- =============================================================================

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  subscription_tier TEXT NOT NULL DEFAULT 'founder',
  user_status TEXT NOT NULL DEFAULT 'pending_activation',
  stripe_customer_id TEXT,
  stripe_session_id TEXT,
  access_granted_at DATETIME,
  access_revoked_at DATETIME,
  last_active_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(user_status);

-- Agent Context Cards
-- NOTE: "values" is a SQLite reserved word — always quote it in queries
CREATE TABLE context_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  full_name TEXT,
  market_location TEXT,
  agent_role TEXT,
  years_experience TEXT,
  client_types TEXT,
  price_range TEXT,
  serious_client_definition TEXT,
  anti_client_description TEXT,
  strengths TEXT,
  "values" TEXT,
  process_step_1 TEXT,
  process_step_2 TEXT,
  process_step_3 TEXT,
  boundary_statement TEXT,
  transactions_range TEXT,
  proof_points TEXT,
  testimonial_snippets TEXT,
  brokerage_name TEXT,
  licence_number TEXT,
  phone TEXT,
  website_url TEXT,
  social_profile_url TEXT,
  broker_disclaimer TEXT,
  state_province TEXT,
  tone_preference TEXT,
  words_to_use TEXT,
  words_to_avoid TEXT,
  cta_preference TEXT,
  cta_next_step TEXT,
  is_complete INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Lessons (content managed by admin — no code deployment needed to update)
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  module_number INTEGER NOT NULL DEFAULT 1,
  lesson_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  transcript TEXT,
  builder_prompt_template TEXT,
  builder_prompt_draft TEXT,
  output_schema TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prompt Version History
CREATE TABLE prompt_versions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  prompt_text TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  published_at DATETIME,
  published_by TEXT,
  preview_output TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);

-- Lesson Progress
CREATE TABLE lesson_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  video_watch_percent INTEGER NOT NULL DEFAULT 0,
  is_complete INTEGER NOT NULL DEFAULT 0,
  builder_completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, lesson_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);

CREATE INDEX idx_lesson_progress_user ON lesson_progress(user_id);

-- Generated Assets (builder outputs — versioned per user per lesson)
CREATE TABLE generated_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson_id TEXT REFERENCES lessons(id),
  asset_type TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  input_snapshot TEXT,
  raw_output TEXT,
  edited_content TEXT,
  r2_pdf_key TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  regeneration_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_generated_assets_user ON generated_assets(user_id);

-- Download Events
CREATE TABLE download_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_id TEXT REFERENCES generated_assets(id),
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Assessments (Lessons 1 & 2 builder outputs)
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  assessment_type TEXT NOT NULL,
  responses TEXT NOT NULL,
  score INTEGER,
  gaps TEXT,
  gap_report TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- App Settings (global config — editable via admin, no deployment needed)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Email Log
CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System Events / Job Log (operational observability)
CREATE TABLE system_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  reference_id TEXT,
  error_message TEXT,
  is_resolved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

-- =============================================================================
-- SCHEMA NOTES
-- =============================================================================
-- 1. context_cards."values" — quoted in ALL queries (SQLite reserved word)
-- 2. lesson_progress uses is_complete, builder_completed, video_watch_percent
--    NOT the old status/started_at/user_inputs columns from Sprint 1
-- 3. lessons uses is_active (not is_published), module_number (not module_id)
-- 4. _cf_KV table is Cloudflare-internal — never reference it in app code
-- 5. All INTEGER boolean columns: 0 = false, 1 = true (SQLite has no BOOLEAN)
-- 6. users.subscription_tier default is 'founder' (not 'free') — all Phase 1
--    purchases land on founder tier directly
-- =============================================================================
