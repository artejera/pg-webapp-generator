# Itemized Specification — `HotY` / Postgres DDL → Webapps + Live Interpreter

## 1. Primary goals (verbatim from the driving requests)

**Goal A (original, code generation):** Build a generator of standalone webapps that takes Postgres connection inputs (hostname, port, dbname, user, password, schema) and produces a full Express webapp implementing **CRUD interactions for every table** in the DDL: one dynamic webpage per table with paginated row listing + interactive paging + create/edit/delete per row + GUI error banners.

**Goal B (new live mode + reconnect UX):** Provide a way to **interact with tables of a database schema without generating any code on disk**, by interpreting the DDL (schema metadata) at runtime — and additionally make the credentials page **re-enterable at any moment** from any page / any table.

Secondary design constraints derived from feedback and implemented uniformly across both modes:
- Raw `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` (and any other Postgres internal / SCRAM / connection strings) must **never** appear in the GUI.
- Every auth/connection/constraint failure is surfaced as a readable `{title, detail, hints:[...]}` structure rendered as an in-UI banner + bulleted hints.
- Credentials & re-entry: the credential dialog is shared by both modes and you can **open it from anywhere** — landing page button, "Change credentials" persistent header button, connection pill click, sidebar empty-state inline link, or automatically on any `401 NO_CONN` response.

## 2. Project layout (tracked source files)

```
/home/artejera/Documents/trae_projects/HotY
├── .gitignore
├── package.json                       # npm start = node generator-ui.js (Generator UI + interpreter both served here)
├── generator-ui.js                  # Express server: routes for both modes + static files
├── interpreter.js                 # Mode-B backend: live DDL interpreter (no codegen, generic SQL)
├── src/generator/
│   ├── cli.js                      # Original CLI entry (legacy)
│   ├── schemaExtractor.js        # Mode-A schema extract via pg + shared classifyColumnType / quoteIdent helpers
│   ├── backendGenerator.js       # Mode-A codegen for server.js / db.js / routes.js / .env.example
│   └── frontendGenerator.js    # Mode-A codegen for HTML/JS per-table pages + banner renderer
├── generator-ui/                 # Mode-A landing + shared credential dialog assets (also used by Mode B)
│   ├── index.html
│   ├── css/app.css
│   └── js/dialog.js              # Legacy dialog (Mode B re-implements it inside the SPA w/ dual-mode + connect-reconnect flows)
└── interpreter-ui/               # Mode B SPA (served at /app)
    ├── index.html             # Shell: top bar + sidebar + main slot + welcome card
    ├── css/app.css        # Dark themed styles, modals, tables, banners (same look as generator-ui)
    └── js/app.js         # SPA driver: state, API client, dual-mode dialog, sidebar, generic CRUD, banners
```

## 3. Commands & URLs

| What | Command / URL |
|---|---|
| Start the single-server that hosts **both** modes | `cd /home/artejera/Documents/trae_projects/HotY && npm start` (default port `3001` via `PORT=3001`) |
| Generator UI landing (Mode A entry) | `http://localhost:3001/` → "Connect to PostgreSQL & Generate" |
| Live interpreter SPA (Mode B entry)  | `http://localhost:3001/app` → header always-visible "Change credentials" + connection pill |
| Previously-generated sample valid webapp fixture | `generated-webapp-ui/` (standalone, port `3000`) — was running during testing |
| Broken-credentials webapp fixture (demonstrates readable banners, no SCRAM leak) | `generated-webapp-ui-bad/.env` (blank `PGPASSWORD`) — served on port `3002` in earlier tests |

Local Postgres used as the smoke-test target throughout (only used as reference fixture, never committed into git):

```
Host:     127.0.0.1
Port:     5432
Database: testdb
Schema:   public
Role:     postgres
Password: test123          # pg_hba.conf on this machine actually trusts local sockets; real SCRAM errors still correctly translated via emulator fixtures (non-existent role = 28000, bad DB = 3D000, ECONNREFUSED, ENOTFOUND, timeout).
Tables:   orders (0 rows) · products (2 rows, PK=sku uuid) · users (8 rows, PK=id serial)
```

## 4. Mode A — Standalone webapp generator (original scope)

### 4.1 Inputs (Generator UI dialog → POST `/api/generate`)

