'use strict';

try { require('dotenv').config(); } catch (_) {}

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { extractSchema } = require('./src/generator/schemaExtractor');
const { generateBackend } = require('./src/generator/backendGenerator');
const { generateFrontend } = require('./src/generator/frontendGenerator');
const interpreter = require('./interpreter');

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_OUTPUT_DIR = path.resolve(path.join(__dirname, 'generated-webapp'));

function listOutputFiles(dir, base) {
  const out = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      const rel = path.relative(base, p);
      if (e.isDirectory()) {
        out.push({ name: rel + '/', type: 'dir', size: null });
        out.push(...listOutputFiles(p, base));
      } else {
        try {
          const st = fs.statSync(p);
          out.push({ name: rel, type: 'file', size: st.size });
        } catch (_) {}
      }
    }
  } catch (_) {}
  return out;
}

function formatError(err) {
  const code = err && err.code;
  const out = {
    error: (err && err.message) ? err.message : String(err),
    step: err && err.step ? err.step : 'unknown',
  };
  if (code) out.code = code;
  if (err && err.detail) out.detail = err.detail;
  if (err && err.hint)   out.hint = err.hint;
  if (err && err.column) out.column = err.column;

  const hints = [];
  switch (code) {
    case 'ECONNREFUSED':
      hints.push('Is Postgres running on the given host/port?');
      hints.push('Is a firewall blocking the connection?');
      break;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      hints.push('Hostname could not be resolved — check hostname.');
      break;
    case '28P01':
    case '28000':
      hints.push('Password authentication failed — check username/password.');
      break;
    case '3D000':
      hints.push('Database does not exist or is not accessible — check database name.');
      break;
  }
  if (hints.length) out.hints = hints;
  return out;
}

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'generator-ui')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.post('/api/generate', async (req, res, next) => {
    try {
      const body = req.body || {};
      const host     = String(body.host     || 'localhost').trim();
      const port     = Number(body.port     || 5432);
      const database = String(body.database || '').trim();
      const user     = String(body.user     || 'postgres').trim();
      const password = body.password == null ? '' : String(body.password);
      const schema   = String(body.schema   || 'public').trim();
      const output   = String(body.output   || '').trim() || DEFAULT_OUTPUT_DIR;
      const ssl      = !!body.ssl;
      const overwrite = !!body.overwrite;

      if (!database) {
        return res.status(400).json({ error: 'Database name is required.', step: 'validate' });
      }
      if (!user) {
        return res.status(400).json({ error: 'User is required.', step: 'validate' });
      }
      if (!host) {
        return res.status(400).json({ error: 'Hostname is required.', step: 'validate' });
      }
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        return res.status(400).json({ error: 'Port must be a valid integer 1-65535.', step: 'validate' });
      }

      const outputDir = path.isAbsolute(output) ? output : path.resolve(path.join(__dirname, output));

      // Ensure output directory rules
      try {
        if (fs.existsSync(outputDir)) {
          const st = fs.statSync(outputDir);
          if (!st.isDirectory()) {
            const e = new Error('Output path exists and is not a directory.');
            e.step = 'validate';
            throw e;
          }
          const entries = fs.readdirSync(outputDir);
          if (entries.length && !overwrite) {
            const e = new Error('Output directory is not empty. Confirm overwrite to proceed.');
            e.step = 'validate';
            throw e;
          }
        } else {
          fs.mkdirSync(outputDir, { recursive: true });
        }
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          fs.mkdirSync(outputDir, { recursive: true });
        } else {
          return res.status(400).json(formatError(Object.assign(err || {}, { step: err && err.step || 'output' })));
        }
      }

      let schemaObj;
      try {
        schemaObj = await extractSchema(
          { host, port, database, user, password, ssl },
          { schema }
        );
      } catch (err) {
        err = err || new Error('Unknown schema extraction error');
        err.step = 'connect';
        return res.status(400).json(formatError(err));
      }

      try {
        await generateBackend(schemaObj, outputDir);
      } catch (err) {
        err = err || new Error('Backend generation failed');
        err.step = 'generate-backend';
        return res.status(500).json(formatError(err));
      }

      try {
        await generateFrontend(schemaObj, outputDir);
      } catch (err) {
        err = err || new Error('Frontend generation failed');
        err.step = 'generate-frontend';
        return res.status(500).json(formatError(err));
      }

      const relativeOutput = path.relative(__dirname, outputDir) || '.';
      const totalFiles = listOutputFiles(outputDir, outputDir);

      return res.json({
        ok: true,
        outputDir,
        relativeOutputDir: relativeOutput,
        tables: schemaObj.tables.map((t) => ({
          name: t.name,
          schema: t.schema,
          columns: t.columns.length,
          primaryKeys: t.primaryKeys,
          hasExplicitPk: t.hasExplicitPk,
        })),
        totalTables: schemaObj.tables.length,
        generatedAt: schemaObj.generatedAt,
        totalFiles: totalFiles.length,
        files: totalFiles.slice(0, 200),
        nextSteps: [
          'cd ' + (relativeOutput.startsWith('.') ? relativeOutput : './' + relativeOutput),
          'cp .env.example .env   # fill in DB password',
          'npm install',
          'npm start               # then open http://localhost:3000',
        ],
      });
    } catch (err) {
      next(err);
    }
  });

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
    console.error('[gen-ui error]', err && err.stack ? err.stack : err);
    res.status(500).json(formatError(err));
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log('Generator UI listening on http://localhost:' + PORT);
  });
}

module.exports = { createApp, PORT };
