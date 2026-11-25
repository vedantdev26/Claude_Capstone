'use strict';
// Real-browser check of the dashboard: starts the app on a free port with a temporary data file and
// drives headless Chrome/Edge over the DevTools protocol (Node built-ins only, no dependencies).
// Usage: npm run test:browser   (env: CHROME_PATH to pick a browser, SCREENSHOT_DIR to save screenshots)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../src/server');

const OUT = process.env.SCREENSHOT_DIR || '';
const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ::  ' + detail}`);
};

async function main() {
  const browser = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) {
    console.error('SKIPPED: no Chrome/Chromium/Edge found. Set CHROME_PATH to run the browser check.');
    process.exit(3);
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-check-data-'));
  const server = createServer({ filePath: path.join(dataDir, 'students.json'), log: () => {}, logError: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const APP = `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-prof-'));
  const chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 150 && !target; i++) {
      try {
        const debugPort = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
        const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        target = list.find((x) => x.type === 'page');
      } catch { /* browser not up yet */ }
      if (!target) await delay(100);
    }
    if (!target) throw new Error('Browser did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d);
    };
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.error) throw new Error(JSON.stringify(r.error));
      if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
      return r.result.result.value;
    };
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

    const helpers = `window.T = {
      $: (id) => document.getElementById(id),
      rows: () => [...document.querySelectorAll('#students-body tr')].map((tr) => [...tr.querySelectorAll('td')].slice(0, 4).map((td) => td.textContent)),
      waitFor: async (fn, ms = 3000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; },
      fill: (n, e, c) => { T.$('name').value = n; T.$('email').value = e; T.$('course').value = c; },
      visible: (id) => !T.$(id).hidden,
    }; true`;
    const open = async (url) => {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) { try { if (await ev('document.readyState') === 'complete') break; } catch { /* navigating */ } await delay(50); }
      await ev(helpers);
    };
    const add = async (n, e, c) => {
      await ev(`T.fill(${JSON.stringify(n)}, ${JSON.stringify(e)}, ${JSON.stringify(c)}); T.$('submit-button').click(); true`);
      await ev('T.waitFor(() => !T.$("message").hidden)');
    };

    // 1. Load
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await open(APP);
    check('dashboard loads at ' + APP, (await ev('document.title')) === 'Student Management');
    check('header and form render', (await ev('document.querySelector("h1").textContent')) === 'Student Management' && await ev('!!T.$("student-form")'));
    check('empty state shown with 0 students', (await ev('T.waitFor(() => T.$("total-count").textContent === "0" && T.visible("empty-state"))')) && /No students yet/.test(await ev('T.$("empty-state").textContent')));
    check('stylesheet applied (header is coloured)', (await ev('getComputedStyle(document.querySelector(".app-header")).backgroundColor')) === 'rgb(59, 79, 216)');

    // 2. Validation errors
    await ev('T.$("submit-button").click(); true');
    await ev('T.waitFor(() => !T.$("message").hidden)');
    const errs = await ev('["name","email","course"].map((f) => T.visible("error-" + f) ? T.$("error-" + f).textContent : "")');
    check('empty submit shows a field error under each field and focuses the first', errs.every((e) => e.length > 0) && (await ev('document.activeElement.id')) === 'name', JSON.stringify(errs));
    check('error alert shown, table still empty', (await ev('T.$("message").className')) === 'alert error' && (await ev('T.rows().length')) === 0);
    check('invalid inputs are flagged aria-invalid', await ev('T.$("name").getAttribute("aria-invalid") === "true"'));
    await ev('T.fill("Bob", "abc", "Art"); T.$("submit-button").click(); true');
    await ev('T.waitFor(() => T.visible("error-email"))');
    check('malformed email: error appears only on the email field', (await ev('T.visible("error-email") && !T.visible("error-name") && !T.visible("error-course")')) && /email/i.test(await ev('T.$("error-email").textContent')));

    // 3. Add
    await ev('T.$("name").value = ""; true');
    await add('Ada Lovelace', 'ada@example.com', 'Mathematics');
    check('add: success message', (await ev('T.$("message").className')) === 'alert success' && (await ev('T.$("message").textContent')) === 'Student added.');
    await ev('T.waitFor(() => T.rows().length === 1)');
    check('add: row shows id and data', JSON.stringify(await ev('T.rows()')) === JSON.stringify([['1', 'Ada Lovelace', 'ada@example.com', 'Mathematics']]));
    check('add: form is reset and counter is 1', (await ev('T.$("name").value === "" && T.$("email").value === ""')) && (await ev('T.$("total-count").textContent')) === '1');
    await add('Bob Stone', 'bob@school.org', 'Art');
    await add('Cara Mathis', 'cara@example.com', 'Physics');
    await ev('T.waitFor(() => T.rows().length === 3)');
    check('list shows 3 rows ordered by id', JSON.stringify((await ev('T.rows()')).map((r) => r[0])) === '["1","2","3"]');

    // 4. Duplicate
    await add('Ada Two', 'ADA@example.com', 'Art');
    check('duplicate email: conflict shown on the email field and in an alert, focus moves to email', (await ev('T.visible("error-email")')) && /already in use/i.test(await ev('T.$("error-email").textContent')) && (await ev('T.$("message").className')) === 'alert error' && (await ev('T.$("message").getAttribute("role")')) === 'alert' && (await ev('document.activeElement.id')) === 'email' && (await ev('T.rows().length')) === 3);
    await ev('T.$("student-form").reset(); true');

    // 5. Search
    const search = async (q) => { await ev(`T.$("search").value = ${JSON.stringify(q)}; T.$("search").dispatchEvent(new Event("input", { bubbles: true })); true`); return ev('T.rows().map((r) => r[1])'); };
    check('search by name', JSON.stringify(await search('lovelace')) === '["Ada Lovelace"]');
    check('search by email, case-insensitive', JSON.stringify(await search('SCHOOL.ORG')) === '["Bob Stone"]');
    check('search by course matches several', JSON.stringify(await search('math')) === '["Ada Lovelace","Cara Mathis"]');
    check('search result count text', (await ev('T.$("result-count").textContent')) === 'Showing 2 of 3');
    check('search with no match shows empty message', (await search('zzz')).length === 0 && /No students match/.test(await ev('T.$("empty-state").textContent')) && !(await ev('T.visible("table-wrap")')));
    check('clearing search restores all rows', (await search('')).length === 3);

    // 6. Edit
    await ev('document.querySelector("#students-body tr[data-id=\\"1\\"] button[data-action=\\"edit\\"]").click(); true');
    check('edit: form is pre-filled and switches to edit mode', (await ev('T.$("name").value')) === 'Ada Lovelace' && (await ev('T.$("form-title").textContent')) === 'Edit Student #1' && (await ev('T.$("submit-button").textContent')) === 'Save Changes' && (await ev('T.visible("cancel-edit")')));
    await ev('T.$("course").value = "Computing"; T.$("submit-button").click(); true');
    await ev('T.waitFor(() => !T.$("message").hidden && T.$("message").textContent === "Student updated.")');
    await ev('T.waitFor(() => T.rows()[0] && T.rows()[0][3] === "Computing")');
    check('edit: saved, same id, success message, form back to add mode', JSON.stringify((await ev('T.rows()'))[0]) === '["1","Ada Lovelace","ada@example.com","Computing"]' && (await ev('T.$("form-title").textContent')) === 'Add Student');
    await ev('document.querySelector("#students-body tr[data-id=\\"2\\"] button[data-action=\\"edit\\"]").click(); T.$("name").value = "CHANGED"; T.$("cancel-edit").click(); true');
    check('edit: cancel discards changes', (await ev('T.$("name").value')) === '' && JSON.stringify((await ev('T.rows()'))[1]) === '["2","Bob Stone","bob@school.org","Art"]');
    await ev('document.querySelector("#students-body tr[data-id=\\"1\\"] button[data-action=\\"edit\\"]").click(); T.$("email").value = "bob@school.org"; T.$("submit-button").click(); true');
    await ev('T.waitFor(() => T.visible("error-email"))');
    check('edit: duplicate email is rejected and data unchanged', /already in use/i.test(await ev('T.$("error-email").textContent')) && JSON.stringify((await ev('T.rows()'))[0]) === '["1","Ada Lovelace","ada@example.com","Computing"]');
    await ev('T.$("cancel-edit").click(); true');

    // 7. Delete
    await ev('document.querySelector("#students-body tr[data-id=\\"3\\"] button[data-action=\\"delete\\"]").click(); true');
    check('delete: confirmation dialog opens naming the student', (await ev('T.$("confirm-dialog").open')) && /Cara Mathis/.test(await ev('T.$("confirm-text").textContent')));
    check('delete: dialog is described by its text and Cancel is focused first', (await ev('T.$("confirm-dialog").getAttribute("aria-describedby")')) === 'confirm-text' && (await ev('document.activeElement.id')) === 'confirm-cancel');
    if (OUT) fs.writeFileSync(path.join(OUT, 'dialog.png'), Buffer.from((await send('Page.captureScreenshot', {})).result.data, 'base64'));
    await ev('T.$("confirm-cancel").click(); true');
    await delay(300);
    check('delete: cancel keeps the student', !(await ev('T.$("confirm-dialog").open')) && (await ev('T.rows().length')) === 3);
    await ev('document.querySelector("#students-body tr[data-id=\\"3\\"] button[data-action=\\"delete\\"]").click(); T.$("confirm-delete").click(); true');
    await ev('T.waitFor(() => T.rows().length === 2)');
    check('delete: confirm removes the student and shows a message', JSON.stringify((await ev('T.rows()')).map((r) => r[0])) === '["1","2"]' && /Deleted Cara Mathis/.test(await ev('T.$("message").textContent')) && (await ev('T.$("total-count").textContent')) === '2' && (await ev('T.waitFor(() => document.activeElement.id === "search")')));

    // 8. XSS
    await add('<img src=x onerror=window.__xss=1>', 'xss@example.com', '<b>bold</b>');
    await ev('T.waitFor(() => T.rows().length === 3)');
    await delay(200);
    check('XSS: markup is rendered as text, nothing injected or executed', (await ev('document.querySelectorAll("#students-body img, #students-body b").length')) === 0 && (await ev('window.__xss === undefined')) && (await ev('T.rows()[2][1]')) === '<img src=x onerror=window.__xss=1>');

    // 9. Persistence + API alongside the UI
    await open(APP);
    await ev('T.waitFor(() => T.rows().length === 3)');
    check('reload: data persists on the server', JSON.stringify((await ev('T.rows()')).map((r) => r[0])) === '["1","2","4"]', JSON.stringify(await ev('T.rows()')));
    check('API from the page origin still works (GET /students)', (await ev('fetch("/students").then((r) => r.status)')) === 200);
    check('unknown path is still JSON ROUTE_NOT_FOUND', (await ev('fetch("/other").then((r) => r.json()).then((j) => j.error.code)')) === 'ROUTE_NOT_FOUND');

    // 10. Screenshots + responsive
    if (OUT) fs.writeFileSync(path.join(OUT, 'desktop.png'), Buffer.from((await send('Page.captureScreenshot', {})).result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await open(APP);
    await ev('T.waitFor(() => T.rows().length === 3)');
    check('mobile: table rows become stacked cards', (await ev('getComputedStyle(document.querySelector("#students-body tr")).display')) === 'block');
    check('mobile: no horizontal overflow', (await ev('document.documentElement.scrollWidth <= window.innerWidth')), String(await ev('document.documentElement.scrollWidth + " vs " + window.innerWidth')));
    check('mobile: layout is a single column', (await ev('getComputedStyle(document.querySelector(".layout")).gridTemplateColumns.split(" ").length')) === 1);
    if (OUT) fs.writeFileSync(path.join(OUT, 'mobile.png'), Buffer.from((await send('Page.captureScreenshot', { captureBeyondViewport: true })).result.data, 'base64'));

    // 11. Console health (HTTP 4xx from intentionally invalid requests are expected network log lines)
    const bad = events.filter((e) => e.method === 'Runtime.exceptionThrown'
      || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && e.params.entry.source !== 'network')
      || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
    check('no JavaScript exceptions, CSP violations or console errors', bad.length === 0, JSON.stringify(bad).slice(0, 500));
    ws.close();
  } finally {
    chrome.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await delay(800);
    for (const dir of [profile, dataDir]) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* browser still releasing files */ }
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('BROWSER CHECK ERROR:', err.message); process.exit(2); });
