/**
 * Express router for LLM endpoints.
 */
const express = require('express');
const router = express.Router();
const llmController = require('../controllers/llmController');

// POST /llm/triage
router.post('/triage', llmController.triageTask);

module.exports = router;