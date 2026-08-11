/**
 * Output validation schema and stub data generator for task triage.
 */
const { z } = require('zod');

// Schema for validating LLM JSON output
const taskTriageSchema = z.object({
  suggested_title: z.string(),
  category: z.enum(['work', 'personal', 'health', 'finance', 'learning', 'home', 'other']),
  priority: z.enum(['low', 'medium', 'high']),
  estimated_minutes: z.number().int().min(5).max(480),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

// Deterministic mock response for stub mode
const stubResponse = {
  suggested_title: 'Stub: Organize project tasks',
  category: 'work',
  priority: 'medium',
  estimated_minutes: 30,
  confidence: 1.0,
  reason: 'This response was generated via LLM_STUB without calling the real model.',
};

module.exports = {
  taskTriageSchema,
  stubResponse,
};