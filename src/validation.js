'use strict';

const { ValidationError, InvalidIdError } = require('./errors');

const MAX_TEXT = 100;
const MAX_EMAIL = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const ID_RE = /^[1-9]\d*$/;
const STATUSES = ['Active', 'Inactive'];
const DEFAULT_STATUS = 'Active';

function readText(source, key) {
  if (!Object.hasOwn(source, key)) return { error: 'is required' };
  const value = source[key];
  if (typeof value !== 'string') return { error: 'must be a string' };
  const text = value.trim();
  if (text === '') return { error: 'must not be blank' };
  return { text };
}

function checkLength(text, max) {
  return text.length > max ? `must be at most ${max} characters` : null;
}

function checkEmail(text) {
  if (text.length > MAX_EMAIL) return `must be at most ${MAX_EMAIL} characters`;
  return EMAIL_RE.test(text) ? null : 'must be a valid email address';
}

const RULES = [
  ['name', (t) => checkLength(t, MAX_TEXT)],
  ['email', checkEmail],
  ['course', (t) => checkLength(t, MAX_TEXT)],
];

function checkStatus(value) {
  return STATUSES.includes(value) ? null : 'must be "Active" or "Inactive"';
}

function asObject(input) {
  return input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function validateStudent(input, { acceptStatus = false } = {}) {
  const source = asObject(input);
  const fields = [];
  const clean = {};
  for (const [field, check] of RULES) {
    const { text, error } = readText(source, field);
    const message = error ?? check(text);
    if (message) fields.push({ field, message });
    else clean[field] = text;
  }
  let status = DEFAULT_STATUS;
  if (acceptStatus && Object.hasOwn(source, 'status')) {
    const message = checkStatus(source.status);
    if (message) fields.push({ field: 'status', message });
    else status = source.status;
  }
  if (fields.length > 0) throw new ValidationError(fields);
  const result = { name: clean.name, email: clean.email, course: clean.course };
  if (acceptStatus) result.status = status;
  return result;
}

function validateStatusChange(input) {
  const source = asObject(input);
  const message = Object.hasOwn(source, 'status') ? checkStatus(source.status) : 'is required';
  if (message) throw new ValidationError([{ field: 'status', message }]);
  return source.status;
}

function parseId(segment) {
  if (segment === undefined || segment === null || segment === '') {
    throw new InvalidIdError('Student ID is required');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new InvalidIdError('Student ID is not valid');
  }
  if (!ID_RE.test(decoded)) {
    throw new InvalidIdError('Student ID must be a positive integer');
  }
  const id = Number(decoded);
  if (id > Number.MAX_SAFE_INTEGER) {
    throw new InvalidIdError('Student ID is too large');
  }
  return id;
}

module.exports = { validateStudent, validateStatusChange, parseId, STATUSES, DEFAULT_STATUS };
