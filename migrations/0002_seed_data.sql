-- ─── App Settings ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO app_settings ("key", value) VALUES
  ('platform_name', 'Pre-Sold Authority System'),
  ('support_email', 'support@presoldauthority.com'),
  ('founder_price_display', '$147'),
  ('regular_price_display', '$497'),
  ('guarantee_days', '14'),
  ('checkout_headline', 'Get Instant Access to the Pre-Sold Authority System'),
  ('checkout_description', 'The complete positioning framework for real estate agents who want inbound clients.'),
  ('vsl_embed_url', 'https://iframe.mediadelivery.net/embed/placeholder');

-- ─── Lessons ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO lessons (id, lesson_number, title, description, is_published) VALUES
  ('lesson-1', 1, 'Your Authority Foundation', 'Define your positioning and the core identity that attracts the right clients.', 1),
  ('lesson-2', 2, 'Your Ideal Client Avatar', 'Get crystal clear on exactly who you serve and what they desperately want.', 1),
  ('lesson-3', 3, 'Your Signature Mechanism', 'Create your unique framework that makes you the obvious expert choice.', 1),
  ('lesson-4', 4, 'Authority Content System', 'Build a repeatable content system that pre-sells prospects before they reach out.', 1),
  ('lesson-5', 5, 'LinkedIn Authority Profile', 'Optimise your LinkedIn presence to attract and convert serious clients inbound.', 1),
  ('lesson-6', 6, 'The Pre-Sold Conversation', 'Master the DM-to-client conversation framework that closes without pressure.', 1),
  ('lesson-7', 7, 'Social Proof Architecture', 'Build and deploy trust signals that make clients choose you before the first call.', 1),
  ('lesson-8', 8, 'Your 90-Day Authority Plan', 'Create your personalised implementation roadmap to activate everything you have built.', 1);
