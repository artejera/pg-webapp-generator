'use strict';

const { Pool } = require('pg');

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function extractSchema(conn, opts = {}) {
  const schemaName = opts.schema || 'public';
  const pool = new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    ssl: conn.ssl || false,
  });

  try {
    await pool.query('SELECT 1');

    const tablesRes = await pool.query(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [schemaName]
    );

    const tableRows = tablesRes.rows;
    if (!tableRows.length) {
      throw new Error(
        `No tables found in schema "${schemaName}". Specify a different schema via --schema.`
      );
    }

    const tables = [];

    for (const t of tableRows) {
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

      const pkRes = await pool.query(
        `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema   = kcu.table_schema
            AND tc.table_name     = kcu.table_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema    = $1
            AND tc.table_name      = $2
          ORDER BY kcu.ordinal_position`,
        [t.table_schema, t.table_name]
      );

      const fkRes = await pool.query(
        `SELECT
           kcu.column_name,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name   AS foreign_table_name,
           ccu.column_name  AS foreign_column_name,
           tc.constraint_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
          AND tc.table_name      = kcu.table_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema    = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema    = $1
          AND tc.table_name      = $2`,
        [t.table_schema, t.table_name]
      );

      const uniqueRes = await pool.query(
        `SELECT DISTINCT
           kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
          AND tc.table_name      = kcu.table_name
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema    = $1
          AND tc.table_name      = $2`,
        [t.table_schema, t.table_name]
      );

      const columns = columnsRes.rows.map((c) => ({
        name: c.column_name,
        dataType: c.data_type,
        udtName: c.udt_name,
        isNullable: c.is_nullable === 'YES',
        default: c.column_default,
        maxLength: c.character_maximum_length,
        numericPrecision: c.numeric_precision,
        numericScale: c.numeric_scale,
        datetimePrecision: c.datetime_precision,
        isIdentity: c.is_identity === 'YES',
        identityGeneration: c.identity_generation,
        isUnique: uniqueRes.rows.some((u) => u.column_name === c.column_name),
        hasDefault: c.column_default != null || c.is_identity === 'YES',
      }));

      const primaryKeys = pkRes.rows.map((r) => r.column_name);
      const foreignKeys = fkRes.rows.map((r) => ({
        column: r.column_name,
        foreignSchema: r.foreign_table_schema,
        foreignTable: r.foreign_table_name,
        foreignColumn: r.foreign_column_name,
        constraintName: r.constraint_name,
      }));

      tables.push({
        schema: t.table_schema,
        name: t.table_name,
        quotedName: quoteIdent(t.table_schema) + '.' + quoteIdent(t.table_name),
        columns,
        primaryKeys,
        foreignKeys,
        effectiveKeys: primaryKeys.length
          ? primaryKeys
          : columns.map((c) => c.name),
        hasExplicitPk: primaryKeys.length > 0,
      });
    }

    return {
      schema: schemaName,
      generatedAt: new Date().toISOString(),
      conn: {
        host: conn.host,
        port: conn.port,
        database: conn.database,
        user: conn.user,
        password: conn.password == null ? '' : String(conn.password),
        ssl: !!conn.ssl,
      },
      tables,
    };
  } finally {
    await pool.end();
  }
}

function classifyColumnType(col) {
  const udt = (col.udtName || '').toLowerCase();
  const dt = (col.dataType || '').toLowerCase();
  const combined = dt + ':' + udt;

  if (/bool/.test(combined)) return 'boolean';
  if (/(int|serial|oid)/.test(combined)) return 'integer';
  if (/(numeric|decimal|float|double|real)/.test(combined)) return 'number';
  if (/(json|jsonb)/.test(combined)) return 'json';
  if (/(bytea|blob)/.test(combined)) return 'binary';
  if (/(date|time|timestamp|interval)/.test(combined)) return 'datetime';
  if (/(uuid)/.test(combined)) return 'uuid';
  if (/(text|char|cidr|inet|macaddr|xml|name|money)/.test(combined)) return 'text';
  if (/(array)/.test(combined)) return 'json';
  return 'text';
}

module.exports = {
  extractSchema,
  quoteIdent,
  classifyColumnType,
};
