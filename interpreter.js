'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');
const { quoteIdent, classifyColumnType } = require('./src/generator/schemaExtractor');

function coerceForPg(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'object' && !(v instanceof Date)) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function typedCoerce(v, typeHint) {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v : String(v);
  const h = (typeHint || 'text').toLowerCase();
  if (s === '' && h !== 'text' && h !== 'binary') return null;
  if (h === 'boolean') {
    if (s === 'true'  || s === '1' || s.toLowerCase() === 't') return true;
    if (s === 'false' || s === '0' || s.toLowerCase() === 'f') return false;
    if (s === '') return null;
  }
  if (h === 'integer') {
    if (s === '') return null;
    const n = parseInt(s, 10);
    if (!isNaN(n)) return n;
  }
  if (h === 'number') {
    if (s === '') return null;
    const f = parseFloat(s);
    if (!isNaN(f)) return f;
  }
  if (h === 'json') {
    if (s === '') return null;
    try { return JSON.stringify(JSON.parse(s)); } catch (_) { return s; }
  }
  if (h === 'uuid' || h === 'datetime') {
    if (s === '') return null;
  }
  return coerceForPg(v);
}

const connections = new Map();

function safeUuid() {
  return crypto.randomBytes(16).toString('hex');
}

function maskPassword(conn) {
  if (!conn) return conn;
  return {
    id: conn.id,
    createdAt: conn.createdAt,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    schema: conn.schema,
    ssl: !!conn.ssl,
  };
}

