'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateStudent, parseId } = require('../src/validation');
const { ValidationError, InvalidIdError } = require('../src/errors');

const valid = { name: 'Ada Lovelace', email: 'ada@example.com', course: 'Math' };

function fieldErrors(input) {
  try {
    validateStudent(input);
  } catch (err) {
    assert.ok(err instanceof ValidationError, 'expected ValidationError');
    return err.fields;
  }
  assert.fail('expected validation to fail');
}

describe('validateStudent', () => {
  test('accepts valid input and trims values', () => {
    const result = validateStudent({ name: '  Ada Lovelace  ', email: ' ada@example.com\n', course: '\tMath ' });
    assert.deepEqual(result, valid);
  });

  for (const field of ['name', 'email', 'course']) {
    test(`rejects missing ${field}`, () => {
      const input = { ...valid };
      delete input[field];
      assert.deepEqual(fieldErrors(input).map((f) => f.field), [field]);
    });

    test(`rejects blank ${field}`, () => {
      const fields = fieldErrors({ ...valid, [field]: '   ' });
      assert.deepEqual(fields.map((f) => f.field), [field]);
      assert.match(fields[0].message, /blank/);
    });

    test(`rejects non-string ${field}`, () => {
      for (const bad of [5, null, true, ['x'], { a: 1 }]) {
        assert.deepEqual(fieldErrors({ ...valid, [field]: bad }).map((f) => f.field), [field]);
      }
    });
  }

  test('collects all field errors in one pass', () => {
    const fields = fieldErrors({});
    assert.deepEqual(fields.map((f) => f.field), ['name', 'email', 'course']);
  });

  test('rejects non-object input', () => {
    for (const bad of [null, undefined, 'x', 5, [valid]]) {
      assert.equal(fieldErrors(bad).length, 3);
    }
  });

  test('enforces 100 character limit for name and course', () => {
    assert.doesNotThrow(() => validateStudent({ ...valid, name: 'a'.repeat(100), course: 'b'.repeat(100) }));
    assert.deepEqual(fieldErrors({ ...valid, name: 'a'.repeat(101) }).map((f) => f.field), ['name']);
    assert.deepEqual(fieldErrors({ ...valid, course: 'b'.repeat(101) }).map((f) => f.field), ['course']);
  });

  test('enforces 254 character limit for email', () => {
    const local = 'a'.repeat(254 - '@b.co'.length);
    const ok = `${local}@b.co`;
    assert.equal(ok.length, 254);
    assert.doesNotThrow(() => validateStudent({ ...valid, email: ok }));
    const tooLong = `a${ok}`;
    assert.equal(tooLong.length, 255);
    assert.deepEqual(fieldErrors({ ...valid, email: tooLong }).map((f) => f.field), ['email']);
  });

  test('rejects malformed emails', () => {
    for (const email of ['abc', 'a@b', 'a@.com', 'a@b.', 'a@@b.c', 'a b@c.d', 'a@b.c\nx', 'a@b\n.c', 'a@b..c', 'a\t@b.c']) {
      const fields = fieldErrors({ ...valid, email });
      assert.deepEqual(fields.map((f) => f.field), ['email'], JSON.stringify(email));
      assert.match(fields[0].message, /valid email/);
    }
  });

  test('accepts a minimal valid email', () => {
    assert.equal(validateStudent({ ...valid, email: 'a@b.co' }).email, 'a@b.co');
  });

  test('returns only name, email, course', () => {
    const result = validateStudent({ ...valid, id: 99, extra: 'x' });
    assert.deepEqual(Object.keys(result), ['name', 'email', 'course']);
  });

  test('__proto__ and constructor keys have no effect', () => {
    const input = JSON.parse(
      '{"name":"Ada","email":"ada@example.com","course":"Math","__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}}}',
    );
    const result = validateStudent(input);
    assert.deepEqual(result, { name: 'Ada', email: 'ada@example.com', course: 'Math' });
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.polluted, undefined);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
  });

  test('does not read inherited fields', () => {
    const input = Object.create({ name: 'Ada', email: 'ada@example.com', course: 'Math' });
    assert.equal(fieldErrors(input).length, 3);
  });
});

describe('parseId', () => {
  test('accepts valid ids', () => {
    assert.equal(parseId('1'), 1);
    assert.equal(parseId('42'), 42);
    assert.equal(parseId('%31'), 1);
    assert.equal(parseId('9007199254740991'), Number.MAX_SAFE_INTEGER);
  });

  test('rejects invalid ids with InvalidIdError', () => {
    const bad = ['0', '007', '1e3', '0x10', '12abc', '-1', '1.5', ' 5 ', '', '1%00', '9007199254740993', '%', '%E0%A4%A', 'abc'];
    for (const segment of bad) {
      assert.throws(() => parseId(segment), InvalidIdError, JSON.stringify(segment));
    }
  });

  test('rejects missing segment', () => {
    assert.throws(() => parseId(undefined), InvalidIdError);
    assert.throws(() => parseId(null), InvalidIdError);
  });
});
