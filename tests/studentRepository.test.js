'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStudentRepository, DataFileError } = require('../src/studentRepository');

const ada = { name: 'Ada', email: 'ada@example.com', course: 'Math' };
const bob = { name: 'Bob', email: 'bob@example.com', course: 'Art' };

function failingWriter() {
  throw new Error('disk full');
}

describe('in-memory repository', () => {
  test('create assigns increasing ids and list is ordered by id', () => {
    const repo = createStudentRepository();
    assert.deepEqual(repo.list(), []);
    assert.equal(repo.create(ada).id, 1);
    assert.equal(repo.create(bob).id, 2);
    assert.deepEqual(repo.list().map((s) => s.id), [1, 2]);
    assert.deepEqual(repo.get(1), { id: 1, ...ada });
  });

  test('get returns undefined for unknown id', () => {
    assert.equal(createStudentRepository().get(5), undefined);
  });

  test('returned records are copies', () => {
    const repo = createStudentRepository();
    repo.create(ada);
    repo.get(1).name = 'changed';
    repo.list()[0].name = 'changed';
    assert.equal(repo.get(1).name, 'Ada');
  });

  test('update replaces fields and keeps id', () => {
    const repo = createStudentRepository();
    repo.create(ada);
    assert.deepEqual(repo.update(1, bob), { id: 1, ...bob });
    assert.deepEqual(repo.get(1), { id: 1, ...bob });
    assert.equal(repo.update(9, bob), undefined);
  });

  test('remove deletes and reports missing ids', () => {
    const repo = createStudentRepository();
    repo.create(ada);
    assert.equal(repo.remove(1), true);
    assert.equal(repo.get(1), undefined);
    assert.equal(repo.remove(1), false);
  });

  test('findByEmail is case-insensitive and trims', () => {
    const repo = createStudentRepository();
    repo.create(ada);
    assert.equal(repo.findByEmail('  ADA@Example.COM ').id, 1);
    assert.equal(repo.findByEmail('nobody@example.com'), undefined);
  });

  test('email index follows update and remove', () => {
    const repo = createStudentRepository();
    repo.create(ada);
    repo.update(1, bob);
    assert.equal(repo.findByEmail(ada.email), undefined);
    assert.equal(repo.findByEmail(bob.email).id, 1);
    repo.remove(1);
    assert.equal(repo.findByEmail(bob.email), undefined);
  });

  test('ids are not reused after delete', () => {
    const repo = createStudentRepository();
    repo.create(ada);
    repo.create(bob);
    repo.remove(2);
    assert.equal(repo.create({ ...bob, email: 'new@example.com' }).id, 3);
  });
});

describe('failing writer', () => {
  test('create leaves state and nextId unchanged', () => {
    let fail = false;
    const repo = createStudentRepository({ writer: () => fail && failingWriter() });
    repo.create(ada);
    fail = true;
    assert.throws(() => repo.create(bob), /disk full/);
    assert.deepEqual(repo.list().map((s) => s.id), [1]);
    assert.equal(repo.findByEmail(bob.email), undefined);
    fail = false;
    assert.equal(repo.create(bob).id, 2);
  });

  test('update leaves state unchanged', () => {
    let fail = false;
    const repo = createStudentRepository({ writer: () => fail && failingWriter() });
    repo.create(ada);
    fail = true;
    assert.throws(() => repo.update(1, bob), /disk full/);
    assert.deepEqual(repo.get(1), { id: 1, ...ada });
    assert.equal(repo.findByEmail(ada.email).id, 1);
    assert.equal(repo.findByEmail(bob.email), undefined);
  });

  test('remove leaves state unchanged', () => {
    let fail = false;
    const repo = createStudentRepository({ writer: () => fail && failingWriter() });
    repo.create(ada);
    fail = true;
    assert.throws(() => repo.remove(1), /disk full/);
    assert.deepEqual(repo.get(1), { id: 1, ...ada });
  });

  test('writer receives the new state', () => {
    const calls = [];
    const repo = createStudentRepository({ writer: (data) => calls.push(data) });
    repo.create(ada);
    assert.deepEqual(calls, [{ nextId: 2, students: [{ id: 1, ...ada }] }]);
  });
});

