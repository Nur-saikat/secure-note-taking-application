import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';

const BASE = process.env.API_URL ?? 'http://127.0.0.1:5080';
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGO_DB ?? 'secure_notes';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function call(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: response.status, body: json, text };
}

function hasPaging(body) {
  return (
    body &&
    Array.isArray(body.items) &&
    Number.isInteger(body.page) &&
    Number.isInteger(body.pageSize) &&
    typeof body.total === 'number' &&
    Number.isInteger(body.totalPages)
  );
}

function decodeJwt(token) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function signJwt(payload, key) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  const signature = createHmac('sha256', key).update(data).digest('base64url');
  return `${data}.${signature}`;
}

async function readSettings() {
  const read = async (file) => JSON.parse(await fs.readFile(new URL(`../backend/NotesApi/${file}`, import.meta.url), 'utf8'));
  const base = await read('appsettings.json');
  const dev = await read('appsettings.Development.json');
  return {
    issuer: base.Jwt.Issuer,
    audience: base.Jwt.Audience,
    key: dev.Jwt.Key,
  };
}

function walkPlan(node, stages, indexes) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (typeof node.stage === 'string') {
    stages.push(node.stage);
  }
  if (typeof node.indexName === 'string') {
    indexes.push(node.indexName);
  }
  walkPlan(node.inputStage, stages, indexes);
  if (Array.isArray(node.inputStages)) {
    for (const child of node.inputStages) {
      walkPlan(child, stages, indexes);
    }
  }
}

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const aliceName = `alice_${suffix}`.toLowerCase();
const bobName = `bob_${suffix}`.toLowerCase();
const tempName = `temp_${suffix}`.toLowerCase();
const charlieName = `charlie_${suffix}`.toLowerCase();
const password = 'Alice#12345';

console.log(`Smoke testing ${BASE} (suffix ${suffix})\n`);

// ---------- Authentication ----------
const adminLogin = await call('POST', '/api/auth/login', {
  body: { username: 'ADMIN', password: 'Admin#12345' },
});
check('admin login (case-insensitive username) returns 200', adminLogin.status === 200, adminLogin.text.slice(0, 300));
check('admin login returns Admin role', adminLogin.body?.user?.role === 'Admin');
check('login response never leaks a password hash', !adminLogin.text.toLowerCase().includes('passwordhash'));
const adminToken = adminLogin.body?.token;
const adminId = adminLogin.body?.user?.id;
const adminClaims = decodeJwt(adminToken);
check('JWT contains sub, unique_name and role claims', Boolean(adminClaims.sub && adminClaims.unique_name && adminClaims.role));
check('JWT contains no password data', !JSON.stringify(adminClaims).toLowerCase().includes('password'));

const registerAlice = await call('POST', '/api/auth/register', {
  body: {
    username: aliceName.toUpperCase(),
    email: `  Alice_${suffix}@Example.COM  `,
    password,
    interests: ['Chess', ' reading ', 'chess'],
    role: 'Admin',
  },
});
check('register returns 201', registerAlice.status === 201, registerAlice.text.slice(0, 300));
check('register cannot self-assign Admin role', registerAlice.body?.user?.role === 'User');
check('username is normalized to lowercase', registerAlice.body?.user?.username === aliceName);
check('email is trimmed and lowercased', registerAlice.body?.user?.email === `alice_${suffix}@example.com`);
check('interests are trimmed, lowercased and de-duplicated', JSON.stringify(registerAlice.body?.user?.interests) === JSON.stringify(['chess', 'reading']));
const aliceToken = registerAlice.body?.token;
const aliceId = registerAlice.body?.user?.id;

const registerBob = await call('POST', '/api/auth/register', {
  body: {
    username: bobName,
    email: `bob_${suffix}@example.com`,
    password,
    interests: ['chess', 'running'],
  },
});
check('second user registration returns 201', registerBob.status === 201);
const bobToken = registerBob.body?.token;
const bobId = registerBob.body?.user?.id;

const duplicate = await call('POST', '/api/auth/register', {
  body: { username: aliceName.toUpperCase(), email: `dupe_${suffix}@example.com`, password },
});
check('duplicate username is rejected with 409', duplicate.status === 409, duplicate.text);

