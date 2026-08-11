/**
 * Quarantine logger to record unrepairable LLM outputs in JSONL format.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'quarantine.jsonl');

function logToQuarantine(entry) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const logRecord = {
      timestamp: new Date().toISOString(),
      input: entry.input,
      rawOutput: entry.rawOutput,
      error: entry.error,
      promptVersion: entry.promptVersion || 'v1'
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(logRecord) + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to write to quarantine log:', err.message);
  }
}

module.exports = { logToQuarantine };