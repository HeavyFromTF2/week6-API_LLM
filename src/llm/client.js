/**
 * OpenAI client initialization configured for OpenRouter / external provider.
 */
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || '[https://openrouter.ai/api/v1](https://openrouter.ai/api/v1)',
  apiKey: process.env.LLM_API_KEY,
  timeout: 30000, // Explicit 30s timeout
  maxRetries: 0,  // Disable automatic SDK retries for strict manual control
});

module.exports = client;