'use strict';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../src/server');
const { createFileWriter } = require('../src/studentRepository');

const SERVER_JS = path.join(__dirname, '..', 'src', 'server.js');
const ada = { name: 'Ada', email: 'ada@example.com', course: 'Math' };
const bob = { name: 'Bob', email: 'bob@example.com', course: 'Art' };

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

function send(port, { method = 'GET', path: urlPath = '/students', headers = {}, body, chunks }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers, agent: false }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      const done = () => {
        if (settled) return;
        settled = true;
        const text = Buffer.concat(parts).toString('utf8');
        let json;
        try {
          json = text ? JSON.parse(text) : undefined;
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      };
      res.on('end', done);
      res.on('close', done);
    });
    req.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    if (chunks) chunks.forEach((c) => req.write(c));
    req.end(body);
  });
}

function jsonRequest(port, method, urlPath, payload, extraHeaders = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return send(port, {
    method,
    path: urlPath,
    body,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...extraHeaders },
  });
}

function assertError(res, status, code) {
  assert.equal(res.status, status);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.equal(res.json.error.code, code);
  assert.equal(typeof res.json.error.message, 'string');
  assert.ok(res.json.error.message.length > 0);
}

function makeEnv() {
  const env = { logs: [], errors: [], writerFails: false };
  env.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
  env.file = path.join(env.dir, 'data', 'students.json');
  return env;
}

async function start(env, { prepare, failingWriter = false } = {}) {
  if (prepare) prepare(env);
  const options = {
    filePath: env.file,
    log: (line) => env.logs.push(line),
    logError: (...args) => env.errors.push(args.map(String).join(' ')),
  };
  if (failingWriter) {
    const real = createFileWriter(env.file);
    options.writer = (data) => {
      if (env.writerFails) throw new Error('disk full');
      real(data);
    };
  }
  env.server = createServer(options);
  env.port = await listen(env.server);
}

async function stop(env) {
  if (env.server) await close(env.server);
  fs.rmSync(env.dir, { recursive: true, force: true });
}

describe('API: happy path and routing', () => {
  const env = makeEnv();
  before(() => start(env));
  after(() => stop(env));

  test('list is empty initially (AC-2)', async () => {
    const res = await send(env.port, {});
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^application\/json/);
    assert.deepEqual(res.json, []);
  });

  test('add returns 201 with id and Location (AC-1)', async () => {
    const res = await jsonRequest(env.port, 'POST', '/students', ada);
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { id: 1, ...ada, status: 'Active' });
    assert.equal(res.headers.location, '/students/1');
    const second = await jsonRequest(env.port, 'POST', '/students', bob);
    assert.equal(second.json.id, 2);
  });

  test('list returns all records ordered by id (AC-2)', async () => {
    const res = await send(env.port, {});
    assert.deepEqual(res.json, [{ id: 1, ...ada, status: 'Active' }, { id: 2, ...bob, status: 'Active' }]);
  });

  test('get by id (AC-3)', async () => {
    const res = await send(env.port, { path: '/students/2' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { id: 2, ...bob, status: 'Active' });
  });

  test('GET /students/ equals the list, query string ignored, trailing slash on id', async () => {
    const list = await send(env.port, {});
    assert.deepEqual((await send(env.port, { path: '/students/' })).json, list.json);
    assert.deepEqual((await send(env.port, { path: '/students?x=1&y=2' })).json, list.json);
    assert.deepEqual((await send(env.port, { path: '/students/1/?x=1' })).json, { id: 1, ...ada, status: 'Active' });
  });

  test('%31 is a valid id', async () => {
    const res = await send(env.port, { path: '/students/%31' });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, 1);
  });

  test('update keeps id and ignores body id (AC-4)', async () => {
    const res = await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, name: 'Ada L', id: 99 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { id: 1, ...ada, name: 'Ada L', status: 'Active' });
    assert.equal((await send(env.port, { path: '/students/99' })).status, 404);
  });

  test('delete returns 204 then get is 404 (AC-5)', async () => {
    const res = await send(env.port, { method: 'DELETE', path: '/students/2' });
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assertError(await send(env.port, { path: '/students/2' }), 404, 'NOT_FOUND');
  });

  test('PUT and DELETE without an id are INVALID_ID (AC-10)', async () => {
    assertError(await jsonRequest(env.port, 'PUT', '/students', ada), 400, 'INVALID_ID');
    assertError(await send(env.port, { method: 'DELETE', path: '/students' }), 400, 'INVALID_ID');
    assertError(await jsonRequest(env.port, 'PUT', '/students/', ada), 400, 'INVALID_ID');
    assertError(await send(env.port, { method: 'DELETE', path: '/students/' }), 400, 'INVALID_ID');
  });

  test('invalid ids are INVALID_ID for get, update and delete (AC-10)', async () => {
    for (const bad of ['0', '007', '1e3', '0x10', '12abc', '1%00', '9007199254740993', '-1', '1.5', '%zz']) {
      assertError(await send(env.port, { path: `/students/${bad}` }), 400, 'INVALID_ID');
      assertError(await jsonRequest(env.port, 'PUT', `/students/${bad}`, ada), 400, 'INVALID_ID');
      assertError(await send(env.port, { method: 'DELETE', path: `/students/${bad}` }), 400, 'INVALID_ID');
    }
  });

  test('unknown or too-deep paths are ROUTE_NOT_FOUND with a fixed message', async () => {
    for (const p of ['/students/1/x', '/other', '/students/1/2/3']) {
      const res = await send(env.port, { path: p });
      assertError(res, 404, 'ROUTE_NOT_FOUND');
      assert.ok(!res.text.includes('other'));
    }
  });

  test('unsupported methods are 405', async () => {
    assertError(await jsonRequest(env.port, 'POST', '/students/1', ada), 405, 'METHOD_NOT_ALLOWED');
    assertError(await send(env.port, { method: 'PATCH', path: '/students' }), 405, 'METHOD_NOT_ALLOWED');
    assertError(await send(env.port, { method: 'PATCH', path: '/students/1' }), 405, 'METHOD_NOT_ALLOWED');
    assertError(await send(env.port, { method: 'DELETE', path: '/students/1/x' }), 404, 'ROUTE_NOT_FOUND');
  });

  test('no CORS headers are sent', async () => {
    const res = await send(env.port, { headers: { Origin: 'http://evil.example' } });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});

