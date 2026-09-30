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

**Goal 6 — Master / Detail pair auto-detection + UI row selection → constrained subordinate browse (new):**
For any two tables in the currently connected schema where the **detail table has a composite PRIMARY KEY (≥2 columns)** and the **master table's PK column list equals the detail PK list MINUS its last (trailing) key column** (mapped either 1:1 by literal name OR by FOREIGN KEY relationship declared on the detail prefix columns, in order):
- Auto-detect and surface the pair as `{master, detail, matchingPrefix[], via}`.
- When browsing a master table, each row has a **"Use as header"** action. Clicking it:
  - Selects exactly **one** row as UI master-header; unselected master rows are hidden from the webpage presentation.
  - Disables Edit/Delete on the selected master row (and `+ New Row` on the master table) while it remains in the "header" state.
  - Renders a **subordinate detail-table browser** directly under the master UI, constrained to rows whose prefix PK columns match the corresponding master values.
- Clear selection button restores full browse.

**Goal 7 — Table selector next to schema selector (new):**
In the Sidebar section "Schema & Tables", next to the Schema dropdown, add a Table dropdown (`<select>`) listing all tables in the current schema — each option labelled with column count, and `[M]aster/[D]etail` suffixes if the table participates in any auto-detected master/detail pair. Selecting an option navigates directly to that table page.

**Goal 8 — Visually distinguish key fields + type/nullable tooltips (new):**
- PRIMARY KEY column headers carry a 🔑 key icon, bold amber name, gradient amber background + amber bottom border; PK data cells use bold amber tabular text with amber left accent bar + light amber tint.
- Selected-as-header master row gets blue highlight + left inset shadow.
- Every column `<th>` header has a multi-line native HTML `title=` tooltip listing Type, Class, Nullable, Max length, Numeric precision (scale), Default, IDENTITY. The same metadata is always visible as a right-side `.type-tag` pill showing `<typeClass> · NULL/NOT NULL`.

**Goal 9 (persistent, from earlier feedback):**
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
│   ├── css/app.css          # Dark theme styles, login card, modals, alerts, tables, pager, users mgmt, schema picker, table selector, PK distinction, md-chips, detail-browser, version pill
│   └── js/app.js            # SPA driver: login gate, app shell, account modal, admin users page, sidebar nav + schema/table selectors, Postgres credential dialog, generic typed CRUD, banners, master/detail UI
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

Reference local Postgres smoke-test databases (not part of git):
- **testdb** (FK-based master/detail fixture):
  ```
  Host:     127.0.0.1
  Port:     5432
  Database: testdb
  Schema:   public
  Role:     postgres / test123
  Tables:   orders (0) · products (2, PK=sku uuid) · users (8, PK=id serial)
        · categories (3, PK=id)   ← master
        · category_items (6, PK=(category_id,item_id), FK category_id→categories.id)  ← detail
  ```
- **sample_db** (2 FK-based master/detail pairs with rows):
  ```
  car_factory (3, PK=factory_id)
  car_part    (N, PK=part_id)
  car_model   (N, PK=model_id)   ← master of car_model_part (PK=(model_id,part_id))
  car_instance(N, PK=vin)        ← master of car_instance_part (PK=(vin,part_id))
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
Table:  [ orders · 7 cols ▼ ]    ← <select>, tables in current schema, [M]/[D] suffixes
         (on change navigates to that table)
Tables
  · categories M      3 cols · PK (1)
  · category_items D  4 cols · PK (2)
  · orders            7 cols
```

On `<select>` schema change → POST /api/interpreter/schema {schema:newVal}:
- On success → setConnectedUi(true, newConnMeta) → sidebar dropdown shows new value + all tables rebuild → sidebar nav active item cleared.
- If the newly connected schema has tables, auto-navigate to the first one. Otherwise render the empty-state welcome.
- On failure (e.g. permissions denied on that schema for the Postgres role): red in-page alert banner with hints.

Table `<select>` change → `navigateToTable(tableName)` (hash-routed, no reload).
- If navigating away from a currently-selected master table row, `state.master` is cleared (master selection resets to full browse).

