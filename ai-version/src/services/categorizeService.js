const llmClient = require("../llmClient");
const { aiOutputSchema } = require("../schemas/taskSchema");
const { logLlmCall, writeQuarantine } = require("../utils/logger");
const { QuarantineError } = require("../utils/errors");

const PROMPT_VERSION = "v1";

/**
 * Attempts to parse `raw` as JSON, then validate it against aiOutputSchema.
 * Returns { ok: true, data } or { ok: false, error } — never throws.
 */
function parseAndValidate(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `Response is not valid JSON: ${err.message}` };
  }

  const result = aiOutputSchema.safeParse(parsed);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, error: message };
  }
  return { ok: true, data: result.data };
}

/** Deterministic, non-AI fallback used when the LLM kill switch is off. */
function safeFallback(text) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const title = trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1).slice(0, 118) : "Untitled task";
  return {
    title,
    category: "Other",
    priority: "low",
    confidence: 0,
  };
}

/**
 * Main entry point: turns raw user text into a validated, structured task
 * payload. Never returns or throws raw model text to the caller — on
 * unrecoverable failure it quarantines the failure and throws QuarantineError.
 *
 * @param {string} text
 * @returns {Promise<{title:string, category:string, priority:string, confidence:number, meta:object}>}
 */
async function categorizeTask(text) {
  if (!llmClient.isEnabled()) {
    logLlmCall({
      promptVersion: PROMPT_VERSION,
      durationMs: 0,
      usage: null,
      repairStatus: "none",
      outcome: "fallback",
      model: null,
    });
    return { ...safeFallback(text), meta: { source: "fallback", repaired: false } };
  }

  // --- First attempt ---
  const first = await llmClient.categorize(text, { promptVersion: PROMPT_VERSION });
  const firstResult = parseAndValidate(first.content);

  if (firstResult.ok) {
    logLlmCall({
      promptVersion: PROMPT_VERSION,
      durationMs: first.durationMs,
      usage: first.usage,
      repairStatus: "none",
      outcome: "ok",
      model: first.model,
    });
    return {
      ...firstResult.data,
      meta: { source: llmClient.isStubMode() ? "stub" : "llm", repaired: false },
    };
  }

  // --- Single repair attempt ---
  const repair = await llmClient.categorize(text, {
    promptVersion: PROMPT_VERSION,
    isRepair: true,
    brokenOutput: first.content,
    validationError: firstResult.error,
  });
  const repairResult = parseAndValidate(repair.content);

  if (repairResult.ok) {
    logLlmCall({
      promptVersion: PROMPT_VERSION,
      durationMs: first.durationMs + repair.durationMs,
      usage: repair.usage,
      repairStatus: "succeeded",
      outcome: "ok",
      model: repair.model,
    });
    return {
      ...repairResult.data,
      meta: { source: llmClient.isStubMode() ? "stub" : "llm", repaired: true },
    };
  }

  // --- Both attempts failed: quarantine, never leak raw model text ---
  writeQuarantine({
    inputText: text,
    promptVersion: PROMPT_VERSION,
    rawFirstAttempt: first.content,
    rawRepairAttempt: repair.content,
    validationErrors: { first: firstResult.error, repair: repairResult.error },
  });

  logLlmCall({
    promptVersion: PROMPT_VERSION,
    durationMs: first.durationMs + repair.durationMs,
    usage: repair.usage,
    repairStatus: "failed",
    outcome: "quarantined",
    model: repair.model,
  });

  throw new QuarantineError(
    "The AI response could not be validated into a structured task after a repair attempt. The failure has been logged for review."
  );
}

module.exports = { categorizeTask, parseAndValidate, safeFallback };
