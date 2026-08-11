/**
 * Controller handling LLM request routing and validation.
 */
const path = require('path');
const fs = require('fs');
const client = require('../llm/client');
const { triageInputSchema } = require('../llm/inputSchema');
const { stubResponse } = require('../llm/schema');

// Carregar o prompt do ficheiro versionado
const PROMPT_PATH = path.join(__dirname, '../../prompts/triage-v1.md');
const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

const llmController = {
  async triageTask(req, res) {
    // 1. Validate request body against input schema
    const validation = triageInputSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues.map((issue) => issue.message),
      });
    }

    // 2. Check for stub mode
    if (process.env.LLM_STUB === '1' || process.env.LLM_STUB === 'true') {
      return res.status(200).json(stubResponse);
    }

    // 3. Call real LLM
    try {
      const response = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: req.body.text },
        ],
      });

      const rawContent = response.choices[0].message.content;
      return res.status(200).send(rawContent);
    } catch (error) {
      console.error('LLM Error:', error.message);
      return res.status(500).json({
        error: 'LLM Provider Error',
        message: error.message,
      });
    }
  },
};

module.exports = llmController;