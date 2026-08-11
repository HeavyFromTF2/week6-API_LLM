/**
 * Controller handling LLM triage with Zod validation, kill switch,
 * exponential backoff retries, cost logging, repair attempt, and quarantine.
 */
const path = require('path');
const fs = require('fs');
const client = require('../llm/client');
const { triageInputSchema } = require('../llm/inputSchema');
const { taskTriageSchema, stubResponse } = require('../llm/schema');
const { extractAndParseJSON } = require('../llm/parse');
const { logToQuarantine } = require('../llm/quarantine');

const PROMPT_VERSION = 'v1';
const PROMPT_PATH = path.join(__dirname, '../../prompts/triage-v1.md');
const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const llmController = {
  async triageTask(req, res) {
    // 1. Input validation
    const validation = triageInputSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues.map((issue) => issue.message),
      });
    }

    // 2. Kill switch check
    if (process.env.LLM_ENABLED === 'false' || process.env.LLM_ENABLED === '0') {
      return res.status(200).json({
        category: 'other',
        priority: 'medium',
        estimated_minutes: 30,
        confidence: 0.0,
        reason: 'LLM features are currently disabled. Fallback response applied.',
      });
    }

    // 3. Stub bypass
    if (process.env.LLM_STUB === '1' || process.env.LLM_STUB === 'true') {
      return res.status(200).json(stubResponse);
    }

    // 4. LLM call wrapper with selective retries (Timeout, 429, 5xx)
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: validation.data.text },
    ];

    const callModelWithRetry = async (msgs) => {
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const startTime = Date.now();
        try {
          const response = await client.chat.completions.create({
            model: process.env.LLM_MODEL,
            temperature: 0.2,
            messages: msgs,
          });
          return { response, duration: Date.now() - startTime };
        } catch (error) {
          const status = error.status || error.statusCode;
          const isTimeout = error.name === 'APIConnectionTimeoutError' || status === 504;
          const isRateLimit = status === 429;
          const isServerError = status >= 500 && status < 600;

          // Never retry 400, 401, 403 or non-retryable errors
          if (!(isTimeout || isRateLimit || isServerError) || attempt > maxRetries) {
            throw error;
          }

          // Respect Retry-After header on 429 if present
          if (isRateLimit && error.headers && error.headers['retry-after']) {
            const retryAfterSec = parseInt(error.headers['retry-after'], 10);
            if (!isNaN(retryAfterSec)) {
              await sleep(retryAfterSec * 1000);
              continue;
            }
          }

          // Backoff + jitter
          const delay = Math.pow(2, attempt - 1) * 1000 + Math.random() * 500;
          await sleep(delay);
        }
      }
    };

    let totalDuration = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let repairs = 0;
    let rawContent = '';

    try {
      // Attempt 1
      const { response, duration } = await callModelWithRetry(messages);
      totalDuration += duration;
      totalPromptTokens += response.usage?.prompt_tokens || 0;
      totalCompletionTokens += response.usage?.completion_tokens || 0;

      rawContent = response.choices[0]?.message?.content || '';
      const parsed = extractAndParseJSON(rawContent);
      const validOutput = taskTriageSchema.parse(parsed);

      // Cost logging
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'LLM_METRICS',
          prompt_version: PROMPT_VERSION,
          model: process.env.LLM_MODEL,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
          duration_ms: totalDuration,
          repairs,
        })
      );

      return res.status(200).json(validOutput);
    } catch (err1) {
      // Check if err1 is a timeout
      if (err1.name === 'APIConnectionTimeoutError' || err1.status === 504) {
        return res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Upstream LLM provider timed out.',
        });
      }

      // Attempt 2: Repair retry (1x) if parsing/validation failed
      try {
        repairs = 1;
        const repairMessages = [
          ...messages,
          { role: 'assistant', content: rawContent },
          {
            role: 'user',
            content: `Previous output failed validation: ${err1.message}. Return ONLY valid JSON matching schema.`,
          },
        ];

        const { response: repairResponse, duration: repairDuration } = await callModelWithRetry(repairMessages);
        totalDuration += repairDuration;
        totalPromptTokens += repairResponse.usage?.prompt_tokens || 0;
        totalCompletionTokens += repairResponse.usage?.completion_tokens || 0;

        const repairRawContent = repairResponse.choices[0]?.message?.content || '';
        const repairParsed = extractAndParseJSON(repairRawContent);
        const validRepairOutput = taskTriageSchema.parse(repairParsed);

        // Cost logging
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'LLM_METRICS',
            prompt_version: PROMPT_VERSION,
            model: process.env.LLM_MODEL,
            prompt_tokens: totalPromptTokens,
            completion_tokens: totalCompletionTokens,
            total_tokens: totalPromptTokens + totalCompletionTokens,
            duration_ms: totalDuration,
            repairs,
          })
        );

        return res.status(200).json(validRepairOutput);
      } catch (err2) {
        if (err2.name === 'APIConnectionTimeoutError' || err2.status === 504) {
          return res.status(504).json({
            error: 'Gateway Timeout',
            message: 'Upstream LLM provider timed out during repair retry.',
          });
        }

        // Quarantine and return 422
        logToQuarantine({
          input: validation.data.text,
          rawOutput: rawContent,
          error: `Validation failed after repair attempt: ${err2.message}`,
          promptVersion: PROMPT_VERSION,
        });

        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'LLM output failed schema contract.',
        });
      }
    }
  },
};

module.exports = llmController;