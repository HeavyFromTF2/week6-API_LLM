/**
 * Exponential backoff with jitter helper for resilient LLM retries.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculates delay with Exponential Backoff + Random Jitter
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelayMs - Base delay in ms (default: 1000ms)
 */
async function waitWithJitter(attempt, baseDelayMs = 1000) {
  const exponential = Math.pow(2, attempt - 1) * baseDelayMs;
  const jitter = Math.random() * 500;
  await sleep(exponential + jitter);
}

module.exports = {
  waitWithJitter,
  sleep,
};