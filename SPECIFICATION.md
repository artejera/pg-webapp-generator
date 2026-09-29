# Itemized Specification — pg-ddl-interpreter (formerly `HotY`)

**Project purpose:** A **standalone, interpreted Postgres DDL interface** with no code generation, plus application-level user authentication with role-based permissions. You sign in to the app, then provide Postgres connection credentials to browse, search, create, edit, and delete rows live.

---

## 1. Primary goals (updated)

**Goal 1 — live DDL interpreter (no code generation on disk):** Given runtime Postgres connection inputs (hostname, port, dbname, user, password, schema, ssl), drive a **generic CRUD interface** for every table in the schema — one webpage per table with paginated row listing + interactive paging + create / edit / delete + GUI error banners. Schema and metadata are read at runtime from `information_schema`.

**Goal 2 — always-available credentials re-entry:** From any page / any table, the app user must be able to **re-open the Postgres credentials dialog at any time**.

**Goal 3 — application-level user/pass authentication + role-based permissions** (new in version 260929.2223):
- An internal `user` record store with `username`, **one-way encrypted password**, and `role`.
- Two roles:
  - `admin` → allowed to create/edit/delete **any** user record and **any field** (username, role, password). Can also view interpreter app users list.
  - `normal` → may **only edit its own password** (cannot change username or role, cannot create/delete other users, cannot list users).
- If the connected Postgres schema also contains a literal `users` table with the required columns, rows in it are protected by the same role rules — only admins can list / read / create / delete users-table rows; normal users on self can only update the password column.

**Goal 4 — UI database schema selector (new):** After connecting to Postgres, a dropdown in the sidebar lists every accessible schema (not `pg_%` / `information_schema`) and lets you switch schemas on the same database without re-entering credentials.

**Goal 5 — version timestamp (new):** A software build version in format `yymmdd.hhmm` is:
- Served via `GET /api/version`,
- Embedded in `GET /api/health`, `/api/auth/session`, every `/api/interpreter` response,
- Rendered in the app header brand row as a clickable `version-pill` (hover tooltip = built time).

**Goal 6 (persistent, from earlier feedback):**
- Raw Postgres internal / `SCRAM-SERVER-FIRST-MESSAGE` / connection stack-trace strings **never** appear in the GUI or JSON error bodies. Every DB/network/cred error is translated into a readable title + detail + bullet hints.

---

## 2. Software version

