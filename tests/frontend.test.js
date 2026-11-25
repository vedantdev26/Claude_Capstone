'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../src/server');
const { ApiError, createApi, filterStudents } = require('../public/app.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CSP = "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const read = (file) => fs.readFileSync(path.join(PUBLIC_DIR, file));

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

function raw(port, { method = 'GET', path: urlPath = '/' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, agent: false }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function makeEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-test-'));
  return { dir, file: path.join(dir, 'data', 'students.json') };
}

async function start(env) {
  env.server = createServer({ filePath: env.file, log: () => {}, logError: () => {} });
  env.port = await listen(env.server);
  env.base = `http://127.0.0.1:${env.port}`;
}

async function stop(env) {
  if (env.server) await close(env.server);
  fs.rmSync(env.dir, { recursive: true, force: true });
}

describe('Frontend: static serving (FR-12, AC-12)', () => {
  const env = makeEnv();
  before(() => start(env));
  after(() => stop(env));

  for (const [urlPath, file, type] of [
    ['/', 'index.html', /^text\/html; charset=utf-8$/],
    ['/styles.css', 'styles.css', /^text\/css; charset=utf-8$/],
    ['/app.js', 'app.js', /^text\/javascript; charset=utf-8$/],
  ]) {
    test(`GET ${urlPath} serves ${file} with security headers`, async () => {
      const res = await raw(env.port, { path: urlPath });
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], type);
      assert.deepEqual(res.body, read(file));
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['content-security-policy'], CSP);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });
  }

  test('the dashboard HTML is returned for /, ignoring a query string', async () => {
    const res = await raw(env.port, { path: '/?x=1' });
    assert.equal(res.status, 200);
    assert.match(res.body.toString('utf8'), /<title>Student Management<\/title>/);
  });

  test('HEAD returns headers and no body', async () => {
    const res = await raw(env.port, { method: 'HEAD', path: '/' });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
    assert.equal(Number(res.headers['content-length']), read('index.html').length);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['content-security-policy'], CSP);
  });

  test('other methods on asset paths are 405 JSON errors', async () => {
    for (const [method, p] of [['POST', '/'], ['PUT', '/'], ['DELETE', '/app.js'], ['PATCH', '/styles.css']]) {
      const res = await raw(env.port, { method, path: p });
      assert.equal(res.status, 405, `${method} ${p}`);
      assert.equal(JSON.parse(res.body).error.code, 'METHOD_NOT_ALLOWED');
      assert.match(res.headers['content-type'], /^application\/json/);
      assert.equal(res.headers['content-security-policy'], undefined);
    }
  });

  test('only the allow-listed paths are served; traversal and unknown paths stay ROUTE_NOT_FOUND', async () => {
    for (const p of ['/index.html', '/app.js/x', '/styles.css/', '/public/app.js', '/../package.json', '/%2e%2e/package.json', '/src/server.js', '/package.json', '/data/students.json']) {
      const res = await raw(env.port, { path: p });
      assert.equal(res.status, 404, p);
      assert.equal(JSON.parse(res.body).error.code, 'ROUTE_NOT_FOUND', p);
    }
  });

  test('the API still works next to the dashboard', async () => {
    const res = await raw(env.port, { path: '/students' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^application\/json/);
    assert.deepEqual(JSON.parse(res.body), []);
  });
});