async function extractSchemaLive(pool, schemaName) {
  const tablesRes = await pool.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [schemaName]
  );
  const tables = [];
  for (const t of tablesRes.rows) {
    const columnsRes = await pool.query(
      `SELECT c.column_name,
              c.data_type,
              c.udt_name,
              c.is_nullable,
              c.column_default,
              c.character_maximum_length,
              c.numeric_precision,
              c.numeric_scale,
              c.datetime_precision,
              c.is_identity,
              c.identity_generation
         FROM information_schema.columns c
        WHERE c.table_schema = $1
          AND c.table_name   = $2
        ORDER BY c.ordinal_position`,
      [t.table_schema, t.table_name]
    );
    const pksRes = await pool.query(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage  kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
          AND tc.table_name      = kcu.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema    = $1
          AND tc.table_name      = $2
        ORDER BY kcu.ordinal_position`,
      [t.table_schema, t.table_name]
    );
    const fksRes = await pool.query(
      `SELECT
         kcu.constraint_name,
         kcu.column_name,
         ccu.table_schema  AS foreign_table_schema,
         ccu.table_name    AS foreign_table_name,
         ccu.column_name   AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage      kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
         AND tc.table_name      = kcu.table_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema    = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema    = $1
         AND tc.table_name      = $2
       ORDER BY kcu.ordinal_position`,
      [t.table_schema, t.table_name]
    );
    const columns = columnsRes.rows.map((c) => ({
      name: c.column_name,
      dataType: c.data_type,
      udtName: c.udt_name,
      isNullable: c.is_nullable === 'YES',
      hasDefault: !!c.column_default || c.is_identity === 'YES',
      isIdentity: c.is_identity === 'YES',
      characterMaximumLength: c.character_maximum_length,
      numericPrecision: c.numeric_precision,
      numericScale: c.numeric_scale,
      datetimePrecision: c.datetime_precision,
      default: c.column_default || null,
      identityGeneration: c.identity_generation || null,
      typeClass: classifyColumnType({
        dataType: c.data_type,
        udtName: c.udt_name,
      }),
    }));
    const primaryKeys = pksRes.rows.map((r) => r.column_name);
    const foreignKeys = fksRes.rows.map((r) => ({
      name: r.constraint_name,
      column: r.column_name,
      foreignTableSchema: r.foreign_table_schema,
      foreignTableName: r.foreign_table_name,
      foreignColumnName: r.foreign_column_name,
    }));
    tables.push({
      schema: t.table_schema,
      name: t.table_name,
      quotedName: quoteIdent(t.table_schema) + '.' + quoteIdent(t.table_name),
      columns,
      primaryKeys,
      effectiveKeys: primaryKeys.length ? primaryKeys : columns.map((c) => c.name),
      hasExplicitPk: primaryKeys.length > 0,
      foreignKeys,
    });
  }
  return {
    schema: schemaName,
    tables,
    generatedAt: new Date().toISOString(),
  };
}

function classifyConnectionError(err) {
  const msg = String((err && err.message) ? err.message : err);
  const code = (err && err.code) || '';
  const scramLike = msg.includes('SCRAM') || msg.includes('SASL') || msg.includes('client password must be') || /password/i.test(msg);
  const authLike = scramLike || code === '28P01' || code === '28000';
  let title = 'Unable to connect to Postgres';
  let text = msg;
  const hints = [];
  if (authLike) {
    title = 'Postgres authentication failed';
    text = 'The database rejected the username / password combination. Check the password and try again.';
    hints.push('Confirm the role password in Postgres matches the password you entered.');
    hints.push('Confirm the user exists on this database.');
  } else if (code === 'ECONNREFUSED') {
    title = 'Could not reach Postgres';
    text = 'Connection refused — Postgres is not running on this host/port.';
    hints.push('Verify host/port and that Postgres is running.');
    hints.push('Check firewalls / security groups.');
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    title = 'Unknown database host';
    text = 'Could not resolve the hostname you provided.';
    hints.push('Check the Hostname field.');
  } else if (code === '3D000') {
    title = 'Database does not exist';
    text = 'The database name does not exist or the user cannot access it.';
    hints.push('Set the Database name to a real Postgres database.');
  } else if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
    title = 'Database connection timed out';
    hints.push('Verify host/port and network.');
  }
  const e = new Error(title + ': ' + text);
  e.status = 503;
  e.code = code || 'PG_CONN';
  e.hints = hints;
  if (err && err.code) e.code = err.code;
  if (err && err.detail) e.detail = err.detail;
  return e;
}

async function connectAndStore(payload) {
  const p = payload || {};
  const host = String(p.host || 'localhost').trim();
  const port = Number(p.port || 5432);
  const database = String(p.database || '').trim();
  const user = String(p.user || '').trim();
  const password = (p.password == null) ? '' : String(p.password);
  const schema = String(p.schema || 'public').trim();
  const ssl = !!p.ssl;

  if (!host) {
    const e = new Error('Hostname is required.');
    e.status = 400;
    e.code = 'VALIDATION';
    throw e;
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    const e = new Error('Port must be a valid integer 1-65535.');
    e.status = 400;
    e.code = 'VALIDATION';
    throw e;
  }
  if (!database) {
    const e = new Error('Database name is required.');
    e.status = 400;
    e.code = 'VALIDATION';
    throw e;
  }
  if (!user) {
    const e = new Error('User is required.');
    e.status = 400;
    e.code = 'VALIDATION';
    throw e;
  }

  const pool = new Pool({
    host, port, database, user, password,
    ssl,
    max: 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 5000,
  });

  try {
    await pool.query('SELECT 1 AS ok');
  } catch (err) {
    try { await pool.end(); } catch (_) {}
    throw classifyConnectionError(err);
  }

  let schemaObj;
  try {
    schemaObj = await extractSchemaLive(pool, schema);
  } catch (err) {
    try { await pool.end(); } catch (_) {}
    const e = new Error(err && err.message ? err.message : String(err));
    e.status = 400;
    e.code = (err && err.code) || 'SCHEMA_EXTRACT';
    if (err && err.detail) e.detail = err.detail;
    throw e;
  }

  const id = safeUuid();
  const conn = {
    id,
    createdAt: new Date().toISOString(),
    host, port, database, user, password, schema, ssl,
    pool,
    schemaObj,
  };
  connections.set(id, conn);
  return conn;
}

function findConnection(req) {
  const id = (req && req.headers && req.headers['x-pg-conn-id']) ||
             (req && req.body && req.body.connectionId) ||
             (req && req.query && req.query.connectionId);
  if (!id) return null;
  return connections.get(String(id)) || null;
}

function requireConnection(req) {
  const c = findConnection(req);
  if (!c) {
    const e = new Error('No active connection. Go back to the credentials page and connect to Postgres.');
    e.status = 401;
    e.code = 'NO_CONN';
    e.hints = [
      'Open the credentials dialog and click Connect (Interact live mode).',
      'Your connection may have timed out on the server — reconnect.',
    ];
    throw e;
  }
  return c;
}

function tableMeta(conn, tableName) {
  const t = conn.schemaObj.tables.find((tt) => tt.name === tableName);
  if (!t) {
    const e = new Error('Table not found in the currently connected schema: ' + String(tableName));
    e.status = 404;
    e.code = 'NO_TABLE';
    throw e;
  }
  return t;
}

function encodeKey(values, keyCols) {
  if (keyCols.length === 1) {
    const v = values[0];
    return encodeURIComponent(v === undefined || v === null ? '' : String(v));
  }
  return encodeURIComponent(values.map((v) => (v === undefined || v === null ? '' : String(v))).join('|'));
}

function splitKey(encoded, keyCols) {
  const raw = decodeURIComponent(String(encoded || ''));
  if (keyCols.length === 1) return [raw === '' ? null : raw];
  const parts = raw.split('|');
  if (parts.length !== keyCols.length) {
    const e = new Error('Composite key requires ' + keyCols.length + ' parts.');
    e.status = 400;
    throw e;
  }
  return parts;
}

function buildTypeMap(table) {
  const m = {};
  for (const c of table.columns) m[c.name] = c.typeClass || 'text';
  return m;
}

function pgError(err) {
  if (!err) return err;
  if (typeof err.status === 'number') return err;
  const rawCode = err && err.code;
  const rawMsg = String((err && err.message) ? err.message : err);
  const scramLike = rawMsg.includes('SCRAM') || rawMsg.includes('SASL') ||
    rawCode === 'ECONNREFUSED' || rawCode === 'ENOTFOUND' || rawCode === 'EAI_AGAIN' ||
    (typeof rawCode === 'string' && /^08|^57P01|^57P02|^58/.test(rawCode)) ||
    rawCode === '3D000' || rawCode === 'ETIMEDOUT';
  if (scramLike) return classifyConnectionError(err);
  const computedStatus = (() => {
    switch (rawCode) {
      case '23505': return 409;
      case '23503': return 409;
      case '23502': return 400;
      case '23514': return 400;
      case '42703': return 400;
      case '42P01': return 404;
      case '22P02': return 400;
      case '22001': return 400;
      case '22003': return 400;
      case '22007': return 400;
      case '22008': return 400;
      case '22012': return 400;
      default:      return 500;
    }
  })();
  const e = new Error(err && err.message ? err.message : 'Database error');
  e.status = computedStatus;
  if (err && err.code) e.code = err.code;
  if (err && err.detail) e.detail = err.detail;
  if (err && err.hint) e.hint = err.hint;
  if (err && err.column) e.column = err.column;
  if (err && err.table) e.table = err.table;
  return e;
}

async function listRows(conn, table, limit, offset) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql =
    'SELECT * FROM ' + table.quotedName +
    ' ORDER BY ctid LIMIT $1 OFFSET $2';
  const countSql = 'SELECT COUNT(*)::bigint AS total FROM ' + table.quotedName;
  const client = await conn.pool.connect();
  try {
    const [rows, count] = await Promise.all([
      client.query(sql, [safeLimit, safeOffset]),
      client.query(countSql),
    ]);
    const typeMap = buildTypeMap(table);
    const pkCols = table.effectiveKeys;
    return {
      rows: rows.rows.map((r) => Object.assign({}, r, {
        __rowKey: encodeKey(pkCols.map(k => r[k]), pkCols),
      })),
      columns: table.columns,
      primaryKeys: table.primaryKeys,
      effectiveKeys: table.effectiveKeys,
      hasExplicitPk: table.hasExplicitPk,
      typeMap,
      total: Number(count.rows[0].total),
      pageSize: safeLimit,
      page: Math.floor(safeOffset / safeLimit) + 1,
    };
  } catch (err) {
    throw pgError(err);
  } finally {
    if (client) try { client.release(); } catch (_) {}
  }
}

async function getRow(conn, table, encodedKey) {
  if (!table.hasExplicitPk) {
    const e = new Error('Table has no explicit primary key; fetching a single row by primary key is disabled.');
    e.status = 400;
    throw e;
  }
  const values = splitKey(encodedKey, table.primaryKeys);
  const where = table.primaryKeys
    .map((c, i) => quoteIdent(c) + ' = $' + (i + 1)).join(' AND ');
  const sql = 'SELECT * FROM ' + table.quotedName + ' WHERE ' + where;
  try {
    const res = await conn.pool.query(sql, values);
    if (!res.rows.length) {
      const e = new Error('Row not found');
      e.status = 404;
      throw e;
    }
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

function allowedCols(table, create) {
  return table.columns
    .filter((c) => create
      ? (c.isIdentity ? false : true)
      : true)
    .filter((c) => !(table.primaryKeys.includes(c.name) && c.isIdentity))
    .map((c) => c.name);
}

async function createRow(conn, table, data) {
  const allowSet = new Set(allowedCols(table, true));
  const typeMap = buildTypeMap(table);
  const entries = Object.entries(data || {}).filter(([k]) => allowSet.has(k));
  if (!entries.length) {
    const e = new Error('No valid columns in payload.');
    e.status = 400;
    throw e;
  }
  const cols = entries.map(([k]) => quoteIdent(k));
  const placeholders = entries.map((_, i) => '$' + (i + 1));
  const values = entries.map(([k, v]) => typedCoerce(v, typeMap[k]));
  const sql =
    'INSERT INTO ' + table.quotedName +
    ' (' + cols.join(', ') + ') VALUES (' + placeholders.join(', ') + ')' +
    ' RETURNING *';
  try {
    const res = await conn.pool.query(sql, values);
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

async function updateRow(conn, table, encodedKey, data) {
  if (!table.hasExplicitPk) {
    const e = new Error('Table has no explicit primary key; updates are disabled.');
    e.status = 400;
    throw e;
  }
  const pkValues = splitKey(encodedKey, table.primaryKeys);
  const allowSet = new Set(allowedCols(table, false).filter((c) => !table.primaryKeys.includes(c)));
  const typeMap = buildTypeMap(table);
  const entries = Object.entries(data || {}).filter(([k]) => allowSet.has(k));
  if (!entries.length) {
    const e = new Error('No valid columns to update.');
    e.status = 400;
    throw e;
  }
  const assigns = entries.map(([k], i) => quoteIdent(k) + ' = $' + (table.primaryKeys.length + i + 1));
  const where = table.primaryKeys.map((c, i) => quoteIdent(c) + ' = $' + (i + 1)).join(' AND ');
  const params = pkValues.concat(entries.map(([k, v]) => typedCoerce(v, typeMap[k])));
  const sql =
    'UPDATE ' + table.quotedName +
    ' SET ' + assigns.join(', ') +
    ' WHERE ' + where +
    ' RETURNING *';
  try {
    const res = await conn.pool.query(sql, params);
    if (!res.rows.length) {
      const e = new Error('Row not found');
      e.status = 404;
      throw e;
    }
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

async function deleteRow(conn, table, encodedKey) {
  if (!table.hasExplicitPk) {
    const e = new Error('Table has no explicit primary key; deletes are disabled.');
    e.status = 400;
    throw e;
  }
  const values = splitKey(encodedKey, table.primaryKeys);
  const where = table.primaryKeys.map((c, i) => quoteIdent(c) + ' = $' + (i + 1)).join(' AND ');
  const sql = 'DELETE FROM ' + table.quotedName + ' WHERE ' + where + ' RETURNING *';
  try {
    const res = await conn.pool.query(sql, values);
    if (!res.rows.length) {
      const e = new Error('Row not found');
      e.status = 404;
      throw e;
    }
    return { deleted: true, row: res.rows[0] };
  } catch (err) {
    throw pgError(err);
  }
}

async function disconnect(connId) {
  const c = connections.get(String(connId));
  if (!c) return { ok: true };
  connections.delete(String(connId));
  try { await c.pool.end(); } catch (_) {}
  return { ok: true };
}

module.exports = {
  connectAndStore,
  requireConnection,
  findConnection,
  tableMeta,
  listRows,
  getRow,
  createRow,
  updateRow,
  deleteRow,
  disconnect,
  maskPassword,
};
