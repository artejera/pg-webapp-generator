'use strict';

const fs = require('fs');
const path = require('path');
const { quoteIdent, classifyColumnType } = require('./schemaExtractor');

function sanitizeJsIdent(name) {
  return String(name).replace(/[^a-zA-Z0-9_$]/g, '_');
}

function stringifySchemaForRoutes(schema) {
  const slimTables = schema.tables.map((t) => ({
    schema: t.schema,
    name: t.name,
    quotedName: t.quotedName,
    columns: t.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      udtName: c.udtName,
      isNullable: c.isNullable,
      hasDefault: c.hasDefault,
      isIdentity: c.isIdentity,
      typeClass: classifyColumnType(c),
    })),
    primaryKeys: t.primaryKeys,
    effectiveKeys: t.effectiveKeys,
    hasExplicitPk: t.hasExplicitPk,
    foreignKeys: t.foreignKeys,
  }));
  return JSON.stringify(slimTables, null, 2);
}

function generateServerJs() {
  return `'use strict';

try { require('dotenv').config(); } catch (_) {}

const path = require('path');
const express = require('express');
const cors = require('cors');
const { registerRoutes } = require('./routes');

const PORT = Number(process.env.PORT || 3000);

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  registerRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    console.error('[error]', err && err.stack ? err.stack : err);
    const status = err && err.status ? err.status : (err && err.code === '23505' ? 409 : 400);
    const body = {
      error: (err && err.message) ? err.message : 'Internal error',
    };
    if (err && err.detail) body.detail = err.detail;
    if (err && err.hint)   body.hint   = err.hint;
    if (err && err.code)   body.code   = err.code;
    if (err && err.column) body.column = err.column;
    res.status(status >= 400 ? status : 500).json(body);
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log('Server listening on http://localhost:' + PORT);
  });
}

module.exports = { createApp };
`;
}

