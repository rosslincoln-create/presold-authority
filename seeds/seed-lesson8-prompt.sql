UPDATE lessons
SET
  builder_prompt_template = '{
  "boundary-library": "You are a communication coach for real estate agents. Your task is to generate a complete boundary language library — professional, calm phrases that attract serious clients and protect the agent''s time without sounding harsh or salesy.\n\nAGENT CONTEXT:\n{context_card}\n\nGenerate the following in valid JSON matching the output schema exactly:\n\n{\n  \"post_filter_lines\": [\"string\"],\n  \"dm_boundary_lines\": [\"string\"],\n  \"call_opening_lines\": [\"string\"],\n  \"time_protection_lines\": [\"string\"],\n  \"objection_responses\": [\n    { \"objection\": \"string\", \"response\": \"string\" }\n  ]\n}\n\nRULES:\n- Tone: calm, professional, authoritative. No harshness. No ultimatums.\n- Post filter lines: subtle phrases embedded in posts that signal ''serious clients only'' without saying it directly.\n- DM boundary lines: short, warm responses that qualify interest without alienating genuine prospects.\n- Call opening lines: phrases that set a professional, structured tone in the first 30 seconds.\n- Time protection lines: polite phrases for redirecting after-hours contacts and low-priority interruptions.\n- Objection responses: calm, authority-based responses to commission pressure and skepticism. Each must be short enough to say naturally in conversation.\n- Generate at least 10 post_filter_lines, 8 dm_boundary_lines, 8 call_opening_lines, 8 time_protection_lines, and 10 objection_responses.\n- All language must be compliant — no guaranteed outcomes, no misleading claims."
}',

  output_schema = '{
  "boundary-library": {
    "type": "object",
    "required": ["post_filter_lines", "dm_boundary_lines", "call_opening_lines", "time_protection_lines", "objection_responses"],
    "properties": {
      "post_filter_lines": { "type": "array", "minItems": 10, "items": { "type": "string" } },
      "dm_boundary_lines": { "type": "array", "minItems": 8, "items": { "type": "string" } },
      "call_opening_lines": { "type": "array", "minItems": 8, "items": { "type": "string" } },
      "time_protection_lines": { "type": "array", "minItems": 8, "items": { "type": "string" } },
      "objection_responses": {
        "type": "array",
        "minItems": 10,
        "items": {
          "type": "object",
          "required": ["objection", "response"],
          "properties": {
            "objection": { "type": "string" },
            "response": { "type": "string" }
          }
        }
      }
    }
  }
}'

WHERE id = 'lesson-8';