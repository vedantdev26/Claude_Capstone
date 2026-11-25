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
    assert.deepEqual(res.json, { id: 1, ...ada });
    assert.equal(res.headers.location, '/students/1');
    const second = await jsonRequest(env.port, 'POST', '/students', bob);
    assert.equal(second.json.id, 2);
  });

  test('list returns all records ordered by id (AC-2)', async () => {
    const res = await send(env.port, {});
    assert.deepEqual(res.json, [{ id: 1, ...ada }, { id: 2, ...bob }]);
  });

  test('get by id (AC-3)', async () => {
    const res = await send(env.port, { path: '/students/2' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { id: 2, ...bob });
  });

  test('GET /students/ equals the list, query string ignored, trailing slash on id', async () => {
    const list = await send(env.port, {});
    assert.deepEqual((await send(env.port, { path: '/students/' })).json, list.json);
    assert.deepEqual((await send(env.port, { path: '/students?x=1&y=2' })).json, list.json);
    assert.deepEqual((await send(env.port, { path: '/students/1/?x=1' })).json, { id: 1, ...ada });
  });

  test('%31 is a valid id', async () => {
    const res = await send(env.port, { path: '/students/%31' });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, 1);
  });

  test('update keeps id and ignores body id (AC-4)', async () => {
    const res = await jsonRequest(env.port, 'PUT', '/students/1', { ...ada, name: 'Ada L', id: 99 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { id: 1, ...ada, name: 'Ada L' });
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
    for (const p of ['/students/1/x', '/other', '/', '/students/1/2/3']) {
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
    assert.deepEqual(await list(), [{ id: 1, ...ada }]);
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
    assert.deepEqual(Object.keys(created.json), ['id', 'name', 'email', 'course']);
    const updated = await jsonRequest(env.port, 'PUT', '/students/1', body);
    assert.equal(updated.status, 200);
    assert.deepEqual(Object.keys(updated.json), ['id', 'name', 'email', 'course']);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
    assert.deepEqual(await list(), [{ id: 1, name: 'Eve', email: 'eve@example.com', course: 'CS' }]);
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
    assert.deepEqual((await send(env.port, {})).json, [{ id: 1, ...ada }]);
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
    assert.deepEqual((await send(env.port, {})).json, [{ id: 1, ...ada }]);
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