describe('API: error rows, check order and NFR-2', () => {
  const env = makeEnv();
  beforeEach(() => start(env));
  afterEach(async () => {
    await stop(env);
    env.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
    env.file = path.join(env.dir, 'data', 'students.json');
  });

  const list = async () => (await send(env.port, {})).json;

  test('422 VALIDATION_ERROR names the field on POST (AC-6, AC-7)', async () => {
    const cases = [
      [{ email: 'a@b.co', course: 'x' }, 'name'],
      [{ name: '  ', email: 'a@b.co', course: 'x' }, 'name'],
      [{ name: 'x', email: 'abc', course: 'x' }, 'email'],
      [{ name: 'x', email: 'a@b.co' }, 'course'],
      [{ name: 5, email: 'a@b.co', course: 'x' }, 'name'],
    ];
    for (const [payload, field] of cases) {
      const res = await jsonRequest(env.port, 'POST', '/students', payload);
      assertError(res, 422, 'VALIDATION_ERROR');
      assert.deepEqual(res.json.error.fields.map((f) => f.field), [field]);
      assert.ok(res.json.error.message.includes(field));
    }
    assert.deepEqual(await list(), []);
  });

  test('422 VALIDATION_ERROR on PUT leaves the record unchanged', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const res = await jsonRequest(env.port, 'PUT', '/students/1', { name: '', email: 'abc', course: 'x' });
    assertError(res, 422, 'VALIDATION_ERROR');
    assert.deepEqual(res.json.error.fields.map((f) => f.field), ['name', 'email']);
    assert.deepEqual(await list(), [{ id: 1, ...ada, status: 'Active' }]);
  });

  test('400 INVALID_JSON for bad JSON and non-object bodies', async () => {
    for (const body of ['{"name":', '', 'null', '[]', '"text"', '5']) {
      const res = await jsonRequest(env.port, 'POST', '/students', body);
      assertError(res, 400, 'INVALID_JSON');
    }
    assertError(await jsonRequest(env.port, 'PUT', '/students/1', '[]'), 400, 'INVALID_JSON');
    assert.deepEqual(await list(), []);
  });

  test('INVALID_JSON message never echoes input', async () => {
    const res = await jsonRequest(env.port, 'POST', '/students', '{"secret": SECRETVALUE}');
    assert.equal(res.status, 400);
    assert.ok(!res.text.includes('SECRETVALUE'));
  });

  test('404 NOT_FOUND on get, update and delete (AC-9)', async () => {
    const get = await send(env.port, { path: '/students/999' });
    assertError(get, 404, 'NOT_FOUND');
    assert.match(get.json.error.message, /999/);
    assertError(await jsonRequest(env.port, 'PUT', '/students/999', ada), 404, 'NOT_FOUND');
    assertError(await send(env.port, { method: 'DELETE', path: '/students/999' }), 404, 'NOT_FOUND');
  });

  test('409 CONFLICT on add in any case and on update; own email allowed (AC-8)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    await jsonRequest(env.port, 'POST', '/students', bob);
    for (const email of ['ada@example.com', 'ADA@Example.com', ' ada@example.com ']) {
      const res = await jsonRequest(env.port, 'POST', '/students', { ...bob, email });
      assertError(res, 409, 'CONFLICT');
      assert.match(res.json.error.message, /[Ee]mail/);
      assert.ok(!res.text.includes('Ada'));
    }
    assertError(await jsonRequest(env.port, 'PUT', '/students/2', { ...bob, email: 'ADA@example.com' }), 409, 'CONFLICT');
    const own = await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, name: 'Ada L', email: 'ADA@example.com' });
    assert.equal(own.status, 200);
    assert.equal((await list()).length, 2);
  });

  test('415 for non-JSON content type on POST and PUT', async () => {
    const body = JSON.stringify(ada);
    for (const [method, p] of [['POST', '/students'], ['PUT', '/students/1']]) {
      const res = await send(env.port, { method, path: p, body, headers: { 'Content-Type': 'text/plain' } });
      assertError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
      const none = await send(env.port, { method, path: p, body });
      assertError(none, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    assert.deepEqual(await list(), []);
  });

  test('application/json with charset is accepted', async () => {
    const res = await jsonRequest(env.port, 'POST', '/students', ada, { 'Content-Type': 'application/json; charset=utf-8' });
    assert.equal(res.status, 201);
  });

  test('413 for an oversize body via Content-Length', async () => {
    const body = JSON.stringify({ ...ada, name: 'a'.repeat(20000) });
    const res = await jsonRequest(env.port, 'POST', '/students', body);
    assertError(res, 413, 'PAYLOAD_TOO_LARGE');
    assert.equal(res.headers.connection, 'close');
    assert.deepEqual(await list(), []);
  });

  test('413 for an oversize chunked body', async () => {
    const chunk = Buffer.alloc(4096, 'a');
    const res = await send(env.port, {
      method: 'POST',
      path: '/students',
      headers: { 'Content-Type': 'application/json' },
      chunks: [Buffer.from('{"name":"'), chunk, chunk, chunk, chunk],
    });
    assertError(res, 413, 'PAYLOAD_TOO_LARGE');
    assert.equal(res.headers.connection, 'close');
    assert.deepEqual(await list(), []);
  });

  test('bodies on GET and DELETE are ignored', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const big = 'x'.repeat(50000);
    const get = await send(env.port, { path: '/students/1', body: big, headers: { 'Content-Length': big.length } });
    assert.equal(get.status, 200);
    const del = await send(env.port, { method: 'DELETE', path: '/students/1', body: big, headers: { 'Content-Length': big.length } });
    assert.equal(del.status, 204);
    assert.deepEqual(await list(), []);
  });

  test('check order: PUT on a missing id with an invalid body is 404', async () => {
    assertError(await jsonRequest(env.port, 'PUT', '/students/999', {}), 404, 'NOT_FOUND');
  });

  test('check order: invalid id with a bad body is 400 INVALID_ID', async () => {
    assertError(await jsonRequest(env.port, 'PUT', '/students/abc', '{bad'), 400, 'INVALID_ID');
    assertError(await send(env.port, { method: 'PUT', path: '/students/abc', body: 'x', headers: { 'Content-Type': 'text/plain' } }), 400, 'INVALID_ID');
  });

  test('check order: content type is checked before the body', async () => {
    const res = await send(env.port, { method: 'POST', path: '/students', body: '{bad', headers: { 'Content-Type': 'text/plain' } });
    assertError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  test('check order: invalid JSON beats validation; missing student beats validation', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    assertError(await jsonRequest(env.port, 'PUT', '/students/1', '{bad'), 400, 'INVALID_JSON');
    assertError(await jsonRequest(env.port, 'PUT', '/students/1', {}), 422, 'VALIDATION_ERROR');
  });

  test('check order: validation (422) is checked before duplicate email (409)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const res = await jsonRequest(env.port, 'POST', '/students', { name: '', email: 'ada@example.com', course: 'x' });
    assertError(res, 422, 'VALIDATION_ERROR');
  });

  test('__proto__ and constructor keys have no effect', async () => {
    const body = '{"name":"Eve","email":"eve@example.com","course":"CS","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}';
    const created = await jsonRequest(env.port, 'POST', '/students', body);
    assert.equal(created.status, 201);
    assert.deepEqual(Object.keys(created.json), ['id', 'name', 'email', 'course', 'status']);
    const updated = await jsonRequest(env.port, 'PUT', '/students/1', body);
    assert.equal(updated.status, 200);
    assert.deepEqual(Object.keys(updated.json), ['id', 'name', 'email', 'course', 'status']);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
    assert.deepEqual(await list(), [{ id: 1, name: 'Eve', email: 'eve@example.com', course: 'CS', status: 'Active' }]);
  });

  test('every error response is JSON', async () => {
    const responses = [
      await send(env.port, { path: '/nope' }),
      await send(env.port, { path: '/students/x' }),
      await send(env.port, { method: 'PATCH', path: '/students' }),
    ];
    for (const res of responses) assert.match(res.headers['content-type'], /^application\/json/);
  });
});

