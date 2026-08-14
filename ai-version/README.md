# todo-ai-categorizer (`/ai-version`)

A standalone Express + Zod + OpenRouter API that turns messy free-form text
into a structured TODO task (title, category, priority, confidence).

Everything needed to run, test, and evaluate this service lives inside this
`/ai-version` folder — all relative paths (prompt file, logs, evals, tests)
are resolved relative to the project root via `path.join(__dirname, ...)`,
so it works regardless of the directory you launch `node` from.

## Structure

```
ai-version/
├── prompts/
│   └── categorize-task-v1.md     # the ONLY place the AI prompt/rules live
├── src/
│   ├── app.js                    # Express app + central error handler
│   ├── server.js                 # entrypoint
│   ├── llmClient.js               # OpenRouter integration, timeout/retry, stub mode
│   ├── controllers/taskController.js
│   ├── services/categorizeService.js  # parse -> validate -> repair -> quarantine
│   ├── schemas/taskSchema.js      # Zod: input validation + AI output validation
│   ├── store/taskStore.js         # in-memory CRUD store
│   └── routes/tasks.js
├── logs/
│   └── quarantine.jsonl           # unrecoverable AI failures (created at runtime)
├── evals/
│   ├── cases.json                 # 8 categorization test cases
│   └── run-eval.js                # eval runner (stub mode by default)
├── tests/
│   └── run-checkpoints.js         # end-to-end assertions (no framework needed)
├── package.json
└── .env.example
```

## Setup

```bash
cd ai-version
npm install
cp .env.example .env   # then fill in OPENROUTER_API_KEY etc. if you want real calls
```

## Running

```bash
npm start          # runs with whatever is in your environment / .env
npm run dev         # auto-restart on file changes (Node's --watch)
```

Health check: `GET /health`

## Environment flags

| Variable              | Purpose                                                                 |
|------------------------|--------------------------------------------------------------------------|
| `LLM_STUB=1`           | Returns a deterministic fake AI response — no network call, no quota spent. Good for local dev/tests. |
| `LLM_ENABLED=false`    | Kill switch. Disables AI entirely and returns a safe fallback (`category: Other`, `priority: low`, `confidence: 0`), still validated the same way as an AI response. |
| `OPENROUTER_API_KEY`   | Required for real calls.                                                |
| `OPENROUTER_MODEL`     | e.g. `openai/gpt-4o-mini`.                                               |
| `LLM_TIMEOUT_MS`       | Defaults to `15000` (15s) per attempt.                                   |
| `PORT`                 | Defaults to `3000`.                                                      |

`LLM_STUB` takes priority over making any real HTTP request; `LLM_ENABLED=false`
takes priority over everything (no AI call, no stub, straight to fallback).

## API

### `POST /api/tasks`
Body: `{ "text": "pay doctor bill 50$ urgent" }`

- `400` if `text` is missing, not a string, or outside 3–500 chars (validated with
  Zod **before** any AI call).
- `201` with the created task on success (AI-categorized or fallback).
- `422` if the AI response is invalid JSON / fails schema validation on both
  the first attempt and the single repair attempt. The raw model output is
  never returned to the client — it's written to `logs/quarantine.jsonl` for
  offline review.

### `GET /api/tasks` — list all tasks
### `GET /api/tasks/:id` — get one task (`404` if missing)
### `PUT /api/tasks/:id` — manual edit of `title` / `category` / `priority`, Zod-validated, no AI call
### `DELETE /api/tasks/:id` — `204` on success

## AI pipeline (`src/services/categorizeService.js`)

1. **Kill switch check** — if `LLM_ENABLED=false`, skip AI entirely and return
   a deterministic fallback (`Other` / `low` / `confidence: 0`).
2. **First attempt** — call the model with the system prompt loaded from
   `prompts/categorize-task-v1.md` (the prompt text never lives in JS).
3. **Validate** — `JSON.parse` + Zod `.strict()` schema (rejects unknown
   fields, wrong types, out-of-range values, or values outside the closed
   category/priority lists).
4. **Repair (single attempt)** — if invalid, send the original text, the
   previous (broken) response, and the validation error back to the model,
   asking for one corrected JSON object.
5. **Quarantine** — if the repair also fails validation, append a record
   (input text, both raw responses, validation errors) to
   `logs/quarantine.jsonl` and respond `422`. Raw model text is **never**
   sent to the HTTP client.

Every attempt logs a structured JSON line to the console with
`prompt_version`, `duration_ms`, token usage, `repair_status`
(`none|succeeded|failed`), and outcome (`ok|quarantined|fallback`).

## LLM client retry policy (`src/llmClient.js`)

- 15s timeout per HTTP attempt (`AbortController`, configurable via
  `LLM_TIMEOUT_MS`).
- `401` / `403` (auth) → thrown immediately, **never retried**.
- `400` (bad request to provider) → thrown immediately, **never retried**.
- Timeout / `5xx` / `429` → **retried once**, then thrown if it fails again.

## Testing

```bash
npm test            # tests/run-checkpoints.js — boots the real app in-process
                     # over HTTP and asserts: input validation, stub mode,
                     # kill switch, repair success, quarantine + 422 + no
                     # leaked raw text, full CRUD lifecycle, and prompt
                     # isolation (no prompt text inlined in any .js file).
```

## Evals

```bash
npm run eval         # evals/run-eval.js — runs the 8 cases in evals/cases.json
                      # against LLM_STUB=1 by default.
LLM_STUB=0 npm run eval   # run against the real OpenRouter model instead
```

Both `tests/` and `evals/` default to stub mode so they can run in CI without
any API key or network access. Set `LLM_STUB=0` (with valid
`OPENROUTER_API_KEY` / `OPENROUTER_MODEL`) to exercise the real provider.

## Notes on the closed category list

`Work | Personal | Finance | Health | Shopping | Other` — enforced in two
places that must stay in sync:
- `prompts/categorize-task-v1.md` (what the model is told)
- `src/schemas/taskSchema.js` (`CATEGORIES`, what Zod actually accepts)

If you add a category, update both files, plus ideally the eval cases.