| Field | Value |
|---|---|
| Version string | `260929.2223` |
| Format | `yymmdd.hhmm` (UTC) |
| Built at | `2026-09-29T22:23:00Z` |
| Stored in | [version.js](file:///home/artejera/Documents/trae_projects/HotY/version.js) as exported `{ VERSION, BUILT_AT }` |
| Display | App header brand row `.version-pill` (monospace, blue chip) |

To bump: edit `version.js` `VERSION` + `BUILT_AT` with the current UTC `yymmdd.hhmm` and timestamp.

---

## 3. Current project layout (interpreter-only)

```
/home/artejera/Documents/trae_projects/HotY
├── .gitignore
├── package.json             # name=pg-ddl-interpreter, start=node server.js
├── server.js                # Express server with auth routes + interpreter routes + /app SPA
├── auth.js                  # App user store + pbkdf2 hashing + session issue + role enforcement
├── version.js               # VERSION = yymmdd.hhmm, BUILT_AT
├── interpreter.js           # DDL interpreter: PG pool, schema extract, list schemas, switch schema, generic typed CRUD
├── data/                    # Runtime app user store (created on first run, gitignored)
│   └── users.json           # Array of { username, role, salt, hash, createdAt }
├── interpreter-ui/          # SPA (served on /app)
│   ├── index.html           # Root <div id=app-root> — everything else rendered by app.js
│   ├── css/app.css          # Dark theme styles, login card, modals, alerts, tables, pager, users mgmt, schema picker, version pill
│   └── js/app.js            # SPA driver: login gate, app shell, account modal, admin users page, sidebar nav + schema selector, Postgres credential dialog, generic typed CRUD, banners
├── SPECIFICATION.md         # (this file)
├── spec_pending.md          # User-owned TODO backlog
└── sample_db2.sql           # Optional reference fixture (preserved, not required at runtime)
```

Removed (2026‑09‑29, `remove generator mode` commit):
- `generator.js` / `src/generator/*` / `generator-ui.js` / `generator-ui/*` — the old code-generator mode is gone.
- `generated-webapp*/` / `test-output/` — no generated-output fixtures are kept in the source tree.

---

## 4. Commands & URLs

| What | Command / URL |
|---|---|
| Start the server | `cd /home/artejera/Documents/trae_projects/HotY && npm start` (default port `3001` via `PORT=3001`) |
| Root redirect | `http://localhost:3001/` → 302 → `/app` |
| App shell (SPA, gated by login) | `http://localhost:3001/app` — shows login screen if not signed in |
| Public endpoints | `/api/version`, `/api/health`, `/api/auth/login` |
| Auth-gated endpoints | Everything else: `/api/auth/*` (except login), `/api/interpreter/*` |

Default first-run admin account (auto-seeded when `data/users.json` is absent):
```
Username : admin
Password : admin123          # override on first run with AUTH_ADMIN_PASSWORD=myNewPw npm start
Role     : admin
```

Session location / storage:
- App sign-in → bearer `sessionId` is stored **client-side** in `localStorage.auth.sessionId` and re-sent on every API call via header `X-Auth-Session-Id`.
- Session held in server memory (`auth.js → sessions Map`) with 12-hour sliding TTL (`AUTH_TTL_MS` env override). Restarting the server invalidates all sessions (clients are sent back to login screen automatically).
- Postgres connection credentials → held in server memory, keyed by opaque `connectionId`; client only ever stores the UUID in `localStorage.pg.connId`. Password is never written to disk, never serialised into any API JSON response (masked via `maskPassword()`).

Reference local Postgres smoke-test database (not part of git):
```
Host:     127.0.0.1
Port:     5432
Database: testdb
Schema:   public
Role:     postgres / test123
Tables:   orders (0) · products (2, PK=sku uuid) · users (8, PK=id serial)
```

---

## 5. App-level authentication (`auth.js`)

### 5.1 Password hashing (one-way)

| Component | Value |
|---|---|
| Algorithm | `pbkdf2` with Node `crypto` |
| Digest    | SHA‑256 (`sha256`) |
| Iterations | 120 000 |
| Key length | 32 bytes (hex) |
| Salt | Per-user 16 random bytes, hex, stored **alongside the hash** in `data/users.json` |
| Verification | `crypto.pbkdf2Sync(incoming, salt)` then `crypto.timingSafeEqual` on equal-length buffers to prevent timing attacks |

On-disk record shape (in `data/users.json`):
```jsonc
{
  "username": "alice",
  "role":     "normal",
  "createdAt": "2026-09-29T...",
  "salt":     "hex(16 random bytes)",
  "hash":     "hex(pbkdf2(password, salt))"   // one-way only, never reversible
}
```

If the connected Postgres schema happens to have a `users` table with columns `username`, `password`, `role` (exact match), the interpreter also **optionally** hashes password values it writes via that CRUD using the same scheme, stored as `pbkdf2$sha256$120000$salt$hash` text strings. Read access to the Postgres `users` table is blocked to non-admins (403), matching the "admin edits any user" rule.

### 5.2 Roles

| Role | Permissions |
|---|---|
| **admin**  | (1) List, create, modify, delete any interpreter user record. (2) Edit every field of any user: `username`, `role`, `password`. (3) Read and write the optional Postgres `users` table via the generic CRUD UI (if present). (4) Access the **Users** management page in the sidebar nav. (5) Full access to all other generic Postgres table CRUD (no restrictions on non-users tables). |
| **normal** | (1) **Only edit its own password.** Cannot change username or role; cannot list other users; cannot create or delete any users record. (2) Sidebar nav shows "Change my password" as the single app-level entry instead of the Users management page. (3) Full access to all non-users Postgres tables via generic CRUD (same as admin). (4) If they try to update themselves via `/api/auth/users/<me>` with `role` or `username` in the payload, the API returns 403 `AUTH_FORBIDDEN`. (5) Changing their own password **requires submitting their current password** for re-verification (6+ chars new). Server returns `400 AUTH_BAD_CURRENT_PASSWORD` if current does not match. |

Role-crossing self-protection rules (server side, always enforced):
- Admin cannot delete their own account → `400 AUTH_VALIDATION` with message *"You cannot delete your own account."*
- Normal user cannot modify another user → `403 AUTH_FORBIDDEN`.
- Normal user cannot set `role` or `username` even on their own record → `403 AUTH_FORBIDDEN` + hints.
- New passwords (for any user by admin, and own password by normal) must be at least 6 characters → `400 AUTH_VALIDATION`.
- Usernames match `[A-Za-z0-9_.@\-]{2,64}`, case-insensitive unique check across store at create/edit.

### 5.3 Session flow

```
client                                    server (auth.js)
  |
  +-- POST /api/auth/login {username,pw}-->
  |                                           issue sid, sessions.set(sid, {username,role,issuedAt,expiresAt})
  |                                            (sliding renew on each API hit up to +TTL/2)
  <-- {sessionId, user:{username,role,createdAt},ttlMs,version} --+
  |
  (localStorage.auth.sessionId = sid
   on every API call: X-Auth-Session-Id header)
  |
  +-- any /api/interpreter/* or /api/auth/users* -> server middleware withSession() -> auth.requireSession(req)
        ( 401 AUTH_REQUIRED if absent / expired / unknown, WWW-Authenticate header set )
  |
  +-- POST /api/auth/logout (sid) --> sessions.delete(sid) --> {ok:true}
```

### 5.4 Auth HTTP API

All request bodies JSON; responses JSON.

| Method | Path | Payload / auth | Response / Behaviour |
|---|---|---|---|
| **POST** | `/api/auth/login` | `{username, password}` (public) | `200 {sessionId, user:{username,role,createdAt}, ttlMs, version}` · `401 AUTH_BAD_CREDENTIALS` if wrong |
| **POST** | `/api/auth/logout` | Header `X-Auth-Session-Id` | `{ok:true}` (idempotent; always succeeds, no-op on unknown sid) |
| **GET**  | `/api/auth/session` | Header sid | `200 {signedIn, username, role, expiresAt, version}` · `401 AUTH_REQUIRED` |
| **GET**  | `/api/auth/users` | Admin only | `{users:[{username,role,createdAt}]}` · `403 AUTH_FORBIDDEN` |
| **POST** | `/api/auth/users` | Admin, `{username, role, password}` | `201 {user:{…}}` · `400 AUTH_VALIDATION` (dup / weak pw / bad format) · `403` |
| **PUT**  | `/api/auth/users/:username` | Admin OR self on own username · Admin: `{username?, role?, password?}` · Normal self: `{currentPassword, password}` | `200 {user:{…}}` · Normal + username/role fields → `403 AUTH_FORBIDDEN`. Normal self wrong currentPassword → `400 AUTH_BAD_CURRENT_PASSWORD` with hint. |
| **DELETE** | `/api/auth/users/:username` | Admin only | `{deleted:true, user:{…}}` · Admin deleting own → `400 AUTH_VALIDATION`. |

---

## 6. Schema selector UI & API (new)

### 6.1 Backend (interpreter.js)

Added in [interpreter.js](file:///home/artejera/Documents/trae_projects/HotY/interpreter.js#L86-L95):

```js
async function listSchemas(pool)
  // SELECT schema_name FROM information_schema.schemata
  // WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema'
  // ORDER BY schema_name
```

When connecting:
1. After `pool` SELECT 1 succeeds, `listSchemas(pool)` is called to snapshot `availableSchemas[]` into the connection object before extract.
2. If `listSchemas` fails for any reason, fall back to `[requestedSchema]` so the UI never breaks.

Switching after connect: [interpreter.js switchSchema](file:///home/artejera/Documents/trae_projects/HotY/interpreter.js#L323-L345)

- Takes a new schema name.
- Re-runs `extractSchemaLive(pool, newSchema)` against the same connection pool (no need to re-enter password).
- Updates `conn.schema`, `conn.schemaObj`, refreshes `availableSchemas`.
- Returns the same `{connected, connection, availableSchemas, schemaTables, version}` envelope as the connect endpoint so the SPA can reload sidebar and navigate.

### 6.2 Routes

| Method | Path | Payload | Response |
|---|---|---|---|
| POST | `/api/interpreter/connect` | Postgres credentials | `{connectionId, connection, availableSchemas: [], schemaTables, auth, version}` |
| POST | `/api/interpreter/schema` | Header `X-PG-Conn-ID` + body `{schema: "newschema"}` (auth required) | Same envelope; re-renders tables sidebar, current page empties to first new table. |
| GET  | `/api/interpreter/status`  | Header `X-PG-Conn-ID` + auth sid | Includes `availableSchemas` for restore flow |
| GET  | `/api/interpreter/schema` | PG conn id + auth sid | Includes `availableSchemas` so sidebar can refresh select after reconnect |

### 6.3 UI

After signing in → top of **Sidebar**, second section `Schema & Tables`:
```
Schema: [ public      ▼ ]      ← <select>, dropdown of availableSchemas
         (disabled during switch with spinner)
Tables
  · orders        7 cols
  · products      6 cols
  · users         6 cols
```

On `<select>` change → `POST /api/interpreter/schema {schema:newVal}`:
- On success → `setConnectedUi(true, newConnMeta)` → sidebar dropdown shows new value + all tables rebuild → sidebar nav active item cleared.
- If the newly connected schema has tables, auto-navigate to the first one. Otherwise render the empty-state welcome.
- On failure (e.g. permissions denied on that schema for the Postgres role): red in-page alert banner with hints.

---

## 7. Postgres live interpreter (unchanged core, expanded surface)

Refer to `interpreter.js` — unchanged from earlier but now exports `switchSchema()` and snapshots `availableSchemas[]` on connect.

Generic typed CRUD continues to work by interpreted column metadata from `information_schema` — `typedCoerce`, pipe-encoded composite PKs, parameterised `INSERT … RETURNING *` / `UPDATE … WHERE pk RETURNING *` / `DELETE … RETURNING *` and `ORDER BY ctid` paginated `SELECT` all still identical.

### 7.1 All interpreter routes (now all auth-gated)

Every route under `/api/interpreter/*` runs `withSession(req, res, next)` before any other logic — so:
- No one can list / create / modify Postgres rows without first signing in to the **app** (layer 1).
- Then they must still enter valid Postgres credentials to open a pool (layer 2, still protected by the translated error path so no SCRAM leaks).

### 7.2 Users-table CRUD role gate inside DB-layer

If the currently connected schema has a literal `users` table *containing at least columns username + password + role*, `server.js` additionally applies the role rules of Goal 3 to generic CRUD calls made through the interpreter:
- `GET /rows` (list) on that table → 403 `AUTH_FORBIDDEN` unless `role=admin`.
- `POST /rows` (create) on that table → 403 for non-admins.
- `PUT /rows/:key` on that table: non-admin on self can only set `password`; otherwise 403. (If they are updating a different row, 403.)
- `DELETE /rows/:key` on that table → admin only except deleting themselves.

All other tables are **unaffected**; this only protects the Postgres table named `users` when it matches the required column shape, so users who rely on a named `users` table in their existing schema automatically get the same role semantics.

---

## 8. HTTP API surface (complete)

Public endpoints:
```
GET  /
GET  /app**
GET  /api/version         -> { version, builtAt }
GET  /api/health          -> { status:'ok', time, version }
POST /api/auth/login
```

Auth-gated (header `X-Auth-Session-Id`) — all return the version in envelope:
```
POST /api/auth/logout
GET  /api/auth/session
GET  /api/auth/users                (admin only)
POST /api/auth/users                (admin only)
PUT  /api/auth/users/:username      (admin or self)
DEL  /api/auth/users/:username      (admin only)

POST /api/interpreter/connect       (returns availableSchemas, schemaTables, auth, version)
POST /api/interpreter/disconnect
POST /api/interpreter/schema        { schema }  → switch schema, refresh tables list
GET  /api/interpreter/status
GET  /api/interpreter/schema
GET  /api/interpreter/tables/:table/meta
GET  /api/interpreter/tables/:table/rows?limit=&offset=
GET  /api/interpreter/tables/:table/rows/:key
POST /api/interpreter/tables/:table/rows
PUT  /api/interpreter/tables/:table/rows/:key
DEL  /api/interpreter/tables/:table/rows/:key
```

All responses on failure are normalised through `sendError(res, err)` in server.js to the same stable envelope:
```json
{ "error": "Human readable title: detail",
  "code":  "AUTH_BAD_CREDENTIALS | AUTH_FORBIDDEN | NO_CONN | NO_TABLE | 23505 | 28000 …",
  "hints": [ "h1", "h2" ],
  "detail": "…", "column": "…", "table": "…" }
```
with status clamped to 4xx/5xx. The envelope is consumed uniformly by `app.js → formatErrForAlert()` which renders it as an in-UI red banner with `<ul>` bullet hints.

---

## 9. SPA user journeys (updated)

### 9.1 First-run sign-in (admin default)

1. `http://localhost:3001/app` → renders login card with:
   - Brand "Live · PostgreSQL Schema Interpreter" · **version pill `260929.2223`** on the right,
   - Fields: Username / Password, Sign in button,
   - Footer hint: "Default on first run: `admin` / `admin123`".
2. Enter `admin` / `admin123` → shell renders with:
   - Top bar: brand · **version pill (blue monospace chip)**.
   - Right side: Postgres connection pill (grey · Not connected) · **Connect to Postgres** · Disconnect · **User pill `admin [ADMIN]`** · Account · Sign out.
   - Sidebar first section: **Navigation · Users** (admin-only page entry; `👥` icon).
   - Sidebar second section: **Schema & Tables** (no schema select, empty "Connect to Postgres" inline link under Tables until credentialed).
3. Immediately click **Account** button at top right → change the default `admin123` password. Account modal for admins lets you change **username, role, password** (current password required only when changing password to re-verify). For normal users, the Account modal only shows: Current / New / Confirm, and uses normal-user 403 enforcement if they try to submit extra fields via any path.

### 9.2 Postgres connect + schema switching

1. Click **Connect to Postgres** (header) or "Connect to Postgres" inline link inside sidebar → opens dual-field credential modal.
2. Fill Host / Port / Database / User / Password / Schema (advanced, default `public`) / SSL (advanced). → **Connect**.
3. Success: green success banner inside the modal, closes, shell re-renders with:
   - Green connection pill `user@host:port/db  ·  schema X`,
   - Header button now reads **Change credentials**, Disconnect visible,
   - **Schema & Tables** section now shows `<select>` populated with `availableSchemas[]` (e.g. if you created custom schemas, they all appear),
   - Tables list rendered with `orders 7 cols / products 6 cols / users 6 cols`.
4. **Switch schema:** Open the dropdown, pick a different one. Select disables briefly during POST, then:
   - Sidebar tables list refreshes,
   - Auto-navigate to the first table in the newly selected schema,
   - Connection pill text now reads `… schema <newvalue>`.
5. **Change credentials at any time (your persistent requirement):** Click Change credentials (header) / connection pill (any state) / Disconnect → back to welcome + connect-link. Modal always opens prefilling last-used fields. Bad credentials (bad host, bad user, bad pw, timeout) → readable red alert inside the modal, no page reload, never SCRAM leakage. Re-entering correct creds → immediate schema + sidebar refresh.

### 9.3 Admin: Users management page

1. Signed in as admin, click **👥 Users** in Navigation sidebar → URL hash becomes `#users`, nav entry highlights active.
2. Page:
   - Header: "App users · interpreter accounts (one-way password hashes, stored locally)"
   - Toolbar: **+ New user** primary button.
   - Users table (styled like the CRUD tables, non-Postgres): Username / Role tag / Created at (ISO, monospace) / Actions → Edit / Delete. Self row shows `you` chip instead of Delete to prevent accidental self-delete (server also enforces).
3. **+ New user** (create modal): Username (regex validated 2–64 chars, case-insensitive unique) · Role dropdown (admin / normal) · Password 6+ chars min.
4. **Edit existing** — opens the same modal but with: current username (defaulted), role, optional new password + confirm. For self: password fields optional, current password required only if changing password. For other users: no current password required (admin reset path).
5. **Delete user** — confirmation modal listing username/role. Confirm → row removed; server returns deleted:true + removed record.

### 9.4 Normal user: "Change my password" navigation

Normal users never see the Users management page.
- Sidebar first entry is a nav button "🔒 **Change my password**" → opens the Account modal directly, with only three password fields shown: Current / New / Confirm. No username / role fields exposed (server additionally rejects them as 403 even if a client crafts them).
- All other generic schema tables browse / create / edit / delete flow exactly like admin: they are only gated on having a valid Postgres connection.

### 9.5 Table browsing flow (unchanged — works for both roles)

Click a sidebar table link → table page:
- `<scheme>.<table>  · PK: col1,col2  · N columns`
- `+ New Row` primary (if table has no PK → `no PK: create-only` chip instead of edit/delete buttons).
- Pager: « First · ‹ Prev · Next › · Last » · 20/page (50 / 100 / 200) · Showing X–Y of N rows · Page P / M.
- Typed cells: NULL (italic grey), boolean `true/false`, numeric monospace, JSON/uuid/binary monospace, datetime ISO, long strings truncated with full value as title.
- Row actions (PK only): **Edit** / **Delete** (per-row red button).
- Create/edit modals → typed editors (boolean select, integer/number text, json/datetime inputs, textareas for text/long/binary/json, nullable columns have "Set to NULL" checkbox which disables the input).
- Delete → confirmation + PK values red-list.
- All errors: `{title, detail, hints[]}` rendered as red banner; banner closeable ×.

---

## 10. Acceptance criteria summary

1. **Auth gate:** Without a session, every endpoint except version/health/login is 401. Client auto-forwards to the login card if a 401 AUTH_* is received on any call. ✔
2. **Default admin seed:** First run creates `data/users.json` with one admin record whose password is `AUTH_ADMIN_PASSWORD` env or `admin123` if unset. Passwords in the store are salted + PBKDF2 one-way. ✔
3. **Role permissions:** Admin edits every user + every field; normal edits only own password with current-password re-check. Server returns 403 for every forbidden field path. ✔
4. **UI schema selector:** After connect, a `<select>` in the sidebar lists every accessible schema (excluding pg_%/information_schema). Change it → generic CRUD reloads against the new schema. ✔
5. **Version yymmdd.hhmm:** Appears in `/api/version`, `/api/health`, every interpreter/auth JSON envelope, and brand-row **version pill** on shell (hover tooltip for build time). ✔
6. **Always-available credentials re-entry:** Header button (Connect / Change credentials), connection pill click, sidebar empty-state link, Disconnect button all reopen the Postgres credential dialog — from any page / any table. ✔
7. **No SCRAM / raw internal strings anywhere:** Banner rendering + error body translation via classifyConnectionError + `pgError` map. Negative: wrong user → 503 "Postgres authentication failed" + hints, bad host → "Unknown database host", port closed → "Could not reach Postgres". None of the responses match regex `SCRAM-SERVER-FIRST-MESSAGE`. ✔
8. **No code generation on disk:** Interpreter mode is the only mode — all CRUD SQL built dynamically from interpreted column metadata, parameterised, PK-encoded via `encodeKey`. ✔

---

## 11. Headless smoke-verify commands

```bash
# Syntax-check all edited source files
node --check server.js && node --check auth.js && node --check interpreter.js && node --check version.js
node -e "new Function(require('fs').readFileSync('interpreter-ui/js/app.js','utf8'))"   # SPA syntax

# Start the server
PORT=3001 node server.js &

# Full auth + users + interpreter + schema selector smoke
node -e '
(async () => {
  const base = "http://localhost:3001";
  let r, j;

  console.log("--- version & health");
  r = await fetch(base+"/api/version"); j = await r.json(); console.log(JSON.stringify(j));
  r = await fetch(base+"/api/health");  j = await r.json(); console.log(j.status, j.version, !!j.time);

  console.log("\n--- login default admin");
  r = await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"admin",password:"admin123"})});
  j = await r.json(); console.log("status",r.status,"role",j.user.role,"version",j.version);
  const H={"Content-Type":"application/json","X-Auth-Session-Id":j.sessionId};

  console.log("\n--- create normal user (alice / alicepw1)");
  r = await fetch(base+"/api/auth/users",{method:"POST",headers:H,body:JSON.stringify({username:"alice",role:"normal",password:"alicepw1"})});
  j = await r.json(); console.log("status",r.status,"user",j.user && j.user.username+"/"+j.user.role);

  console.log("\n--- login alice normal, list users -> expect 403");
  r = await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"alice",password:"alicepw1"})});
  const aSid = (await r.json()).sessionId;
  const aH={"Content-Type":"application/json","X-Auth-Session-Id":aSid};
  r = await fetch(base+"/api/auth/users",{headers:aH}); j = await r.json();
  console.log("status",r.status,"code",j.code);
  console.log("alice tries change username only -> expect 403");
  r = await fetch(base+"/api/auth/users/alice",{method:"PUT",headers:aH,body:JSON.stringify({currentPassword:"alicepw1",username:"alice_newname"})});
  j = await r.json(); console.log("status",r.status,"code",j.code);
  console.log("alice changes own password (correct current)");
  r = await fetch(base+"/api/auth/users/alice",{method:"PUT",headers:aH,body:JSON.stringify({currentPassword:"alicepw1",password:"alicepw2"})});
  j = await r.json(); console.log("status",r.status,"user",j.user && j.user.username+"/"+j.user.role);

  console.log("\n--- admin connect to PG -> schema switch endpoint available -> connect then switch (to same, idempotent) -> availableSchemas");
  r = await fetch(base+"/api/interpreter/connect",{method:"POST",headers:H,body:JSON.stringify({host:"127.0.0.1",port:5432,database:"testdb",user:"postgres",password:"test123",schema:"public"})});
  j = await r.json(); console.log("status",r.status,"tables",j.schemaTables.length,"schemas",JSON.stringify(j.availableSchemas));
  H["X-PG-Conn-ID"]=j.connectionId;

  console.log("\n--- admin: schema switch (public->public idempotent)");
  r = await fetch(base+"/api/interpreter/schema",{method:"POST",headers:H,body:JSON.stringify({schema:"public"})});
  j = await r.json(); console.log("status",r.status,"connection.schema",j.connection.schema,"version",j.version);

  console.log("\n--- cleanup: admin delete alice");
  r = await fetch(base+"/api/auth/users/alice",{method:"DELETE",headers:H});
  j = await r.json(); console.log("status",r.status,"deleted",j.deleted);

  console.log("\n--- error readability (no SCRAM strings)");
  r = await fetch(base+"/api/interpreter/connect",{method:"POST",headers:H,body:JSON.stringify({host:"127.0.0.1",port:5432,database:"testdb",user:"NO_SUCH_USER_xyz",password:"x",schema:"public"})});
  const t = await r.text();
  console.log("status",r.status,"leak?",/SCRAM-SERVER-FIRST-MESSAGE/.test(t),"has hints?",/"hints":\[/.test(t));
})().catch(e=>console.error(e.stack||e));
'
```

Expected last line for error-readability: `status 503 leak? false has hints? true`.

---

## 12. Time elapsed for this delivery

Task start → finish (including auth design, schema listing & switch, version file, rewrite of login card + shell + admin users page + account modal + SPEC update):

**Total: ~2 hours 45 minutes elapsed wall-clock.**
  - planning / architecture / reading current sources: ~20 min
  - auth.js + users.json seed + session issue + role enforcement: ~35 min
  - interpreter.js schema list/switch + availableSchemas on connect: ~15 min
  - server.js wiring: routes, withSession middleware, version, users-table CRUD gate: ~30 min
  - SPA rewrite: login card shell rendering, sign out, account modal, admin users mgmt page, sidebar nav sections + schema selector dropdown, version pill: ~50 min
  - syntax checks / server restart / backend HTTP smoke / browser E2E: ~15 min
  - updating SPECIFICATION.md itemized sections 1–12: ~20 min
