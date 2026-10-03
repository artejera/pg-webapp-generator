const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const VERSION = (() => {
  const d = new Date();
  const pad = (n, w=2) => String(n).padStart(w, '0');
  return `${pad(d.getFullYear()%100)}${pad(d.getMonth()+1)}${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}`;
})();

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 10 * 1000;
const TXN_MAX_AGE_MS = 60 * 60 * 1000;

const poolMap = new Map();
const txnMap = new Map();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function newSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

function getPool(sessionId) {
  const entry = poolMap.get(sessionId);
  if (!entry) throw new Error('Not connected. Please login again.');
  return entry.pool;
}

function getCreds(sessionId) {
  const entry = poolMap.get(sessionId);
  if (!entry) throw new Error('Not connected. Please login again.');
  return entry.creds;
}

async function getClient(sessionId) {
  const pool = getPool(sessionId);
  const client = await pool.connect();
  return client;
}

async function runQuery(sessionId, sql, params = [], opts = {}) {
  const client = await getClient(sessionId);
  let timer;
  try {
    const timeout = opts.timeout ?? QUERY_TIMEOUT_MS;
    const useLimit = opts.enforceLimit !== false;
    const txn = txnMap.get(sessionId);
    const qp = txn ? txn.client : client;
    timer = setTimeout(() => {
      try { qp.query('SELECT pg_cancel_backend(pg_backend_pid())').catch(()=>{}); } catch(e){}
    }, timeout);
    let finalSql = sql;
    let finalParams = params;
    if (useLimit && /^\s*select\s/i.test(sql)) {
      if (!/\blimit\s+/i.test(sql)) {
        finalSql = sql + ` LIMIT ${MAX_ROWS + 1}`;
      }
    }
    const res = await qp.query({ text: finalSql, values: finalParams });
    clearTimeout(timer);
    timer = null;
    let rows = res.rows;
    let clamped = false;
    if (useLimit && rows.length > MAX_ROWS) {
      rows = rows.slice(0, MAX_ROWS);
      clamped = true;
    }
    return { rows, fields: res.fields, rowCount: res.rowCount, clamped };
  } finally {
    if (timer) clearTimeout(timer);
    try { client.release(); } catch(e){}
  }
}

function ok(res, data) {
  return res.json({ ok: true, data });
}

function err(res, e, status = 400) {
  const msg = e && e.message ? e.message : String(e);
  const detail = (e && (e.detail || e.where || e.hint || e.position))
    ? `${e.detail ? 'DETAIL: '+e.detail+'. ' : ''}${e.where ? 'WHERE: '+e.where+'. ' : ''}${e.hint ? 'HINT: '+e.hint+'. ' : ''}${e.position ? 'POS: '+e.position+'. ' : ''}`.trim()
    : undefined;
  return res.status(status).json({ ok: false, error: msg, detail });
}

app.get('/api/version', (_req, res) => {
  res.json({ ok: true, data: { version: VERSION, maxRows: MAX_ROWS, queryTimeoutMs: QUERY_TIMEOUT_MS } });
});

app.post('/api/login', async (req, res) => {
  try {
    const { user, host, port, database, password } = req.body || {};
    if (!user || !host || !port || !database || password === undefined) {
      throw new Error('All fields required: user, host, port, database, password');
    }
    const pool = new Pool({
      user, host, port: Number(port), database, password,
      max: 4, idleTimeoutMillis: 60000, connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    const sessionId = newSessionId();
    poolMap.set(sessionId, { pool, creds: { user, host, port: Number(port), database } });
    ok(res, { sessionId, user, host, port: Number(port), database });
  } catch (e) { err(res, e, 401); }
});

app.post('/api/logout', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) { ok(res, { loggedOut: true }); return; }
    const entry = poolMap.get(sessionId);
    if (entry) {
      try {
        const txn = txnMap.get(sessionId);
        if (txn) { try { await txn.client.query('ROLLBACK'); } catch(e){} txn.client.release(); txnMap.delete(sessionId); }
        await entry.pool.end();
      } catch(e){}
      poolMap.delete(sessionId);
    }
    ok(res, { loggedOut: true });
  } catch (e) { err(res, e); }
});

app.use((req, _res, next) => {
  if (req.path.startsWith('/api/login') || req.path.startsWith('/api/version') || !req.path.startsWith('/api/')) { next(); return; }
  const sid = (req.body && req.body.sessionId) || (req.query && req.query.sessionId) || (req.headers['x-session-id']);
  req.sessionId = sid;
  next();
});

