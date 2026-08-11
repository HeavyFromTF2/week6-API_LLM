# 🚀 Todo List API - Task Triage Component - FlyRank Week 6

---

# 🤖 Assignment A17 – LLM Behind the API


## Endpoint Overview

This API endpoint takes a messy, unstructured text description of a task (like "Fix severe server crash on save task button") and uses an AI model to clean it up and classify it. It extracts a clear task title (`suggested_title`), assigns an urgency level (`priority`) and category from a strict list, estimates how many minutes it will take, and gives a confidence score explaining its reasoning—allowing your todo application to automatically organize tasks without human effort.

## Quickstart & Sample cURL

```bash
curl -X POST http://localhost:3000/llm/triage \
  -H "Content-Type: application/json" \
  -d '{"text": "Fix severe application server crash on save task button."}'
```

**Exact Response:**

```json
{
  "suggested_title": "Fix server crash on save button",
  "category": "work",
  "priority": "high",
  "estimated_minutes": 60,
  "confidence": 0.85,
  "reason": "Critical server crash requiring urgent investigation."
}
```

## Job Card

- **Task Description:** Process unstructured user task notes and output structured task metadata.
- **Input:** `{"text": "string, 3-500 characters"}`

- **Output:**
  - `suggested_title` (string)
  - `category` (enum: `work`, `personal`, `health`, `finance`, `learning`, `home`, `other`)
  - `priority` (enum: `low`, `medium`, `high`)
  - `estimated_minutes` (integer: `5` to `480`)
  - `confidence` (float: `0.0` to `1.0`)
  - `reason` (string)

- **It Must Never:**
  - Must NEVER invent a category outside the specified allowed list.
  - Must NEVER return raw text, markdown blocks, or backticks in response bodies.
  - Must NEVER crash or throw unhandled 500 errors on invalid model outputs.
  - Must NEVER bypass schema validation before returning data to the client.
  - Must NEVER leak secret API keys or environment variables in logs or responses.

- **When Unsure:**
  - Return category `"other"` with `priority: "low"` and `confidence` below `0.5`, rather than guessing.

## Provider & Environment Configuration

- **Provider:** OpenRouter
- **Model:** `openrouter/free`

### Three Environment Variables Needed to Swap Providers

```env
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=your_openrouter_api_key_here
LLM_MODEL=openrouter/free
```

## Evaluation Results

- **Execution Date:** 2026-08-11
- **Prompt Version:** `v1` (`prompts/triage-v1.md`)
- **Category Accuracy:** 87.5% (7/8)
- **Exact Match Accuracy:** 37.5% (3/8)

## Cost Log & Daily Scale Estimate

### Single Call Metrics Log

```json
{
  "timestamp": "2026-08-11T20:44:00.000Z",
  "event": "LLM_METRICS",
  "prompt_version": "v1",
  "model": "openrouter/free",
  "prompt_tokens": 210,
  "completion_tokens": 42,
  "total_tokens": 252,
  "duration_ms": 1120,
  "repairs": 0
}
```

### Daily Scale Estimate

For **10,000 requests/day**, at approximately 252 tokens per call:

**~2.52 million tokens/day**

Estimated cost: **~$0.57/day** on standard `gpt-4o-mini` pricing.

## What I'd Fix With Another Day

Calibrate the task priority definitions in `prompts/triage-v1.md` with explicit negative examples to fix the AI's bias toward over-classifying tasks as `medium`/`high` priority.
