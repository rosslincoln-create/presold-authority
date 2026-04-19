INSERT INTO app_settings (key, value, updated_at)
VALUES ('lesson_7_video_url', NULL, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = NULL, updated_at = CURRENT_TIMESTAMP;