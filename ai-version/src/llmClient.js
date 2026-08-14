const fs = require("fs");
const path = require("path");
const { LLMAuthError, LLMInputError, LLMTransientError } = require("./utils/errors");

const PROJECT_ROOT = path.join(__dirname, "..");
const PROMPTS_DIR = path.join(PROJECT_ROOT, "prompts");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 15000;

const promptCache = new Map();

/** Loads prompts/categorize-task-<version>.md. The prompt lives ONLY here, never inline in JS. */
function loadPrompt(version = "v1") {
  if (promptCache.has(version)) return promptCache.get(version);
  const filePath = path.join(PROMPTS_DIR, `categorize-task-${version}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  promptCache.set(version, content);
  return content;
}

function isStubMode() {
  return process.env.LLM_STUB === "1";
}

/** Kill switch: "false" (any case) disables AI entirely. Defaults to enabled. */
function isEnabled() {
  return String(process.env.LLM_ENABLED ?? "true").toLowerCase() !== "false";
}

// ---------------------------------------------------------------------------
// Stub mode: deterministic, heuristic-based fake response so the app can be
// developed/tested without spending real LLM quota.
// ---------------------------------------------------------------------------

const STUB_CATEGORY_KEYWORDS = [
  ["Finance", ["bill", "pay", "invoice", "bank", "tax", "salary", "insurance", "$", "money", "refund"]],
  ["Health", ["doctor", "dentist", "medicine", "gym", "hospital", "appointment", "clinic", "therapy"]],
  ["Work", ["meeting", "report", "email", "project", "client", "deadline", "boss", "presentation", "standup"]],
  ["Shopping", ["buy", "purchase", "groceries", "store", "order", "cart", "milk", "eggs"]],
  ["Personal", ["birthday", "call mom", "family", "home", "clean", "mom", "dad", "friend", "gift"]],
];

const STUB_HIGH_PRIORITY = ["urgent", "asap", "immediately", "important", "overdue", "\\bnow\\b"];
const STUB_MEDIUM_PRIORITY = ["tomorrow", "next week", "soon", "\\bthis week\\b"];

/** Matches keyword as a whole word/phrase, avoiding substrings like "this week" inside "this weekend". */
function matchesKeyword(lower, keyword) {
  if (keyword.startsWith("\\b")) {
    return new RegExp(keyword, "i").test(lower);
  }
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower);
}

function stubCleanTitle(text) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled task";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function stubCategorize(text) {
  const lower = text.toLowerCase();
  for (const [category, keywords] of STUB_CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return { category, confidence: 0.85 };
    }
  }
  return { category: "Other", confidence: 0.3 };
}

function stubPriority(text) {
  const lower = text.toLowerCase();
  if (STUB_HIGH_PRIORITY.some((kw) => matchesKeyword(lower, kw))) return "high";
  if (STUB_MEDIUM_PRIORITY.some((kw) => matchesKeyword(lower, kw))) return "medium";
  return "low";
}

/**
 * Fake model response generator for LLM_STUB=1.
 * Supports two magic substrings for deterministic testing of the
 * validation/repair/quarantine pipeline without any network access:
 *   - "force_broken_json"       -> always returns invalid JSON (quarantine path)
 *   - "force_broken_once"       -> invalid JSON on first try, valid on repair
 */
function buildStubResponse(text, { isRepair }) {
  const lower = text.toLowerCase();

  if (lower.includes("force_broken_json")) {
    return { content: "{ this is not valid json, sorry", usage: fakeUsage() };
  }

  if (lower.includes("force_broken_once")) {
    if (!isRepair) {
      return { content: "{ this is not valid json, sorry", usage: fakeUsage() };
    }
    return {
      content: JSON.stringify({
        title: stubCleanTitle(text),
        category: "Other",
        priority: "low",
        confidence: 0.3,
      }),
      usage: fakeUsage(),
    };
  }

  const { category, confidence } = stubCategorize(text);
  const priority = category === "Other" ? "low" : stubPriority(text);
  const body = {
    title: stubCleanTitle(text),
    category,
    priority,
    confidence: category === "Other" ? Math.min(confidence, 0.4) : confidence,
  };
  return { content: JSON.stringify(body), usage: fakeUsage() };
}

function fakeUsage() {
  return { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 };
}

// ---------------------------------------------------------------------------
// Real OpenRouter call, with 15s timeout and a single retry rule:
//   - 401 / 403 (auth)  -> never retried
//   - 400 (bad request) -> never retried
//   - timeout / 5xx     -> retried once
// ---------------------------------------------------------------------------

async function callOpenRouterOnce(messages, { timeoutMs }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    throw new LLMAuthError("Missing OPENROUTER_API_KEY or OPENROUTER_MODEL", 401);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new LLMAuthError(`OpenRouter auth error (${response.status})`, response.status);
    }
    if (response.status === 400) {
      const body = await safeReadText(response);
      throw new LLMInputError(`OpenRouter rejected the request (400): ${body}`, 400);
    }
    if (response.status >= 500 || response.status === 429) {
      const body = await safeReadText(response);
      throw new LLMTransientError(`OpenRouter server/rate-limit error (${response.status}): ${body}`, response.status);
    }
    if (!response.ok) {
      // Any other unexpected non-OK status: treat as non-retryable input-ish error.
      const body = await safeReadText(response);
      throw new LLMInputError(`OpenRouter unexpected error (${response.status}): ${body}`, response.status);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return { content, usage: data?.usage ?? null };
  } catch (err) {
    if (err.name === "AbortError") {
      // Explicit status 504 so the central error handler surfaces a proper
      // Gateway Timeout to the client, per the assignment's "Done means"
      // checklist ("a slow model gets a 504"). Previously this constructed
      // LLMTransientError with no status, which fell through to a generic 500.
      throw new LLMTransientError(`OpenRouter request timed out after ${timeoutMs}ms`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}

async function callOpenRouterWithRetry(messages, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    return await callOpenRouterOnce(messages, { timeoutMs });
  } catch (err) {
    const retryable = err instanceof LLMTransientError;
    if (!retryable) throw err; // auth (401/403) and input (400) errors: never retried
    // Single retry for timeout / server error / rate limit.
    return await callOpenRouterOnce(messages, { timeoutMs });
  }
}

// ---------------------------------------------------------------------------
// Public entry point used by categorizeService.
// ---------------------------------------------------------------------------

/**
 * @param {string} text - the raw user input.
 * @param {object} opts
 * @param {string} opts.promptVersion - e.g. "v1"
 * @param {boolean} [opts.isRepair] - whether this is a repair (fix-my-JSON) call
 * @param {string} [opts.brokenOutput] - the invalid output from the previous attempt
 * @param {string} [opts.validationError] - human-readable validation error to feed back
 * @returns {Promise<{content: string, usage: object|null, durationMs: number, model: string}>}
 */
async function categorize(text, opts = {}) {
  const { promptVersion = "v1", isRepair = false, brokenOutput = null, validationError = null } = opts;
  const systemPrompt = loadPrompt(promptVersion);
  const model = process.env.OPENROUTER_MODEL || (isStubMode() ? "stub/heuristic-v1" : null);

  const started = Date.now();

  if (isStubMode()) {
    const { content, usage } = buildStubResponse(text, { isRepair });
    const durationMs = Date.now() - started;
    return { content, usage, durationMs, model: "stub/heuristic-v1" };
  }

  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: text }];

  if (isRepair) {
    messages.push({ role: "assistant", content: brokenOutput ?? "" });
    messages.push({
      role: "user",
      content:
        `Your previous response was not valid according to the required JSON contract. ` +
        `Validation error: ${validationError}. ` +
        `Re-read the original task text above and return ONE corrected JSON object only, ` +
        `with no extra text and no markdown fences.`,
    });
  }

  const { content, usage } = await callOpenRouterWithRetry(messages, { timeoutMs: DEFAULT_TIMEOUT_MS });
  const durationMs = Date.now() - started;
  return { content, usage, durationMs, model };
}

module.exports = {
  categorize,
  loadPrompt,
  isStubMode,
  isEnabled,
};