| Field | Default | Required | Notes |
|---|---|---:|---|
| Hostname                | `localhost` | ✔ | DNS/IP |
| Port                    | `5432`      | ✔ | 1–65535 integer |
| Database                | —           | ✔ | e.g. `testdb` |
| User                    | `postgres`  | ✔ | Postgres role |
| Password                | —           | — | Stored **only** into generated `.env.example` and never into git-tracked sources (`.gitignore` excludes `.env`) |
| Schema *(advanced)*     | `public`    | ✔ | Postgres schema |
| Output dir *(advanced)* | `generated-webapp` | ✔ | Relative to project root |
| Overwrite *(advanced)*    | `false`     | — | Danger zone; deletes+recreates output dir |
| SSL *(advanced)*         | `false`        | — | `PGSSLMODE=require` in output |

### 4.2 Generation process

1. `schemaExtractor.extractSchema(conn)` via node-postgres:
   - `information_schema.tables` → base tables only (not views).
   - `information_schema.columns` → type, nullable, default, identity, length/precision.
   - PKs via `table_constraints · key_column_usage`.
   - FKs via `table_constraints · constraint_column_usage`.
2. Password is propagated from extract → generator so the generated `.env.example` is **prefilled** — the original "SCRAM…" bug was caused by placeholders being written; this is now fixed.
3. Write `N` source files into the output directory using `{backend,frontend}Generator.js` template strings:
   - `package.json` / `.env.example` (with real credentials) / `.env` gitignore hook.
   - `server.js` — startup health probe (explicit `pool.connect()` before listen → prints big `!!! [db] Could NOT connect to Postgres.` CLI block with bullet hints if credentials are bad).
   - `db.js` — `typedCoerce`, `validateCredentials`, `classifyConnectionError`, `translateConnectionError`, `healthCheck`, credential-guard wrapper around every CRUD, parameterized SQL per table.
   - `routes.js` — one route per table per CRUD verb with pipe-encoded PK composite keys.
   - `views/index.html` + per-table HTML pages + JS + CSS (paginated listing + Create/Edit/Delete modals + banner renderer with hints bullets).

### 4.3 Output run instructions

```bash
cd generated-webapp      # whatever output dir you chose
cp .env.example .env     # already prefilled; if needed, edit PGPASSWORD here
npm install
npm start                # → http://localhost:3000  (default)
```

### 4.4 Mode-A error-surface contract (per table page + /api/health)

| Condition | Behaviour |
|---|---|
| Blank / missing env credentials | Generated server startup warning banner + `/api/health` → 503 `ENV_MISSING` with exact missing field name; listRows → 503 with hints; GUI renders "Database credentials are missing or incomplete…" not raw SCRAM. |
| Wrong password / bad role (SCRAM/`28P01`/`28000`) | Classified into 503 *Postgres authentication failed* + hints; raw SCRAM string is stripped. |
| Unknown database `3D000` | 503 "Database does not exist"; hints. |
| `ECONNREFUSED` / ENOTFOUND / ETIMEDOUT | 503 readable title + hints. |
| NOT NULL / UNIQUE / FK / CHECK constraints | 400/409 with constraint `detail` preserved; rendered inside GUI banner. |
| `/api/health` | 200 `ok` when connected; 503 with `hints[]` when not (so reverse proxies / health probes can detect it). |

## 5. Mode B — Live DDL interpreter (no code generation)

### 5.1 Persistence model for credentials

- **No code is written to disk.** No `.env`, no generated JS, no HTML files.
- Credentials live in server memory inside `interpreter.js → connections: Map<connectionId, {pool, schemaObj, connDetails}>` keyed by a random 128-bit hex `connectionId` (UUID-class entropy).
- The password is **masked out of every JSON response** via `maskPassword(conn)` (returns host/port/db/user/schema/ssl/id but no password).
- Client only ever holds the opaque `connectionId` (kept in `localStorage.pg.connId`) and re-sends it on every API call via header `X-PG-Conn-ID`. This avoids ever saving passwords to browser persistent storage across restarts.
- Server cleans up on `POST /disconnect` → `pool.end()` + `connections.delete(id)`.

### 5.2 Runtime DDL interpretation flow

