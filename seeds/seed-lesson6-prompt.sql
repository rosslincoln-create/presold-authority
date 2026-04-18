UPDATE lessons
SET
  builder_prompt_template = 'You are a content strategy expert for real estate agents. Your task is to generate a complete content pillar framework that attracts serious, decision-stage buyers and sellers — and naturally filters out tire-kickers.

AGENT CONTEXT:
{context_card}

Generate the following in valid JSON format matching the output schema exactly:

{
  "pillars": [
    {
      "pillar_number": 1,
      "pillar_title": "...",
      "pillar_purpose": "One sentence: what this pillar does for the agent''s authority.",
      "topics": [
        "...",
        "...",
        "...",
        "...",
        "...",
        "...",
        "...",
        "...",
        "...",
        "..."
      ],
      "avoid_topics": [
        "...",
        "...",
        "..."
      ]
    },
    {
      "pillar_number": 2,
      "pillar_title": "...",
      "pillar_purpose": "...",
      "topics": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
      "avoid_topics": ["...", "...", "..."]
    },
    {
      "pillar_number": 3,
      "pillar_title": "...",
      "pillar_purpose": "...",
      "topics": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
      "avoid_topics": ["...", "...", "..."]
    },
    {
      "pillar_number": 4,
      "pillar_title": "...",
      "pillar_purpose": "...",
      "topics": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
      "avoid_topics": ["...", "...", "..."]
    }
  ],
  "filter_lines": [
    "...",
    "...",
    "...",
    "...",
    "...",
    "...",
    "...",
    "...",
    "...",
    "..."
  ]
}

RULES:
- Tone: calm, authoritative, premium. No hype. No guaranteed outcomes.
- All 4 pillars must be distinct — no overlap in topic territory.
- Topics must target decision-stage buyers or sellers — people actively considering a transaction.
- Avoid entertainment content, lifestyle posts, or visibility-for-its-own-sake topics.
- Filter lines are subtle, professional phrases the agent can embed in posts to signal they work with serious people only. Not harsh. Not salesy.
- Tailor every pillar title and topic to the agent''s specific market, role, and ideal client from the context card.
- avoid_topics per pillar should call out content that looks relevant but attracts low-intent audiences.',

  output_schema = '{
  "type": "object",
  "required": ["pillars", "filter_lines"],
  "properties": {
    "pillars": {
      "type": "array",
      "minItems": 4,
      "maxItems": 4,
      "items": {
        "type": "object",
        "required": ["pillar_number", "pillar_title", "pillar_purpose", "topics", "avoid_topics"],
        "properties": {
          "pillar_number": { "type": "integer" },
          "pillar_title": { "type": "string" },
          "pillar_purpose": { "type": "string" },
          "topics": {
            "type": "array",
            "minItems": 10,
            "maxItems": 10,
            "items": { "type": "string" }
          },
          "avoid_topics": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string" }
          }
        }
      }
    },
    "filter_lines": {
      "type": "array",
      "minItems": 10,
      "maxItems": 10,
      "items": { "type": "string" }
    }
  }
}'

WHERE id = 'lesson-6';
