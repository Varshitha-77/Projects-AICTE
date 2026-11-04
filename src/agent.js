/**
 * Library Agent Core
 * Orchestrates the full query-response cycle:
 *   Input → Guardrails → Intent → DB Lookup → IBM Granite → Output Guardrails
 */

'use strict';

const granite    = require('./granite');
const guardrails = require('./guardrails');
const db         = require('./database');
const auth       = require('./auth');
const logger     = require('./logger');

// ── Conversation session store ────────────────────────────────────────────────
// Maps sessionId → conversation history array
const conversations = new Map();

const MAX_HISTORY = 12; // turns to retain per session

// ── Main agent entry point ────────────────────────────────────────────────────

/**
 * Process a student query through the full agent pipeline.
 *
 * @param {object} params
 * @param {string} params.query       - Student's natural language query
 * @param {string} params.sessionId   - Auth session ID (may be null for unauthenticated users)
 * @param {string} params.convId      - Conversation ID for history tracking
 * @returns {Promise<AgentResponse>}
 */
async function processQuery({ query, sessionId = null, convId }) {
  // ── Step 1: Input validation & guardrails ─────────────────────────────────
  const validation = guardrails.validateInput(query);
  if (!validation.valid) {
    return buildResponse({
      type   : validation.reason === 'INJECTION_ATTEMPT' ? 'BLOCKED' : 'ERROR',
      message: guardrails.GUARDRAIL_RESPONSES[validation.reason] ||
               'Invalid input. Please enter a valid library query.',
      convId,
    });
  }

  const sanitizedQuery = validation.sanitized;

  // ── Step 2: Scope check ───────────────────────────────────────────────────
  const scopeCheck = guardrails.checkScope(sanitizedQuery);
  if (scopeCheck.outOfScope) {
    return buildResponse({
      type   : 'OUT_OF_SCOPE',
      message: guardrails.GUARDRAIL_RESPONSES.OUT_OF_SCOPE,
      convId,
    });
  }

  // ── Step 3: Privacy check ─────────────────────────────────────────────────
  const privacyCheck = guardrails.checkPrivacyRisk(sanitizedQuery);
  if (privacyCheck.privacyRisk) {
    return buildResponse({
      type   : 'PRIVACY_BLOCKED',
      message: guardrails.GUARDRAIL_RESPONSES.PRIVACY_VIOLATION,
      convId,
    });
  }

  // ── Step 4: Get auth context ──────────────────────────────────────────────
  const authResult     = auth.requireStudentAuth(sessionId);
  let   studentProfile = null;

  if (authResult.authenticated && authResult.studentId !== 'ADMIN') {
    studentProfile = db.getStudentById(authResult.studentId);
  }

  // ── Step 5: Intent classification ────────────────────────────────────────
  let intent;
  try {
    intent = await granite.classifyIntent(sanitizedQuery);
  } catch (_) {
    intent = 'GENERAL_QUERY';
  }

  logger.info('Intent classified', { intent, sessionId });

  // ── Step 6: Database lookups (intent-driven) ──────────────────────────────
  let searchResults     = [];
  let actionResult      = null;
  let requiresAuth      = false;

  switch (intent) {
    case 'SEARCH_BOOKS': {
      searchResults = db.searchBooks(sanitizedQuery);
      if (searchResults.length === 0) {
        // Try subject-based search with individual words
        const words = sanitizedQuery.split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
          const res = db.getBooksBySubject(word);
          if (res.length > 0) { searchResults = res; break; }
        }
      }
      break;
    }

    case 'CHECK_AVAILABILITY': {
      // Extract possible book title or subject from the query
      searchResults = db.searchBooks(sanitizedQuery);
      break;
    }

    case 'GET_RECOMMENDATIONS': {
      if (studentProfile) {
        // Recommend books for student's enrolled courses
        const courseBooks = new Map();
        for (const course of (studentProfile.courses || [])) {
          for (const book of db.getBooksByCourse(course)) {
            if (!studentProfile.borrow_history.includes(book.id) &&
                !studentProfile.active_borrows.includes(book.id)) {
              courseBooks.set(book.id, book);
            }
          }
        }
        searchResults = [...courseBooks.values()].slice(0, 5);
        if (searchResults.length === 0) {
          searchResults = db.getAvailableBooks().slice(0, 5);
        }
      } else {
        // Unauthenticated — recommend from query keywords
        searchResults = db.searchBooks(sanitizedQuery);
        if (searchResults.length === 0) {
          searchResults = db.getAvailableBooks().slice(0, 5);
        }
      }
      break;
    }

    case 'RESERVE_BOOK': {
      if (!authResult.authenticated) {
        requiresAuth = true;
      } else if (studentProfile) {
        // Find the book the student wants to reserve
        const bookMatches = db.searchBooks(sanitizedQuery);
        if (bookMatches.length > 0) {
          const targetBook = bookMatches[0];
          if (targetBook.available_copies > 0) {
            actionResult = {
              type   : 'INFO',
              message: `"${targetBook.title}" is available now! ` +
                       `You can borrow it directly from ${targetBook.location}.`,
            };
          } else {
            actionResult = db.reserveBook(studentProfile.id, targetBook.id);
            actionResult.type = actionResult.success ? 'RESERVATION' : 'ERROR';
          }
          searchResults = [targetBook];
        }
      }
      break;
    }

    case 'BORROW_HISTORY': {
      if (!authResult.authenticated) {
        requiresAuth = true;
      } else if (studentProfile) {
        const borrows = db.getActiveBorrows(studentProfile.id);
        const reservations = db.getStudentReservations(studentProfile.id);
        actionResult = {
          type        : 'HISTORY',
          active_borrows: borrows.map(b => ({
            ...b,
            book: db.getBookById(b.book_id),
          })),
          reservations: reservations.map(r => ({
            ...r,
            book: db.getBookById(r.book_id),
          })),
        };
      }
      break;
    }

    case 'OUT_OF_SCOPE': {
      return buildResponse({
        type   : 'OUT_OF_SCOPE',
        message: guardrails.GUARDRAIL_RESPONSES.OUT_OF_SCOPE,
        convId,
      });
    }

    default:
      // GENERAL_QUERY — let Granite handle it with library context
      searchResults = db.searchBooks(sanitizedQuery).slice(0, 3);
      break;
  }

  // ── Step 7: Handle auth-required flows ───────────────────────────────────
  if (requiresAuth) {
    return buildResponse({
      type   : 'AUTH_REQUIRED',
      message: guardrails.GUARDRAIL_RESPONSES.UNAUTHENTICATED_ACTION,
      convId,
    });
  }

  // ── Step 8: Build Granite context and generate response ──────────────────
  const history = getHistory(convId);

  // If we have a definitive action result, enrich the Granite prompt with it
  let enrichedQuery = sanitizedQuery;
  if (actionResult) {
    enrichedQuery += `\n[System note: ${JSON.stringify(actionResult)}]`;
  }

  let aiResponse;
  try {
    aiResponse = await granite.generateResponse(
      enrichedQuery,
      history,
      { searchResults, studentProfile }
    );
  } catch (err) {
    logger.error('Granite generation failed', { message: err.message });
    // Graceful fallback using purely database results
    aiResponse = buildFallbackResponse(intent, searchResults, actionResult, sanitizedQuery);
  }

  // ── Step 9: Output sanitization ──────────────────────────────────────────
  const safeResponse = guardrails.sanitizeOutput(aiResponse);

  // ── Step 10: Update conversation history ─────────────────────────────────
  addToHistory(convId, 'user',      sanitizedQuery);
  addToHistory(convId, 'assistant', safeResponse);

  return buildResponse({
    type        : 'SUCCESS',
    message     : safeResponse,
    intent,
    books       : searchResults.slice(0, 5),
    actionResult: actionResult?.type !== 'INFO' ? undefined : actionResult,
    convId,
  });
}