const weak = await call('POST', '/api/auth/register', {
  body: { username: `weak_${suffix}`, email: `weak_${suffix}@example.com`, password: 'short' },
});
check('weak password is rejected with 400', weak.status === 400);

const badEmail = await call('POST', '/api/auth/register', {
  body: { username: `bademail_${suffix}`, email: 'not-an-email', password },
});
check('invalid email is rejected with 400', badEmail.status === 400);
const badUsername = await call('POST', '/api/auth/register', {
  body: { username: `bad name!${suffix}`, email: `badname_${suffix}@example.com`, password },
});
check('invalid username characters are rejected with 400', badUsername.status === 400);
const tooManyInterests = await call('POST', '/api/auth/register', {
  body: {
    username: `many_${suffix}`,
    email: `many_${suffix}@example.com`,
    password,
    interests: Array.from({ length: 21 }, (_, index) => `interest${index}`),
  },
});
check('more than 20 interests is rejected with 400', tooManyInterests.status === 400);
const longInterest = await call('POST', '/api/auth/register', {
  body: { username: `longint_${suffix}`, email: `longint_${suffix}@example.com`, password, interests: ['x'.repeat(31)] },
});
check('interest longer than 30 characters is rejected with 400', longInterest.status === 400);

const longPassword = await call('POST', '/api/auth/register', {
  body: { username: `long_${suffix}`, email: `long_${suffix}@example.com`, password: 'a'.repeat(73) },
});
check('password over 72 bytes is rejected with 400', longPassword.status === 400);

const wrongLogin = await call('POST', '/api/auth/login', { body: { username: aliceName, password: 'WrongPass#1' } });
check('wrong password is rejected with 401', wrongLogin.status === 401);

const aliceLogin = await call('POST', '/api/auth/login', {
  body: { username: aliceName.toUpperCase(), password },
});
check('user login succeeds', aliceLogin.status === 200 && aliceLogin.body?.user?.id === aliceId);
const aliceToken2 = aliceLogin.body?.token;

const me = await call('GET', '/api/auth/me', { token: aliceToken2 });
check('profile /me returns current user', me.status === 200 && me.body?.id === aliceId);
const meAnonymous = await call('GET', '/api/auth/me');
check('profile /me requires authentication', meAnonymous.status === 401);
const tampered = await call('GET', '/api/auth/me', { token: `${aliceToken2}x` });
check('tampered JWT is rejected with 401', tampered.status === 401);

const settings = await readSettings();
const nowSeconds = Math.floor(Date.now() / 1000);
const expiredToken = signJwt({
  sub: adminId,
  unique_name: 'admin',
  role: 'Admin',
  iss: settings.issuer,
  aud: settings.audience,
  nbf: nowSeconds - 7200,
  iat: nowSeconds - 7200,
  exp: nowSeconds - 3600,
}, settings.key);
const expired = await call('GET', '/api/auth/me', { token: expiredToken });
check('expired JWT is rejected with 401', expired.status === 401);

const wrongKeyToken = signJwt({
  sub: adminId,
  unique_name: 'admin',
  role: 'Admin',
  iss: settings.issuer,
  aud: settings.audience,
  nbf: nowSeconds,
  iat: nowSeconds,
  exp: nowSeconds + 3600,
}, 'a-different-key-that-is-long-enough-to-sign-tokens-123456');
const forged = await call('GET', '/api/auth/me', { token: wrongKeyToken });
check('JWT signed with the wrong key is rejected with 401', forged.status === 401);

// ---------- Notes and ownership ----------
const anonNotes = await call('GET', '/api/notes');
check('notes list requires authentication', anonNotes.status === 401);

const createdNotes = [];
for (let index = 1; index <= 3; index += 1) {
  const created = await call('POST', '/api/notes', {
    token: aliceToken2,
    body: { title: `QA note ${index}`, content: `Content ${index}` },
  });
  check(`note ${index} created`, created.status === 201 && created.body?.userId === aliceId, created.text.slice(0, 200));
  createdNotes.push(created.body);
  await sleep(15);
}

