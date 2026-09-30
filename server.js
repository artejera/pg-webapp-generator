'use strict';

try { require('dotenv').config(); } catch (_) {}

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const interpreter = require('./interpreter');
const auth = require('./auth');
const { VERSION, BUILT_AT } = require('./version');

const PORT = Number(process.env.PORT || 3001);

function sendError(res, err) {
  const status = (err && typeof err.status === 'number') ? err.status : 500;
  const body = { error: (err && err.message) ? err.message : String(err) };
  if (err && err.code)   body.code   = err.code;
  if (err && err.detail) body.detail = err.detail;
  if (err && err.hint)   body.hint   = err.hint;
  if (err && err.column) body.column = err.column;
  if (err && err.table)  body.table  = err.table;
  if (err && err.hints && err.hints.length) body.hints = err.hints;
  res.status(status >= 400 ? status : 500).json(body);
}

function withSession(req, _res, next) {
  try { auth.requireSession(req); }
  catch (e) { return sendError(_res, e); }
  req.auth = auth.readSession(req);
  next();
}

function authHeaders() {
  return { 'WWW-Authenticate': 'Bearer realm="pg-ddl-interpreter"' };
}

function isUsersTable(conn, tableName) {
  if (!conn || !tableName) return false;
  if (String(tableName).toLowerCase() !== 'users') return false;
  const t = (conn.schemaObj && conn.schemaObj.tables || []).find(t => t.name === tableName);
  if (!t) return false;
  const names = new Set((t.columns || []).map(c => String(c.name).toLowerCase()));
  const required = ['username', 'password', 'role'];
  return required.every(c => names.has(c));
}

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/version', (_req, res) => {
    res.json({ version: VERSION, builtAt: BUILT_AT });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), version: VERSION });
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const b = req.body || {};
      const username = String(b.username || '').trim();
      const password = String(b.password === undefined ? '' : b.password);
      if (!username) {
        const e = new Error('Username is required.');
        e.status = 400; e.code = 'AUTH_VALIDATION'; throw e;
      }
      const result = auth.authenticate(username, password);
      if (!result) {
        const e = new Error('Invalid username or password.');
        e.status = 401; e.code = 'AUTH_BAD_CREDENTIALS';
        e.hints = ['If you just installed, the default admin password is "admin123".'];
        res.set(authHeaders());
        return sendError(res, e);
      }
      return res.json({ sessionId: result.sessionId, user: result.user, ttlMs: auth.TTL_MS, version: VERSION });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    try {
      return res.json(auth.endSession(req));
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/auth/session', (req, res) => {
    try {
      const s = auth.readSession(req);
      if (!s) {
        const e = new Error('Not signed in.');
        e.status = 401; e.code = 'AUTH_REQUIRED';
        res.set(authHeaders());
        return sendError(res, e);
      }
      return res.json({
        signedIn: true,
        username: s.username,
        role: s.role,
        expiresAt: new Date(s.expiresAt).toISOString(),
        version: VERSION,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/auth/users', (req, res) => {
    try {
      const s = auth.requireSession(req);
      return res.json({ users: auth.listUsers(s), version: VERSION });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.post('/api/auth/users', (req, res) => {
    try {
      const s = auth.requireSession(req);
      const u = auth.createUser(s, req.body || {});
      return res.status(201).json({ user: u });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.put('/api/auth/users/:username', (req, res) => {
    try {
      const s = auth.requireSession(req);
      const u = auth.updateUser(s, req.params.username, req.body || {});
      return res.json({ user: u });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.delete('/api/auth/users/:username', (req, res) => {
    try {
      const s = auth.requireSession(req);
      return res.json(auth.deleteUser(s, req.params.username));
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/interpreter/status', withSession, (req, res) => {
    const conn = interpreter.findConnection(req);
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: true,
      connection: interpreter.maskPassword(conn),
      availableSchemas: conn.availableSchemas || [conn.schema],
      schemaTables: conn.schemaObj.tables.map((t) => ({
        name: t.name,
        schema: t.schema,
        columns: t.columns.length,
        primaryKeys: t.primaryKeys,
        hasExplicitPk: t.hasExplicitPk,
        foreignKeys: t.foreignKeys.length,
      })),
      masterDetailPairs: interpreter.detectMasterDetailPairs(conn.schemaObj),
      auth: { username: req.auth.username, role: req.auth.role },
      version: VERSION,
    });
  });

  app.post('/api/interpreter/connect', withSession, async (req, res, next) => {
    try {
      const conn = await interpreter.connectAndStore(req.body || {});
      res.json({
        connected: true,
        connectionId: conn.id,
        connection: interpreter.maskPassword(conn),
        availableSchemas: conn.availableSchemas || [conn.schema],
        schemaTables: conn.schemaObj.tables.map((t) => ({
          name: t.name,
          schema: t.schema,
          columns: t.columns.length,
          primaryKeys: t.primaryKeys,
          hasExplicitPk: t.hasExplicitPk,
          foreignKeys: t.foreignKeys.length,
        })),
        masterDetailPairs: interpreter.detectMasterDetailPairs(conn.schemaObj),
        auth: { username: req.auth.username, role: req.auth.role },
        version: VERSION,
      });
    } catch (err) {
      if (next && false) return next(err);
      return sendError(res, err);
    }
  });

  app.post('/api/interpreter/schema', withSession, async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const schema = String((req.body && req.body.schema) || '').trim();
      await interpreter.switchSchema(conn, schema);
      return res.json({
        connected: true,
        connectionId: conn.id,
        connection: interpreter.maskPassword(conn),
        availableSchemas: conn.availableSchemas || [conn.schema],
        schemaTables: conn.schemaObj.tables.map((t) => ({
          name: t.name,
          schema: t.schema,
          columns: t.columns.length,
          primaryKeys: t.primaryKeys,
          hasExplicitPk: t.hasExplicitPk,
          foreignKeys: t.foreignKeys.length,
        })),
        masterDetailPairs: interpreter.detectMasterDetailPairs(conn.schemaObj),
        version: VERSION,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.post('/api/interpreter/disconnect', withSession, async (req, res) => {
    try {
      const id = (req.body && req.body.connectionId) || (req.headers['x-pg-conn-id']);
      const r = await interpreter.disconnect(id || '');
      return res.json(r);
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/interpreter/schema', withSession, (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const tables = conn.schemaObj.tables.map((t) => ({
        name: t.name,
        schema: t.schema,
        quotedName: t.quotedName,
        columns: t.columns,
        primaryKeys: t.primaryKeys,
        effectiveKeys: t.effectiveKeys,
        hasExplicitPk: t.hasExplicitPk,
        foreignKeys: t.foreignKeys,
      }));
      return res.json({
        schema: conn.schemaObj.schema,
        generatedAt: conn.schemaObj.generatedAt,
        connection: interpreter.maskPassword(conn),
        availableSchemas: conn.availableSchemas || [conn.schema],
        tables,
        masterDetailPairs: interpreter.detectMasterDetailPairs(conn.schemaObj),
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/interpreter/tables/:table/meta', withSession, (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      return res.json({
        name: t.name,
        schema: t.schema,
        quotedName: t.quotedName,
        columns: t.columns,
        primaryKeys: t.primaryKeys,
        effectiveKeys: t.effectiveKeys,
        hasExplicitPk: t.hasExplicitPk,
        foreignKeys: t.foreignKeys,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/interpreter/tables/:table/rows', withSession, async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      if (isUsersTable(conn, t.name)) {
        if (req.auth.role !== 'admin') {
          const e = new Error('Forbidden: admin access required to list users from the users table directly.');
          e.status = 403; e.code = 'AUTH_FORBIDDEN';
          e.hints = ['Use the Users management page or the /api/auth/users endpoint (admin only).'];
          throw e;
        }
      }
      const filter = {};
      const q = req.query || {};
      if (q && typeof q === 'object') {
        for (const k of Object.keys(q)) {
          if (k.startsWith('filter.')) {
            const col = k.slice('filter.'.length);
            if (col) filter[col] = q[k];
          }
        }
      }
      const data = await interpreter.listRows(conn, t, req.query.limit, req.query.offset, Object.keys(filter).length ? filter : null);
      return res.json(data);
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/api/interpreter/tables/:table/rows/:key', withSession, async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      if (isUsersTable(conn, t.name)) {
        if (req.auth.role !== 'admin') {
          const e = new Error('Forbidden: admin access required to read users-table rows directly.');
          e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
        }
      }
      const row = await interpreter.getRow(conn, t, req.params.key);
      return res.json({ row });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.post('/api/interpreter/tables/:table/rows', withSession, async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      if (isUsersTable(conn, t.name)) {
        auth.enforceOnUsersTable(req.auth, 'create', req.body || {}, null, null);
        if (req.body && typeof req.body.password === 'string') {
          const crypto = require('crypto');
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.pbkdf2Sync(req.body.password, salt, 120000, 32, 'sha256').toString('hex');
          req.body.password = 'pbkdf2$sha256$120000$' + salt + '$' + hash;
        }
      }
      const row = await interpreter.createRow(conn, t, req.body || {});
      return res.status(201).json({ row });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.put('/api/interpreter/tables/:table/rows/:key', withSession, async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      if (isUsersTable(conn, t.name)) {
        const existing = await interpreter.getRow(conn, t, req.params.key);
        auth.enforceOnUsersTable(req.auth, 'update', req.body || {}, req.params.key, existing || null);
        if (req.body && typeof req.body.password === 'string') {
          const crypto = require('crypto');
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.pbkdf2Sync(req.body.password, salt, 120000, 32, 'sha256').toString('hex');
          req.body.password = 'pbkdf2$sha256$120000$' + salt + '$' + hash;
        }
      }
      const row = await interpreter.updateRow(conn, t, req.params.key, req.body || {});
      return res.json({ row });
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.delete('/api/interpreter/tables/:table/rows/:key', withSession, async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      if (isUsersTable(conn, t.name)) {
        const existing = await interpreter.getRow(conn, t, req.params.key);
        auth.enforceOnUsersTable(req.auth, 'delete', req.body || {}, req.params.key, existing || null);
      }
      const r = await interpreter.deleteRow(conn, t, req.params.key);
      return res.json(r);
    } catch (err) {
      return sendError(res, err);
    }
  });

  app.get('/', (_req, res) => res.redirect('/app'));

  app.get('/app', (_req, res) => {
    const p = path.join(__dirname, 'interpreter-ui', 'index.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).json({ error: 'Interpreter UI not found.' });
  });
  app.use('/app', express.static(path.join(__dirname, 'interpreter-ui')));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    console.error('[server error]', err && err.stack ? err.stack : err);
    res.status(500).json({
      error: (err && err.message) ? err.message : String(err),
      code: (err && err.code) ? err.code : undefined,
    });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Postgres interpreter ${VERSION} listening on http://localhost:${PORT}/app`);
    console.log(`  Default admin: admin / admin123  (override env AUTH_ADMIN_PASSWORD on first run)`);
  });
}

module.exports = { createApp, PORT, VERSION };
