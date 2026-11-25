'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateStudent } = require('./validation');
const { ValidationError } = require('./errors');

class DataFileError extends Error {
  constructor(reason) {
    super(`Invalid data file: ${reason}`);
    this.name = 'DataFileError';
  }
}

function createFileWriter(filePath) {
  const dir = path.dirname(filePath);
  const tmpPath = `${filePath}.tmp`;
  return (data) => {
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // best effort; the original error is the one to report
      }
      throw err;
    }
  };
}

function isPositiveSafeInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function loadFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new DataFileError(`cannot read file (${err.code})`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataFileError('not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DataFileError('expected an object');
  }
  if (!isPositiveSafeInt(parsed.nextId)) throw new DataFileError('nextId is not a positive integer');
  if (!Array.isArray(parsed.students)) throw new DataFileError('students is not an array');

  const students = new Map();
  const emails = new Set();
  let maxId = 0;
  parsed.students.forEach((raw, index) => {
    const row = `record ${index + 1}`;
    if (raw === null || typeof raw !== 'object' || !isPositiveSafeInt(raw.id)) {
      throw new DataFileError(`${row} has an invalid id`);
    }
    if (students.has(raw.id)) throw new DataFileError(`${row} has a duplicate id`);
    let data;
    try {
      data = validateStudent(raw);
    } catch (err) {
      if (err instanceof ValidationError) throw new DataFileError(`${row} failed validation`);
      throw err;
    }
    const key = data.email.toLowerCase();
    if (emails.has(key)) throw new DataFileError(`${row} has a duplicate email`);
    emails.add(key);
    students.set(raw.id, { id: raw.id, ...data });
    maxId = Math.max(maxId, raw.id);
  });

  return { students, nextId: Math.max(parsed.nextId, maxId + 1) };
}

function emailKey(email) {
  return email.trim().toLowerCase();
}

function createStudentRepository({ filePath, writer } = {}) {
  const write = writer ?? (filePath ? createFileWriter(filePath) : () => {});
  let students = new Map();
  let emailIndex = new Map();
  let nextId = 1;

  function indexOf(map) {
    const index = new Map();
    for (const s of map.values()) index.set(emailKey(s.email), s.id);
    return index;
  }

  if (filePath) {
    const loaded = loadFile(filePath);
    if (loaded) {
      students = loaded.students;
      nextId = loaded.nextId;
      emailIndex = indexOf(students);
    }
  }

  function snapshot(map) {
    return [...map.values()].sort((a, b) => a.id - b.id).map((s) => ({ ...s }));
  }

  function commit(newStudents, newNextId) {
    write({ nextId: newNextId, students: snapshot(newStudents) });
    students = newStudents;
    nextId = newNextId;
    emailIndex = indexOf(newStudents);
  }

  return {
    list: () => snapshot(students),

    get(id) {
      const found = students.get(id);
      return found ? { ...found } : undefined;
    },

    findByEmail(email) {
      const id = emailIndex.get(emailKey(email));
      return id === undefined ? undefined : { ...students.get(id) };
    },

    create(data) {
      const record = { id: nextId, name: data.name, email: data.email, course: data.course };
      const next = new Map(students).set(record.id, record);
      commit(next, nextId + 1);
      return { ...record };
    },

    update(id, data) {
      if (!students.has(id)) return undefined;
      const record = { id, name: data.name, email: data.email, course: data.course };
      commit(new Map(students).set(id, record), nextId);
      return { ...record };
    },

    remove(id) {
      if (!students.has(id)) return false;
      const next = new Map(students);
      next.delete(id);
      commit(next, nextId);
      return true;
    },
  };
}

module.exports = { createStudentRepository, createFileWriter, DataFileError };