// ── Conversation history helpers ──────────────────────────────────────────────

function getHistory(convId) {
  return conversations.get(convId) || [];
}

function addToHistory(convId, role, content) {
  const history = conversations.get(convId) || [];
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  conversations.set(convId, history);
}

function clearHistory(convId) {
  conversations.delete(convId);
}

// ── Fallback response builder (when Granite is unavailable) ───────────────────

function buildFallbackResponse(intent, books, actionResult, query) {
  if (actionResult) {
    if (actionResult.type === 'RESERVATION') {
      return actionResult.success
        ? `✅ ${actionResult.message}`
        : `❌ ${actionResult.message}`;
    }
    if (actionResult.type === 'HISTORY') {
      const borrows = actionResult.active_borrows || [];
      if (borrows.length === 0) return 'You have no active borrows at the moment.';
      return 'Your active borrows:\n' + borrows.map((b, i) =>
        `${i + 1}. "${b.book?.title}" — Due: ${new Date(b.due_date).toDateString()}`
      ).join('\n');
    }
  }

  if (books.length === 0) {
    return `I searched the library for "${query}" but could not find any matching books. ` +
           `Please try a different search term or speak to the library staff.`;
  }

  const list = books.slice(0, 5).map((b, i) =>
    `${i + 1}. **${b.title}** by ${(b.authors || []).join(', ')}\n` +
    `   Available: ${b.available_copies}/${b.total_copies} copies | ${b.location}`
  ).join('\n\n');

  return `Here are the books I found:\n\n${list}`;
}

// ── Response envelope ─────────────────────────────────────────────────────────

function buildResponse({ type, message, intent, books, actionResult, convId }) {
  return {
    type,
    message,
    intent      : intent || null,
    books       : books  || [],
    actionResult: actionResult || null,
    convId,
    timestamp   : new Date().toISOString(),
  };
}

module.exports = {
  processQuery,
  clearHistory,
  getHistory,
};