Sidebar table list items also render **M/D coloured chips** when a table participates in any detected pair, plus `PK (N)` suffix for PK column count.

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

### 7.3 Generic typed row filtering by column equality (`interpreter.js:buildFilteredSql + listRows)

Added [interpreter.js buildFilteredSql(table, filters)](file:///home/artejera/Documents/trae_projects/HotY/interpreter.js#L444-L461) validates filter keys against real columns, throws 400 VALIDATION on unknown, parameterises AND-equality WHERE with typedCoerce for the column typeClass. Extended [interpreter.js listRows(conn, table, limit, offset, filters?)](file:///home/artejera/Documents/trae_projects/HotY/interpreter.js#L463-L501) appends WHERE first, then uses `$(params.length+1)` / `$(params.length+2)` for LIMIT/OFFSET so filter parameter positions never overlap; always safe.

Rows endpoint filter syntax:
```
GET /api/interpreter/tables/:table/rows?limit=20&offset=0
                                 &filter.<column1>=<value1>
                                 &filter.<column2>=<value2>
                                 …
```
Unknown filter column → 400 VALIDATION. Each value is run through `typedCoerce(value, column.typeClass)'.`data.filter:{<column>: <value>} returned in response envelope (so caller can echo filter state in UI chips).

Real example:
```
GET /tables/category_items/rows?limit=50&filter.category_id=1  -> total 3 Apple/Banana/Tomato
GET /tables/category_items/rows?filter.category_id=3     -> total 1 USB-C cable
GET /tables/category_items/rows?filter.XXbad=1              -> 400 VALIDATION
```

### 7.4 Master / Detail pair detector (`interpreter.js detectMasterDetailPairs`)

[interpreter.js detectMasterDetailPairs(schemaObj)](file:///home/artejera/Documents/trae_projects/HotY/interpreter.js#L504-L551) returns array of pairs matching:
```jsonc
{ master: { name, primaryKeys[] },
  detail: { name, primaryKeys[], matchingPrefix[] },
  via: 'primary-key-match' | 'foreign-key-match' }
```

Detection rule: detail must `detail.hasExplicitPk` AND `detail.primaryKeys.length >= 2`. Let `prefix = detail.primaryKeys.slice(0, -1)` (all but last = trailing discriminator). For every candidate master table with same-sized`):

1. Path A (literal name match): `master.primaryKeys[i] === prefix[i]` for all i — matches → mark pair as 'primary-key-match'.
2. Path B (FK match using detail.foreignKeys[]): For every index, verify (for every prefix col its FK entry pointing to exactly one master table, and FK foreignColumnName === master.primaryKeys[i] (ordered. That is: order matters (so FK maps precisely master PK column-by-column, not just set equality).

Deduplicated by `master|detail|prefix` composite key so a pair is emitted once.

Exposed in 4 API responses: `POST /api/interpreter/connect, `POST /api/interpreter/schema (switch), GET /api/interpreter/schema, GET /api/interpreter/status — so SPA sidebar M/D markers and so SPA sidebar chips populate immediately after schema change.

### 7.5 PK visual distinction + tooltips

All column headers `<th>` render:

- 🔑 `.pk-icon` before PK column name, then bold amber `.pk-name`, amber gradient background + amber bottom border (`th.pk-col-head`).
- Right-aligned `.head-tag-wrap > span.type-tag showing `<typeClass> · NULL / · NOT NULL`.
- Native HTML `title=` attribute (multi-line tooltip, `\n` separated):
  ```
  Type: <udt_name>
  [Class: <typeClass>]  -- omitted if text
  Nullable: YES | NO (NOT NULL)
  [Max length: N]
  [Numeric precision: N [scale M)]
  [Default: <default_value]
  [IDENTITY ALWAYS|BY DEFAULT ...]
  ```
  ```
  Each metadata line is only shown if not null/undefined.
- PK data `td.pk-col`: bold amber tabular numerals, 2px amber left accent bar, light amber bg tint.
- Selected master row `tr.row-selected-master blue highlight + strong left inset shadow.

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

POST /api/interpreter/connect       (returns availableSchemas, schemaTables, masterDetailPairs, auth, version)
POST /api/interpreter/disconnect
POST /api/interpreter/schema        { schema }  → switch schema, refresh tables list, masterDetailPairs refreshed
GET  /api/interpreter/status        (includes availableSchemas, masterDetailPairs)
GET  /api/interpreter/schema        (includes availableSchemas, masterDetailPairs for all tables)
GET  /api/interpreter/tables/:table/meta
GET  /api/interpreter/tables/:table/rows?limit=&offset=&filter.<col>=<val>&...
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

### 9.6 Table selector + master/detail browse (new)

From any connected state (sidebar or main view):

1. **Table selector next to Schema selector.**
   - In sidebar "Schema & Tables" section, Table dropdown immediately follows the Schema dropdown. Options labelled: `<name> · N cols [M]|[D]`.
   - Selecting `categories [M]` or any master → navigates (hash `#categories`) → Master page renders with:
     - Banner: `<schema> categories · PK: id · 3 columns · master of category_items`.
     - First column in table = `Select`; each row has button "Use as header".
     - PK column headers: 🔑 + amber bold styling, `.type-tag` pills (type + NULL/NOT NULL) with full metadata hover tooltip.
     - PK cells: amber bold tabular text with left accent bar.
2. **Select master row → constrained detail browse.**
   - Click "Use as header" on the Produce row (id=1):
     - Banner now adds "· header row selected", "+ New Row" is disabled, button "Clear master selection" shown.
     - Master table shows **only the selected row** (rows id=2, id=3 hidden from UI). Selected tr is blue highlighted.
     - Row Edit / Delete buttons are `disabled=true` with native hover tooltip explaining: *"Cannot edit/delete while selected master header row. Clear selection first."*.
     - Directly **below** the master UI block, a green-bordered `.detail-browser` section renders:
       - Title "Detail rows · subordinate `category_items` filtered by prefix PK match".
       - Prefix chips (one per prefix PK column): `category_id = 1` (monospace value, left border chip).
       - `✕ Clear selection` button.
       - Independent pager (first/prev/next/last + 20/50/100/200 size select + "detail rows Page X/Y").
       - Rows list for `category_items` is fetched with `GET /rows?filter.category_id=1` → returns 3 rows (Apple/Banana/Tomato). Each row retains Edit/Delete actions and +New Row for creating a child detail.
3. **Clear master selection** — via either (a) banner "Clear master selection" button, (b) ✕ Clear selection in detail header, or (c) re-clicking the "✓ Selected" button on the already-selected master row → toggle off. Full 3-row master browse re-appears instantly; all buttons re-enabled; detail section removed.
4. **Single-selection enforcement** — if another master row is clicked while one is selected, selection is *replaced* (not stacked). Always at most one `state.master` object.

### 9.7 Standalone detail-table browsing (when navigated directly to detail page via Table selector)

Select `car_instance_part [D]` in the Table dropdown → standalone detail page:
- Banner reads: "public. car_instance_part · PK: vin, part_id · 4 cols · detail under car_instance (vin / last PK is discriminator)".
- Table has **two** key columns: `vin` (PK prefix) and `part_id` (PK last/trailing) — both rendered with 🔑 icons, amber bold, tooltips.
- Generic CRUD continues to work normally: create/edit/delete rows, paging, typed cells. No "Select" column here.

### 9.8 Navigate away from master → auto-clear

On `navigateToTable(newName)`:
- If `state.master` is set, `state.master` is cleared to `null` **before** re-render (so stale selection from a different master never leaks into the next view). Also cleared on schema switch, sign-out, disconnect.

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
9. **Table selector next to schema selector:** After connect the Sidebar "Schema & Tables" section renders two adjacent `<select>`s — Schema and Table. Table options are labelled `<name> · N cols [M]|[D]` with M/D suffixes if the table participates in an auto-detected master/detail pair. On change → hash-navigate to that table. ✔
10. **Master/Detail auto-detection (2-path literal + FK):** On connect, `GET /schema`, and `POST /schema` switch, the server returns `masterDetailPairs[] = {master:{name,primaryKeys[]}, detail:{name, primaryKeys[], matchingPrefix[]}, via}`. Detection matches: detail composite PK (≥2 cols); master PK equals prefix of detail PK (all-but-last). Path A literal name match; Path B via FK graph walking on detail.foreignKeys[] to the master PK columns in order. ✔
11. **Master row select → header UI state:** On browsing any master table:
    - Table has a first `Select` column with a button "Use as header" on every row.
    - Click → one row is selected (✓ Selected); other master rows are **excluded from presentation** (hidden, not rendered).
    - Selected master row's Edit & Delete buttons are set `disabled=true` (greyed, tooltip for why); banner "+ New Row" also disabled.
    - Below master UI a green-subordinate `.detail-browser` section appears, with prefix chips `<prefixCol> = <value>`, its own pager, and rows fetched with `filter.<prefixCol[i]>=<masterPk[i]>` for each prefix column so rows are constrained to matching keys.
    - Clear selection button (or click again on ✓ Selected) restores full 3-row browse, re-enables buttons, removes detail section. ✔
12. **Single-selection enforcement:** `state.master` is a single scalar object (or null). Clicking another master row replaces selection, not stacks. Navigating away from master table, changing schema, signing out, or disconnecting all reset state.master=null. ✔
13. **Row filter API:** `GET /tables/:t/rows?filter.<col>=<val>&…` ANDs equality, validates column names against table.columns[] (400 VALIDATION on unknown), passes values through typedCoerce for the column, uses parameter position-safe binding (filters first, then LIMIT/OFFSET as $(N+1)/$(N+2)). Example: filter.category_id=1 returns 3 rows for categories id=1; filter.XXbad=1 returns 400 VALIDATION code "Unknown filter column: XXbad". ✔
14. **PK visual distinction:** All PRIMARY KEY column headers (any table, single or composite) show 🔑 key icon + bold amber name + amber gradient background + solid amber bottom border; corresponding data cells use bold amber tabular-nums + 2px left amber accent bar + light amber tint. Selected-as-header row has blue highlight. ✔
15. **Data-type + nullable tooltips:** Every `<th>` column header carries a multi-line native HTML title= listing Type, Class, Nullable, Max length, Numeric precision/scale, Default, IDENTITY (each only if not null/undefined). Also visible right-side `.type-tag` pill with `<typeClass> · NULL/NOT NULL` for zero-hover visibility. ✔

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
  console.log("masterDetailPairs NON-EMPTY FK detection:", j.masterDetailPairs && j.masterDetailPairs.length ? 'OK ('+j.masterDetailPairs.length+' pairs, via='+j.masterDetailPairs[0].via+')' : 'FAIL empty');
  H["X-PG-Conn-ID"]=j.connectionId;

  console.log("\n--- admin: schema switch (public->public idempotent)");
  r = await fetch(base+"/api/interpreter/schema",{method:"POST",headers:H,body:JSON.stringify({schema:"public"})});
  j = await r.json(); console.log("status",r.status,"connection.schema",j.connection.schema,"version",j.version);
  console.log("  masterDetailPairs on GET schema: via second confirm =", j.masterDetailPairs && j.masterDetailPairs.length && j.masterDetailPairs[0].via);

  console.log("\n--- rows: categories (3), category_items (6), filter.category_id=1 (expect 3 Apple Banana Tomato), filter.category_id=3 (expect 1 USB-C), bad filter -> 400 VALIDATION");
  async function rows(q){ return fetch(base+'/api/interpreter/tables'+q,{headers:H}).then(r=>r.json().then(j=>({s:r.status,data:j}))); }
  let rr = await rows('/categories/rows?limit=20');                        console.log('categories total:', rr.s, rr.data.total || rr.data.data && rr.data.data.totalRows || '?', 'rows:', rr.data.rows && rr.data.rows.length || (rr.data.data && rr.data.data.rows && rr.data.data.rows.length));
  rr = await rows('/category_items/rows?limit=50');                       console.log('category_items full:', rr.data.totalRows || rr.data.data && rr.data.data.totalRows, 'pk:', JSON.stringify(rr.data.primaryKeys||rr.data.data&&rr.data.data.primaryKeys));
  rr = await rows('/category_items/rows?limit=50&filter.category_id=1');  console.log('filter cat_id=1 total:', rr.data.totalRows || rr.data.data && rr.data.data.totalRows, 'names:', (rr.data.rows||(rr.data.data&&rr.data.data.rows)||[]).map(r=>r.name).join(', '));
  rr = await rows('/category_items/rows?limit=50&filter.category_id=3');  console.log('filter cat_id=3 total:', rr.data.totalRows || rr.data.data && rr.data.data.totalRows, 'names:', (rr.data.rows||(rr.data.data&&rr.data.data.rows)||[]).map(r=>r.name).join(', '));
  rr = await rows('/category_items/rows?filter.XXbad=1');                 console.log('bad filter XXbad:', rr.s, 'code=', rr.data.code, 'msg=', rr.data.error);

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

## 12. Time elapsed for each delivery block

### Delivery block 1 (auth, schema switch, versioning, admin users page)
Task start → finish (including auth design, schema listing & switch, version file, rewrite of login card + shell + admin users page + account modal + SPEC update):

**Total: ~2 hours 45 minutes elapsed wall-clock.**
  - planning / architecture / reading current sources: ~20 min
  - auth.js + users.json seed + session issue + role enforcement: ~35 min
  - interpreter.js schema list/switch + availableSchemas on connect: ~15 min
  - server.js wiring: routes, withSession middleware, version, users-table CRUD gate: ~30 min
  - SPA rewrite: login card shell rendering, sign out, account modal, admin users mgmt page, sidebar nav sections + schema selector dropdown, version pill: ~50 min
  - syntax checks / server restart / backend HTTP smoke / browser E2E: ~15 min
  - updating SPECIFICATION.md itemized sections 1–12: ~20 min

### Delivery block 2 (master/detail auto-detect + UI, Table selector, PK distinction, tooltips, row filter API)
**Total: ~3 hours 15 minutes elapsed wall-clock (this delivery block).**
  - planning / design: pair detector 2 paths + filter API + table selector layout + PK visual palette + tooltip text content: ~25 min
  - interpreter.js: `buildFilteredSql`, `listRows` (extended with filters + safe param positions), rewrite `detectMasterDetailPairs` (literal match + FK-walking ordered mapping): ~40 min
  - server.js: `masterDetailPairs` envelope in 4 interpreter responses, rows endpoint parses `filter.<col>` querystring, filter-column name validation 400: ~30 min
  - sample Postgres master/detail fixtures (categories ↔ category_items; car_instance/part etc.): ~20 min
  - SPA app.js: sidebar Table selector next to Schema, M/D chips in sidebar + combo, PK column tooltips + amber distinction, master page render with Select column / "Use as header" buttons, detail browser section + prefix chips + filter querystring + independent pager, single-selection state machine + disabled edit/delete on master header row: ~70 min
  - SPA app.css: append md-chips (M/D colour pills), column PK styles, row-selected-master highlight, detail-browser green card + head/pager layout, type-tag pills: ~15 min
  - backend syntax smoke + 8-assertion HTTP node smoke (login / connect / schema / 4 rows / filter 1 / filter 3 / bad 400): ~10 min
  - integrated browser E2E (login / connect sample_db / Table selector → car_instance / click "Use as header" → 4→1 row render + Edit/Delete disabled + 2-row constrained detail subordinate → ✓ / sample_db 2 master/detail pairs auto-detect / clear selection): ~15 min
  - bug fixes: `h` shadow crash in setAlert hints.forEach, detail browser prefix filter by master.col instead of detail.prefixCol: ~10 min
  - updating SPECIFICATION.md (Goals 6–9, layout refs, DB reference fixtures, 6.3 sidebar UI, 7.3 filters / 7.4 detector / 7.5 PK visuals, API surface, 9.6–9.8 user journeys, 9 acceptance items, extended smoke, block-2 time): ~20 min