function generateDbJs() {
  return `'use strict';

try { require('dotenv').config(); } catch (_) {}

const { Pool } = require('pg');

function _pgEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null) return fallback;
  return v;
}

const pool = new Pool({
  host:     _pgEnv('PGHOST', 'localhost'),
  port:     Number(_pgEnv('PGPORT', 5432)),
  database: _pgEnv('PGDATABASE', ''),
  user:     _pgEnv('PGUSER', 'postgres'),
  password: _pgEnv('PGPASSWORD', ''),
  ssl:      (_pgEnv('PGSSLMODE', '')).toLowerCase() === 'require',
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[pg pool error]', err && err.message, err && err.code);
});

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '\\"\\"') + '"';
}

function q(tableSchema, tableName) {
  return quoteIdent(tableSchema) + '.' + quoteIdent(tableName);
}

function pgError(err) {
  if (!err) return err;
  if (typeof err.status === 'number' && !err.code) return err;
  const computedStatus = (() => {
    switch (err.code) {
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
  const e = new Error(err.message || 'Database error');
  e.status = (typeof err.status === 'number') ? err.status : computedStatus;
  if (err.code)    e.code    = err.code;
  if (err.detail)  e.detail  = err.detail;
  if (err.hint)    e.hint    = err.hint;
  if (err.column)  e.column  = err.column;
  if (err.table)   e.table   = err.table;
  return e;
}

async function listRows(schema, table, limit, offset) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit)  || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql =
    'SELECT * FROM ' + q(schema, table) +
    ' ORDER BY ctid LIMIT $1 OFFSET $2';
  const countSql = 'SELECT COUNT(*)::bigint AS total FROM ' + q(schema, table);
  const client = await pool.connect();
  try {
    const [rows, count] = await Promise.all([
      client.query(sql, [safeLimit, safeOffset]),
      client.query(countSql),
    ]);
    return {
      rows: rows.rows,
      total: Number(count.rows[0].total),
      pageSize: safeLimit,
      page: Math.floor(safeOffset / safeLimit) + 1,
    };
  } catch (err) {
    throw pgError(err);
  } finally {
    client.release();
  }
}

function _splitKey(encoded, keyCols) {
  const raw = decodeURIComponent(String(encoded || ''));
  const parts = raw.split('|');
  if (parts.length !== keyCols.length) {
    const err = new Error(
      'Composite key requires ' + keyCols.length +
      ' parts (join values with "|")'
    );
    err.status = 400;
    throw err;
  }
  return parts;
}

async function getRow(schema, table, keyCols, encodedKey) {
  const values = _splitKey(encodedKey, keyCols);
  const where = keyCols
    .map((c, i) => quoteIdent(c) + ' = $' + (i + 1))
    .join(' AND ');
  const sql = 'SELECT * FROM ' + q(schema, table) + ' WHERE ' + where;
  try {
    const res = await pool.query(sql, values);
    if (!res.rows.length) {
      const err = new Error('Row not found');
      err.status = 404;
      throw err;
    }
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

async function createRow(schema, table, data, allowedColumns, typeMap) {
  const allowSet = new Set(allowedColumns);
  const types = typeMap || {};
  const entries = Object.entries(data || {}).filter(([k]) => allowSet.has(k));
  if (!entries.length) {
    const err = new Error('No valid columns in payload');
    err.status = 400;
    throw err;
  }
  const cols = entries.map(([k]) => quoteIdent(k));
  const placeholders = entries.map((_, i) => '$' + (i + 1));
  const values = entries.map(([k, v]) => typedCoerce(v, types[k]));
  const sql =
    'INSERT INTO ' + q(schema, table) +
    ' (' + cols.join(', ') + ') VALUES (' + placeholders.join(', ') + ')' +
    ' RETURNING *';
  try {
    const res = await pool.query(sql, values);
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

async function updateRow(schema, table, keyCols, encodedKey, data, allowedColumns, typeMap) {
  const values = _splitKey(encodedKey, keyCols);
  const allowSet = new Set(allowedColumns.filter((c) => !keyCols.includes(c)));
  const types = typeMap || {};
  const entries = Object.entries(data || {}).filter(([k]) => allowSet.has(k));
  if (!entries.length) {
    const err = new Error('No valid columns to update');
    err.status = 400;
    throw err;
  }
  const assigns = entries.map(([k], i) => quoteIdent(k) + ' = $' + (keyCols.length + i + 1));
  const where = keyCols.map((c, i) => quoteIdent(c) + ' = $' + (i + 1)).join(' AND ');
  const params = values.concat(entries.map(([k, v]) => typedCoerce(v, types[k])));
  const sql =
    'UPDATE ' + q(schema, table) +
    ' SET ' + assigns.join(', ') +
    ' WHERE ' + where +
    ' RETURNING *';
  try {
    const res = await pool.query(sql, params);
    if (!res.rows.length) {
      const err = new Error('Row not found');
      err.status = 404;
      throw err;
    }
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

async function deleteRow(schema, table, keyCols, encodedKey) {
  const values = _splitKey(encodedKey, keyCols);
  const where = keyCols.map((c, i) => quoteIdent(c) + ' = $' + (i + 1)).join(' AND ');
  const sql = 'DELETE FROM ' + q(schema, table) + ' WHERE ' + where + ' RETURNING *';
  try {
    const res = await pool.query(sql, values);
    if (!res.rows.length) {
      const err = new Error('Row not found');
      err.status = 404;
      throw err;
    }
    return res.rows[0];
  } catch (err) {
    throw pgError(err);
  }
}

function coerceForPg(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
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

module.exports = {
  pool,
  listRows,
  getRow,
  createRow,
  updateRow,
  deleteRow,
  quoteIdent,
  typedCoerce,
  coerceForPg,
};
`;
}

