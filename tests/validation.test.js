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

const { validateStatusChange, STATUSES, DEFAULT_STATUS } = require('../src/validation');

const STATUS_MESSAGE = 'must be "Active" or "Inactive"';
const BAD_STATUSES = ['active', 'INACTIVE', ' Active', 'Active ', 'Active\n', '', null, 1, true, [], {}, 'Suspended'];

function statusErrors(run) {
  try {
    run();
  } catch (err) {
    assert.ok(err instanceof ValidationError, 'expected ValidationError');
    return err.fields;
  }
  assert.fail('expected validation to fail');
}

describe('status rules', () => {
  test('constants', () => {
    assert.deepEqual(STATUSES, ['Active', 'Inactive']);
    assert.equal(DEFAULT_STATUS, 'Active');
  });

  test('rejected set is identical for PATCH mode and POST mode with the fixed message', () => {
    for (const bad of BAD_STATUSES) {
      const expected = [{ field: 'status', message: STATUS_MESSAGE }];
      assert.deepEqual(statusErrors(() => validateStatusChange({ status: bad })), expected, JSON.stringify(bad));
      assert.deepEqual(
        statusErrors(() => validateStudent({ ...valid, status: bad }, { acceptStatus: true })),
        expected,
        JSON.stringify(bad),
      );
    }
  });

  test('rejection never echoes the input', () => {
    for (const bad of ['Secret-Value', ' Active']) {
      const fields = statusErrors(() => validateStatusChange({ status: bad }));
      assert.ok(!JSON.stringify(fields).includes(bad));
    }
  });

  test('Active and Inactive are accepted in both modes', () => {
    for (const status of STATUSES) {
      assert.equal(validateStatusChange({ status }), status);
      assert.deepEqual(validateStudent({ ...valid, status }, { acceptStatus: true }), { ...valid, status });
    }
  });

  test('missing status: PATCH mode requires it, POST mode defaults to Active', () => {
    assert.deepEqual(statusErrors(() => validateStatusChange({})), [{ field: 'status', message: 'is required' }]);
    assert.deepEqual(validateStudent(valid, { acceptStatus: true }), { ...valid, status: 'Active' });
  });

  test('validateStatusChange treats non-object input as missing status', () => {
    for (const input of [null, undefined, [], 'Active', 5]) {
      assert.deepEqual(statusErrors(() => validateStatusChange(input)), [{ field: 'status', message: 'is required' }]);
    }
  });

  test('default option ignores a bad status and returns exactly name, email, course', () => {
    for (const bad of [...BAD_STATUSES, 'Inactive']) {
      const result = validateStudent({ ...valid, status: bad });
      assert.deepEqual(Object.keys(result), ['name', 'email', 'course']);
      assert.deepEqual(result, valid);
    }
  });

  test('multi-field errors are collected in one pass in order name, email, course, status', () => {
    const fields = statusErrors(() => validateStudent({ name: '', email: 'x', course: 5, status: 'nope' }, { acceptStatus: true }));
    assert.deepEqual(fields.map((f) => f.field), ['name', 'email', 'course', 'status']);
  });

  test('acceptStatus result key order is name, email, course, status', () => {
    assert.deepEqual(Object.keys(validateStudent({ ...valid, status: 'Inactive' }, { acceptStatus: true })), [
      'name',
      'email',
      'course',
      'status',
    ]);
  });

  test('inherited or __proto__ status has no effect and the prototype is untouched', () => {
    const inherited = Object.create({ status: 'Inactive' });
    Object.assign(inherited, valid);
    assert.equal(validateStudent(inherited, { acceptStatus: true }).status, 'Active');
    assert.deepEqual(statusErrors(() => validateStatusChange(Object.create({ status: 'Active' }))), [
      { field: 'status', message: 'is required' },
    ]);
    const parsed = JSON.parse('{"__proto__":{"status":"Inactive"}}');
    assert.deepEqual(statusErrors(() => validateStatusChange(parsed)), [{ field: 'status', message: 'is required' }]);
    const body = JSON.parse(`{"name":"Ada","email":"ada@example.com","course":"Math","__proto__":{"status":"Inactive"}}`);
    assert.equal(validateStudent(body, { acceptStatus: true }).status, 'Active');
    assert.equal(Object.prototype.status, undefined);
    assert.equal(({}).status, undefined);
  });
});
