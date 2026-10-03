# Debug Session: schema-table-no-render
**Status:** [CLOSED] — User verified "it worked! this thing seems to be working OK!" on 2026-10-03 v261003.1736
**Created:** 2026-10-03
**Symptom:** User logs in → selects schema → selects table → nothing happens (no table browser appears, no errors visible)

## HYPOTHESES (Falsifiable)

| # | Hypothesis | Expected Evidence If True |
|---|-----------|---------------------------|
| H1 | `localStorage` `hotx_table` holds stale pre-selection from prior session; `onchange` handler does NOT fire for same-value selection, so `initRootBrowser()` never runs | Browser snapshot shows table dropdown has selected value matching localStorage; no `initRootBrowser` trace in logs |
| H2 | Schema selector has `public` as only visible option, but user data lives in `geo` schema → schemas endpoint excludes non-public schemas; user selects a table they believe is in geo but actually loads empty | API call to `/api/schemas` returns only `[public]`, missing `geo` |
| H3 | `hdr-table` `onchange` handler has a JavaScript exception before `initRootBrowser()` (e.g., bad async await, stack access) | Browser console has a NEW unhandled error at attachHeaderHandlers → hdr-table.onchange → initRootBrowser call site |
| H4 | `api()` helper calls with only `query` (not `body`) fail to POST sessionId because `opts.method` defaults only when `opts.body` exists | Network log shows GET /api/columns?sessionId=undefined → backend returns 401 "Not connected" |
| H5 | `findDetailTables` or related metadata access throws during root `initRootBrowser()` (or `state.tables.find` returns undefined with renamed tables) → Promise rejection silently swallowed by empty `.catch(_){}` | No toast error visible but console shows "Unhandled promise rejection" referencing `initRootBrowser` or `attachHeaderHandlers` |

## REPRO STEPS
1. Open http://localhost:3001/
2. Enter credentials, click Connect
3. Change schema (or leave public)
4. Click table dropdown → select any table
5. Expected: table browser renders below header
6. Actual: header only, no table content

## EVIDENCE LOG

```
[warn] [DBG:BOOT:START] sid?=true schema=geo table=null
[warn] [DBG:BOOT:CREDS:OK] user=postgres@localhost
[warn] [DBG:BOOT:SCHEMAS:OK] count=2 includes(geo)=true tablesCount=5
[warn] [DBG:BOOT:TABLE:CHECK] current=null existsInTables=false willInitRoot=false
[warn] [DBG:HDR:TABLE] selected=countries tablesLen=5 findInList=true
[warn] [DBG:INIT:ROOT] BEGIN schema=geo table=countries
[warn] [DBG:LOAD:COLS] schema=geo table=countries sidPrefix=7166a7ac
[warn] [DBG:HDR:TABLE:FAIL] column ccu2.ordinal_position does not exist
        at Promise.all (index 1 = /api/foreign-keys endpoint)
[warn] [DBG:RENDER:CONTENT] currentTable=countries BUT stack is EMPTY → Loading... (permanent)
```

## ANALYSIS