describe('API: failed save (AC-11)', () => {
  const env = makeEnv();
  before(() => start(env, { failingWriter: true }));
  after(() => stop(env));

  test('POST, PUT and DELETE return 500 and leave the store unchanged', async () => {
    const created = await jsonRequest(env.port, 'POST', '/students', ada);
    assert.equal(created.status, 201);
    const before = fs.readFileSync(env.file, 'utf8');
    env.writerFails = true;

    const post = await jsonRequest(env.port, 'POST', '/students', bob);
    assertError(post, 500, 'INTERNAL_ERROR');
    assert.equal(post.json.error.message, 'Internal server error');
    assert.ok(!post.text.includes('disk full'));
    assertError(await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, name: 'Changed' }), 500, 'INTERNAL_ERROR');
    assertError(await send(env.port, { method: 'DELETE', path: '/students/1' }), 500, 'INTERNAL_ERROR');

    env.writerFails = false;
    assert.deepEqual((await send(env.port, {})).json, [{ id: 1, ...ada, status: 'Active' }]);
    assert.equal(fs.readFileSync(env.file, 'utf8'), before);
    const next = await jsonRequest(env.port, 'POST', '/students', bob);
    assert.equal(next.json.id, 2);
    assert.ok(env.errors.some((line) => line.includes('disk full') || line.includes('Unexpected')));
  });
});

