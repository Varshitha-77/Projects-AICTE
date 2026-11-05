/**
 * Express REST API Server
 * Library AI Agent — AICTE Problem Statement No.21
 */

'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const { v4: uuidv4 } = require('uuid');

const agent   = require('./agent');
const auth    = require('./auth');
const db      = require('./database');
const logger  = require('./logger');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── Security middleware ───────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'", "'unsafe-inline'"],
      styleSrc   : ["'self'", "'unsafe-inline'"],
      connectSrc : ["'self'"],
    },
  },
}));

app.use(cors({
  origin     : '*',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs : parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max      : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message  : { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders  : false,
});
app.use('/api/', limiter);

// ── Body parsing ──────────────────────────────────────────────────────────────

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ── Logging ───────────────────────────────────────────────────────────────────

app.use(morgan('combined', {
  stream: { write: msg => logger.info(msg.trim()) },
}));

// ── Static files (web UI) ─────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Helper: extract session ID ────────────────────────────────────────────────

function extractSessionId(req) {
  return req.headers['x-session-id'] ||
         req.query.sessionId          ||
         req.body?.sessionId          ||
         null;
}

// ═════════════════════════════════════════════════════════════════════════════
// API Routes
// ═════════════════════════════════════════════════════════════════════════════

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status   : 'ok',
    service  : 'Library AI Agent',
    version  : '1.0.0',
    timestamp: new Date().toISOString(),
    model    : process.env.GRANITE_MODEL_ID || 'ibm/granite-13b-chat-v2',
  });
});

// ── Authentication routes ─────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Student login with roll number and PIN.
 */
app.post('/api/auth/login', async (req, res) => {
  const { rollNumber, pin } = req.body;
  if (!rollNumber || !pin) {
    return res.status(400).json({ error: 'rollNumber and pin are required.' });
  }
  try {
    const result = await auth.authenticateStudent(rollNumber, pin);
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }
    res.json({ sessionId: result.sessionId, student: result.student, message: result.message });
  } catch (err) {
    logger.error('Login error', { message: err.message });
    res.status(500).json({ error: 'Authentication service unavailable.' });
  }
});

/**
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', (req, res) => {
  const sessionId = extractSessionId(req);
  if (sessionId) auth.destroySession(sessionId);
  res.json({ message: 'Logged out successfully.' });
});

/**
 * GET /api/auth/me
 * Returns the authenticated student's profile (non-sensitive fields only).
 */
app.get('/api/auth/me', (req, res) => {
  const sessionId = extractSessionId(req);
  const authCheck = auth.requireStudentAuth(sessionId);
  if (!authCheck.authenticated) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  if (authCheck.studentId === 'ADMIN') {
    return res.json({ role: 'admin' });
  }
  const student = db.getStudentById(authCheck.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  // Return only safe fields
  res.json({
    id        : student.id,
    name      : student.name,
    department: student.department,
    year      : student.year,
    courses   : student.courses,
    role      : authCheck.role,
  });
});

// ── Chat / Agent routes ───────────────────────────────────────────────────────

/**
 * POST /api/chat
 * Main chat endpoint — sends a query to the Library AI Agent.
 *
 * Body: { query: string, convId?: string, sessionId?: string }
 */
app.post('/api/chat', async (req, res) => {
  const { query, convId: clientConvId } = req.body;
  const sessionId = extractSessionId(req);

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required.' });
  }

  // Assign or reuse a conversation ID
  const convId = clientConvId || uuidv4();

  try {
    const response = await agent.processQuery({ query, sessionId, convId });
    res.json({ ...response, convId });
  } catch (err) {
    logger.error('Agent error', { message: err.message });
    res.status(500).json({
      type   : 'ERROR',
      message: 'The library agent encountered an issue. Please try again.',
      convId,
    });
  }
});

/**
 * DELETE /api/chat/:convId
 * Clear conversation history for a session.
 */