1. Client posts full credentials + schema to `POST /api/interpreter/connect`.
2. Backend:
   - Validates fields (hostname/port/db/user) → 400 `VALIDATION` with exact missing field.
   - Creates a real `pg.Pool` and runs `SELECT 1` against it — **this is where auth failures get caught and classified before any session is stored. If connect fails, no session stored, pool immediately `.end()`ed, returns classified 503 `{error, code, hints[]}`.
   - `extractSchemaLive(pool, schema)` via `information_schema` (same shape as mode-A, 1:1 column / PK / FK coverage — so mode A and mode B render identical per-table semantics).
   - Stores the session → returns masked connection, `connectionId`, table list.
3. SPA driver saves `connectionId` → `localStorage.pg.connId` and auto-navigates to the first table in the schema (or `location.hash` if already set).
4. On every subsequent call:
   - Server extracts `X-PG-Conn-ID` header, looks up session, **requireConnection(req) guard** → throws `401 NO_CONN` with hints if expired/absent.
   - SPA treats `401 NO_CONN` uniformly: auto-opens the credential dialog in "Interact live" mode (transparent reconnect flow).

### 5.3 Generic SQL driven purely by interpreted metadata

Every CRUD function builds parameterized SQL from the column/PK metadata extracted at step 2 — zero per-table codegen, zero template strings per table:

| Operation | Metadata used | Shape |
|---|---|---|
| List rows (paginated) | `quotedName`, effective PK ordering | `SELECT * FROM qTbl ORDER BY ctid LIMIT $1 OFFSET $2` + `COUNT(*)`; returns `{rows[], total, pageSize, page, typeMap, primaryKeys, hasExplicitPk, __rowKey}`. |
| Get single row | explicit PK, composite key decode (`splitKey`) | `SELECT * FROM qTbl WHERE pk1=$1 AND pk2=$2 …` → 400 if no explicit PK. |
| Create | `allowedCols()` filter: drops `GENERATED ALWAYS AS IDENTITY`; parameterized `INSERT … RETURNING *` via `typedCoerce`. | `INSERT INTO qTbl (colA, colB) VALUES ($1, $2) RETURNING *` → 409 on dup, 400 on missing not-null. |
| Update | explicit PK only; drops PKs + ALWAYS identity from SET list. | `UPDATE qTbl SET colA=$3 WHERE pk1=$1 AND pk2=$2 RETURNING *`. |
| Delete | explicit PK only. | `DELETE FROM qTbl WHERE pk1=$1 … RETURNING *`. |

Row identity for composite PKs: **pipe-encoded** URL-safe `encodeKey([pkVal1, pkVal2], pkCols)` → `encodeURIComponent("pk1|pk2")`, matching mode A exactly — so the same `splitKey` function handles both modes identically.

### 5.4 Column type classification

Used by: typed HTML inputs in create/edit modals, sorted cell formatting (`mono`/`null`/`bool`/`num`/`json`/`datetime`). `classifyColumnType(col)` is the shared helper exported from schemaExtractor.js and reused **verbatim** between mode A template codegen and mode B interpreter.

| Combined `data_type:udt_name` matches | `typeClass` | HTML input |
|---|---|---|
| `bool` | `boolean` | `<select>` NULL / true / false |
| `int` / `serial` / `oid` | `integer` | number text → `parseInt` |
| `numeric` / `decimal` / `float` / `double` / `real` | `number` | number text → `parseFloat` |
| `json` / `jsonb` | `json` | `<textarea>` → JSON stringify-roundtrip |
| `bytea` / `blob` | `binary` | textarea |
| `date` / `time` / `timestamp` / `interval` | `datetime` | `<input type="datetime-local">` → ISO |
| `uuid` | `uuid` | mono text |
| `text` / `char` / `cidr` / `inet` / `xml` / `money` / `name` | `text` | textarea for long, input for short |
| `array` | `json` | textarea JSON |

### 5.5 `typedCoerce` in interpreter