describe('API: data file', () => {
  let env;
  beforeEach(() => {
    env = makeEnv();
  });
  afterEach(() => stop(env));

  function writeRaw(content) {
    fs.mkdirSync(path.dirname(env.file), { recursive: true });
    fs.writeFileSync(env.file, content);
  }

  test('missing data dir is created on first save', async () => {
    await start(env);
    assert.equal(fs.existsSync(path.dirname(env.file)), false);
    await jsonRequest(env.port, 'POST', '/students', ada);
    assert.equal(JSON.parse(fs.readFileSync(env.file, 'utf8')).students.length, 1);
    assert.deepEqual(fs.readdirSync(path.dirname(env.file)), ['students.json']);
  });

  test('nextId at or below maxId is corrected', async () => {
    await start(env, { prepare: () => writeRaw(JSON.stringify({ nextId: 1, students: [{ id: 5, ...ada }] })) });
    const res = await jsonRequest(env.port, 'POST', '/students', bob);
    assert.equal(res.json.id, 6);
  });

  test('existing records are served after restart', async () => {
    await start(env);
    await jsonRequest(env.port, 'POST', '/students', ada);
    await close(env.server);
    env.server = createServer({ filePath: env.file, log: () => {} });
    env.port = await listen(env.server);
    assert.deepEqual((await send(env.port, {})).json, [{ id: 1, ...ada, status: 'Active' }]);
  });

  test('invalid data file fails startup and stays untouched', () => {
    for (const content of ['{not json', '[]', JSON.stringify({ nextId: 3, students: [{ id: 1, ...ada }, { id: 1, ...bob }] })]) {
      writeRaw(content);
      assert.throws(() => createServer({ filePath: env.file }), /Invalid data file/);
      assert.equal(fs.readFileSync(env.file, 'utf8'), content);
    }
  });
});

describe('API: client abort mid-body (F-1)', () => {
  const env = makeEnv();
  before(() => start(env));
  after(() => stop(env));

  test('is not logged as an error, not answered, and does not affect the server', async () => {
    const socket = net.connect(env.port, '127.0.0.1');
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(
      'POST /students HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"name":"Ab',
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.logs, []);
    const list = await send(env.port, {});
    assert.equal(list.status, 200);
    assert.deepEqual(list.json, []);
  });
});

