/**
 * Controller handling LLM request routing and validation.
 */
const { triageInputSchema } = require('../llm/inputSchema');
const { stubResponse } = require('../llm/schema');

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

    // Temporary placeholder before full LLM integration in Stage 2
    return res.status(501).json({ message: 'Real LLM integration pending.' });
  },
};

module.exports = llmController;