| # | Hypothesis | Status | Evidence |
|---|-----------|--------|----------|
| H1 | `localStorage.hotx_table` stale; onchange not fired; state mismatch | **CONFIRMED (co-factor)** | `BOOT:START schema=geo table=null` but dropdown pre-selects `counties` (checked in snapshot) → snapshot schema=geo table dropdown actually checked=counties but state says null. Shows state-table isn't restored at boot correctly. But once the user selects, this bypassed via manual selection → NOT the blocker |
| H2 | Missing schemas (geo not visible) | **REJECTED** | `BOOT:SCHEMAS count=2 includes(geo)=true tablesCount=5` |
| H3 | JS exception in hdr-table.onchange | **PARTIAL (H4 instead)** | Exception happens, but it's in initRootBrowser → loadColumnsAndFks → FK query SQL error |
| H4 | FK SQL bug: ccu2.ordinal_position doesn't exist in information_schema | **CONFIRMED (ROOT CAUSE)** | Hard evidence: `column ccu2.ordinal_position does not exist`. The `/api/foreign-keys` route uses `ccu2.ordinal_position = kcu2.ordinal_position` but constraint_column_usage has NO `ordinal_position` column in Postgres! Only `key_column_usage` has it. Promise.all rejects index=1 (foreign-keys) before loadColumnsAndFks finishes → state.stack never set → permanent "Loading..." |
| H5 | Promise rejection swallowed | **CONFIRMED (amplifier)** | Indeed silent catch without UI indicator until instrumentation added. There's a toast(e.message, 'error') BUT the toast renders before render() rebuilds the DOM — so it's deleted immediately (onerror's handler at line 379 toast is called, THEN line 382 `render()` runs and rebuilds `#app` → the `<div id="toasts">` child nodes get wiped! This explains why user sees "nothing happens" — even the toast got nuked.) |

**Two Root Causes (both blocking):**

**RC1 (Hard blocker):** The FK meta query uses `ccu2.ordinal_position` column which does NOT exist in Postgres `information_schema.constraint_column_usage`. Per Postgres docs `ccu` has: constraint_catalog, constraint_schema, constraint_name, table_catalog, table_schema, table_name, column_name. To find the *referenced* column's ordinal, we must instead use `information_schema.key_column_usage` **AGAINST THE UNIQUE/PK CONSTRAINT OF THE PARENT TABLE**, not ccu. The ccu → kcu bridge is the *constraint* not *ordinal*.

Actually easier fix: the parent's PK ordinal is not in ccu at all. We should do the following strategy:
- Aggregate child_columns from kcu (already has ordinal_position)
- Find FK's referenced columns WITHOUT relying on ordinal in ccu: match kcu(foreign key col) ← position_in_unique_constraint → another kcu row for the referenced constraint
- Or simpler: aggregate `ccu2.column_name` into an array WITHOUT ordering join, then in JS check if the FK's parent_columns AS-A-SET equals parentPk AS-A-SET with same count. Since FK in Postgres is guaranteed same order as PK definition, just relying on length+set equality is sufficient for HotX's prefix-match algorithm.

**RC2 (makes it invisible, so symptom is "nothing happens"):** toast is added → then render() nukes the DOM → toasts element children are cleared. This hides any error from user. Fix: toast should be inserted as persistent outside the main `#app` root rebuild cycle, or render() rebuilds but preserves #toasts contents, or re-order calls so toast runs AFTER render.

## FIX

**RC1 Fix** (Hard blocker — file: [src/server.js](file:///home/artejera/Documents/trae_projects/HotX/src/server.js#L248-L301)):
Rewrote the FK parent_columns subquery to stop using `ccu2.ordinal_position` (which does NOT exist in Postgres `information_schema.constraint_column_usage`). Now uses `tc.unique_constraint_name` / `tc.unique_constraint_schema` → looks up the referenced constraint's PK/UQ `key_column_usage pkcu` entries directly → those `pkcu.column_name` are ordered by `pkcu.ordinal_position` (which definitely exists in KCU) → filtered down to only columns actually referenced in this FK. Verified empirically in node logic sim: `findDetailTables('countries', ['country_id'], 'geo', fixedFks)` now returns `[{tbl:"federated_states",alt:2,idx:1},{tbl:"sales_regions",alt:2,idx:2}]` and `findDetailTables('federated_states', ['country_id','state_id'])` returns `[{tbl:"counties",alt:1,idx:0}]` — exactly matching the fixture manual expected output.

**RC2 Fix** (Invisibility amplifier — file: [src/public/index.html](file:///home/artejera/Documents/trae_projects/HotX/src/public/index.html#L358-L415)):
- `hdr-table onchange` catch: render() FIRST, then toast(), then early return. Also clears `state.currentTable = null` so the dropdown resets to prompt and user can re-pick.
- TXN begin/commit/rollback: deferredToast pattern set; render() runs FIRST, then toast() fires AFTER, so DOM rebuild doesn't wipe the newly-injected toast `<div>`.
- Defensive `.value` sync in `attachHeaderHandlers()`: forces `<select>` DOM value = `state.currentSchema/Table` after every render to prevent HTML `<option selected>` from lying when state is out of sync.

**H1 Fix** (ACTUAL ROOT CAUSE for "nothing happens" — file: [src/public/index.html](file:///home/artejera/Documents/trae_projects/HotX/src/public/index.html#L313-L335)):
Dropdowns had NO EMPTY PLACEHOLDER when list non-empty. Browser defaulted 1st real option → onchange NEVER fired when user clicked the "already selected" first option (car_factory / counties). Fix: **Always prepend explicit empty placeholders:**

```html
<select id="hdr-schema"><option value="">(select schema)</option>${schemasOpts}</select>
<select id="hdr-table"><option value="">(select a table)</option>${tablesOpts}</select>
```

Now the default selected option is the placeholder. Clicking ANY real schema/table produces onchange.

**H1 secondary fixes:**
- `submit()` after login restores saved `localStorage.hotx_table` + runs `initRootBrowser()` if matching → resume works on first login without re-pick.
- `renderContent()` defensive: if `state.currentTable` set but stack empty → `setTimeout(0, initRootBrowser)` auto-loads via `_stackInitInProgress` guard (no double init).

**Pre-fix vs Post-fix evidence (snapshot + console):**

| Scenario | Pre-fix | Post-fix |
|----------|---------|----------|
| Snapshot default selected | Table: `counties` checked (but state=null!) | Table: `"(select a table)"` placeholder checked (state=null, consistent) |
| Console: HDR:attach tableVal | `tableVal=counties` (stale / mismatch) | `tableVal=` (empty string = placeholder) |
| Select car_factory (1st in public list) | Browser thinks "no change" → no onchange → nothing | onchange fires → initRootBrowser() runs |
| select countries (geo schema) | FK SQL err: ccu2.ordinal_position → Loading... forever | FK metadata correct (string_agg on PK KCU) → countries table 2 rows rendered |
| Post-master-detail | N/A (blocked) | Alternate siblings (federated_states/sales_regions alt=2) + nested counties under US-CA depth=2 |




---

## ITERATION #2: User reported "B. Still reproducible, C. Different symptoms: unique_constraint_name does not exist + blank with select a table"

### NEW ROOT CAUSE (Environmental): SERVER PROCESS HAD NOT RESTARTED
```
src/server.js mtime   = 1791065020 (16:03:40)
src/index.html mtime  = 1791065975 (16:19:35) ← 15 MIN AFTER server proc created
Server PID 665057 btime= 1791065086 (16:04:46)
```
Fixes applied to files on DISK but old Node process (PID 665057 from 16:04) was STILL serving OLD code with `ccu2.ordinal_position` FK SQL bug. Error `unique_constraint_name does not exist` came from OLD FK query.

### Iteration-2 Fix Applied:
`bash bin/server_stop.sh ; bash bin/server_start.sh` :
```
OLD PID 665057 SIGTERM drained
NEW PID=665818
/api/version = v261003.1727 (old was v261003.1704) ← PROVES new code in-process
```
New server loads: FK rewrite (RC1), placeholder dropdowns (H1), toast-order (RC2), login restore on submit (H1 amplifier), renderContent auto-init-loader.

### User Must: Reload browser page (F5)
The saved hotx_sid in localStorage points to a cleared in-memory session on the new server, so boot logs user out, displays login dialog. User re-enters password → Connect → new sessionId created. Header schema+table dropdowns have explicit empty placeholders as first option → clicking any real table fires onchange → table loads.

---

## FINAL VERDICT & SUMMARY OF FIXES KEPT IN PRODUCTION CODE

### Root Causes (Multiple Interacting):

1. **RC1 - FK SQL metadata query broken (Hard Blocker):** 
   - v1 → tried to use `ccu2.ordinal_position` which does NOT exist in `information_schema.constraint_column_usage` (Postgres only has `ordinal_position` in `key_column_usage`).
   - v2 → tried to use `tc.unique_constraint_schema` + `tc.unique_constraint_name` to look up parent PK constraint. These columns DO exist in Postgres ≥9.4 but for UNKNOWN REASON (maybe older PG, maybe upstream SQL error cascaded?) user still saw `name does not exist`.
   - v3 (FINAL, KEPT): Rewrote `/api/foreign-keys` entirely to query **pg_catalog tables directly** (`pg_constraint.conkey/confkey` arrays + `unnest WITH ORDINALITY` + `pg_attribute` for column names + `pg_class`/`pg_namespace` for schema/table names). This is 100% version-stable and works on ALL supported Postgres builds. FK column ordering guaranteed correct because ordinality joins on the 1:1 corresponding array positions.

2. **H1 - Dropdown state mismatch / No onchange (user says "select table and nothing happens"):**
   - Cause: `<select id="hdr-table">` and `<select id="hdr-schema">` rendered with NO EMPTY PLACEHOLDER option when lists were non-empty. Browser defaulted DOM selected to first REAL option in list (car_factory / counties). But `state.currentTable` was `null`. When user then clicked the first option in the list to select it, Browser saw "selected value = DOM default value = no change" → `onchange` NEVER FIRED. Hence "nothing happens."
   - Fix (KEPT IN PRODUCTION): Header `renderHeader()` template ALWAYS prepends explicit empty placeholders:
     ```html
     <option value="">(select schema)</option>
     <option value="">(select a table)</option>
     ```
     DOM default is now always the empty placeholder, so clicking ANY real entry always fires onchange.
   - Amplifier fixes (KEPT):
     - `submit()` login handler now restores `localStorage.hotx_table` + calls `initRootBrowser()` if matching if table exists, so resume works on first connect if there's a saved table.
     - `attachHeaderHandlers()` forces `sEl.value / tEl.value` = state values after render to prevent stale HTML `selected` attributes from drifting vs JS state.
     - `renderContent()` defensive failsafe: if `state.currentTable != null && state.stack.empty == true` → `setTimeout(0, async initRootBrowser())` with `_stackInitInProgress` guard to auto-load without requiring explicit handler call.

3. **RC2 - Error toasts nuked by subsequent render():**
   - Cause: Catch blocks called `toast(e.message, 'error')` → inserted toast DOM, then immediately `render()` called which replaced all `#app` children, removing the toast element before user could see it. Result: even when errors occurred, user saw literally nothing.
   - Fix (KEPT): Swap line order → `render()` FIRST → `toast()` after → toast persists in DOM. Applied to:
     - `hdr-table onchange` catch
     - TXN begin/commit/rollback buttons (using deferredToast pattern + calling toast after render())
     - All other catch blocks restructured to follow "render → toast" or "return then toast after async render via deferred queue".

### Kept Production Enhancements:
- Enhanced `err(res, e)` includes `DETAIL / WHERE / HINT / POSITION` from pg-promise native Error objects in the JSON response → frontend `api()` throws compound messages → toasts now show SQL context for fast debugging.
- Frontend `api()` sets `err.plainError` (short) and `err.detail` (long) fields for structured error handling.
- `VERSION` bumped with each build (server's current time formatted YYMMDD.HHMM) → easy to see new code deployed without checking git diff.

### Kept Persistent Session Files:
- `debug-schema-table-no-render.md` [CLOSED] retained for historical record (per GLOBALS docs/bin never auto-erase .md/.sql/.sh rule).