describe('API: bootstrap and log hygiene', () => {
  function run(envVars) {
    const child = spawn(process.execPath, [SERVER_JS], {
      env: { ...process.env, ...envVars },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: '', stderr: '' };
    child.stdout.on('data', (d) => (output.stdout += d));
    child.stderr.on('data', (d) => (output.stderr += d));
    return { child, output };
  }

  function waitFor(predicate, ms = 5000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (predicate()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > ms) {
          clearInterval(timer);
          reject(new Error('timed out'));
        }
      }, 25);
    });
  }

  test('default bind address is 127.0.0.1 and GET /students returns []', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-boot-'));
    const env = { PORT: '0', DATA_FILE: path.join(dir, 'students.json') };
    const { child, output } = run({ ...env, HOST: '' });
    try {
      await waitFor(() => /Listening on/.test(output.stdout));
      const match = /Listening on http:\/\/([\d.]+):(\d+)/.exec(output.stdout);
      assert.equal(match[1], '127.0.0.1');
      const res = await send(Number(match[2]), {});
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, []);
    } finally {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('invalid data file exits non-zero, logs the cause and leaves the file untouched', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-boot-'));
    const file = path.join(dir, 'students.json');
    const content = '{"nextId":1,"students":[{"id":1,"name":"Sensitive Name"';
    fs.writeFileSync(file, content);
    try {
      const { child, output } = run({ PORT: '0', DATA_FILE: file });
      const code = await new Promise((resolve) => child.once('exit', resolve));
      assert.notEqual(code, 0);
      assert.match(output.stderr, /Invalid data file/);
      assert.ok(!output.stderr.includes('Sensitive Name'));
      assert.equal(fs.readFileSync(file, 'utf8'), content);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('invalid PORT exits non-zero with a clean message and no stack trace (F-2)', async () => {
    for (const bad of ['abc', '70000', '-1', '3000x']) {
      const { child, output } = run({ PORT: bad, DATA_FILE: path.join(os.tmpdir(), 'unused-never-created.json') });
      const code = await new Promise((resolve) => child.once('exit', resolve));
      assert.equal(code, 1, `PORT=${bad}`);
      assert.match(output.stderr, /^Startup failed: PORT must be an integer from 0 to 65535\r?\n$/);
    }
  });

  test('listen failure (EADDRINUSE) exits non-zero with a clean message (F-2)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-boot-'));
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    try {
      const { child, output } = run({ PORT: String(blocker.address().port), DATA_FILE: path.join(dir, 'students.json') });
      const code = await new Promise((resolve) => child.once('exit', resolve));
      assert.equal(code, 1);
      assert.match(output.stderr, /^Startup failed: .*EADDRINUSE/);
      assert.ok(!/\n\s+at /.test(output.stderr), 'no stack trace');
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('logs and error bodies contain no request body or query string', async () => {
    const env = makeEnv();
    await start(env);
    try {
      const secretBody = '{"name":"TOPSECRETNAME","email":"topsecret@example.com","course":';
      const responses = [
        await jsonRequest(env.port, 'POST', '/students?token=QUERYSECRET', secretBody),
        await jsonRequest(env.port, 'POST', '/students?token=QUERYSECRET', { name: 'TOPSECRETNAME', email: 'bad', course: 'c' }),
        await jsonRequest(env.port, 'POST', '/students?token=QUERYSECRET', { name: 'TOPSECRETNAME', email: 'topsecret@example.com', course: 'c' }),
        await jsonRequest(env.port, 'POST', '/students?token=QUERYSECRET', { name: 'TOPSECRETNAME', email: 'TOPSECRET@example.com', course: 'c' }),
        await send(env.port, { path: '/nope?token=QUERYSECRET' }),
        await send(env.port, { path: '/students/abc?token=QUERYSECRET' }),
      ];
      assert.deepEqual(responses.map((r) => r.status), [400, 422, 201, 409, 404, 400]);
      for (const res of responses.filter((r) => r.status >= 400)) {
        assert.ok(!res.text.includes('QUERYSECRET'));
        assert.ok(!res.text.includes('TOPSECRETNAME'));
        assert.ok(!res.text.includes('topsecret@'));
      }
      assert.equal(env.logs.length, responses.length);
      const logged = env.logs.join('\n');
      assert.ok(!logged.includes('QUERYSECRET'));
      assert.ok(!logged.includes('TOPSECRET'));
      assert.ok(!logged.includes('topsecret'));
      assert.match(env.logs[0], /^POST \/students 400 INVALID_JSON$/);
      assert.match(env.logs[2], /^POST \/students 201 -$/);
      assert.match(env.logs[3], /^POST \/students 409 CONFLICT$/);
    } finally {
      await stop(env);
    }
  });
});

describe('API: status (Amendment 3)', () => {
  const badStatuses = ['active', 'INACTIVE', ' Active', 'Active ', 'Active\n', '', null, 1, true, [], {}, 'Suspended'];
  let env;
  beforeEach(async () => {
    env = makeEnv();
    await start(env);
  });
  afterEach(() => stop(env));

  const list = async () => (await send(env.port, {})).json;
  const patch = (id, payload, headers) => jsonRequest(env.port, 'PATCH', `/students/${id}/status`, payload, headers);
  const fieldNames = (res) => res.json.error.fields.map((f) => f.field);

  test('POST without status is Active; with Inactive it stays Inactive through create and GET (DR-19)', async () => {
    const plain = await jsonRequest(env.port, 'POST', '/students', ada);
    assert.equal(plain.status, 201);
    assert.deepEqual(plain.json, { id: 1, ...ada, status: 'Active' });
    const off = await jsonRequest(env.port, 'POST', '/students', { ...bob, status: 'Inactive' });
    assert.equal(off.status, 201);
    assert.deepEqual(off.json, { id: 2, ...bob, status: 'Inactive' });
    assert.equal(off.headers.location, '/students/2');
    assert.deepEqual((await send(env.port, { path: '/students/2' })).json, { id: 2, ...bob, status: 'Inactive' });
    const onDisk = JSON.parse(fs.readFileSync(env.file, 'utf8')).students.map((s) => s.status);
    assert.deepEqual(onDisk, ['Active', 'Inactive']);
  });

  test('POST with an invalid status is 422 naming status and stores nothing (AC-20)', async () => {
    for (const status of badStatuses) {
      const res = await jsonRequest(env.port, 'POST', '/students', { ...ada, status });
      assertError(res, 422, 'VALIDATION_ERROR');
      assert.deepEqual(fieldNames(res), ['status']);
      assert.ok(res.json.error.message.includes('status'));
    }
    assert.deepEqual(await list(), []);
    assert.equal(fs.existsSync(env.file), false);
  });

  test('POST multi-field error lists status with the other fields', async () => {
    const res = await jsonRequest(env.port, 'POST', '/students', { name: '', email: 'abc', course: 'x', status: 'nope' });
    assertError(res, 422, 'VALIDATION_ERROR');
    assert.deepEqual(fieldNames(res), ['name', 'email', 'status']);
  });

  test('PATCH flips Inactive then Active, returns the full student and later GET agrees (AC-21)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    await jsonRequest(env.port, 'POST', '/students', bob);
    const off = await patch(1, { status: 'Inactive' });
    assert.equal(off.status, 200);
    assert.match(off.headers['content-type'], /^application\/json/);
    assert.deepEqual(off.json, { id: 1, ...ada, status: 'Inactive' });
    assert.deepEqual((await send(env.port, { path: '/students/1' })).json, off.json);
    const on = await patch(1, { status: 'Active' });
    assert.deepEqual(on.json, { id: 1, ...ada, status: 'Active' });
    assert.deepEqual((await send(env.port, { path: '/students/1' })).json, on.json);
    assert.deepEqual((await send(env.port, { path: '/students/2' })).json, { id: 2, ...bob, status: 'Active' });
  });

  test('PATCH to the current status is 200 and still saves', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const res = await patch(1, { status: 'Active' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { id: 1, ...ada, status: 'Active' });
  });

  test('PATCH persists across a restart', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    await patch(1, { status: 'Inactive' });
    await close(env.server);
    env.server = createServer({ filePath: env.file, log: () => {} });
    env.port = await listen(env.server);
    assert.deepEqual(await list(), [{ id: 1, ...ada, status: 'Inactive' }]);
  });

  test('PATCH with {} or an invalid status on an existing student is 422 naming status, data unchanged (AC-20, AC-22)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const before = fs.readFileSync(env.file, 'utf8');
    const empty = await patch(1, {});
    assertError(empty, 422, 'VALIDATION_ERROR');
    assert.deepEqual(empty.json.error.fields, [{ field: 'status', message: 'is required' }]);
    for (const status of badStatuses) {
      const res = await patch(1, { status });
      assertError(res, 422, 'VALIDATION_ERROR');
      assert.deepEqual(fieldNames(res), ['status']);
    }
    assert.deepEqual(await list(), [{ id: 1, ...ada, status: 'Active' }]);
    assert.equal(fs.readFileSync(env.file, 'utf8'), before);
  });

  test('PATCH and POST reject the same status values (NFR-3)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    for (const status of badStatuses) {
      const viaPost = await jsonRequest(env.port, 'POST', '/students', { ...bob, status });
      const viaPatch = await patch(1, { status });
      assert.equal(viaPost.status, viaPatch.status);
      assert.deepEqual(viaPost.json.error.fields, viaPatch.json.error.fields);
    }
  });

  test('PATCH with an empty, invalid-JSON or non-object body is 400 INVALID_JSON (AC-22, DR-18)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    for (const body of ['', '{"status":', '[]', 'null', '"Inactive"', '5']) {
      assertError(await patch(1, body), 400, 'INVALID_JSON');
    }
    assert.deepEqual(await list(), [{ id: 1, ...ada, status: 'Active' }]);
  });

  test('PATCH without a JSON content type is 415, including an empty body (DR-18b)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const url = '/students/1/status';
    const none = await send(env.port, { method: 'PATCH', path: url, body: '' });
    assertError(none, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body = JSON.stringify({ status: 'Inactive' });
    const text = await send(env.port, { method: 'PATCH', path: url, body, headers: { 'Content-Type': 'text/plain' } });
    assertError(text, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const noneBody = await send(env.port, { method: 'PATCH', path: url, body });
    assertError(noneBody, 415, 'UNSUPPORTED_MEDIA_TYPE');
    assert.equal((await list())[0].status, 'Active');
  });

  test('PATCH accepts application/json with a charset', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const res = await patch(1, { status: 'Inactive' }, { 'Content-Type': 'application/json; charset=utf-8' });
    assert.equal(res.status, 200);
  });

  test('PATCH body over 10 KB is 413 with Connection: close and changes nothing', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const res = await patch(1, JSON.stringify({ status: 'Inactive', pad: 'a'.repeat(20000) }));
    assertError(res, 413, 'PAYLOAD_TOO_LARGE');
    assert.equal(res.headers.connection, 'close');
    const chunk = Buffer.alloc(4096, 'a');
    const chunked = await send(env.port, {
      method: 'PATCH',
      path: '/students/1/status',
      headers: { 'Content-Type': 'application/json' },
      chunks: [Buffer.from('{"pad":"'), chunk, chunk, chunk, chunk],
    });
    assertError(chunked, 413, 'PAYLOAD_TOO_LARGE');
    assert.deepEqual(await list(), [{ id: 1, ...ada, status: 'Active' }]);
  });

  test('check order: unknown id with a valid JSON object is 404 even with a bad status (DR-18a)', async () => {
    const res = await patch(999, { status: 'nope' });
    assertError(res, 404, 'NOT_FOUND');
    assert.match(res.json.error.message, /999/);
    assertError(await patch(999, { status: 'Inactive' }), 404, 'NOT_FOUND');
    assertError(await patch(999, {}), 404, 'NOT_FOUND');
  });

  test('check order: unknown id with an invalid-JSON, empty or array body is 400 INVALID_JSON (DR-18a)', async () => {
    for (const body of ['{bad', '', '[]']) assertError(await patch(999, body), 400, 'INVALID_JSON');
  });

  test('check order: invalid id beats content type and body; content type beats body', async () => {
    assertError(await patch('abc', '{bad'), 400, 'INVALID_ID');
    const wrongType = await send(env.port, { method: 'PATCH', path: '/students/abc/status', body: 'x', headers: { 'Content-Type': 'text/plain' } });
    assertError(wrongType, 400, 'INVALID_ID');
    const badBodyWrongType = await send(env.port, { method: 'PATCH', path: '/students/1/status', body: '{bad', headers: { 'Content-Type': 'text/plain' } });
    assertError(badBodyWrongType, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  test('PATCH ignores name, email, course and id in the body (DR-18c, FR-23)', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    await jsonRequest(env.port, 'POST', '/students', bob);
    const res = await patch(1, { status: 'Inactive', name: 'Hacked', email: 'bob@example.com', course: 'X', id: 2 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { id: 1, ...ada, status: 'Inactive' });
    assert.deepEqual(await list(), [{ id: 1, ...ada, status: 'Inactive' }, { id: 2, ...bob, status: 'Active' }]);
  });

  test('PATCH __proto__ and constructor keys have no effect', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const res = await patch(1, '{"__proto__":{"status":"Inactive","polluted":true},"constructor":{"prototype":{"polluted":true}}}');
    assertError(res, 422, 'VALIDATION_ERROR');
    assert.deepEqual(res.json.error.fields, [{ field: 'status', message: 'is required' }]);
    assert.equal({}.polluted, undefined);
    assert.equal((await list())[0].status, 'Active');
  });

  test('PUT ignores a body status, valid or garbage, and preserves Inactive (AC-24)', async () => {
    await jsonRequest(env.port, 'POST', '/students', { ...ada, status: 'Inactive' });
    for (const status of ['Active', 'garbage', null, 5]) {
      const res = await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, name: 'Ada L', status });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { id: 1, ...ada, name: 'Ada L', status: 'Inactive' });
    }
    assert.equal((await send(env.port, { path: '/students/1' })).json.status, 'Inactive');
    await patch(1, { status: 'Active' });
    const res = await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, status: 'Inactive' });
    assert.equal(res.json.status, 'Active');
  });

  test('status is present in list, get, create, update and PATCH responses (AC-25)', async () => {
    const created = await jsonRequest(env.port, 'POST', '/students', ada);
    const got = await send(env.port, { path: '/students/1' });
    const listed = await send(env.port, {});
    const updated = await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, name: 'Ada L' });
    const patched = await patch(1, { status: 'Inactive' });
    for (const student of [created.json, got.json, listed.json[0], updated.json, patched.json]) {
      assert.deepEqual(Object.keys(student), ['id', 'name', 'email', 'course', 'status']);
    }
  });

  test('an Inactive student still blocks duplicate email on POST and PUT and is listed, got and deleted (AC-26)', async () => {
    await jsonRequest(env.port, 'POST', '/students', { ...ada, status: 'Inactive' });
    await jsonRequest(env.port, 'POST', '/students', bob);
    assertError(await jsonRequest(env.port, 'POST', '/students', { ...bob, email: 'ADA@example.com', name: 'Z' }), 409, 'CONFLICT');
    assertError(await jsonRequest(env.port, 'PUT', '/students/2', { ...bob, email: 'ada@example.com' }), 409, 'CONFLICT');
    assert.deepEqual((await list()).map((s) => s.status), ['Inactive', 'Active']);
    assert.equal((await send(env.port, { path: '/students/1' })).json.status, 'Inactive');
    assert.equal((await send(env.port, { method: 'DELETE', path: '/students/1' })).status, 204);
    assert.deepEqual((await list()).map((s) => s.id), [2]);
  });
});