app.get('/api/schemas', async (req, res) => {
  try {
    const sql = `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
        AND schema_name NOT LIKE 'pg_temp_%'
        AND schema_name NOT LIKE 'pg_toast_%'
      ORDER BY schema_name
    `;
    const r = await runQuery(req.sessionId, sql, [], { enforceLimit: false });
    ok(res, r.rows.map(r => r.schema_name));
  } catch (e) { err(res, e); }
});

app.get('/api/tables', async (req, res) => {
  try {
    const schema = req.query.schema || 'public';
    const sql = `
      SELECT t.table_name,
             obj_description(('"'||t.table_schema||'"."'||t.table_name||'"')::regclass, 'pg_class') AS table_comment,
             EXISTS (
               SELECT 1 FROM information_schema.table_constraints tc
               WHERE tc.table_schema = t.table_schema
                 AND tc.table_name = t.table_name
                 AND tc.constraint_type = 'PRIMARY KEY'
             ) AS has_primary_key
      FROM information_schema.tables t
      WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `;
    const r = await runQuery(req.sessionId, sql, [schema], { enforceLimit: false });
    ok(res, r.rows);
  } catch (e) { err(res, e); }
});

app.get('/api/columns', async (req, res) => {
  try {
    const schema = req.query.schema || 'public';
    const table = req.query.table;
    if (!table) throw new Error('table query parameter required');

    const colsSql = `
      SELECT
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        col_description(('"'||c.table_schema||'"."'||c.table_name||'"')::regclass, c.ordinal_position) AS column_comment,
        COALESCE(pk.is_pk, false) AS is_primary_key,
        COALESCE(pk.pk_ord, 0) AS pk_ordinal
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.table_schema, kcu.table_name, kcu.column_name,
               true AS is_pk,
               kcu.ordinal_position AS pk_ord
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;
    const cols = await runQuery(req.sessionId, colsSql, [schema, table], { enforceLimit: false });

    const fkSql = `
      SELECT
        kcu.column_name,
        tc.constraint_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        kcu.ordinal_position AS fk_ord
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1 AND tc.table_name = $2
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `;
    const fks = await runQuery(req.sessionId, fkSql, [schema, table], { enforceLimit: false });

    const fkByCol = new Map();
    for (const f of fks.rows) {
      if (!fkByCol.has(f.column_name)) fkByCol.set(f.column_name, []);
      fkByCol.get(f.column_name).push(f);
    }

    const columns = cols.rows.map(c => ({
      ...c,
      foreign_keys: fkByCol.get(c.column_name) || []
    }));

    ok(res, { columns });
  } catch (e) { err(res, e); }
});

app.get('/api/foreign-keys', async (req, res) => {
  try {
    const schema = req.query.schema || 'public';
    // Use pg_catalog directly (100% stable across PG versions). Avoids
    // information_schema quirks:
    //   - ccu has NO ordinal_position
    //   - tc.unique_constraint_name can be missing on older PG builds
    // conkey = array of child (FK) table attribute numbers
    // confkey = array of parent (PK/UQ) table attribute numbers
    // Arrays are ordinal-corresponding: conkey[i] references confkey[i].
    // Unnest both WITH ORDINALITY + join on ordinal → guarantees order.
    const sql = `
      SELECT
        nc.nspname::text AS child_schema,
        c.relname::text  AS child_table,
        np.nspname::text AS parent_schema,
        p.relname::text  AS parent_table,
        con.conname::text AS constraint_name,
        string_agg(ka.attname::text, ',' ORDER BY fk.ord) AS child_columns,
        string_agg(pa.attname::text, ',' ORDER BY fk.ord) AS parent_columns
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class c        ON c.oid     = con.conrelid
      JOIN pg_catalog.pg_namespace nc   ON nc.oid    = c.relnamespace
      JOIN pg_catalog.pg_class p        ON p.oid     = con.confrelid
      JOIN pg_catalog.pg_namespace np   ON np.oid    = p.relnamespace
      JOIN LATERAL unnest(con.conkey)   WITH ORDINALITY AS fk(child_attnum, ord) ON true
      JOIN LATERAL unnest(con.confkey)  WITH ORDINALITY AS pk(parent_attnum, ord) ON pk.ord = fk.ord
      JOIN pg_catalog.pg_attribute ka   ON ka.attrelid = con.conrelid   AND ka.attnum = fk.child_attnum
      JOIN pg_catalog.pg_attribute pa   ON pa.attrelid = con.confrelid  AND pa.attnum = pk.parent_attnum
      WHERE con.contype = 'f'
        AND nc.nspname = $1
        AND ka.attisdropped = false
        AND pa.attisdropped = false
      GROUP BY nc.nspname, c.relname, np.nspname, p.relname, con.conname
      ORDER BY c.relname, con.conname
    `;
    const r = await runQuery(req.sessionId, sql, [schema], { enforceLimit: false });
    const rows = r.rows.map(row => {
      const splitCsv = s => {
        if (Array.isArray(s)) return s;
        if (typeof s !== 'string' || !s) return [];
        return s.replace(/^\{|\}$/g, '').split(',').filter(x => x.length);
      };
      return {
        ...row,
        child_columns: splitCsv(row.child_columns),
        parent_columns: splitCsv(row.parent_columns)
      };
    });
    ok(res, rows);
  } catch (e) { err(res, e); }
});

function qIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function buildWhere(filters, startIdx = 1) {
  if (!filters || !filters.length) return { sql: '', params: [], idx: startIdx };
  const parts = [];
  const params = [];
  let i = startIdx;
  for (const f of filters) {
    const { column, op, value } = f;
    if (op === 'is_null') { parts.push(`${qIdent(column)} IS NULL`); continue; }
    if (op === 'is_not_null') { parts.push(`${qIdent(column)} IS NOT NULL`); continue; }
    if (op === 'like') { parts.push(`${qIdent(column)}::text LIKE $${i++}`); params.push(value); continue; }
    if (op === 'ilike') { parts.push(`${qIdent(column)}::text ILIKE $${i++}`); params.push(value); continue; }
    if (op === 'in') {
      const qs = value.map((_,j) => `$${i+j}`).join(',');
      parts.push(`${qIdent(column)} IN (${qs})`);
      params.push(...value);
      i += value.length;
      continue;
    }
    parts.push(`${qIdent(column)} = $${i++}`);
    params.push(value);
  }
  return { sql: ' WHERE ' + parts.join(' AND '), params, idx: i };
}

app.post('/api/rows', async (req, res) => {
  try {
    const { schema = 'public', table, filters = [], search = [], orderBy, limit, offset } = req.body;
    if (!table) throw new Error('table required');
    const w1 = buildWhere(filters, 1);
    const w2 = buildWhere(search, w1.idx);
    const where = (w1.sql + w2.sql).replace(/^ WHERE  AND /, ' WHERE ');
    let orderSql = '';
    if (orderBy && orderBy.length) {
      orderSql = ' ORDER BY ' + orderBy.map(o => `${qIdent(o.column)} ${o.desc ? 'DESC' : 'ASC'}`).join(', ');
    }
    let limitSql = '';
    if (limit) {
      const lim = Math.min(Number(limit), MAX_ROWS);
      limitSql = ` LIMIT ${lim}`;
      if (offset) limitSql += ` OFFSET ${Number(offset)}`;
    }
    const params = [...w1.params, ...w2.params];
    const sql = `SELECT * FROM ${qIdent(schema)}.${qIdent(table)}${where}${orderSql}${limitSql}`;
    const countSql = `SELECT count(*)::bigint AS total FROM ${qIdent(schema)}.${qIdent(table)}${where}`;
    const [data, countRes] = await Promise.all([
      runQuery(req.sessionId, sql, params),
      runQuery(req.sessionId, countSql, params, { enforceLimit: false })
    ]);
    ok(res, {
      rows: data.rows,
      fields: data.fields,
      total: countRes.rows[0] ? Number(countRes.rows[0].total) : 0,
      clamped: data.clamped
    });
  } catch (e) { err(res, e); }
});

function getPkColumns(columnsMeta) {
  return columnsMeta.filter(c => c.is_primary_key).sort((a,b) => a.pk_ordinal - b.pk_ordinal).map(c => c.column_name);
}

app.post('/api/row', async (req, res) => {
  try {
    const { schema = 'public', table, row } = req.body;
    if (!table || !row) throw new Error('table and row required');
    const cols = Object.keys(row);
    if (!cols.length) throw new Error('empty row');
    const placeholders = cols.map((_, i) => `$${i+1}`).join(', ');
    const sql = `INSERT INTO ${qIdent(schema)}.${qIdent(table)} (${cols.map(qIdent).join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const r = await runQuery(req.sessionId, sql, cols.map(c => row[c]));
    ok(res, { row: r.rows[0] });
  } catch (e) { err(res, e); }
});

app.put('/api/row', async (req, res) => {
  try {
    const { schema = 'public', table, row, pk, pkColumns } = req.body;
    if (!table || !row || !pkColumns || !pkColumns.length) throw new Error('table, row, pkColumns required');
    const sets = [];
    const params = [];
    let i = 1;
    for (const [col, val] of Object.entries(row)) {
      sets.push(`${qIdent(col)} = $${i++}`);
      params.push(val);
    }
    const pkFilters = pkColumns.map(col => ({ column: col, op: '=', value: pk[col] }));
    const where = buildWhere(pkFilters, i);
    params.push(...where.params);
    const sql = `UPDATE ${qIdent(schema)}.${qIdent(table)} SET ${sets.join(', ')}${where.sql} RETURNING *`;
    const r = await runQuery(req.sessionId, sql, params);
    ok(res, { row: r.rows[0], rowCount: r.rowCount });
  } catch (e) { err(res, e); }
});

app.delete('/api/row', async (req, res) => {
  try {
    const { schema = 'public', table, pk, pkColumns } = req.body;
    if (!table || !pkColumns || !pkColumns.length) throw new Error('table, pkColumns required');
    const pkFilters = pkColumns.map(col => ({ column: col, op: '=', value: pk[col] }));
    const where = buildWhere(pkFilters, 1);
    const sql = `DELETE FROM ${qIdent(schema)}.${qIdent(table)}${where.sql}`;
    const r = await runQuery(req.sessionId, sql, where.params);
    ok(res, { rowCount: r.rowCount });
  } catch (e) { err(res, e); }
});

app.post('/api/txn/begin', async (req, res) => {
  try {
    const pool = getPool(req.sessionId);
    if (txnMap.has(req.sessionId)) throw new Error('Transaction already active');
    const client = await pool.connect();
    await client.query('BEGIN');
    txnMap.set(req.sessionId, {
      client,
      startedAt: Date.now(),
      timer: setTimeout(async () => {
        try { await client.query('ROLLBACK'); } catch(e){}
        try { client.release(); } catch(e){}
        txnMap.delete(req.sessionId);
      }, TXN_MAX_AGE_MS)
    });
    ok(res, { started: true });
  } catch (e) { err(res, e); }
});

app.post('/api/txn/commit', async (req, res) => {
  try {
    const txn = txnMap.get(req.sessionId);
    if (!txn) throw new Error('No active transaction');
    try {
      await txn.client.query('COMMIT');
      ok(res, { committed: true });
    } catch (e) {
      try { await txn.client.query('ROLLBACK'); } catch(_){}
      err(res, new Error('Commit failed: ' + (e.message || String(e))), 400);
      return;
    } finally {
      clearTimeout(txn.timer);
      try { txn.client.release(); } catch(_){}
      txnMap.delete(req.sessionId);
    }
  } catch (e) { err(res, e); }
});

app.post('/api/txn/rollback', async (req, res) => {
  try {
    const txn = txnMap.get(req.sessionId);
    if (!txn) throw new Error('No active transaction');
    try { await txn.client.query('ROLLBACK'); } catch(e){}
    clearTimeout(txn.timer);
    try { txn.client.release(); } catch(e){}
    txnMap.delete(req.sessionId);
    ok(res, { rolledBack: true });
  } catch (e) { err(res, e); }
});

app.get('/api/txn/status', async (req, res) => {
  try {
    const txn = txnMap.get(req.sessionId);
    ok(res, { active: !!txn, startedAt: txn ? txn.startedAt : null });
  } catch (e) { err(res, e); }
});

app.get('/api/creds', (req, res) => {
  try {
    ok(res, getCreds(req.sessionId));
  } catch (e) { err(res, e); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`HotX v${VERSION} listening on port ${PORT}`);
  console.log(`Static files: ${path.join(__dirname, 'public')}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Draining pools...');
  for (const [sid, txn] of txnMap) {
    try { await txn.client.query('ROLLBACK'); } catch(e){}
    try { txn.client.release(); } catch(e){}
  }
  txnMap.clear();
  for (const [sid, entry] of poolMap) {
    try { await entry.pool.end(); } catch(e){}
  }
  poolMap.clear();
  process.exit(0);
});

process.on('SIGINT', () => process.emit('SIGTERM'));
