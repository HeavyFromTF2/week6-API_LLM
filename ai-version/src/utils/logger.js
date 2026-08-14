const fs = require("fs");
const path = require("path");

// All paths are resolved relative to the project root (/ai-version), never
// relative to process.cwd(), so this works no matter where the process is
// launched from.
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const LOGS_DIR = path.join(PROJECT_ROOT, "logs");
const QUARANTINE_FILE = path.join(LOGS_DIR, "quarantine.jsonl");

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Structured console log for every LLM call: tokens, duration, prompt
 * version and repair status. Never logs full raw model output at info
 * level to keep logs clean; only enough to debug.
 */
function logLlmCall({
  promptVersion,
  durationMs,
  usage,
  repairStatus, // "none" | "attempted" | "succeeded" | "failed"
  outcome, // "ok" | "quarantined" | "fallback" | "error"
  model,
}) {
  const entry = {
    ts: new Date().toISOString(),
    event: "llm_call",
    prompt_version: promptVersion,
    duration_ms: durationMs,
    model: model || null,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
    repair_status: repairStatus,
    outcome,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Appends a failure record to logs/quarantine.jsonl. Used when the AI
 * output is unrecoverable (invalid after the single repair attempt).
 * The raw model text is kept ONLY in this internal log file — it is never
 * sent back to the client.
 */
function writeQuarantine({ inputText, promptVersion, rawFirstAttempt, rawRepairAttempt, validationErrors }) {
  ensureLogsDir();
  const entry = {
    ts: new Date().toISOString(),
    prompt_version: promptVersion,
    input_text: inputText,
    raw_first_attempt: rawFirstAttempt,
    raw_repair_attempt: rawRepairAttempt ?? null,
    validation_errors: validationErrors,
  };
  fs.appendFileSync(QUARANTINE_FILE, JSON.stringify(entry) + "\n", "utf8");
}

module.exports = {
  logLlmCall,
  writeQuarantine,
  QUARANTINE_FILE,
  LOGS_DIR,
};