describe('API: status PATCH failed save (NFR-2)', () => {
  const env = makeEnv();
  before(() => start(env, { failingWriter: true }));
  after(() => stop(env));

  test('PATCH returns 500 INTERNAL_ERROR with a generic message and leaves state and nextId unchanged', async () => {
    await jsonRequest(env.port, 'POST', '/students', ada);
    const before = fs.readFileSync(env.file, 'utf8');
    env.writerFails = true;
    const res = await jsonRequest(env.port, 'PATCH', '/students/1/status', { status: 'Inactive' });
    assertError(res, 500, 'INTERNAL_ERROR');
    assert.equal(res.json.error.message, 'Internal server error');
    assert.ok(!res.text.includes('disk full'));
    env.writerFails = false;
    assert.deepEqual((await send(env.port, {})).json, [{ id: 1, ...ada, status: 'Active' }]);
    assert.equal(fs.readFileSync(env.file, 'utf8'), before);
    assert.equal((await jsonRequest(env.port, 'POST', '/students', bob)).json.id, 2);
    assert.equal((await jsonRequest(env.port, 'PATCH', '/students/1/status', { status: 'Inactive' })).status, 200);
  });
});

describe('API: status routing, ID edges, legacy data and log hygiene', () => {
  let env;
  beforeEach(async () => {
    env = makeEnv();
    await start(env);
    await jsonRequest(env.port, 'POST', '/students', ada);
  });
  afterEach(() => stop(env));

  const patch = (urlPath, payload = { status: 'Inactive' }) => jsonRequest(env.port, 'PATCH', urlPath, payload);
  const unchanged = async () => assert.deepEqual((await send(env.port, {})).json, [{ id: 1, ...ada, status: 'Active' }]);

  test('PATCH /students//status is 400 INVALID_ID (empty id)', async () => {
    const res = await patch('/students//status');
    assertError(res, 400, 'INVALID_ID');
    assert.match(res.json.error.message, /required/);
    await unchanged();
  });

  test('non-numeric, zero, padded, exponent, hex, trailing-text, NUL and oversize ids are 400 INVALID_ID', async () => {
    for (const id of ['abc', '0', '007', '1e3', '0x10', '12abc', '1%00', '9007199254740993']) {
      assertError(await patch(`/students/${id}/status`), 400, 'INVALID_ID');
    }
    await unchanged();
  });

  test('%31 is a valid id on the status path', async () => {
    const res = await patch('/students/%31/status');
    assert.equal(res.status, 200);
    assert.equal(res.json.id, 1);
    assert.equal(res.json.status, 'Inactive');
  });

  test('unknown id is 404 NOT_FOUND and nothing changes (AC-23)', async () => {
    assertError(await patch('/students/2/status'), 404, 'NOT_FOUND');
    await unchanged();
  });

  test('PATCH without /status stays 405 METHOD_NOT_ALLOWED (DR-17)', async () => {
    for (const p of ['/students', '/students/status', '/students//', '/students/1', '/students/']) {
      assertError(await patch(p), 405, 'METHOD_NOT_ALLOWED');
    }
    await unchanged();
  });

  test('GET, POST, PUT and DELETE on the status path are 405, method checked before the id', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      for (const p of ['/students/1/status', '/students/abc/status', '/students//status', '/students/999/status']) {
        const res = await jsonRequest(env.port, method, p, { status: 'Inactive' });
        assertError(res, 405, 'METHOD_NOT_ALLOWED');
      }
    }
    await unchanged();
  });

  test('wrong-case, deeper and double-slash paths are 404 ROUTE_NOT_FOUND', async () => {
    for (const p of ['/students/1/Status', '/students/1/STATUS', '/students/1/status/x', '/students/1//', '/students/1/x', '/students/1/statuses']) {
      assertError(await patch(p), 404, 'ROUTE_NOT_FOUND');
    }
    await unchanged();
  });

  test('trailing slash and query string are accepted on the status path', async () => {
    const slash = await patch('/students/1/status/');
    assert.equal(slash.status, 200);
    assert.equal(slash.json.status, 'Inactive');
    const query = await patch('/students/1/status?x=1&status=Active', { status: 'Active' });
    assert.equal(query.status, 200);
    assert.equal(query.json.status, 'Active');
  });

  test('a server started on a legacy file serves Active, leaves the file bytes alone until the first save (AC-19, FR-21)', async () => {
    await stop(env);
    env = makeEnv();
    const legacy = JSON.stringify({ nextId: 3, students: [{ id: 1, ...ada }, { id: 2, ...bob }] });
    await start(env, {
      prepare: () => {
        fs.mkdirSync(path.dirname(env.file), { recursive: true });
        fs.writeFileSync(env.file, legacy);
      },
    });
    const listed = await send(env.port, {});
    assert.deepEqual(listed.json, [{ id: 1, ...ada, status: 'Active' }, { id: 2, ...bob, status: 'Active' }]);
    assert.deepEqual((await send(env.port, { path: '/students/2' })).json, { id: 2, ...bob, status: 'Active' });
    assert.equal(fs.readFileSync(env.file, 'utf8'), legacy);
    assertError(await patch('/students/9/status'), 404, 'NOT_FOUND');
    assert.equal(fs.readFileSync(env.file, 'utf8'), legacy);
    assert.equal((await patch('/students/2/status')).status, 200);
    const saved = JSON.parse(fs.readFileSync(env.file, 'utf8')).students;
    assert.deepEqual(saved.map((s) => s.status), ['Active', 'Inactive']);
  });

  test('a data file with an invalid present status fails startup and stays untouched', () => {
    for (const status of [null, '', 'active', 1, 'x']) {
      const fresh = makeEnv();
      try {
        const content = JSON.stringify({ nextId: 2, students: [{ id: 1, ...ada, status }] });
        fs.mkdirSync(path.dirname(fresh.file), { recursive: true });
        fs.writeFileSync(fresh.file, content);
        assert.throws(() => createServer({ filePath: fresh.file }), /Invalid data file/);
        assert.equal(fs.readFileSync(fresh.file, 'utf8'), content);
      } finally {
        fs.rmSync(fresh.dir, { recursive: true, force: true });
      }
    }
  });

  test('logs and error bodies for PATCH contain no request body or query string', async () => {
    const secret = 'TOPSECRETSTATUS';
    const responses = [
      await jsonRequest(env.port, 'PATCH', '/students/1/status?token=QUERYSECRET', { status: secret }),
      await jsonRequest(env.port, 'PATCH', '/students/1/status?token=QUERYSECRET', `{"status":${secret}}`),
      await jsonRequest(env.port, 'PATCH', '/students/9/status?token=QUERYSECRET', { status: secret }),
      await jsonRequest(env.port, 'PATCH', '/students/abc/status?token=QUERYSECRET', { status: secret }),
      await jsonRequest(env.port, 'PATCH', '/students/1/status?token=QUERYSECRET', { status: 'Inactive', name: secret }),
      await send(env.port, { method: 'PATCH', path: '/students/1/status?token=QUERYSECRET', body: secret, headers: { 'Content-Type': 'text/plain' } }),
    ];
    assert.deepEqual(responses.map((r) => r.status), [422, 400, 404, 400, 200, 415]);
    for (const res of responses.slice(0, 4).concat(responses.slice(5))) {
      assert.ok(!res.text.includes(secret));
      assert.ok(!res.text.includes('QUERYSECRET'));
    }
    const output = [...env.logs, ...env.errors].join('\n');
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes('QUERYSECRET'));
    assert.ok(env.logs.some((line) => line.startsWith('PATCH /students/1/status 422 VALIDATION_ERROR')));
  });
});
