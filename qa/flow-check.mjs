// Browser flow checks. Requires the API on :5080, the Angular dev server on :4300,
// and headless Edge with CDP enabled:
//   msedge --headless=new --remote-debugging-port=9223 --user-data-dir=<temp dir> about:blank
const API = 'http://127.0.0.1:5080';
const APP = 'http://localhost:4300';

const targets = await fetch('http://127.0.0.1:9223/json').then((r) => r.json());
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('No page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Page.javascriptDialogOpening') {
    send('Page.handleJavaScriptDialog', { accept: true });
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception?.description ?? ''));
  return result.result.value;
}

async function waitFor(expression, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return true;
    await sleep(150);
  }
  return false;
}

async function navigate(url, ready) {
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"');
  const ok = await waitFor(ready);
  await sleep(400);
  return ok;
}

async function fill(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
}

const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

// --- UI login ---
await navigate(`${APP}/posts`, 'document.querySelector(".feed-card")');
await evaluate(`localStorage.clear()`);
await navigate(`${APP}/login`, 'document.querySelector("form input[name=username]")');
await fill('form input[name=username]', 'admin');
await fill('form input[name=password]', 'Admin#12345');
await click('form button[type=submit]');
const loggedIn = await waitFor('location.pathname === "/notes"');
check('Login redirects to /notes', loggedIn);
check('Notes page renders composer', await waitFor('document.querySelector("#title")'));

// --- Create note ---
const stamp = Date.now().toString().slice(-6);
const noteTitle = `Flow note ${stamp}`;
await fill('#title', noteTitle);
await fill('#content', 'Created by the flow check.');
await click('.composer form button[type=submit]');
const created = await waitFor(`[...document.querySelectorAll('.note-card h3')].some(h => h.textContent.trim() === ${JSON.stringify(noteTitle)})`);
check('Create note appears in grid', created);
const createNotice = await evaluate(`document.querySelector('.alert.success')?.textContent?.trim() ?? ''`);
check('Create shows success notice', createNotice !== '', createNotice);

// --- Edit note ---
await evaluate(`(() => {
  const card = [...document.querySelectorAll('.note-card')].find(c => c.querySelector('h3')?.textContent.trim() === ${JSON.stringify(noteTitle)});
  card.querySelector('button.text-button').click();
})()`);
await waitFor('document.querySelector("#title").value.startsWith("Flow note")');
const editedTitle = noteTitle + ' edited';
await fill('#title', editedTitle);
await click('.composer form button[type=submit]');
const edited = await waitFor(`[...document.querySelectorAll('.note-card h3')].some(h => h.textContent.trim() === ${JSON.stringify(editedTitle)})`);
check('Edit note updates the card', edited);

// --- Delete note (confirm auto-accepted) ---
await evaluate(`(() => {
  const card = [...document.querySelectorAll('.note-card')].find(c => c.querySelector('h3')?.textContent.trim() === ${JSON.stringify(editedTitle)});
  card.querySelector('button.danger-text').click();
})()`);
const deleted = await waitFor(`![...document.querySelectorAll('.note-card h3')].some(h => h.textContent.trim() === ${JSON.stringify(editedTitle)})`);
check('Delete note removes the card', deleted);

// --- Publish post ---
await navigate(`${APP}/posts`, 'document.querySelector("#post-content")');
const postText = `Flow post ${stamp}`;
await fill('#post-content', postText);
await click('.composer-side form button[type=submit]');
const posted = await waitFor(`[...document.querySelectorAll('.post-content')].some(p => p.textContent.trim() === ${JSON.stringify(postText)})`);
check('Publish post shows in feed', posted);

// --- Admin user create + delete via visible Delete button ---
await navigate(`${APP}/admin/users`, 'document.querySelectorAll("tbody tr").length > 0');
const uname = `aaa_flow_${stamp}`;
await fill('#new-username', uname);
await fill('#new-email', `${uname}@example.com`);
await fill('#new-password', 'FlowPass#123');
await fill('#new-interests', 'testing, flow');
await click('.composer form button[type=submit]');
const userRow = `[...document.querySelectorAll('tbody tr')].some(r => r.textContent.includes(${JSON.stringify(uname)}))`;
check('Admin creates a user', await waitFor(userRow));

const deleteStyle = await evaluate(`(() => {
  const row = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(${JSON.stringify(uname)}));
  const btn = row.querySelector('button.table-action.danger');
  const cs = getComputedStyle(btn);
  return { bg: cs.backgroundColor, color: cs.color, label: btn.textContent.trim() };
})()`);
check('Delete button renders transparent with coral label', deleteStyle.bg === 'rgba(0, 0, 0, 0)' && deleteStyle.label === 'Delete', JSON.stringify(deleteStyle));

await evaluate(`(() => {
  const row = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(${JSON.stringify(uname)}));
  row.querySelector('button.table-action.danger').click();
})()`);
const userGone = await waitFor(`![...document.querySelectorAll('tbody tr')].some(r => r.textContent.includes(${JSON.stringify(uname)}))`);
check('Admin deletes the user', userGone);

// --- User-posts page for admin ---
const userId = await evaluate(`JSON.parse(localStorage.getItem('secure_notes_user')).id`);
await navigate(`${APP}/users/${userId}/posts`, 'document.querySelector(".feed-card")');
const chipText = await evaluate(`document.querySelector('.feed-card .chip')?.textContent?.trim() ?? ''`);
const pluralOk = await evaluate(`(() => {
  const m = (document.querySelector('.feed-card .chip')?.textContent ?? '').trim().match(/^(\\d+) (post|posts)$/);
  return m ? (Number(m[1]) === 1 ? m[2] === 'post' : m[2] === 'posts') : false;
})()`);
check('User posts chip pluralizes correctly', pluralOk, chipText);

// --- Admin all-notes view ---
await navigate(`${APP}/admin/notes`, 'document.querySelectorAll("tbody tr").length > 0');
check('Admin sees every note in the archive table', await evaluate(`document.querySelectorAll('tbody tr').length > 0`));
check('Admin can expand note content with the disclosure control', await evaluate(`document.querySelectorAll('details summary').length > 0`));

// --- Interests grouping view ---
await navigate(`${APP}/admin/interests`, 'document.querySelector(".interest-card, .empty-state")');
check('Interests view renders grouped interest cards', await evaluate(`document.querySelectorAll('.interest-card').length > 0`));
check('Interest cards link members to their posts', await evaluate(`Boolean(document.querySelector('.interest-card .member-list a'))`));

// --- Mobile drawer ---
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await navigate(`${APP}/notes`, 'document.querySelector(".menu-button")');
await sleep(400);
check('Sidebar hidden off-canvas on mobile', await evaluate(`getComputedStyle(document.querySelector('.sidebar')).transform !== 'none'`));
await click('.menu-button');
const drawerOpened = await waitFor(`(() => {
  const t = getComputedStyle(document.querySelector('.sidebar')).transform;
  return t === 'none' || Math.abs(new DOMMatrix(t).m41) < 2;
})()`, 4000);
check('Menu button opens the drawer', drawerOpened);
await click('.scrim');
const drawerClosed = await waitFor(`(() => {
  const t = getComputedStyle(document.querySelector('.sidebar')).transform;
  return t !== 'none' && Math.abs(new DOMMatrix(t).m41) > 200;
})()`, 4000);
check('Scrim closes the drawer', drawerClosed, await evaluate(`getComputedStyle(document.querySelector('.sidebar')).transform`));

await send('Emulation.clearDeviceMetricsOverride');
ws.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