Inlined into [interpreter.js](file:///home/artejera/Documents/trae_projects/HotY/interpreter.js#L7-L45) as self-contained module-level helpers. Keeps typed inserts/updates byte-identical to mode A so both modes' CRUD behaves the same for the same data.

## 6. Shared credential UX (both modes, always re-enterable)

### 6.1 Credential dialog (dual-mode)

Built into the SPA driver at `interpreter-ui/js/app.js → openCredentialDialog`. Callable from anywhere; always rendered on top with Esc + backdrop-click to close.

**Header:** Connect to PostgreSQL · close ×  
**Body order:** Alert host (for live validation results) → progress bar → mode picker → form fields → advanced toggle → submit result card.

**Mode picker (always visible):** two clickable selector cards (radio-style):
- **🕹️ Interact live (no code) — on submit: `POST /api/interpreter/connect`, saves `pg.connId`, closes dialog, reloads schema + current table.
- **📦 Generate a standalone webapp** — on submit: `POST /api/generate`, shows result card with file count, output dir, and an inline copy-paste run-command block of `nextSteps[]` (cd / cp .env / npm install / npm start).

**Form fields:** Host, Port + Database (row2), User + Password (row3). Advanced: Schema, Output, Overwrite (check), SSL (check). Prefilled from `localStorage.pg.*` + last-saved connection (password is only optionally reused via `reusePassword` flag — never forced if you want a clean prompt).

**Submit text changes based on mode:** `Connect & Interact` / `Connect & Generate`. Also shows spinner during network.

### 6.2 "Credentials page re-enterable at any moment" (specific requirement)

| Entry point | When visible | Where in code |
|---|---|---|
| **Landing-page button** `Connect to Postgres` (big primary) | When `state.connectionId` is empty. | SPA `boot()` + welcome card CTA. |
| **Header button** `Connect to Postgres` / `Change credentials` (label changes). **Always visible** on every page / every table / every state. | ✔ Always. Persistent right-top inside `.topbar`. | Interpreter shell HTML + `#btn-connect` click handler. |
| **Connection pill click** (shows `user@host:port/db · schema X" chip) | When connected (green dot) or disconnected (grey dot). Click anywhere on pill. | `#conn-pill` click handler reopens dialog in Interact-live mode with last creds prefilling. |
| **Disconnect button** | Only when connected — drops session + shows welcome. | `#btn-disconnect` → `POST /api/interpreter/disconnect` + `clearConnection()`. |
| **Sidebar empty-state inline link** "Connect to Postgres" inside the dashed "Not connected" message | Not connected. | `renderSidebar()` empty-branch anchor. |
| **Auto on any 401 `NO_CONN`** | Any list/get/create/update/delete returns 401. | Every call piped through `api()` → on 401 status, dialog opens auto in "Interact live" mode → on success retries state. |
| **Manual re-entry mid-flow** (exactly your request) | At any time, even while on `orders` / `users` rows view — just click the pill or the header button, dialog opens prefilled, submit OK = immediate reconnect + schema sidebar + current page refresh. | Built into header; no per-page wiring needed. |

### 6.3 Sidebar + main-table shell (connected state)

```
[Top bar]  brand · connection-pill(green) · [Change credentials] [Disconnect]
[Sidebar]  Schema tables h3
           · orders (7 cols) ← currently active highlight
           · products (6 cols)
           · users (6 cols)
[Main]     Page header: public.users · PK: id · 6 columns
           [+ New Row]
           Pager: « First  ‹ Prev   Next ›   Last »   rows-per-page   Showing 1-8 of 8 · Page 1 / 1
           Table: id/PK-int  username/text  email/text  is_active/bool  created_at/datetime  profile/json  Actions[Edit Delete]
           (alert banners rendered above pager on any DB error)
```

### 6.4 CRUD modals (generic from columns)
- **Create** / **Edit**: 2-column grid of typed editors; each row shows column name, its typeClass / maxLen / default / identity in a meta chip, red star if NOT NULL, and a nullable "Set to NULL" checkbox that disables the input.
- Identity + PK columns are **locked (omitted)** from edit forms; ALWAYS-identity are omitted from create forms.
- Submit errors → red banner inside modal with title/detail/hints; fixes re-submitted into same dialog without close.
- **Delete**: confirmation modal lists PK values in red-bordered bullets; returns permanent-delete feedback then re-renders table.

## 7. Uniform error classification (both modes, no raw SCRAM leak)

| Error class | Postgres / node code | HTTP | Interpreter JSON & GUI banner title | Default hints |
|---|---|---:|---|---|
| Trust/SCRAM/role bad | `28P01`, `28000`, message contains SCRAM | 503 | Postgres authentication failed | Confirm role password matches; confirm role exists |
| No database | `3D000` | 503 | Database does not exist | Set Database name to real one |
| Port closed | `ECONNREFUSED` | 503 | Could not reach Postgres | Verify host/port; firewall/secgroups |
| Bad DNS | `ENOTFOUND`, `EAI_AGAIN` | 503 | Unknown database host | Check hostname |
| Bad net / SSL hang | `ETIMEDOUT`, timeout message | 503 | Database connection timed out | Host/port reachable? |
| Missing password / env (generated) / required field missing | custom `VALIDATION` | 400 | Please fix the form + exact missing field | Naming the specific field in detail |
| No active session | `requireConnection` guard | 401 | `NO_CONN` | Open credentials dialog + reconnect; session may have timed out on server |
| Duplicate (UNIQUE / PK) | `23505` | 409 | Raw Postgres detail preserved |
| FK violation | `23503` | 409 | Raw Postgres detail preserved |
| Not-null violation | `23502` | 400 | Raw Postgres detail preserved, column name exposed via banner |
| CHECK / exclusion | `23514` | 400 | — |
| Unknown column / bad cast | `42703`, `22P02/001/003/007/008/012` | 400 | — |
| Unknown table after connect | (internal `NO_TABLE`) | 404 | Table not found in current schema |

Verified for interpreter mode via HTTP smoke script: for every negative case above, `JSON.stringify(response)` is **guaranteed not to match** `/SCRAM-SERVER-FIRST-MESSAGE/` and **always** has an `hints:[]` array when applicable and human-readable title + separate detail line.

## 8. HTTP API surface

### 8.1 Generator UI server (both modes): `generator-ui.js`

Served from the same Express app (port `3001` by default):

**Static mounts**
```
/                       → static generator-ui/       (Mode A landing + dialog.js)
/app                    → sendFile interpreter-ui/index.html
/app/**                 → static interpreter-ui/     (Mode B SPA + its CSS/JS)
```

**Mode A (codegen)**

| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/api/health` | — | `{status:'ok', time}` |
| POST | `/api/generate` | `{host,port,database,user,password,schema,output,overwrite,ssl}` | `{ok:true, totalTables, totalFiles, outputDir, relativeOutputDir, files[0..200], nextSteps:[4-line run-commands]}` |

**Mode B (live interpreter)** — **every endpoint except /connect either requires the `X-PG-Conn-ID` header or returns 401 `NO_CONN`**.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET  | `/api/interpreter/status` | header | `{connected:bool, connection:maskedConn?, schemaTables:[name,schema,columns,pks,hasExplicitPk,fks]}` |
| POST | `/api/interpreter/connect` | `{host,port,database,user,password,schema,ssl}` | `{connected:true, connectionId, connection:maskedConn, schemaTables:[...]}`  *or* classified 503 |
| POST | `/api/interpreter/disconnect` | header + optional `body.connectionId` | `{ok:true}` (idempotent) |
| GET  | `/api/interpreter/schema` | header | `{schema, generatedAt, connection:maskedConn, tables:[name, quotedName, columns[], pks, effectiveKeys, hasExplicitPk, fks]}` |
| GET  | `/api/interpreter/tables/:table/meta` | header | Single table meta |
| GET  | `/api/interpreter/tables/:table/rows?limit=20&offset=0` | query + header | Paginated list: `{rows[{…,__rowKey}], total, page, pageSize, typeMap, pks}` |
| GET  | `/api/interpreter/tables/:table/rows/:key` | header | `{row}` by PK (composite via pipe) |
| POST | `/api/interpreter/tables/:table/rows` | header + `{col1:val1,…}` with typed values incl null | `201 {row}` (RETURNING *) or 400/409 classified |
| PUT  | `/api/interpreter/tables/:table/rows/:key` | header + partial update payload | `{row}` or classified |
| DELETE | `/api/interpreter/tables/:table/rows/:key` | header | `{deleted:true, row}` |

All interpreter errors go through `sendInterpreterError(res, err)` which normalises shape to:
```json
{ "error": "<human readable title: detail>", "code": "<pg or custom code>", "detail": "…", "hint": "…", "column": "…", "hints": ["…","…"] }
```
and clamps status to 4xx/5xx.

## 9. Acceptance criteria (what "done" means)

### 9.1 Goal A — Generator webapp (original request, completed earlier in prior work)

1. Given valid PG connection credentials → runs codegen → standalone Express webapp output directory.
2. Output contains one page per table with paginated rows + prev/next + change rows-per-page.
3. Each row: Create (New Row), Edit, Delete operations work against live PG.
4. DB errors surfaced as GUI banners (not stack traces).
5. (Follow-up bug fix criteria) SCRAM / SASL strings never appear in the GUI under any credential-misconfiguration scenario.

### 9.2 Goal B — Interpreter + always-available credentials (most recent request)

1. **No codegen:** Interpreter mode works by reading metadata at runtime, no per-table files on disk. ✔
2. **Connect + schema sidebar:** Submit valid `testdb` creds → sidebar immediately lists `orders/products/users` (3 tables) with column counts and active highlight for the current table. ✔
3. **Generic per-table CRUD:** Click `users` → `Showing 1-8 of 8`, `+New Row` → valid create → auto-navigate back + new row visible; Edit row → Update → new value in table; Delete row → confirmation + row removed + `deleted:true`. ✔
4. **Pagination:** Rows-per-page selector (20/50/100/200) + « First / ‹ Prev / Next › / Last » all work. ✔
5. **Re-enter credentials at any moment (explicit user requirement):** from any page / any table, the top-right header always shows **"Change credentials"** clickable button; connection pill is clickable; submit bad credentials → readable red alert inside dialog (no page reload); submit good credentials → dialog closes, connection chip & sidebar & current-page data all refresh to new DB. ✔
6. **Auth failures remain human-readable:** No response body rendered in GUI ever matches regex `SCRAM-SERVER-FIRST-MESSAGE`; negative cases all surface as `{Postgres auth failed / DB does not exist / Could not reach Postgres / connection timed out}` plus bulleted hints. ✔
7. **401 auto reconnect:** Any list/get/create/update/delete that returns 401 `NO_CONN` triggers the dialog to reopen automatically. ✔
8. **Consistency with Goal A:** Same type classification, same PK encoding, same typedCoerce, same error codes → so a row inserted in Mode B behaves identically to a row inserted via the generated webapp and vice versa. ✔

## 10. Manual end-to-end acceptance-test procedure

**Prerequisites**
```bash
pg_isready -h 127.0.0.1 -p 5432 -d testdb
cd /home/artejera/Documents/trae_projects/HotY
npm start
```

**Scenario A — interpreter mode happy path (Goal B)**
1. Open `http://localhost:3001/app` → welcome card.
2. Click Connect to Postgres. Dialog appears. Mode cards: Interact live (preselected) + Generate.
3. Fill Host=127.0.0.1, Port=5432, DB=testdb, User=postgres, Pass=test123, Schema=public, Interact live mode → **Connect & Interact**.
4. Expect sidebar `orders`, `products`, `users`, green `postgres@… testdb · schema public` chip, header says "Change credentials", Disconnect button visible.
5. Click **users** → verify `Showing 1-8 of 8`, 8 rows in table, id col rendered `PK / integer / NOT NULL`, booleans as `true/false`, nulls as italic gray NULL.
6. **+ New Row** → create modal shows typed inputs; fill `username`, `email` + set `is_active=false`, `profile={"note":"smoke"}` (json typed field) → submit → banner flashes green → table re-renders with 9 rows, row created.
7. Click **Edit** on the new row → change `email` to `updated@x` → submit → table shows new email.
8. Click **Delete** → confirm → row gone, `Showing 1-8 of 8` again.
9. **Re-enter credentials at any moment (explicitly test this):** without leaving the users table, click **"Change credentials"** at top-right.
10. In the reopened dialog, change Host to `192.0.2.1` (black-hole IP, guaranteed timeout) → submit. Verify dialog *stays open* with a red banner: "Could not connect to Postgres / Database connection timed out: Connection terminated due to connection timeout" and a hint bullet "Verify host/port and network." Confirm no SCRAM substring exists anywhere in visible text.
11. Fix Host back to `127.0.0.1` → submit again. Dialog closes; sidebar re-renders with 3 tables; users page still shows 8 rows. **This is the "always re-enterable credentials page acceptance criterion. ✔
12. Click Disconnect → connection pill becomes grey, button returns to "Connect to Postgres", sidebar empty state shows inline Connect link (another entry point back to credentials page).

**Scenario B — Generate mode via same dialog (Goal A still working)**
1. Fresh `/app` tab, click Connect. Switch to **Generate a standalone webapp** mode. Notice Output/Overwrite fields now unhide, Interact-only advanced options hide correctly (mode-switch UX).
2. Use same credentials + output=`generated-webapp-smoke` + Overwrite=true → Connect & Generate.
3. Expect green success banner inside dialog + run-command code block with cd/cp/env/npm steps.
4. `cd generated-webapp-smoke && npm install && npm start` → `http://localhost:3000/` shows the same three table pages working with the exact same data semantics.

**Scenario C — Banner readability / no SCRAM leak (regression)**
1. From interpreter dialog, submit a non-existent user (`NO_SUCH_USER_xyz`).
2. Banner title = "Postgres authentication failed" + two hints. Copy the visible banner text into a case-insensitive search for `SCRAM-SERVER-FIRST-MESSAGE` / `SASL` → zero matches. ✔

## 11. Quick smoke-verify commands (reproducible, no browser)

Use these any time you want to Mode-B sanity-check without opening the browser:

```bash
# Syntax-check all edited files
node --check interpreter.js
node --check generator-ui.js
node -e "new Function(require('fs').readFileSync('interpreter-ui/js/app.js','utf8'))"
node -e "new Function(require('fs').readFileSync('generator-ui/js/dialog.js','utf8'))"

# Start the server
PORT=3001 node generator-ui.js &

# Full interpreter backend smoke
node -e '
(async () => {
  const base = "http://localhost:3001";
  let r = await fetch(base + "/api/interpreter/connect", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({host:"127.0.0.1",port:5432,database:"testdb",user:"postgres",password:"test123",schema:"public"})});
  let j = await r.json();
  console.assert(r.status === 200, "connect status");
  console.assert(j.connectionId && j.schemaTables.length === 3, "connect payload");
  const hdrs = {"X-PG-Conn-ID":j.connectionId,"Content-Type":"application/json"};
  r = await fetch(base + "/api/interpreter/tables/users/meta", {headers:hdrs});
  const meta = await r.json();
  console.log("users typeClasses:", meta.columns.map(c=>\`\${c.name}:\${c.typeClass}\`).join(", "));
  // create + get + update + delete a user row with correct columns
  r = await fetch(base + "/api/interpreter/tables/users/rows", {method:"POST",headers:hdrs,body:JSON.stringify({username:"e2e_smoke",email:"e2e@x"})});
  j = await r.json();
  console.log("create status", r.status, j.row && j.row.id);
  r = await fetch(base + "/api/interpreter/tables/users/rows/"+encodeURIComponent(j.row.id), {headers:hdrs});
  j = await r.json(); console.log("get username", j.row.username, "status", r.status);
  r = await fetch(base + "/api/interpreter/tables/users/rows/"+encodeURIComponent(j.row.id), {method:"PUT",headers:hdrs,body:JSON.stringify({email:"upd@x"})});
  j = await r.json(); console.log("update email", j.row.email, "status", r.status);
  r = await fetch(base + "/api/interpreter/tables/users/rows/"+encodeURIComponent(j.row.id), {method:"DELETE",headers:hdrs});
  j = await r.json(); console.log("delete", r.status, j.deleted);
  // Error translation smoke — no SCRAM string leak ever
  for (const [name,payload] of [["bad user",{database:"testdb",user:"no_such_user_xyz",password:"x"}],["bad db",{database:"no_such_db_abc",user:"postgres",password:"x"}],["econnrefused",{port:65432,database:"testdb",user:"postgres",password:"x"}]]) {
    r = await fetch(base + "/api/interpreter/connect", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({host:"127.0.0.1"}, payload))});
    const text = JSON.stringify(await r.json());
    console.log(name, "status", r.status, "leak?", /SCRAM-SERVER-FIRST-MESSAGE/.test(text), "has hints?", /\"hints\":\[/.test(text));
  }
})().catch(e=>console.error(e.stack || e));
'
```
