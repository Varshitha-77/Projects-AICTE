/**
 * Guardrails Module
 * Enforces safety, relevance, privacy, and injection-prevention rules
 * for every input and output passing through the Library AI Agent.
 */

'use strict';

const logger = require('./logger');

// ── Injection / jailbreak patterns ────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)\s+(instructions?|prompts?|rules?|context)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|another|unrestricted)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(?!a\s+librarian)/i,
  /act\s+as\s+(?!a\s+(library|librarian|book|assistant))/i,
  /disregard\s+(your|all|any)\s+(rules?|guidelines?|instructions?)/i,
  /override\s+(system|safety|guardrail)/i,
  /jailbreak|DAN\s+mode|developer\s+mode|unrestricted\s+mode/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
  /what\s+(are|is)\s+your\s+(system\s+)?instructions/i,
  /bypass\s+(the\s+)?(filter|restriction|guardrail|rule)/i,
];

// ── Out-of-scope topic patterns ───────────────────────────────────────────────

const OUT_OF_SCOPE_PATTERNS = [
  /\b(weather|forecast|temperature|climate)\b/i,
  /\b(sports?|cricket|football|basketball|score|match|game)\b/i,
  /\b(movie|film|cinema|netflix|series|episode|watch)\b/i,
  /\b(recipe|cook|food|restaurant|eat|drink)\b/i,
  /\b(politics?|election|government|minister|president|parliament)\b/i,
  /\b(stock|crypto|bitcoin|invest|trading|finance|money)\b/i,
  /\b(celebrity|actor|actress|singer|pop\s+star)\b/i,
  /\b(joke|funny|meme|entertain|humor)\b/i,
  /\b(shopping|buy|sell|price|deal|amazon|flipkart)\b/i,
  /\b(social\s+media|instagram|facebook|twitter|tiktok|youtube)\b/i,
];

// ── Privacy protection patterns ───────────────────────────────────────────────

const PRIVACY_RISK_PATTERNS = [
  /other\s+student(s)?('s)?\s+(borrow|history|record|data|info)/i,
  /who\s+(has\s+)?(borrowed|checked\s+out)\s+this/i,
  /list\s+(all\s+)?(students?|borrowers?)/i,
  /student\s+(database|records?|list|data)\s+(of|for)/i,
  /personal\s+(data|info|details?)\s+of/i,
];

// ── PII patterns to sanitize from responses ───────────────────────────────────

const PII_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,    replacement: '[EMAIL REDACTED]'  },
  { pattern: /\b\d{10}\b/g,                                                replacement: '[PHONE REDACTED]'  },
  { pattern: /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g,                        replacement: '[CARD REDACTED]'   },
];

// ── Input validation ──────────────────────────────────────────────────────────

/**
 * Validate and sanitize a user input string.
 * @param {string} input
 * @returns {{ valid: boolean, reason?: string, sanitized?: string }}
 */
function validateInput(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, reason: 'Empty or invalid input.' };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: 'Input cannot be empty.' };
  }

  if (trimmed.length > 1000) {
    return { valid: false, reason: 'Input is too long (max 1000 characters).' };
  }

  // Check for prompt injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.warn('Prompt injection attempt detected', { input: trimmed.slice(0, 100) });
      return {
        valid : false,
        reason: 'INJECTION_ATTEMPT',
      };
    }
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Check if a query is out of the library's scope.
 * @param {string} query
 * @returns {{ outOfScope: boolean, reason?: string }}
 */
function checkScope(query) {
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(query)) {
      return { outOfScope: true };
    }
  }
  return { outOfScope: false };
}

/**
 * Check if the query risks violating student data privacy.
 * @param {string} query
 * @returns {{ privacyRisk: boolean }}
 */
function checkPrivacyRisk(query) {
  for (const pattern of PRIVACY_RISK_PATTERNS) {
    if (pattern.test(query)) {
      logger.warn('Privacy risk query detected', { query: query.slice(0, 100) });
      return { privacyRisk: true };
    }
  }
  return { privacyRisk: false };
}

// ── Output sanitization ───────────────────────────────────────────────────────

/**
 * Sanitize the AI-generated response before sending to the client.
 * Strips any PII that may have slipped through.
 * @param {string} response
 * @returns {string}
 */
function sanitizeOutput(response) {
  if (!response) return '';
  let sanitized = response;
  for (const { pattern, replacement } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

// ── Standard guardrail responses ──────────────────────────────────────────────

const GUARDRAIL_RESPONSES = {
  INJECTION_ATTEMPT:
    "I'm sorry, but I can only assist with library-related queries. " +
    "Please ask me about books, availability, recommendations, or reservations.",

  OUT_OF_SCOPE:
    "I'm the Library AI Agent and I'm only able to help with library-related topics " +
    "such as finding books, checking availability, or reservations. " +
    "For other queries, please visit the appropriate campus resource.",

  PRIVACY_VIOLATION:
    "I'm unable to share personal information about other students. " +
    "This is to protect everyone's privacy. " +
    "I can only provide information about your own library account.",

  UNAUTHENTICATED_ACTION:
    "To view your personal library records or make a reservation, " +
    "please authenticate first by providing your student roll number.",

  UNAUTHORIZED_ACTION:
    "You don't have permission to perform this action. " +
    "Please contact the library staff for assistance.",
};

module.exports = {
  validateInput,
  checkScope,
  checkPrivacyRisk,
  sanitizeOutput,
  GUARDRAIL_RESPONSES,
};