app.delete('/api/chat/:convId', (req, res) => {
  agent.clearHistory(req.params.convId);
  res.json({ message: 'Conversation history cleared.' });
});

// ── Book routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/books
 * Returns all books (or filtered by ?subject= or ?course= or ?q=).
 */
app.get('/api/books', (req, res) => {
  const { q, subject, course, available } = req.query;
  let books;
  if (q)       books = db.searchBooks(q);
  else if (subject) books = db.getBooksBySubject(subject);
  else if (course)  books = db.getBooksByCourse(course);
  else if (available === 'true') books = db.getAvailableBooks();
  else books = db.getAllBooks();

  res.json({ count: books.length, books });
});

/**
 * GET /api/books/:id
 * Returns a single book with its availability.
 */
app.get('/api/books/:id', (req, res) => {
  const book = db.getBookById(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  const avail = db.checkAvailability(req.params.id);
  res.json({ ...book, availability: avail });
});

// ── Reservation routes ────────────────────────────────────────────────────────

/**
 * POST /api/reservations
 * Reserve a book (requires authentication).
 */
app.post('/api/reservations', (req, res) => {
  const sessionId = extractSessionId(req);
  const authCheck = auth.requireStudentAuth(sessionId);

  if (!authCheck.authenticated) {
    return res.status(401).json({ error: 'Authentication required to make a reservation.' });
  }
  if (authCheck.studentId === 'ADMIN') {
    return res.status(403).json({ error: 'Admin cannot place student reservations.' });
  }

  const { bookId } = req.body;
  if (!bookId) return res.status(400).json({ error: 'bookId is required.' });

  const result = db.reserveBook(authCheck.studentId, bookId);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.status(201).json(result);
});

/**
 * GET /api/reservations
 * Get current student's reservations (requires authentication).
 */
app.get('/api/reservations', (req, res) => {
  const sessionId = extractSessionId(req);
  const authCheck = auth.requireStudentAuth(sessionId);

  if (!authCheck.authenticated) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (authCheck.studentId === 'ADMIN') {
    return res.status(403).json({ error: 'Use admin endpoints for admin operations.' });
  }

  const reservations = db.getStudentReservations(authCheck.studentId).map(r => ({
    ...r,
    book: db.getBookById(r.book_id),
  }));
  res.json({ reservations });
});

// ── Student's borrow history ──────────────────────────────────────────────────

/**
 * GET /api/my/borrows
 * Get active borrows for authenticated student.
 */
app.get('/api/my/borrows', (req, res) => {
  const sessionId = extractSessionId(req);
  const authCheck = auth.requireStudentAuth(sessionId);

  if (!authCheck.authenticated || authCheck.studentId === 'ADMIN') {
    return res.status(401).json({ error: 'Student authentication required.' });
  }

  const borrows = db.getActiveBorrows(authCheck.studentId).map(b => ({
    ...b,
    book: db.getBookById(b.book_id),
  }));
  res.json({ borrows });
});

// ── Top books ─────────────────────────────────────────────────────────────────

app.get('/api/books/stats/top', (req, res) => {
  const n   = parseInt(req.query.n) || 5;
  const top = db.getTopBorrowedBooks(n);
  res.json({ top });
});

// ── Catch-all: serve the web UI ───────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  await auth.initDemoPins();

  app.listen(PORT, () => {
    logger.info(`🚀 Library AI Agent running on http://localhost:${PORT}`);
    logger.info(`📚 Model: ${process.env.GRANITE_MODEL_ID || 'ibm/granite-13b-chat-v2'}`);
    logger.info(`🔑 IBM API key: ${process.env.IBM_API_KEY === 'your_ibm_cloud_api_key_here' ? '⚠️  NOT CONFIGURED' : '✅ Set'}`);
  });
}

start().catch(err => {
  logger.error('Failed to start server', { message: err.message });
  process.exit(1);
});

module.exports = app;