const notePage1 = await call('GET', '/api/notes?page=1&pageSize=2', { token: aliceToken2 });
check('notes page 1 is paginated', notePage1.status === 200 && hasPaging(notePage1.body), notePage1.text.slice(0, 200));
check('notes pagination reports 3 total across 2 pages', notePage1.body?.total === 3 && notePage1.body?.totalPages === 2);
check('notes page 1 returns 2 items', notePage1.body?.items?.length === 2);
check('notes are sorted newest first', notePage1.body?.items?.[0]?.title === 'QA note 3');

const notePage2 = await call('GET', '/api/notes?page=2&pageSize=2', { token: aliceToken2 });
check('notes page 2 returns the remaining item', notePage2.body?.items?.length === 1 && notePage2.body?.items?.[0]?.title === 'QA note 1');

const badPageSize = await call('GET', '/api/notes?page=1&pageSize=101', { token: aliceToken2 });
check('pageSize above limit is rejected with 400', badPageSize.status === 400);
const badPage = await call('GET', '/api/notes?page=0', { token: aliceToken2 });
check('page below 1 is rejected with 400', badPage.status === 400);
const feedBadPage = await call('GET', '/api/posts?page=0');
check('public feed rejects page below 1 with 400', feedBadPage.status === 400);
const feedBadSize = await call('GET', '/api/posts?pageSize=101');
check('public feed rejects pageSize above 100 with 400', feedBadSize.status === 400);
const adminNotesBadSize = await call('GET', '/api/admin/notes?pageSize=0', { token: adminToken });
check('admin notes reject pageSize below 1 with 400', adminNotesBadSize.status === 400);
const usersBadPage = await call('GET', '/api/users?page=-1', { token: adminToken });
check('admin user list rejects page below 1 with 400', usersBadPage.status === 400);
const interestsBadSize = await call('GET', '/api/users/interests?pageSize=101', { token: adminToken });
check('interests view rejects pageSize above 100 with 400', interestsBadSize.status === 400);
const userPostsBadSize = await call('GET', `/api/users/${aliceId}/posts?pageSize=101`);
check('$lookup posts reject pageSize above 100 with 400', userPostsBadSize.status === 400);

const emptyNote = await call('POST', '/api/notes', { token: aliceToken2, body: { title: '', content: 'x' } });
check('note with an empty title is rejected with 400', emptyNote.status === 400);
const hugePost = await call('POST', '/api/posts', { token: aliceToken2, body: { content: 'x'.repeat(2001) } });
check('post over 2000 characters is rejected with 400', hugePost.status === 400);
const badRole = await call('POST', '/api/users', {
  token: adminToken,
  body: { username: `badrole_${suffix}`, email: `badrole_${suffix}@example.com`, password, role: 'SuperAdmin' },
});
check('unknown role is rejected with 400', badRole.status === 400);

const getAliceNote = await call('GET', `/api/notes/${createdNotes[0].id}`, { token: aliceToken2 });
check('owner can read their note', getAliceNote.status === 200);

const bobReadsAliceNote = await call('GET', `/api/notes/${createdNotes[0].id}`, { token: bobToken });
check('another user cannot read the note (404)', bobReadsAliceNote.status === 404);
const bobUpdatesAliceNote = await call('PUT', `/api/notes/${createdNotes[0].id}`, {
  token: bobToken,
  body: { title: 'Hacked', content: 'nope' },
});
check('another user cannot update the note (404)', bobUpdatesAliceNote.status === 404);
const bobDeletesAliceNote = await call('DELETE', `/api/notes/${createdNotes[0].id}`, { token: bobToken });
check('another user cannot delete the note (404)', bobDeletesAliceNote.status === 404);

const adminReadsAliceNote = await call('GET', `/api/notes/${createdNotes[0].id}`, { token: adminToken });
check('admin can view any note', adminReadsAliceNote.status === 200);
const adminUpdatesAliceNote = await call('PUT', `/api/notes/${createdNotes[0].id}`, {
  token: adminToken,
  body: { title: 'Admin edit', content: 'nope' },
});
check('admin cannot edit another user note (view-only, 404)', adminUpdatesAliceNote.status === 404);