describe('Frontend: HTML and JavaScript contract (NFR-6)', () => {
  const html = read('index.html').toString('utf8');
  const js = read('app.js').toString('utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  test('every element id used by app.js exists in index.html', () => {
    const used = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
    used.add('error-name').add('error-email').add('error-course');
    assert.ok(used.size >= 15);
    for (const id of used) assert.ok(ids.has(id), `missing #${id}`);
  });

  test('the page loads its CSS and JS from the served paths and has the required controls', () => {
    assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
    assert.match(html, /<script src="\/app\.js"><\/script>/);
    for (const id of ['student-form', 'name', 'email', 'course', 'search', 'students-table', 'confirm-dialog']) {
      assert.ok(ids.has(id), id);
    }
    assert.match(html, /<dialog id="confirm-dialog"/);
    assert.match(html, /name="viewport"/);
  });

  test('no inline script, style or event handler (the CSP forbids them)', () => {
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), 'inline script');
    assert.ok(!/\sstyle=/i.test(html), 'style attribute');
    assert.ok(!/\son[a-z]+=/i.test(html), 'inline handler');
    assert.ok(!/<style/i.test(html), 'style element');
  });

  test('student data is rendered as text, never as HTML', () => {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|DOMParser|document\.write|eval\(|new Function|setAttribute\('on/.test(js));
    assert.match(js, /textContent/);
  });

  test('no frameworks or external resources', () => {
    assert.ok(!/https?:\/\//.test(html + js + read('styles.css').toString('utf8')));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
  });
});

describe('Frontend: search filter (FR-17, AC-17)', () => {
  const students = [
    { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', course: 'Mathematics' },
    { id: 2, name: 'Bob Stone', email: 'bob@school.org', course: 'Art' },
    { id: 3, name: 'Cara Mathis', email: 'cara@example.com', course: 'Physics' },
  ];
  const ids = (q) => filterStudents(students, q).map((s) => s.id);

  test('empty or blank query returns everyone', () => {
    assert.deepEqual(ids(''), [1, 2, 3]);
    assert.deepEqual(ids('   '), [1, 2, 3]);
  });
  test('matches name, email and course, case-insensitively', () => {
    assert.deepEqual(ids('LOVELACE'), [1]);
    assert.deepEqual(ids('school.org'), [2]);
    assert.deepEqual(ids('physics'), [3]);
    assert.deepEqual(ids('math'), [1, 3]);
  });
  test('trims the query and returns nothing when there is no match', () => {
    assert.deepEqual(ids('  art '), [2]);
    assert.deepEqual(ids('zzz'), []);
  });
  test('regex characters are treated literally', () => {
    assert.deepEqual(ids('.*'), []);
    assert.deepEqual(ids('('), []);
  });
});

describe('Frontend: API client against the real server (FR-13..FR-18)', () => {
  const env = makeEnv();
  before(async () => {
    await start(env);
    env.api = createApi(fetch, `${env.base}/students`);
  });
  after(() => stop(env));

  const ada = { name: 'Ada', email: 'ada@example.com', course: 'Math' };

  test('add, list, edit and delete round trip (AC-13, AC-15, AC-16)', async () => {
    assert.deepEqual(await env.api.list(), []);
    const created = await env.api.create(ada);
    assert.deepEqual(created, { id: 1, ...ada, status: 'Active' });
    assert.deepEqual(await env.api.list(), [created]);
    const updated = await env.api.update(created.id, { ...ada, name: 'Ada King', course: 'Computing' });
    assert.deepEqual(updated, { id: 1, name: 'Ada King', email: 'ada@example.com', course: 'Computing', status: 'Active' });
    assert.equal(await env.api.remove(created.id), null);
    assert.deepEqual(await env.api.list(), []);
  });

  test('validation errors carry the field list (AC-14)', async () => {
    await assert.rejects(env.api.create({ name: '', email: 'abc', course: 'Art' }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 422);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.deepEqual(err.fields.map((f) => f.field).sort(), ['email', 'name']);
      return true;
    });
    assert.deepEqual(await env.api.list(), []);
  });

  test('duplicate email is a CONFLICT on add and on edit, own email is allowed (AC-14)', async () => {
    const first = await env.api.create(ada);
    const second = await env.api.create({ name: 'Bob', email: 'bob@example.com', course: 'Art' });
    await assert.rejects(env.api.create({ ...ada, email: 'ADA@example.com' }), (err) => err.status === 409 && err.code === 'CONFLICT');
    await assert.rejects(env.api.update(second.id, { ...second, email: ' Ada@Example.com ' }), (err) => err.code === 'CONFLICT');
    assert.equal((await env.api.update(first.id, { ...ada, course: 'Physics' })).course, 'Physics');
  });

  test('NOT_FOUND on edit and delete of a missing student', async () => {
    await assert.rejects(env.api.update(999, ada), (err) => err.status === 404 && err.code === 'NOT_FOUND');
    await assert.rejects(env.api.remove(999), (err) => err.status === 404 && err.code === 'NOT_FOUND');
  });

  test('an oversize body maps to a readable 413 ApiError', async () => {
    await assert.rejects(
      env.api.create({ name: 'x'.repeat(11 * 1024), email: 'big@example.com', course: 'c' }),
      (err) => err instanceof ApiError && err.status === 413 && err.code === 'PAYLOAD_TOO_LARGE',
    );
  });

  test('non-JSON error bodies become HTTP_ERROR, non-JSON success bodies BAD_RESPONSE, missing messages get a default', async () => {
    const respond = (status, text) => async () => new Response(text, { status });
    await assert.rejects(createApi(respond(502, '<html>Bad gateway</html>'), '/students').list(), (err) => err.code === 'HTTP_ERROR' && err.status === 502 && /502/.test(err.message));
    await assert.rejects(createApi(respond(200, 'not json'), '/students').list(), (err) => err.code === 'BAD_RESPONSE');
    assert.equal(new ApiError(500, { code: 'X' }).message, 'Request failed');
    assert.deepEqual(new ApiError(422, { code: 'VALIDATION_ERROR', fields: 'oops' }).fields, []);
  });

  test('an unreachable server becomes a readable NETWORK_ERROR', async () => {
    const probe = http.createServer();
    const port = await listen(probe);
    await close(probe);
    const dead = createApi(fetch, `http://127.0.0.1:${port}/students`);
    await assert.rejects(dead.list(), (err) => err instanceof ApiError && err.code === 'NETWORK_ERROR' && /Cannot reach the server/.test(err.message));
  });

  test('records added through the client persist across a server restart (JSON persistence)', async () => {
    await env.api.create({ name: 'Persist One', email: 'persist1@example.com', course: 'A' });
    await env.api.create({ name: 'Persist Two', email: 'persist2@example.com', course: 'B' });
    const saved = await env.api.list();
    assert.ok(saved.length >= 2);
    await close(env.server);
    await start(env);
    const reloaded = await createApi(fetch, `${env.base}/students`).list();
    assert.deepEqual(reloaded, saved);
  });
});
