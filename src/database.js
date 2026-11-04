/**
 * Library Database Module
 * Provides CRUD operations over the JSON-based library database.
 * In a production setup, replace with a proper database (PostgreSQL / MongoDB).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './data/library_db.json');

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load library database: ${err.message}`);
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// ── Book queries ──────────────────────────────────────────────────────────────

/**
 * Returns all books in the database.
 */
function getAllBooks() {
  return loadDB().books;
}

/**
 * Find a book by its ID.
 * @param {string} bookId
 */
function getBookById(bookId) {
  const db = loadDB();
  return db.books.find(b => b.id === bookId) || null;
}

/**
 * Search books by keyword against title, authors, subjects, and courses.
 * @param {string} query
 * @returns {Array}
 */
function searchBooks(query) {
  if (!query || query.trim().length === 0) return [];
  const db      = loadDB();
  const terms   = query.toLowerCase().split(/\s+/).filter(Boolean);

  return db.books.filter(book => {
    const haystack = [
      book.title,
      ...(book.authors || []),
      ...(book.subjects || []),
      ...(book.courses  || []),
      book.publisher,
      book.description,
    ].join(' ').toLowerCase();

    return terms.every(t => haystack.includes(t));
  });
}

/**
 * Get books filtered by subject.
 * @param {string} subject
 */
function getBooksBySubject(subject) {
  const db  = loadDB();
  const sub = subject.toLowerCase();
  return db.books.filter(b =>
    (b.subjects || []).some(s => s.toLowerCase().includes(sub))
  );
}

/**
 * Get books relevant to a specific course code.
 * @param {string} courseCode
 */
function getBooksByCourse(courseCode) {
  const db     = loadDB();
  const course = courseCode.toUpperCase();
  return db.books.filter(b =>
    (b.courses || []).map(c => c.toUpperCase()).includes(course)
  );
}

/**
 * Get only available books (available_copies > 0).
 */
function getAvailableBooks() {
  const db = loadDB();
  return db.books.filter(b => b.available_copies > 0);
}

/**
 * Check availability of a specific book.
 * @param {string} bookId
 * @returns {{ available: boolean, copies: number, reservations: number }}
 */
function checkAvailability(bookId) {
  const db   = loadDB();
  const book = db.books.find(b => b.id === bookId);
  if (!book) return null;

  const activeReservations = db.reservations.filter(
    r => r.book_id === bookId && r.status === 'active'
  ).length;

  return {
    available   : book.available_copies > 0,
    copies      : book.available_copies,
    total       : book.total_copies,
    reservations: activeReservations,
  };
}

// ── Student queries ───────────────────────────────────────────────────────────

/**
 * Get a student by their roll number.
 * @param {string} rollNumber
 */
function getStudentByRoll(rollNumber) {
  const db = loadDB();
  return db.students.find(s => s.roll_number === rollNumber) || null;
}

/**
 * Get a student by ID.
 * @param {string} studentId
 */
function getStudentById(studentId) {
  const db = loadDB();
  return db.students.find(s => s.id === studentId) || null;
}

// ── Reservation operations ────────────────────────────────────────────────────

/**
 * Place a reservation for a book.
 * @param {string} studentId
 * @param {string} bookId
 * @returns {{ success: boolean, message: string, reservation?: object }}
 */
function reserveBook(studentId, bookId) {
  const db      = loadDB();
  const student = db.students.find(s => s.id === studentId);
  const book    = db.books.find(b => b.id === bookId);

  if (!student) return { success: false, message: 'Student not found.' };
  if (!book)    return { success: false, message: 'Book not found.' };

  // Already borrowed?
  if (student.active_borrows.includes(bookId)) {
    return { success: false, message: 'You already have this book borrowed.' };
  }

  // Already reserved?
  const existing = db.reservations.find(
    r => r.student_id === studentId && r.book_id === bookId && r.status === 'active'
  );
  if (existing) {
    return { success: false, message: 'You already have an active reservation for this book.' };
  }

  const now        = new Date();
  const expiresAt  = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  const reservation = {
    id          : `R${String(db.reservations.length + 1).padStart(3, '0')}`,
    student_id  : studentId,
    book_id     : bookId,
    reserved_at : now.toISOString(),
    expires_at  : expiresAt.toISOString(),
    status      : 'active',
  };

  db.reservations.push(reservation);
  student.reservations.push(bookId);
  saveDB(db);

  return {
    success     : true,
    message     : `Reservation placed successfully for "${book.title}". Valid until ${expiresAt.toDateString()}.`,
    reservation,
  };
}

/**
 * Get all active reservations for a student.
 * @param {string} studentId
 */
function getStudentReservations(studentId) {
  const db = loadDB();
  return db.reservations.filter(
    r => r.student_id === studentId && r.status === 'active'
  );
}

// ── Borrow records ────────────────────────────────────────────────────────────

/**
 * Get active borrow records for a student.
 * @param {string} studentId
 */
function getActiveBorrows(studentId) {
  const db = loadDB();
  return db.borrow_records.filter(
    r => r.student_id === studentId && r.returned_at === null
  );
}

/**
 * Get top N most borrowed books.
 * @param {number} n
 */
function getTopBorrowedBooks(n = 5) {
  const db      = loadDB();
  const counts  = {};
  db.borrow_records.forEach(r => {
    counts[r.book_id] = (counts[r.book_id] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([bookId, count]) => ({
      book : db.books.find(b => b.id === bookId),
      count,
    }))
    .filter(e => e.book);
}

module.exports = {
  getAllBooks,
  getBookById,
  searchBooks,
  getBooksBySubject,
  getBooksByCourse,
  getAvailableBooks,
  checkAvailability,
  getStudentByRoll,
  getStudentById,
  reserveBook,
  getStudentReservations,
  getActiveBorrows,
  getTopBorrowedBooks,
};
