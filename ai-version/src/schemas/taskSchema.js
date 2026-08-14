const { z } = require("zod");

// Closed category list — must match prompts/categorize-task-v1.md exactly.
const CATEGORIES = ["Work", "Personal", "Finance", "Health", "Shopping", "Other"];
const PRIORITIES = ["low", "medium", "high"];

/**
 * Validates the raw user input BEFORE any AI call is made.
 * Rejecting bad input early avoids wasting LLM quota.
 */
const categorizeInputSchema = z.object({
  text: z
    .string({ required_error: "text is required", invalid_type_error: "text must be a string" })
    .trim()
    .min(3, "text must be at least 3 characters")
    .max(500, "text must be at most 500 characters"),
});

/**
 * Validates the JSON that the AI model is expected to return.
 * `.strict()` rejects any unexpected extra fields.
 */
const aiOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    confidence: z.number().min(0).max(1),
  })
  .strict();

/**
 * Validates a manual (non-AI) update to an existing task.
 * All fields optional, but at least one must be present.
 */
const manualUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (title, category, priority) must be provided",
  });

module.exports = {
  CATEGORIES,
  PRIORITIES,
  categorizeInputSchema,
  aiOutputSchema,
  manualUpdateSchema,
};
