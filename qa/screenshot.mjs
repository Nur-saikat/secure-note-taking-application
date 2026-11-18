import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'http://127.0.0.1:5080';
const APP = 'http://localhost:4300';
const OUT = path.resolve('shots');

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

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function navigate(url, ready) {
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"');
  await waitFor(ready);
  await sleep(500);
  await evaluate('window.scrollTo(0, 0)');
}

async function shot(name) {
  const metrics = await send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize;
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.min(size.width, 1600),
      height: Math.min(size.height, 3200),
      scale: 1,
    },
  });
  await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`saved ${name}.png (${Math.round(size.width)}x${Math.round(size.height)})`);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}`);
  return response.status === 204 ? null : response.json();
}

await fs.mkdir(OUT, { recursive: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

const auth = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: 'admin', password: 'Admin#12345' }),
});

const sampleNotes = [
  {
    title: 'A slower kind of focus',
    content:
      'The best work rarely starts with a full inbox.\n\nMornings are for one hard thing, a long walk, and a page that stays open until it makes sense.',
  },
  {
    title: 'Weekend reading list',
    content:
      'Three essays on systems, one on typography, and the interview with the cartographer. Keep the tabs honest this time.',
  },
  {
    title: 'Architecture notes',
    content:
      'Indexes should follow query shapes, not imagined ones. The compound index earns its place; everything else has to prove it belongs.',
  },
];

const created = [];
try {
  for (const note of sampleNotes) {
    const createdNote = await api('/api/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(note),
    });
    created.push(createdNote.id);
  }

  await navigate(`${APP}/login`, 'document.querySelector(".auth-page")');
  await shot('01-login-desktop');

  await navigate(`${APP}/register`, 'document.querySelector(".auth-page")');
  await shot('02-register-desktop');

  await evaluate(
    `localStorage.setItem('secure_notes_token', ${JSON.stringify(auth.token)});
     localStorage.setItem('secure_notes_user', ${JSON.stringify(JSON.stringify(auth.user))});`,
  );

  await navigate(`${APP}/notes`, 'document.querySelector("app-notes .note-card")');
  await shot('03-notes-desktop');

  await navigate(`${APP}/posts`, 'document.querySelector("app-posts .feed-item")');
  await shot('04-posts-desktop');

  const feed = await api('/api/posts?page=1&pageSize=1');
  const author = feed.items[0];
  await navigate(
    `${APP}/users/${author.userId}/posts`,
    'document.querySelector("app-user-posts .profile-band")',
  );
  await shot('05-user-posts-desktop');

  await navigate(`${APP}/admin/users`, 'document.querySelector("app-admin-users .data-table tbody tr")');
  await shot('06-people-desktop');

  await navigate(`${APP}/admin/notes`, 'document.querySelector("app-admin-notes .data-table tbody tr")');
  await shot('07-all-notes-desktop');

  await navigate(`${APP}/admin/interests`, 'document.querySelector("app-interests .interest-card")');
  await shot('08-interests-desktop');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(`${APP}/notes`, 'document.querySelector("app-notes .note-card")');
  await shot('09-notes-mobile');

  await navigate(`${APP}/posts`, 'document.querySelector("app-posts .feed-item")');
  await shot('10-posts-mobile');
} finally {
  for (const id of created) {
    await fetch(`${API}/api/notes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.token}` },
    });
  }
  ws.close();
}
