/**
 * Controller handling LLM triage with Zod schema validation,
 * a single repair retry, and quarantine fallback on failure.
 */
const path = require('path');
const fs = require('fs');
const client = require('../llm/client');
const { triageInputSchema } = require('../llm/inputSchema');
const { taskTriageSchema, stubResponse } = require('../llm/schema');
const { extractAndParseJSON } = require('../llm/parse');
const { logToQuarantine } = require('../llm/quarantine');

const PROMPT_PATH = path.join(__dirname, '../../prompts/triage-v1.md');
const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

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

    // 2. Stub bypass
    if (process.env.LLM_STUB === '1' || process.env.LLM_STUB === 'true') {
      return res.status(200).json(stubResponse);
    }

    // 3. LLM call & output verification
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: validation.data.text },
    ];

    const callModel = (msgs) =>
      client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2,
        messages: msgs,
      });

    let rawContent = '';

    try {
      // Attempt 1
      const response = await callModel(messages);
      rawContent = response.choices[0]?.message?.content || '';

      const parsed = extractAndParseJSON(rawContent);
      const validOutput = taskTriageSchema.parse(parsed);
      return res.status(200).json(validOutput);
    } catch (err1) {
      // Attempt 2: Repair retry (1x)
      try {
        const repairMessages = [
          ...messages,
          { role: 'assistant', content: rawContent },
          {
            role: 'user',
            content: `Previous output failed validation: ${err1.message}. Return ONLY valid JSON matching schema.`,
          },
        ];

        const repairResponse = await callModel(repairMessages);
        const repairRawContent = repairResponse.choices[0]?.message?.content || '';

        const repairParsed = extractAndParseJSON(repairRawContent);
        const validRepairOutput = taskTriageSchema.parse(repairParsed);
        return res.status(200).json(validRepairOutput);
      } catch (err2) {
        // Quarantine and return 422 if repair retry also fails
        logToQuarantine({
          input: validation.data.text,
          rawOutput: rawContent,
          error: `Validation failed after repair attempt: ${err2.message}`,
          promptVersion: 'v1',
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