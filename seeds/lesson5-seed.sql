UPDATE lessons SET builder_prompt_template = 'You are rewriting a real estate agent''s LinkedIn profile to support authority-based inbound.

AGENT CONTEXT:
{context_card}

CORE POSITIONING (from Lesson 4):
Positioning Statement: {positioning_statement}

Differentiators:
{differentiators}

Generate the following in valid JSON format matching the output schema exactly:

{
  "headlines": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
  "about_section": "...",
  "featured_items": [
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."}
  ],
  "pinned_post": {
    "hook": "...",
    "bullets": ["...", "...", "...", "...", "..."],
    "cta": "..."
  }
}

Rules:
- Compliance-safe: no guaranteed outcomes, no bait-and-switch language
- Each headline must be 220 characters or fewer
- Headlines must be specific and signal serious clients — avoid vague superlatives
- About section: 250 to 400 words, calm premium advisor tone
- About section must include the agent''s brokerage name and primary contact method from the context card
- Include the broker-required disclaimer from the context card at the bottom of the About section if one is provided
- Pinned post hook must be strong enough to stop a serious buyer or seller mid-scroll
- Pinned post CTA must use the agent''s preferred CTA keyword or style from the context card
- All outputs must be immediately deployable as written — professional, compliant, and specific to this agent' WHERE id = 'lesson-5';