const aliceUpdate = await call('PUT', `/api/notes/${createdNotes[0].id}`, {
  token: aliceToken2,
  body: { title: 'QA note 1 updated', content: 'Updated content' },
});
check('owner can update their note', aliceUpdate.status === 200 && aliceUpdate.body?.title === 'QA note 1 updated');

const adminOwnNote = await call('POST', '/api/notes', {
  token: adminToken,
  body: { title: 'Admin own note', content: 'Admins inherit User capabilities.' },
});
check('admin inherits note creation', adminOwnNote.status === 201);
const adminOwnList = await call('GET', '/api/notes', { token: adminToken });
check('admin can list their own notes', adminOwnList.status === 200 && adminOwnList.body?.total === 1);
const adminOwnDelete = await call('DELETE', `/api/notes/${adminOwnNote.body.id}`, { token: adminToken });
check('admin can delete their own note', adminOwnDelete.status === 204);

const aliceDelete = await call('DELETE', `/api/notes/${createdNotes[1].id}`, { token: aliceToken2 });
check('owner can delete their note', aliceDelete.status === 204);
const afterDelete = await call('GET', '/api/notes', { token: aliceToken2 });
check('note total drops after delete', afterDelete.body?.total === 2);

// ---------- RBAC ----------
const userListForbidden = await call('GET', '/api/users', { token: aliceToken2 });
check('User cannot list users (403)', userListForbidden.status === 403);
const adminNotesForbidden = await call('GET', '/api/admin/notes', { token: aliceToken2 });
check('User cannot list all notes (403)', adminNotesForbidden.status === 403);
const interestsForbidden = await call('GET', '/api/users/interests', { token: aliceToken2 });
check('User cannot view interests admin view (403)', interestsForbidden.status === 403);

const userProfileForbidden = await call('GET', `/api/users/${aliceId}`, { token: aliceToken2 });
check('User cannot read the user profile endpoint (403)', userProfileForbidden.status === 403);
const adminProfile = await call('GET', `/api/users/${aliceId}`, { token: adminToken });
check('Admin can read a user profile by id', adminProfile.status === 200 && adminProfile.body?.id === aliceId);
const missingProfile = await call('GET', '/api/users/507f1f77bcf86cd799439011', { token: adminToken });
check('Missing user profile returns 404', missingProfile.status === 404);

// ---------- Posts and $lookup scenario ----------
for (let index = 1; index <= 2; index += 1) {
  const post = await call('POST', '/api/posts', {
    token: aliceToken2,
    body: { content: `Alice public post ${index}` },
  });
  check(`alice post ${index} created`, post.status === 201);
  await sleep(10);
}
const bobPost = await call('POST', '/api/posts', { token: bobToken, body: { content: 'Bob public post' } });
check('bob post created', bobPost.status === 201);

const feed = await call('GET', '/api/posts?page=1&pageSize=10');
check('public feed is accessible without auth', feed.status === 200 && hasPaging(feed.body));
check('public feed includes author usernames', feed.body?.items?.some((post) => post.authorUsername === aliceName));

const alicePostsPage1 = await call('GET', `/api/users/${aliceId}/posts?page=1&pageSize=1`);
check('$lookup user posts endpoint is public', alicePostsPage1.status === 200);
check('$lookup returns the correct username', alicePostsPage1.body?.username === aliceName);
check('$lookup paginates items and total', alicePostsPage1.body?.items?.length === 1 && alicePostsPage1.body?.total === 2 && alicePostsPage1.body?.totalPages === 2);
const alicePostsPage2 = await call('GET', `/api/users/${aliceId}/posts?page=2&pageSize=1`);
check('$lookup second page returns the second post', alicePostsPage2.body?.items?.length === 1);
const missingUserPosts = await call('GET', '/api/users/507f1f77bcf86cd799439011/posts');
check('$lookup for missing user returns 404', missingUserPosts.status === 404);
const malformedUserPosts = await call('GET', '/api/users/zzzzzzzzzzzzzzzzzzzzzzzz/posts');
check('malformed user id returns 404', malformedUserPosts.status === 404);

