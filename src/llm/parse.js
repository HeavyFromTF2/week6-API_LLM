/**
 * Utility to extract and parse JSON content from raw LLM responses.
 */
function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Raw response is empty or not a string.');
  }

  let cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  const firstCurly = cleaned.indexOf('{');
  const lastCurly = cleaned.lastIndexOf('}');

  if (firstCurly === -1 || lastCurly === -1 || lastCurly <= firstCurly) {
    throw new Error('No valid JSON object bounds found in model response.');
  }

  cleaned = cleaned.substring(firstCurly, lastCurly + 1);
  return JSON.parse(cleaned);
}

module.exports = { extractAndParseJSON };