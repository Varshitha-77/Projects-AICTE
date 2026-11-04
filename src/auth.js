/**
 * Authentication & Authorization Module
 * Provides student authentication and session management.
 *
 * Security model:
 *  - Students authenticate via roll number + (demo) pin
 *  - Authenticated sessions grant access to personal records and reservation actions
 *  - Admin role required for privileged operations
 */

'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db     = require('./database');
const logger = require('./logger');

// ── In-memory session store ───────────────────────────────────────────────────
// In production use Redis or a database-backed session store.

const sessions = new Map(); // sessionId → { studentId, role, expiresAt }

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Demo PIN store (roll_number → hashed PIN)
// In production: store hashed PINs in the database.
const DEMO_PINS = {};

/**
 * Pre-hash demo PINs on startup for the demo students.
 */
async function initDemoPins() {
  const demoCreds = [
    { roll: 'CS2021001', pin: '1234' },
    { roll: 'DS2022045', pin: '5678' },
    { roll: 'EC2021078', pin: '9012' },
  ];
  for (const { roll, pin } of demoCreds) {
    DEMO_PINS[roll] = await bcrypt.hash(pin, 10);
  }
  logger.info('Demo PINs initialised');
}

// ── Session helpers ───────────────────────────────────────────────────────────

/**
 * Create a new authenticated session for a student.
 * @param {string} studentId
 * @param {string} role - 'student' | 'admin'
 * @returns {string} sessionId
 */
function createSession(studentId, role = 'student') {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    studentId,
    role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  // Clean expired sessions
  cleanExpiredSessions();
  return sessionId;
}

/**
 * Retrieve a valid session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  // Refresh TTL on access
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

/**
 * Invalidate a session (logout).
 * @param {string} sessionId
 */
function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(id);
  }
}

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Authenticate a student by roll number and PIN.
 * @param {string} rollNumber
 * @param {string} pin
 * @returns {Promise<{ success: boolean, sessionId?: string, student?: object, message: string }>}
 */
async function authenticateStudent(rollNumber, pin) {
  if (!rollNumber || !pin) {
    return { success: false, message: 'Roll number and PIN are required.' };
  }

  const student = db.getStudentByRoll(rollNumber.toUpperCase().trim());
  if (!student) {
    logger.warn('Authentication failed — roll number not found', { rollNumber });
    return { success: false, message: 'Invalid roll number or PIN.' };
  }

  // Check demo PIN
  const hashedPin = DEMO_PINS[rollNumber.toUpperCase().trim()];
  if (!hashedPin) {
    return { success: false, message: 'Invalid roll number or PIN.' };
  }

  const pinMatch = await bcrypt.compare(pin, hashedPin);
  if (!pinMatch) {
    logger.warn('Authentication failed — wrong PIN', { rollNumber });
    return { success: false, message: 'Invalid roll number or PIN.' };
  }

  const sessionId = createSession(student.id, 'student');
  logger.info('Student authenticated', { studentId: student.id, roll: rollNumber });

  return {
    success  : true,
    sessionId,
    student  : {
      id        : student.id,
      name      : student.name,
      department: student.department,
      year      : student.year,
      courses   : student.courses,
    },
    message  : `Welcome, ${student.name}! You are now authenticated.`,
  };
}

/**
 * Authenticate an admin user.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ success: boolean, sessionId?: string, message: string }>}
 */
async function authenticateAdmin(username, password) {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@Library2024';

  if (username !== adminUser || password !== adminPass) {
    logger.warn('Admin authentication failed', { username });
    return { success: false, message: 'Invalid admin credentials.' };
  }

  const sessionId = createSession('ADMIN', 'admin');
  logger.info('Admin authenticated');
  return { success: true, sessionId, message: 'Admin authenticated successfully.' };
}

// ── Authorization ─────────────────────────────────────────────────────────────

/**
 * Check if a session is authenticated as a student.
 * @param {string} sessionId
 * @returns {{ authenticated: boolean, studentId?: string }}
 */
function requireStudentAuth(sessionId) {
  const session = getSession(sessionId);
  if (!session || (session.role !== 'student' && session.role !== 'admin')) {
    return { authenticated: false };
  }
  return { authenticated: true, studentId: session.studentId, role: session.role };
}

/**
 * Check if a session has admin privileges.
 * @param {string} sessionId
 * @returns {{ authorized: boolean }}
 */
function requireAdminAuth(sessionId) {
  const session = getSession(sessionId);
  if (!session || session.role !== 'admin') {
    return { authorized: false };
  }
  return { authorized: true };
}

module.exports = {
  initDemoPins,
  authenticateStudent,
  authenticateAdmin,
  requireStudentAuth,
  requireAdminAuth,
  getSession,
  destroySession,
};