// ---------- Admin user management ----------
const userList = await call('GET', '/api/users?page=1&pageSize=2', { token: adminToken });
check('admin lists users with pagination', userList.status === 200 && hasPaging(userList.body), userList.text.slice(0, 200));
check('admin user list is sorted by username', userList.body?.items?.length === 2 && userList.body.items[0].username <= userList.body.items[1].username);
check('user list never leaks password hashes', !userList.text.toLowerCase().includes('passwordhash'));

const adminNotes = await call('GET', '/api/admin/notes?page=1&pageSize=10', { token: adminToken });
check('admin lists all notes with pagination', adminNotes.status === 200 && hasPaging(adminNotes.body));
check('admin notes include owner usernames', adminNotes.body?.items?.every((note) => typeof note.ownerUsername === 'string'));

const charlie = await call('POST', '/api/users', {
  token: adminToken,
  body: {
    username: charlieName,
    email: `charlie_${suffix}@example.com`,
    password,
    role: 'Admin',
    interests: ['reading'],
  },
});
check('admin can create an Admin user', charlie.status === 201 && charlie.body?.role === 'Admin');

const duplicateByAdmin = await call('POST', '/api/users', {
  token: adminToken,
  body: {
    username: aliceName,
    email: `dupadmin_${suffix}@example.com`,
    password,
    role: 'User',
  },
});
check('admin create with duplicate username returns 409', duplicateByAdmin.status === 409);

const bobRenameConflict = await call('PUT', `/api/users/${bobId}`, {
  token: adminToken,
  body: { username: aliceName, email: `bob_${suffix}@example.com`, role: 'User', interests: ['chess'] },
});
check('admin update to duplicate username returns 409', bobRenameConflict.status === 409);

const selfDelete = await call('DELETE', `/api/users/${adminId}`, { token: adminToken });
check('admin cannot delete own account (400)', selfDelete.status === 400);
const selfDemote = await call('PUT', `/api/users/${adminId}`, {
  token: adminToken,
  body: { username: 'admin', email: 'admin@example.com', role: 'User', interests: ['security', 'architecture'] },
});
check('admin cannot demote own account (400)', selfDemote.status === 400);

const charlieLogin = await call('POST', '/api/auth/login', { body: { username: charlieName, password } });
check('new admin can log in', charlieLogin.status === 200 && charlieLogin.body?.user?.role === 'Admin');
const charlieToken = charlieLogin.body?.token;
const charlieDelete = await call('DELETE', `/api/users/${charlie.body.id}`, { token: adminToken });
check('admin can delete another user', charlieDelete.status === 204);
const deletedTokenUse = await call('GET', '/api/notes', { token: charlieToken });
check('token for deleted account is rejected with 401', deletedTokenUse.status === 401);

const alicePromote = await call('PUT', `/api/users/${aliceId}`, {
  token: adminToken,
  body: { username: aliceName, email: `alice_${suffix}@example.com`, role: 'Admin', interests: ['chess', 'reading'] },
});
check('admin can change a user role', alicePromote.status === 200 && alicePromote.body?.role === 'Admin');
const staleRoleToken = await call('GET', '/api/users', { token: aliceToken2 });
check('token with stale role is rejected with 401', staleRoleToken.status === 401);
const aliceAdminLogin = await call('POST', '/api/auth/login', { body: { username: aliceName, password } });
check('promoted user gets Admin access on new login', aliceAdminLogin.status === 200 && aliceAdminLogin.body?.user?.role === 'Admin');
const aliceAdminList = await call('GET', '/api/users?page=1&pageSize=5', { token: aliceAdminLogin.body?.token });
check('promoted user can call admin endpoints', aliceAdminList.status === 200);
const aliceDemote = await call('PUT', `/api/users/${aliceId}`, {
  token: adminToken,
  body: { username: aliceName, email: `alice_${suffix}@example.com`, role: 'User', interests: ['chess', 'reading'] },
});
check('admin can restore the User role', aliceDemote.status === 200 && aliceDemote.body?.role === 'User');
const staleAdminToken = await call('GET', '/api/users', { token: aliceAdminLogin.body?.token });
check('demoted user token loses admin access immediately (401)', staleAdminToken.status === 401);
const aliceFinalLogin = await call('POST', '/api/auth/login', { body: { username: aliceName, password } });
check('demoted user can log in again as User', aliceFinalLogin.status === 200 && aliceFinalLogin.body?.user?.role === 'User');

