'use strict';

try { require('dotenv').config(); } catch (_) {}

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const interpreter = require('./interpreter');

const PORT = Number(process.env.PORT || 3001);

function sendInterpreterError(res, err) {
  const status = (err && typeof err.status === 'number') ? err.status : 500;
  const body = {
    error: (err && err.message) ? err.message : String(err),
  };
  if (err && err.code)   body.code   = err.code;
  if (err && err.detail) body.detail = err.detail;
  if (err && err.hint)   body.hint   = err.hint;
  if (err && err.column) body.column = err.column;
  if (err && err.table)  body.table  = err.table;
  if (err && err.hints && err.hints.length) body.hints = err.hints;
  res.status(status >= 400 ? status : 500).json(body);
}

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/interpreter/status', (req, res) => {
    const conn = interpreter.findConnection(req);
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: true,
      connection: interpreter.maskPassword(conn),
      schemaTables: conn.schemaObj.tables.map((t) => ({
        name: t.name,
        schema: t.schema,
        columns: t.columns.length,
        primaryKeys: t.primaryKeys,
        hasExplicitPk: t.hasExplicitPk,
        foreignKeys: t.foreignKeys.length,
      })),
    });
  });

  app.post('/api/interpreter/connect', async (req, res, next) => {
    try {
      const conn = await interpreter.connectAndStore(req.body || {});
      res.json({
        connected: true,
        connectionId: conn.id,
        connection: interpreter.maskPassword(conn),
        schemaTables: conn.schemaObj.tables.map((t) => ({
          name: t.name,
          schema: t.schema,
          columns: t.columns.length,
          primaryKeys: t.primaryKeys,
          hasExplicitPk: t.hasExplicitPk,
          foreignKeys: t.foreignKeys.length,
          tables: { columns: t.columns.map(c => c.name) },
        })),
      });
    } catch (err) {
      if (next && false) return next(err);
      return sendInterpreterError(res, err);
    }
  });

  app.post('/api/interpreter/disconnect', async (req, res) => {
    try {
      const id = (req.body && req.body.connectionId) || (req.headers['x-pg-conn-id']);
      const r = await interpreter.disconnect(id || '');
      return res.json(r);
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.get('/api/interpreter/schema', (req, res) => {
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
        tables,
      });
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.get('/api/interpreter/tables/:table/meta', (req, res) => {
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
      return sendInterpreterError(res, err);
    }
  });

  app.get('/api/interpreter/tables/:table/rows', async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      const data = await interpreter.listRows(conn, t, req.query.limit, req.query.offset);
      return res.json(data);
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.get('/api/interpreter/tables/:table/rows/:key', async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      const row = await interpreter.getRow(conn, t, req.params.key);
      return res.json({ row });
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.post('/api/interpreter/tables/:table/rows', async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      const row = await interpreter.createRow(conn, t, req.body || {});
      return res.status(201).json({ row });
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.put('/api/interpreter/tables/:table/rows/:key', async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      const row = await interpreter.updateRow(conn, t, req.params.key, req.body || {});
      return res.json({ row });
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.delete('/api/interpreter/tables/:table/rows/:key', async (req, res) => {
    try {
      const conn = interpreter.requireConnection(req);
      const t = interpreter.tableMeta(conn, req.params.table);
      const r = await interpreter.deleteRow(conn, t, req.params.key);
      return res.json(r);
    } catch (err) {
      return sendInterpreterError(res, err);
    }
  });

  app.get('/', (_req, res) => res.redirect('/app'));

  app.get('/app', (_req, res) => {
    const p = path.join(__dirname, 'interpreter-ui', 'index.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).json({ error: 'Interpreter UI not found. Build interpreter-ui/index.html.' });
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
    console.log('Postgres interpreter listening on http://localhost:' + PORT + '/app');
  });
}

module.exports = { createApp, PORT };
