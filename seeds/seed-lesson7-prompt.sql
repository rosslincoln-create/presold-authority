UPDATE lessons
SET
  builder_prompt_template = '{
  "posts-10": "You are an authority content writer for real estate agents. Your task is to generate 10 LinkedIn posts that build trust with serious, decision-stage buyers and sellers — and naturally filter out tire-kickers.\n\nAGENT CONTEXT:\n{context_card}\n\nCONTENT PILLARS (use these as the framework for post topics — spread posts across all 4 pillars where possible. If empty, generate posts based on the context card alone covering a natural spread of decision-stage topics):\n{prior_asset}\n\nGenerate exactly 10 posts. Each post must follow this structure:\n1. Hook — one line that stops a serious buyer or seller scrolling. No clickbait. No hype.\n2. Clarity paragraph — 2-3 sentences explaining the insight or point of view.\n3. Three bullet insights — specific, process-based, believable.\n4. Soft CTA — one line inviting action without pressure. Use the agent''s preferred CTA style from their context card.\n\nReturn valid JSON matching the output schema exactly:\n\n{\n  \"posts\": [\n    {\n      \"post_number\": 1,\n      \"pillar_reference\": \"The pillar title this post belongs to\",\n      \"hook\": \"...\",\n      \"clarity_paragraph\": \"...\",\n      \"bullets\": [\"...\", \"...\", \"...\"],\n      \"cta\": \"...\",\n      \"word_count\": 0\n    }\n  ],\n  \"alternative_hooks\": [\"...\", \"...\", \"...\", \"...\", \"...\", \"...\", \"...\", \"...\", \"...\", \"...\"]\n}\n\nRULES:\n- Tone: calm, authoritative, premium. No hype. No guaranteed outcomes. No ''list with me.'' No ''DM me.''\n- Each post must subtly repel tire-kickers — serious language, process references, decision-stage framing.\n- Posts must feel like they come from a calm advisor, not a salesperson.\n- Spread posts across the content pillars provided. Do not cluster all posts in one pillar.\n- word_count should be the actual word count of hook + clarity_paragraph + bullets + cta combined.\n- All 10 posts must be complete and distinct.",
  "dm-flow": "You are a conversion strategist for real estate agents. Your task is to generate a complete inbound DM conversation path — simple, warm, and authority-based. No pressure. No scripts that sound like scripts.\n\nAGENT CONTEXT:\n{context_card}\n\nGenerate the following in valid JSON matching the output schema exactly:\n\n{\n  \"dm_openers\": [\"...\", \"...\", \"...\", \"...\", \"...\"],\n  \"dm_sequence\": [\n    { \"message_number\": 1, \"purpose\": \"...\", \"message\": \"...\" },\n    { \"message_number\": 2, \"purpose\": \"...\", \"message\": \"...\" },\n    { \"message_number\": 3, \"purpose\": \"...\", \"message\": \"...\" },\n    { \"message_number\": 4, \"purpose\": \"...\", \"message\": \"...\" },\n    { \"message_number\": 5, \"purpose\": \"...\", \"message\": \"...\" },\n    { \"message_number\": 6, \"purpose\": \"...\", \"message\": \"...\" }\n  ],\n  \"no_response_followups\": [\"...\", \"...\", \"...\", \"...\", \"...\"],\n  \"handoff_message\": \"...\",\n  \"call_opener\": \"...\"\n}\n\nRULES:\n- Tone: calm advisor. No pressure. No hype.\n- DM openers must feel natural — not like a funnel entry point.\n- The 6-message sequence moves: interest acknowledged → clarity on situation → next step offered → confirmation → handoff → follow-through.\n- No-response follow-ups are gentle, not chasing.\n- Handoff message books a call without pressure.\n- Call opener sets a serious, calm tone in the first 30 seconds.\n- All messages must be short enough to send on mobile without editing."
}',

  output_schema = '{
  "posts-10": {
    "type": "object",
    "required": ["posts", "alternative_hooks"],
    "properties": {
      "posts": {
        "type": "array",
        "minItems": 10,
        "maxItems": 10,
        "items": {
          "type": "object",
          "required": ["post_number", "pillar_reference", "hook", "clarity_paragraph", "bullets", "cta", "word_count"],
          "properties": {
            "post_number": { "type": "integer" },
            "pillar_reference": { "type": "string" },
            "hook": { "type": "string" },
            "clarity_paragraph": { "type": "string" },
            "bullets": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string" } },
            "cta": { "type": "string" },
            "word_count": { "type": "integer" }
          }
        }
      },
      "alternative_hooks": {
        "type": "array",
        "minItems": 10,
        "maxItems": 10,
        "items": { "type": "string" }
      }
    }
  },
  "dm-flow": {
    "type": "object",
    "required": ["dm_openers", "dm_sequence", "no_response_followups", "handoff_message", "call_opener"],
    "properties": {
      "dm_openers": { "type": "array", "minItems": 5, "maxItems": 5, "items": { "type": "string" } },
      "dm_sequence": {
        "type": "array",
        "minItems": 6,
        "maxItems": 6,
        "items": {
          "type": "object",
          "required": ["message_number", "purpose", "message"],
          "properties": {
            "message_number": { "type": "integer" },
            "purpose": { "type": "string" },
            "message": { "type": "string" }
          }
        }
      },
      "no_response_followups": { "type": "array", "minItems": 5, "maxItems": 5, "items": { "type": "string" } },
      "handoff_message": { "type": "string" },
      "call_opener": { "type": "string" }
    }
  }
}'

WHERE id = 'lesson-7';