// Cascade deletion
const temp = await call('POST', '/api/users', {
  token: adminToken,
  body: { username: tempName, email: `temp_${suffix}@example.com`, password, role: 'User' },
});
const tempLogin = await call('POST', '/api/auth/login', { body: { username: tempName, password } });
const tempToken = tempLogin.body?.token;
await call('POST', '/api/notes', { token: tempToken, body: { title: 'Temp note', content: 'Will be deleted' } });
await call('POST', '/api/posts', { token: tempToken, body: { content: 'Temp post' } });
const tempDelete = await call('DELETE', `/api/users/${temp.body.id}`, { token: adminToken });
check('admin can delete a user with content', tempDelete.status === 204);
const tempTokenUse = await call('GET', '/api/notes', { token: tempToken });
check('deleted user token is rejected with 401', tempTokenUse.status === 401);

// ---------- Interests aggregation ----------
const interestsPage = await call('GET', '/api/users/interests?page=1&pageSize=1', { token: adminToken });
check('interests view is paginated', interestsPage.status === 200 && hasPaging(interestsPage.body));
check('interests view returns one group per page', interestsPage.body?.items?.length === 1);
check('interests total matches distinct interests', interestsPage.body?.total >= 3 && interestsPage.body?.totalPages === interestsPage.body?.total);

const allInterests = await call('GET', '/api/users/interests?page=1&pageSize=100', { token: adminToken });
const chessGroup = allInterests.body?.items?.find((group) => group.interest === 'chess');
check('interests grouping includes chess users', chessGroup && chessGroup.count >= 2 && chessGroup.users.some((user) => user.username === aliceName) && chessGroup.users.some((user) => user.username === bobName), JSON.stringify(chessGroup));
check('interests grouping includes admin interests', allInterests.body?.items?.some((group) => group.interest === 'security'));

// ---------- CORS ----------
const preflight = await fetch(`${BASE}/api/notes`, {
  method: 'OPTIONS',
  headers: {
    Origin: 'http://localhost:4200',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization',
  },
});
check('CORS preflight allows the Angular dev origin', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === 'http://localhost:4200', `${preflight.status} ${preflight.headers.get('access-control-allow-origin')}`);

// ---------- MongoDB index and data checks ----------
const client = new MongoClient(MONGO_URL);
await client.connect();
const db = client.db(DB_NAME);

async function indexNames(collection) {
  const indexes = await db.collection(collection).indexes();
  return indexes.map((index) => index.name).sort();
}

const expectedUsers = ['_id_', 'ix_users_interests', 'ux_users_username'].sort();
const expectedNotes = ['_id_', 'ix_notes_createdAt', 'ix_notes_userId_createdAt'].sort();
const expectedPosts = ['_id_', 'ix_posts_createdAt', 'ix_posts_userId_createdAt'].sort();

const userIndexes = await indexNames('users');
const noteIndexes = await indexNames('notes');
const postIndexes = await indexNames('posts');
check('users collection has exactly the required indexes', JSON.stringify(userIndexes) === JSON.stringify(expectedUsers), JSON.stringify(userIndexes));
check('notes collection has exactly the required indexes', JSON.stringify(noteIndexes) === JSON.stringify(expectedNotes), JSON.stringify(noteIndexes));
check('posts collection has exactly the required indexes', JSON.stringify(postIndexes) === JSON.stringify(expectedPosts), JSON.stringify(postIndexes));

const userIndexDefs = await db.collection('users').indexes();
const usernameIndex = userIndexDefs.find((index) => index.name === 'ux_users_username');
check('username index is unique', usernameIndex?.unique === true);

