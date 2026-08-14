/** 400 - invalid client input, fails Zod validation before any AI call. */
class InputValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "InputValidationError";
    this.status = 400;
    this.details = details;
  }
}

/** 404 - resource not found. */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

/**
 * 422 - the AI response could not be turned into valid structured data,
 * even after one repair attempt. The failure has already been quarantined
 * to logs/quarantine.jsonl. Raw model text must NEVER be returned to the client.
 */
class QuarantineError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuarantineError";
    this.status = 422;
  }
}

/** Raised for 401/403 from the LLM provider — never retried. */
class LLMAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LLMAuthError";
    this.status = status;
  }
}

/** Raised for 400 from the LLM provider (bad request to provider) — never retried. */
class LLMInputError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LLMInputError";
    this.status = status;
  }
}

/** Raised for timeouts / 5xx from the LLM provider — eligible for a single retry. */
class LLMTransientError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LLMTransientError";
    this.status = status || null;
  }
}

module.exports = {
  InputValidationError,
  NotFoundError,
  QuarantineError,
  LLMAuthError,
  LLMInputError,
  LLMTransientError,
};
