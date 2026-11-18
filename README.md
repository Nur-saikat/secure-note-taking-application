# Secure Notes

A secure note-taking application with a .NET Web API, MongoDB, JWT authentication and an Angular frontend. Users manage their own private notes; admins additionally manage users and can read every user's notes. Public posts live in a separate collection and are visible to everyone.

## Stack

| Layer | Technology |
| --- | --- |
| Backend | ASP.NET Core (.NET 11) Web API, controllers, Swashbuckle |
| Database | MongoDB 8.2 (works with 6+), official MongoDB C# driver 3.14 |
| Auth | JWT HS256 (`Microsoft.AspNetCore.Authentication.JwtBearer`) |
| Passwords | BCrypt.Net-Next, work factor 12 |
| Frontend | Angular 22 (standalone components, signals, new control flow) |

No UI templates or component libraries are used: the Angular app is plain standalone components with hand-written HTML/CSS. The visual layer is a custom design built from scratch in `src/styles.css` (forest sidebar, paper texture, serif display type, inline SVG icons) with no CSS framework.

## Prerequisites

- .NET SDK 11
- Node.js 20+ and npm
- MongoDB listening on `127.0.0.1:27017` (local service or `mongod`)

Local configuration files are not committed. Copy `backend/NotesApi/appsettings.Example.json` to `appsettings.json` and `backend/NotesApi/appsettings.Development.Example.json` to `appsettings.Development.json`, then fill in your local connection string and secrets.

## Running the app

Start the backend and frontend in two terminals.

### 1. Backend

```bash
cd backend/NotesApi
dotnet restore
dotnet run --launch-profile http
```

- API: http://localhost:5080
- Swagger UI (Development only): http://localhost:5080/swagger — the **Authorize** button accepts a JWT from `POST /api/auth/login`, and only endpoints that require a token are marked with a lock.
- On startup the API verifies the connection is usable, creates the indexes (idempotently) and seeds the admin account if it does not exist.

`dotnet run` without a launch profile starts in **Production**, where `Jwt:Key` is intentionally empty and startup fails fast. Supply configuration through environment variables (or `appsettings.Production.json`):

```bash
export Jwt__Key="a-production-signing-key-at-least-32-bytes-long"
export SeedAdmin__Username="admin"
export SeedAdmin__Email="admin@example.com"
export SeedAdmin__Password="Admin#12345"
export SeedAdmin__Interests__0="security"
export SeedAdmin__Interests__1="architecture"
```

`appsettings.Development.json` already contains a development-only signing key and the seeded admin below.

### 2. Frontend

```bash
cd frontend/notes-app
npm install
npm start
```

- App: http://localhost:4200 (or `npx ng serve --port 4300` if 4200 is taken)
- The API base URL is configured in `frontend/notes-app/src/environments/environment.ts` (`apiBaseUrl`, default `http://localhost:5080`). `api-base-url.interceptor.ts` prefixes every relative `/api/...` request with it, so the browser calls the backend directly.
- Direct cross-origin calls require the API's CORS allow-list, which already includes both `localhost:4200` and `localhost:4300` (and their `127.0.0.1` variants).

### Development admin

| Username | Password |
| --- | --- |
| `admin` | `Admin#12345` |

Registration always creates a `User`; roles can only be assigned by an admin.

## Frontend pages

- `/login`, `/register` - authentication; registration accepts optional interests.
- `/notes` - private notes of the signed-in user (create, edit, delete, paginated).
- `/posts` - public post feed; signed-in users can publish, everyone can read.
- `/users/:userId/posts` - one user's posts, paginated.
- `/admin/users` - admin-only user list, create, edit (role/password included), delete; self-delete is blocked and self-role change is disabled.
- `/admin/notes` - admin-only view of all notes with owner username.
- `/admin/interests` - admin-only users grouped by interest.
- Route guards redirect unauthenticated users from `/notes` to `/login` and non-admins from `/admin/*` to `/notes`. A 401 from any API call clears the session and redirects to `/login?expired=1`.

## API