const aliceDoc = await db.collection('users').findOne({ username: aliceName });
check('passwords are stored as BCrypt hashes', typeof aliceDoc?.passwordHash === 'string' && aliceDoc.passwordHash.startsWith('$2') && aliceDoc.passwordHash !== password);
check('cascade delete removed the temp user content',
  (await db.collection('notes').countDocuments({ userId: new ObjectId(temp.body.id) })) === 0 &&
  (await db.collection('posts').countDocuments({ userId: new ObjectId(temp.body.id) })) === 0);
check('deleted users are gone from the database', (await db.collection('users').countDocuments({ username: charlieName })) === 0);

async function explainFind(collection, filter, sort = null) {
  let cursor = db.collection(collection).find(filter);
  if (sort) {
    cursor = cursor.sort(sort);
  }
  const explanation = await cursor.limit(2).explain('executionStats');
  const stages = [];
  const indexes = [];
  walkPlan(explanation.queryPlanner?.winningPlan, stages, indexes);
  return { stages, indexes, explanation };
}

const notesByUserPlan = await explainFind('notes', { userId: new ObjectId(aliceId) }, { createdAt: -1 });
check('user notes query uses the compound index without a blocking sort',
  notesByUserPlan.indexes.includes('ix_notes_userId_createdAt') && !notesByUserPlan.stages.includes('SORT'),
  JSON.stringify({ stages: notesByUserPlan.stages, indexes: notesByUserPlan.indexes }));

const allNotesPlan = await explainFind('notes', {}, { createdAt: -1 });
check('admin notes query uses the createdAt index without a blocking sort',
  allNotesPlan.indexes.includes('ix_notes_createdAt') && !allNotesPlan.stages.includes('SORT'),
  JSON.stringify({ stages: allNotesPlan.stages, indexes: allNotesPlan.indexes }));

const userListPlan = await explainFind('users', {}, { username: 1 });
check('admin user list uses the unique username index without a blocking sort',
  userListPlan.indexes.includes('ux_users_username') && !userListPlan.stages.includes('SORT'),
  JSON.stringify({ stages: userListPlan.stages, indexes: userListPlan.indexes }));

const postsByUserPlan = await explainFind('posts', { userId: new ObjectId(aliceId) }, { createdAt: -1 });
check('$lookup posts query uses the compound posts index without a blocking sort',
  postsByUserPlan.indexes.includes('ix_posts_userId_createdAt') && !postsByUserPlan.stages.includes('SORT'),
  JSON.stringify({ stages: postsByUserPlan.stages, indexes: postsByUserPlan.indexes }));

const allPostsPlan = await explainFind('posts', {}, { createdAt: -1 });
check('public feed uses the createdAt index without a blocking sort',
  allPostsPlan.indexes.includes('ix_posts_createdAt') && !allPostsPlan.stages.includes('SORT'),
  JSON.stringify({ stages: allPostsPlan.stages, indexes: allPostsPlan.indexes }));

const userByIdPlan = await explainFind('users', { _id: new ObjectId(adminId) });
check('single user read uses the built-in _id index',
  userByIdPlan.stages.includes('IDHACK') || userByIdPlan.indexes.includes('_id_'),
  JSON.stringify({ stages: userByIdPlan.stages, indexes: userByIdPlan.indexes }));

const noteByIdPlan = await explainFind('notes', { _id: new ObjectId(createdNotes[0].id) });
check('single note read uses the built-in _id index',
  noteByIdPlan.stages.includes('IDHACK') || noteByIdPlan.indexes.includes('_id_'),
  JSON.stringify({ stages: noteByIdPlan.stages, indexes: noteByIdPlan.indexes }));

