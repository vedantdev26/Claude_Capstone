'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createStudentRepository } = require('../src/studentRepository');
const { createStudentService } = require('../src/studentService');
const { ValidationError, NotFoundError, ConflictError } = require('../src/errors');

const ada = { name: 'Ada', email: 'ada@example.com', course: 'Math' };
const bob = { name: 'Bob', email: 'bob@example.com', course: 'Art' };

describe('studentService', () => {
  let service;

  beforeEach(() => {
    service = createStudentService(createStudentRepository());
  });

  test('create returns unique increasing ids (AC-1)', () => {
    const a = service.create(ada);
    const b = service.create(bob);
    assert.deepEqual(a, { id: 1, ...ada });
    assert.equal(b.id, 2);
  });

  test('create stores trimmed values', () => {
    const created = service.create({ name: ' Ada ', email: ' ada@example.com ', course: ' Math ' });
    assert.deepEqual(created, { id: 1, ...ada });
  });

  test('list returns empty then all records (AC-2)', () => {
    assert.deepEqual(service.list(), []);
    service.create(ada);
    service.create(bob);
    assert.deepEqual(service.list().map((s) => s.id), [1, 2]);
  });

  test('get returns the record (AC-3)', () => {
    service.create(ada);
    assert.deepEqual(service.get(1), { id: 1, ...ada });
  });

  test('update changes fields and keeps id (AC-4)', () => {
    service.create(ada);
    assert.deepEqual(service.update(1, { ...bob, id: 77 }), { id: 1, ...bob });
    assert.deepEqual(service.get(1), { id: 1, ...bob });
  });

  test('delete removes the record (AC-5)', () => {
    service.create(ada);
    service.remove(1);
    assert.throws(() => service.get(1), NotFoundError);
    assert.deepEqual(service.list(), []);
  });

  test('duplicate email on add is a conflict in any case or whitespace (AC-8)', () => {
    service.create(ada);
    for (const email of ['ada@example.com', 'ADA@EXAMPLE.COM', '  Ada@Example.com  ']) {
      assert.throws(() => service.create({ ...bob, email }), (err) => {
        assert.ok(err instanceof ConflictError);
        assert.match(err.message, /[Ee]mail/);
        return true;
      });
    }
    assert.equal(service.list().length, 1);
  });

  test('duplicate email on update is a conflict (AC-8)', () => {
    service.create(ada);
    service.create(bob);
    assert.throws(() => service.update(2, { ...bob, email: 'ADA@example.com' }), ConflictError);
    assert.deepEqual(service.get(2), { id: 2, ...bob });
  });

  test('update keeping own email, even in another case, is allowed', () => {
    service.create(ada);
    const updated = service.update(1, { ...ada, name: 'Ada L', email: 'ADA@example.com' });
    assert.equal(updated.name, 'Ada L');
    assert.equal(updated.email, 'ADA@example.com');
  });

  test('same name alone is not a duplicate', () => {
    service.create(ada);
    assert.doesNotThrow(() => service.create({ ...bob, name: 'Ada' }));
  });

  test('get, update and delete of a missing id are not found (AC-9)', () => {
    assert.throws(() => service.get(7), /Student 7 not found/);
    assert.throws(() => service.update(7, ada), NotFoundError);
    assert.throws(() => service.remove(7), NotFoundError);
  });

  test('update of a missing id with an invalid body is not found, not validation', () => {
    assert.throws(() => service.update(7, {}), NotFoundError);
  });

  test('validation failure on add stores nothing (AC-6, AC-7)', () => {
    assert.throws(() => service.create({ ...ada, email: 'abc' }), ValidationError);
    assert.throws(() => service.create({ ...ada, name: '' }), ValidationError);
    assert.deepEqual(service.list(), []);
    assert.equal(service.create(ada).id, 1);
  });

  test('validation failure on update changes nothing (AC-6, AC-7)', () => {
    service.create(ada);
    assert.throws(() => service.update(1, { ...bob, course: ' ' }), ValidationError);
    assert.throws(() => service.update(1, { ...bob, email: 'abc' }), ValidationError);
    assert.deepEqual(service.get(1), { id: 1, ...ada });
  });

  test('add and update apply the same validation (NFR-3)', () => {
    service.create(ada);
    const bad = { name: 'x', email: 'a@b', course: 'y' };
    const errorsFor = (fn) => {
      try {
        fn();
      } catch (err) {
        return err.fields;
      }
    };
    assert.deepEqual(errorsFor(() => service.create(bad)), errorsFor(() => service.update(1, bad)));
  });

  test('ids are not reused after delete', () => {
    service.create(ada);
    service.create(bob);
    service.remove(2);
    assert.equal(service.create({ ...bob, email: 'other@example.com' }).id, 3);
  });

  test('a failing writer propagates the error and leaves state unchanged (AC-11)', () => {
    let fail = false;
    const svc = createStudentService(
      createStudentRepository({
        writer: () => {
          if (fail) throw new Error('disk full');
        },
      }),
    );
    svc.create(ada);
    fail = true;
    assert.throws(() => svc.create(bob), /disk full/);
    assert.throws(() => svc.update(1, bob), /disk full/);
    assert.throws(() => svc.remove(1), /disk full/);
    assert.deepEqual(svc.list(), [{ id: 1, ...ada }]);
    fail = false;
    assert.equal(svc.create(bob).id, 2);
  });
});
