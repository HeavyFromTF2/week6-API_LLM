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



# 🤖 AI vs Me — Bonus Stage (The AI Rematch)

This section covers the Bonus Stage, where we compare the hand-written implementation (`src/`) against the AI-generated code placed in an isolated folder (`ai-version/`).

The process followed a natural evolution: starting with a first short prompt (which generated a basic, incomplete setup in a `.zip` file) and culminating in an improved prompt that produced a production-ready application.

## 1. The First Prompt (The short initial version)

To kick off the experiment, a simple prompt was given:

> "I want you to build a Node.js Express app that adds an endpoint to a simple TODO LIST API. It should receive messy input and send it to the LLM, which returns clean, validated JSON with a timeout and a kill switch. The AI should be able to access the information and display it in JSON based on contextualized metrics, such as what category the task belongs to (e.g., "Pay the doctor bill" -> "Finance"). If it cannot determine the category, it should mark it as "other", and these prompt metrics must be isolated. Ensure there is a timeout in place for extreme cases. Be simple"

## 2. Answers to the Three Questions from the PDF

Based on this initial version and the code comparison:

### What did the AI do better (and do I understand the code)?

**Separation of network errors from schema errors:** The AI separated the LLM call from the JSON validation/repair flow. Authentication errors such as `401` fail immediately instead of triggering an unnecessary repair call. I understand this structure and consider it cleaner than handling both failures in the same `try/catch`.

### What did the AI get wrong or ignore from the prompt?

**Timeout handling:** A 15-second timeout was implemented, but the resulting error fell through to the generic handler and returned `500` instead of the required `504 Gateway Timeout`.

**JSON parsing:** The AI used a direct `JSON.parse(raw)` without handling Markdown fences or surrounding prose, meaning valid model output could unnecessarily trigger the repair attempt.

### What did my prompt forget to specify (and what did the AI decide on its own)?

The prompt did not specify the exact category list, `estimated_minutes`, `reason`, or the storage approach. The AI therefore chose its own **6-category list** and an **in-memory CRUD store**, and made everything in a single JS file, while ignoring most of the required points.

## 3. Watch-list Verification Table

| Assignment Trap                             | PDF | Hand-built (`src/`)                                        | AI Version (`ai-version/`)                                       |
| ------------------------------------------- | --- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 10-minute SDK default timeout left in place | —   | Avoided: Explicit 30s timeout configured on the client.    | Avoided: Uses `AbortController` with a strict 15s timeout.       |
| Raw model text returned straight to caller  | —   | Avoided: Returns only validated JSON or quarantine errors. | Avoided: Schema validation prevents returning raw model text.    |
| Retrying on 401 (Auth Error)                | —   | Fixed: Adjusted to fail fast on 401/403 errors.            | Avoided: Code structure isolates network errors prior to repair. |

## 4. The Improved Prompt (Rematch) & What It Achieved

To fix the limitations of the first prompt and meet 100% of the production requirements, the improved prompt was created:

> "I need you to create a simple Node.js API with Express to categorize tasks for a TODO list (CRUD) using an LLM.
>
> The idea is as follows: The user sends any messy text (e.g., "pay doctor bill 50$ urgent") and the API must return a clean, structured JSON response. I want the AI prompt to be isolated in a Markdown file at `prompts/categorize-task-v1.md` (no prompts inside the JS code). Inside, define the rules: the clean task title, a category from a closed list (Work, Personal, Finance, Health, Shopping, Other), priority, and a confidence level. If the AI is in doubt about the task, it must mark it as "Other" and low priority, without inventing details.
>
> On the API code side, ensure the following:
>
> Validate the input with Zod before calling the AI. If the text is invalid, return HTTP 400 immediately.
>
> Set two environment flags: `LLM_STUB=1` to return a fake response (so I can test without spending quota) and `LLM_ENABLED=false` as a kill switch to disable the AI and provide a safe fallback.
>
> When the AI responds, validate that the JSON comes out correct. If it is broken or has incorrect fields, perform a single repair attempt asking the AI to fix the error. If it fails again, save the failure to a log at `logs/quarantine.jsonl` and return HTTP 422. Never return raw model text.
>
> On the model call, set a short timeout of 15 seconds. If there is an authentication error (401/403) or input error (400), DO NOT retry. Only retry if it is a timeout or server error.
>
> Use OpenRouter (https://openrouter.ai/api/v1/chat/completions) as the provider in `llmClient.js` using `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
>
> Log token usage, `duration_ms`, `prompt_version`, and repair status to console for each call.
>
> Include `evals/cases.json` (8 cases), `evals/run-eval.js`, and `tests/run-checkpoints.js` to run all required test assertions automatically.
>
> Ensure that ALL relative file paths (prompts, logs, evals, tests) are scoped internally inside the `/ai-version` folder structure so it operates as a fully standalone application. Put everything you generate inside an `/ai-version` folder."

### Summary of What the Improved Prompt Achieved

**Prompt Isolation:** Extracted system instructions out of JS string literals into a versioned file at `prompts/categorize-task-v1.md`.

**Complete Resilience Pipeline:** Implemented strict input validation with Zod, a single repair attempt for broken JSON, and logged quarantine failures to `logs/quarantine.jsonl` with an HTTP `422` response.

**Strict Retry Policy:** Explicitly forbidden retries on client errors (`400`) or authentication failures (`401/403`), reserving retries strictly for timeouts and server errors (`5xx`).

**Automated Test Infrastructure:** Provided `tests/run-checkpoints.js` and an evaluation suite in `evals/run-eval.js` backed by 8 test cases in `evals/cases.json`.

**Stub Mode & Cost Logging:** Added `LLM_STUB=1` for quota-free testing alongside console telemetry logging token usage, duration, and prompt version.

**Final Rematch Fix:** After adding explicit `504` status assignment in `ai-version/src/llmClient.js` during the rematch, running `npm test` and `npm run eval` resulted in **18/18 checkpoints passing and 8/8 eval cases passing**.

**File Organization:** After this improved prompt, the AI managed to provide the entire project divided in directories, and even more complete than the project I've made before.


# 🤖 AI Usage

AI was used as a learning, code-review, and debugging partner to help me better understand in:

- Extracting system instructions out of JS code into external `.md` files (`prompts/<job>-v1.md`).
- Implementing Zod schema validation, 1-attempt repair retries, and quarantine logging (`logs/quarantine.jsonl`) for malformed model outputs.
- Understanding how to make the AI do strictly structured JSON, self-repair broken output, and fall back safely when unsure instead of hallucinating.
- Setting explicit SDK timeouts (e.g. 15s/30s) and distinguishing transient failures (timeouts, `429`...) from non-retriable auth/client errors (`400`, `401`, `403`).
- Tracking token usage, duration, and repair counts per request, alongside safe fallbacks via `LLM_ENABLED=false`.
- Building isolated test checkpoints and running automated eval suites (`evals/cases.json`) to benchmark output accuracy.
- Creating this README