const interestsExplain = await db.command({
  explain: {
    aggregate: 'users',
    pipeline: [
      { $match: { interests: { $exists: true } } },
      { $unwind: '$interests' },
      {
        $group: {
          _id: '$interests',
          count: { $sum: 1 },
          users: { $push: { id: { $toString: '$_id' }, username: '$username' } },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      { $facet: { items: [{ $skip: 0 }, { $limit: 10 }], total: [{ $count: 'value' }] } },
    ],
    cursor: {},
  },
  verbosity: 'executionStats',
});
const cursorStage = interestsExplain.stages?.find((stage) => stage.$cursor)?.$cursor;
const aggStages = [];
const aggIndexes = [];
walkPlan(cursorStage?.queryPlanner?.winningPlan ?? interestsExplain.queryPlanner?.winningPlan, aggStages, aggIndexes);
console.log(`INFO  interests aggregation plan :: ${JSON.stringify({ stages: aggStages, indexes: aggIndexes })}`);
check('interests aggregation is driven by ix_users_interests (no collection scan)',
  aggIndexes.includes('ix_users_interests') && !aggStages.includes('COLLSCAN'),
  JSON.stringify({ stages: aggStages, indexes: aggIndexes }));

const lookupExplain = await db.command({
  explain: {
    aggregate: 'users',
    pipeline: [
      { $match: { _id: new ObjectId(aliceId) } },
      {
        $lookup: {
          from: 'posts',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
            { $sort: { createdAt: -1 } },
            { $skip: 0 },
            { $limit: 2 },
          ],
          as: 'items',
        },
      },
      {
        $lookup: {
          from: 'posts',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
            { $count: 'value' },
          ],
          as: 'postCount',
        },
      },
      {
        $project: {
          userId: { $toString: '$_id' },
          username: 1,
          items: 1,
          total: { $ifNull: [{ $arrayElemAt: [{ $ifNull: ['$postCount.value', []] }, 0] }, 0] },
        },
      },
    ],
    cursor: {},
  },
  verbosity: 'executionStats',
});
const lookupStages = (lookupExplain.stages ?? []).filter((stage) => stage.$lookup);
check('Scenario 2 pipeline has the posts $lookups',
  lookupStages.length === 2,
  JSON.stringify(lookupStages.map((stage) => stage.as)));
check('both $lookups use ix_posts_userId_createdAt with zero collection scans',
  lookupStages.length === 2 && lookupStages.every((stage) =>
    (stage.indexesUsed ?? []).includes('ix_posts_userId_createdAt') && (stage.collectionScans ?? 0) === 0),
  JSON.stringify(lookupStages.map((stage) => ({ as: stage.as, indexesUsed: stage.indexesUsed, collectionScans: stage.collectionScans }))));

// ---------- Source-level aggregation constraints ----------
const interestSource = await fs.readFile(new URL('../backend/NotesApi/Services/InterestService.cs', import.meta.url), 'utf8');
check('Scenario 1 makes exactly one collection.Aggregate() call',
  (interestSource.match(/\.Aggregate</g) ?? []).length === 1);
check('Scenario 1 uses no other collection query methods',
  !/\.(Find|FindAsync|CountDocuments|InsertOne|InsertMany|UpdateOne|UpdateMany|ReplaceOne|DeleteOne|DeleteMany|BulkWrite)\b/.test(interestSource));
check('Scenario 1 touches only the users collection', (interestSource.match(/db\.Users\./g) ?? []).length === 1);

const postSource = await fs.readFile(new URL('../backend/NotesApi/Services/PostService.cs', import.meta.url), 'utf8');
check('Scenario 2 uses one aggregation pipeline with $lookup',
  (postSource.match(/\.Aggregate</g) ?? []).length === 1 && postSource.includes('"$lookup"'));

await client.close();

// ---------- Rate limiting ----------
let saw429 = false;
for (let attempt = 0; attempt < 40 && !saw429; attempt += 1) {
  const response = await call('POST', '/api/auth/login', {
    body: { username: `limiter_probe_${suffix}`, password: 'WrongPass#1' },
  });
  if (response.status === 429) {
    saw429 = true;
  }
}
check('auth endpoints rate limit at 30 requests/minute with 429', saw429);
if (saw429) {
  console.log('INFO  waiting 61s for the rate-limit window to reset');
  await sleep(61000);
  const recovery = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin#12345' } });
  check('auth login works again after the window resets', recovery.status === 200);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failures:\n - ${failures.join('\n - ')}`);
  process.exitCode = 1;
}