function generateRoutesJs(schema) {
  return `'use strict';

const {
  listRows,
  getRow,
  createRow,
  updateRow,
  deleteRow,
} = require('./db');

const SCHEMA_TABLES = ${stringifySchemaForRoutes(schema)};

function findTable(name) {
  return SCHEMA_TABLES.find((t) => t.name === name);
}

function encodeKey(row, keyCols) {
  return keyCols.map((c) => encodeURIComponent(row[c] == null ? '' : String(row[c]))).join('|');
}

function registerRoutes(app) {
  app.get('/api/tables', (_req, res, next) => {
    Promise.resolve()
      .then(() => {
        const out = SCHEMA_TABLES.map((t) => ({
          name: t.name,
          schema: t.schema,
          columns: t.columns.length,
          primaryKeys: t.primaryKeys,
          hasExplicitPk: t.hasExplicitPk,
          url: '/tables/' + encodeURIComponent(t.name) + '.html',
        }));
        res.json({ tables: out });
      })
      .catch(next);
  });

  SCHEMA_TABLES.forEach((t) => {
    const tableName = t.name;
    const columns = t.columns.map((c) => c.name);
    const editableCols = t.columns
      .filter((c) => !c.isIdentity)
      .map((c) => c.name);
    const typeMap = t.columns.reduce((m, c) => { m[c.name] = c.typeClass; return m; }, {});
    const keys = t.effectiveKeys;
    const hasExplicitPk = t.hasExplicitPk;

    app.get('/api/tables/:table', (req, res, next) => {
      if (req.params.table !== tableName) return next('route');
      const limit  = req.query.limit;
      const offset = req.query.offset;
      listRows(t.schema, t.name, limit, offset)
        .then((data) => res.json(data))
        .catch(next);
    });

    app.get('/api/tables/:table/:id', (req, res, next) => {
      if (req.params.table !== tableName) return next('route');
      getRow(t.schema, t.name, keys, req.params.id)
        .then((row) => res.json({ row, keys }))
        .catch(next);
    });

    app.post('/api/tables/:table', (req, res, next) => {
      if (req.params.table !== tableName) return next('route');
      createRow(t.schema, t.name, req.body, editableCols, typeMap)
        .then((row) => res.status(201).json({ row, key: encodeKey(row, keys) }))
        .catch(next);
    });

    app.put('/api/tables/:table/:id', (req, res, next) => {
      if (req.params.table !== tableName) return next('route');
      if (!hasExplicitPk) {
        const err = new Error('Table has no explicit primary key; updates disabled.');
        err.status = 400;
        return next(err);
      }
      updateRow(t.schema, t.name, keys, req.params.id, req.body, editableCols, typeMap)
        .then((row) => res.json({ row }))
        .catch(next);
    });

    app.delete('/api/tables/:table/:id', (req, res, next) => {
      if (req.params.table !== tableName) return next('route');
      if (!hasExplicitPk) {
        const err = new Error('Table has no explicit primary key; deletes disabled.');
        err.status = 400;
        return next(err);
      }
      deleteRow(t.schema, t.name, keys, req.params.id)
        .then((row) => res.json({ deleted: true, row }))
        .catch(next);
    });
  });
}

module.exports = { registerRoutes, findTable, SCHEMA_TABLES };
`;
}

function generateEnvExample() {
  return `PGHOST=localhost
PGPORT=5432
PGDATABASE=mydb
PGUSER=postgres
PGPASSWORD=
PGSSLMODE=disable
PORT=3000
`;
}

function generateOutputPackageJson() {
  return JSON.stringify({
    name: 'pg-generated-webapp',
    version: '1.0.0',
    description: 'Auto-generated CRUD webapp (from pg-webapp-generator)',
    main: 'server.js',
    scripts: {
      start: 'node server.js',
    },
    engines: { node: '>=18' },
    dependencies: {
      cors: '^2.8.5',
      dotenv: '^16.4.5',
      express: '^4.19.2',
      pg: '^8.12.0',
    },
  }, null, 2) + '\n';
}

async function generateBackend(schema, outputDir) {
  const backendDir = outputDir;
  fs.mkdirSync(backendDir, { recursive: true });

  const files = {
    'server.js':       generateServerJs(),
    'db.js':           generateDbJs(),
    'routes.js':       generateRoutesJs(schema),
    'package.json':    generateOutputPackageJson(),
    '.env.example':    generateEnvExample(),
    '.gitignore':      'node_modules/\n.env\n.DS_Store\n',
    'README.md':
      '# Auto-Generated PostgreSQL Webapp\n\n' +
      'Generated: ' + schema.generatedAt + '\n\n' +
      'Database: `' + (schema.conn.database || '') + '` on `' +
      (schema.conn.host || '') + ':' + (schema.conn.port || '') + '` (user `' +
      (schema.conn.user || '') + '`)\n\n' +
      '## Run\n\n' +
      '```bash\n' +
      'cp .env.example .env   # edit credentials\n' +
      'npm install\n' +
      'npm start\n' +
      '```\n\n' +
      'Then open http://localhost:3000\n\n' +
      '## Tables\n\n' +
      schema.tables.map((t) =>
        '- `' + t.schema + '.' + t.name + '` (' + t.columns.length + ' cols, ' +
        (t.hasExplicitPk ? 'PK: ' + t.primaryKeys.join(',') : 'no explicit PK') +
        ')'
      ).join('\n') + '\n',
  };

  Object.entries(files).forEach(([name, content]) => {
    fs.writeFileSync(path.join(backendDir, name), content, 'utf8');
  });
}

module.exports = {
  generateBackend,
  generateServerJs,
  generateDbJs,
  generateRoutesJs,
  generateEnvExample,
  generateOutputPackageJson,
  sanitizeJsIdent,
};
