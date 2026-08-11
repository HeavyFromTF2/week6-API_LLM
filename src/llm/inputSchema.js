/**
 * Input validation schema for incoming HTTP requests.
 */
const { z } = require('zod');

const triageInputSchema = z.object({
  text: z
    .string({
      required_error: 'The text field is required.',
    })
    .min(3, 'Text must be at least 3 characters long.')
    .max(500, 'Text must not exceed 500 characters.'),
});

module.exports = {
  triageInputSchema,
};