All list endpoints accept `page` (default 1) and `pageSize` (default 20, max 100) and return:

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
```

| Method | Route | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public, rate-limited | Creates a `User`, returns JWT |
| POST | `/api/auth/login` | Public, rate-limited | Generic error on bad credentials |
| GET | `/api/auth/me` | Authenticated | Current user |
| GET | `/api/notes` | Authenticated | Own notes, newest first, paged |
| POST | `/api/notes` | Authenticated | Owner taken from JWT |
| GET | `/api/notes/{id}` | Owner or admin | Single note |
| PUT | `/api/notes/{id}` | Owner | Others get 404 |
| DELETE | `/api/notes/{id}` | Owner | Others get 404 |
| GET | `/api/admin/notes` | Admin | All notes with owner username, paged |
| GET | `/api/posts` | Public | Global feed, newest first, paged |
| POST | `/api/posts` | Authenticated | Author taken from JWT |
| GET | `/api/users` | Admin | All users sorted by username, paged |
| POST | `/api/users` | Admin | Create user with role and interests |
| GET | `/api/users/interests` | Admin | Users grouped by interest, paged |
| GET | `/api/users/{id}` | Admin | Single user |
| PUT | `/api/users/{id}` | Admin | Update email/role/interests/optional password |
| DELETE | `/api/users/{id}` | Admin | Cascades notes and posts |
| GET | `/api/users/{id}/posts` | Public | One user's posts via `$lookup`, paged |

Errors use ProblemDetails (`application/problem+json`) with `traceId` and statuses 400/401/403/404/409/429/500.

## Indexing strategy

Indexes are declared explicitly with `CreateIndexModel` in `backend/NotesApi/Data/MongoIndexes.cs` and created at startup. This is the .NET driver equivalent of Mongoose's `schema.index(...)` (Mongoose itself is Node-only).

Exactly six secondary indexes are created; nothing speculative:

| Collection | Index | Why |
| --- | --- | --- |
| `users` | `ux_users_username` (unique, ascending) | Login lookup by username and the admin user list sorted by username (`SORT` is served by the index). Unique also enforces usernames. |
| `users` | `ix_users_interests` (ascending, multikey) | The interests grouping pipeline works on the `interests` array; a multikey index supports interest filtering/lookups and satisfies the requirement that the grouped view is index-backed. |
| `notes` | `ix_notes_userId_createdAt` (`userId` asc, `createdAt` desc) | User's note list: equality on `userId` plus newest-first order (`SORT` served, no blocking sort). |
| `notes` | `ix_notes_createdAt` (descending) | Admin all-notes list: global newest-first order (`SORT` served). |
| `posts` | `ix_posts_userId_createdAt` (`userId` asc, `createdAt` desc) | Per-user posts and the `$lookup` correlation on `userId`; newest-first order. |
| `posts` | `ix_posts_createdAt` (descending) | Public post feed: global newest-first order (`SORT` served). |

Reads of a single document by id (`GET /api/notes/{id}`, `GET /api/users/{id}`) use MongoDB's built-in `_id` index and are not given an extra index. There is no index on `email` because email is never queried or sorted on. There are no indexes on `passwordHash` or any array element that never appears in a filter.

The user-posts aggregation starts from the matching user document (`$match` on `_id`, planned as `EXPRESS_IXSCAN` on `_id`), then resolves that user's posts inside `$lookup` through `ix_posts_userId_createdAt`. `explain` reports `indexesUsed: ["ix_posts_userId_createdAt"]` with `collectionScans: 0` for both the paged lookup and the count lookup, and the newest-first sort is served by the compound index.

The interests grouping has to touch every user in order to count groups, but the pipeline begins with an indexed `$match` on `interests`, so `explain` shows `IXSCAN` on `ix_users_interests` rather than a collection scan. The `$unwind`/`$group` work itself necessarily happens in memory; no index can replace it.

To inspect the actual indexes:

```bash
mongosh secure_notes --eval "db.users.getIndexes(); db.notes.getIndexes(); db.posts.getIndexes()"
```

## Aggregation requirements

### Users grouped by interests

`InterestService` makes **exactly one** `collection.Aggregate()` call on `users` and uses no other query method for this view. Pipeline:

1. `$match` users that have an `interests` field (served by `IXSCAN` on `ix_users_interests`).
2. `$unwind` the `interests` array (users with no interests are excluded from groups).
3. `$group` by interest name, `$push` each user's id and username, and count members.
4. `$sort` by member count descending, then interest name ascending (deterministic pagination).
5. `$facet` with `items` (`$skip`/`$limit`) and `total` (`$count`).
6. `$project` the paged groups plus the total.

### User posts with `$lookup`

`PostService.GetUserPostsAsync` builds **one** aggregation pipeline on `users`:

1. `$match` the user by `_id` (`IDHACK`).
2. `$lookup` into `posts` with `let`/`$expr` matching `post.userId` to the user id, then `$sort` newest-first, `$skip`/`$limit` for pagination.
3. A second `$lookup` counts that user's posts (`$count`) for `total`/`totalPages`.
4. `$project` userId, username, `items` and `total`; a missing user yields no document and the endpoint returns 404.

## Security measures

- **Password storage**: BCrypt with work factor 12, per-password salt; passwords are never returned. Passwords must be 8+ characters and at most 72 bytes (BCrypt's limit). Admin-created users go through the same hashing.
- **JWT**: HS256 with issuer/audience/lifetime validation, 30 s clock skew, `sub`/`unique_name`/`role` claims, `MapInboundClaims = false`. Signing keys shorter than 32 bytes are rejected at startup.
- **Account revalidation**: `OnTokenValidated` loads the user on every authenticated request and rejects tokens when the account was deleted or its role changed. Deleting/demoting a user invalidates existing tokens immediately. This per-request lookup uses the `_id` index, which is why no extra user id index exists.
- **Authorization**: role policies (`Admin`) plus ownership checks on note update/delete (non-owners receive 404, which avoids leaking whether a note exists). Admin note reads are explicit.
- **Self-protection**: admins cannot delete their own account or change their own role (API guard plus disabled UI controls).
- **Rate limiting**: fixed window of 30 requests/minute per IP on register/login, returning 429 ProblemDetails.
- **Other**: CORS restricted to the configured dev origins, DTO validation annotations and manual normalization (trim/lowercase usernames and emails, deduplicated interests up to 20), duplicate username returns 409 via MongoDB's unique index, generic login failure message, cascade delete of a deleted user's notes and posts.

## QA

`qa/api-smoke.mjs` is an end-to-end API suite (125 checks) covering auth, RBAC, ownership, pagination validation on every list endpoint, request validation, cascade deletes, the two aggregation endpoints, exact index sets, BCrypt hashes, CORS preflight, rate limiting, expired/forged JWTs, and `explain` plans for each list/read path plus stage-level plans for both aggregation scenarios. It finishes with a rate-limit probe and waits for the window to reset, so a run takes about 70 seconds.

```bash
# with the API running on http://127.0.0.1:5080 and MongoDB up
cd qa
npm install
npm run smoke
```

The suite writes timestamped test users/notes/posts into the configured `secure_notes` database and cleans up where practical; do not point it at a production database. A repeatable browser pass is available in `qa/flow-check.mjs` (18 checks: login, notes CRUD, posting, admin user create/delete, admin archive and interests views, mobile drawer) and `qa/screenshot.mjs` captures every view at desktop and mobile sizes from a running dev server.

## PDF requirement checklist

| Requirement | Where it is implemented | How it is verified |
| --- | --- | --- |
| REST API + functional frontend | ASP.NET Core controllers + Angular SPA | `qa/api-smoke.mjs`, `qa/flow-check.mjs` |
| User: create/update/delete/list own notes | `NotesController` + `NoteService` ownership filters | Smoke ownership checks (cross-user reads/writes return 404) |
| Admin inherits User capabilities | Same note endpoints with the Admin role | Smoke admin own-note create/list/delete checks |
| Admin manages users (add/remove/update/list) | `UsersController` protected by `Roles.Admin` | Smoke user CRUD, role change, self-protection checks; UI People page |
| Admin views everyone's notes | `AdminNotesController` + `GET /api/notes/{id}` admin bypass | Smoke admin notes list/read checks; UI All Notes page |
| MongoDB + Mongoose | MongoDB 8.2 via the official C# driver | Deviation explained below; `Data/MongoIndexes.cs` |
| `schema.index` equivalents visible in review | Explicit `CreateIndexModel` definitions created at startup | Smoke asserts the exact index set per collection |
| JWT authentication | HS256, issuer/audience/lifetime/signature validation, claims, per-request account revalidation | Tampered/expired/stale-role token checks |
| Secure password hashing | BCrypt work factor 12, 8+ chars, 72-byte limit | DB check confirms `$2...` hashes, never plaintext |
| Pagination on all list operations | `Paging.Normalize` in every list service (notes, admin notes, users, interests, feed, user posts) | Valid paging plus 400 checks on each endpoint |
| Indexes for all list views | Six targeted secondary indexes (`_id` for single reads) | `explain` asserts IXSCAN and no blocking `SORT` for each list |
| Indexes for all GET-by-id operations | Built-in `_id` index; unique username index for login | `explain` asserts `EXPRESS_IXSCAN`/`IDHACK` |
| Scenario 1: group users by interests | `InterestService` with exactly one `Aggregate()` call and no other collection methods | Source-level assertions + `explain` shows IXSCAN on `ix_users_interests` |
| Scenario 2: user posts via `$lookup` | `PostService.GetUserPostsAsync`, one pipeline starting at the user with `$lookup` into posts, paginated inside the pipeline | Source-level assertion + `explain` shows both lookups using `ix_posts_userId_createdAt` with zero collection scans |
| No unnecessary indexes | Exactly six secondary indexes, each tied to a query | Exact-set assertions in the smoke suite |
| No templates | Hand-written standalone Angular components and CSS | Source review |

## Requirement deviations

- The interview brief names MongoDB/Mongoose. Mongoose is a Node.js ODM, so in the requested .NET API the equivalent is the official MongoDB C# driver with explicit index models in `Data/MongoIndexes.cs` (created at startup, visible for review) instead of `schema.index`.
- The interview brief forbids templates and asks for restrained styling; no UI kit, CSS framework or page template is used. The frontend is hand-written standalone components plus one hand-written stylesheet (`src/styles.css`), so every visual rule stays reviewable in source.