describe('file persistence', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
    file = path.join(dir, 'data', 'students.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeRaw(content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  test('missing file starts empty and is not created until first save', () => {
    const repo = createStudentRepository({ filePath: file });
    assert.deepEqual(repo.list(), []);
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(path.dirname(file)), false);
  });

  test('missing data dir is created on first save and no tmp file remains', () => {
    const repo = createStudentRepository({ filePath: file });
    repo.create(ada);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { nextId: 2, students: [{ id: 1, ...ada }] });
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['students.json']);
  });

  test('saved file reloads to the same state', () => {
    const repo = createStudentRepository({ filePath: file });
    repo.create(ada);
    repo.create(bob);
    repo.remove(2);
    const reloaded = createStudentRepository({ filePath: file });
    assert.deepEqual(reloaded.list(), repo.list());
    assert.equal(reloaded.create(bob).id, 3);
  });

  test('failed save with a real file leaves the file and memory unchanged', () => {
    const repo = createStudentRepository({ filePath: file });
    repo.create(ada);
    const before = fs.readFileSync(file);
    fs.mkdirSync(`${file}.tmp`);
    assert.throws(() => repo.create(bob));
    fs.rmSync(`${file}.tmp`, { recursive: true, force: true });
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(repo.list().map((s) => s.id), [1]);
  });

  test('nextId at or below maxId is corrected to maxId + 1', () => {
    writeRaw(JSON.stringify({ nextId: 1, students: [{ id: 5, ...ada }] }));
    const repo = createStudentRepository({ filePath: file });
    assert.equal(repo.create(bob).id, 6);
  });

  test('higher nextId is preserved', () => {
    writeRaw(JSON.stringify({ nextId: 50, students: [{ id: 2, ...ada }] }));
    assert.equal(createStudentRepository({ filePath: file }).create(bob).id, 50);
  });

  const invalidFiles = {
    'malformed JSON': '{"nextId": 1, "students": [',
    'not an object': '[]',
    'null': 'null',
    'missing nextId': JSON.stringify({ students: [] }),
    'nextId zero': JSON.stringify({ nextId: 0, students: [] }),
    'nextId not an integer': JSON.stringify({ nextId: 1.5, students: [] }),
    'nextId unsafe': JSON.stringify({ nextId: 2 ** 60, students: [] }),
    'students not an array': JSON.stringify({ nextId: 1, students: {} }),
    'record not an object': JSON.stringify({ nextId: 2, students: [7] }),
    'record with bad id': JSON.stringify({ nextId: 2, students: [{ id: '1', ...ada }] }),
    'record with zero id': JSON.stringify({ nextId: 2, students: [{ id: 0, ...ada }] }),
    'record failing validation': JSON.stringify({ nextId: 2, students: [{ id: 1, ...ada, email: 'nope' }] }),
    'duplicate ids': JSON.stringify({ nextId: 3, students: [{ id: 1, ...ada }, { id: 1, ...bob }] }),
    'duplicate emails with different case': JSON.stringify({
      nextId: 3,
      students: [{ id: 1, ...ada }, { id: 2, ...bob, email: 'ADA@example.com' }],
    }),
  };

  for (const [label, content] of Object.entries(invalidFiles)) {
    test(`startup fails and file is untouched: ${label}`, () => {
      writeRaw(content);
      const before = fs.readFileSync(file);
      assert.throws(() => createStudentRepository({ filePath: file }), (err) => {
        assert.ok(err instanceof DataFileError);
        assert.ok(!err.message.includes('ada@example.com'));
        return true;
      });
      assert.deepEqual(fs.readFileSync(file), before);
    });
  }
});
