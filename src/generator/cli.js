'use strict';

const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { extractSchema } = require('./schemaExtractor');
const { generateBackend } = require('./backendGenerator');
const { generateFrontend } = require('./frontendGenerator');

async function runCli(argv) {
  const args = yargs(hideBin(argv || process.argv))
    .scriptName('pg-webapp-generator')
    .option('host', {
      type: 'string',
      describe: 'PostgreSQL hostname / IP',
      default: process.env.PGHOST || 'localhost',
    })
    .option('port', {
      type: 'number',
      describe: 'PostgreSQL port',
      default: Number(process.env.PGPORT || 5432),
    })
    .option('db', {
      alias: ['database', 'dbname'],
      type: 'string',
      describe: 'PostgreSQL database name',
      default: process.env.PGDATABASE || '',
    })
    .option('user', {
      alias: ['u', 'username'],
      type: 'string',
      describe: 'PostgreSQL username',
      default: process.env.PGUSER || 'postgres',
    })
    .option('pass', {
      alias: ['p', 'password'],
      type: 'string',
      describe: 'PostgreSQL password',
      default: process.env.PGPASSWORD || '',
    })
    .option('schema', {
      type: 'string',
      describe: 'PostgreSQL schema to scan',
      default: 'public',
    })
    .option('output', {
      alias: ['o', 'out'],
      type: 'string',
      describe: 'Output directory for generated webapp',
      demandOption: true,
      default: undefined,
    })
    .option('ssl', {
      type: 'boolean',
      describe: 'Require SSL connection to Postgres',
      default: false,
    })
    .option('overwrite', {
      type: 'boolean',
      describe: 'Overwrite existing output directory contents',
      default: false,
    })
    .example([
      [
        '$0 --host localhost --port 5432 --db mydb --user postgres --pass secret --output ./mywebapp',
        'Connect and generate a webapp for the "public" schema',
      ],
      [
        '$0 --db mydb --output ./webapp --schema sales',
        'Use default localhost/postgres/5432 credentials but target schema "sales"',
      ],
    ])
    .help('help')
    .parseSync();

  const missing = [];
  if (!args.db)   missing.push('--db / PGDATABASE');
  if (!args.host) missing.push('--host / PGHOST');
  if (missing.length) {
    console.error('Missing required connection parameter(s): ' + missing.join(', '));
    process.exitCode = 2;
    return false;
  }

  const outputDir = path.resolve(args.output);
  ensureOutputDir(outputDir, args.overwrite);

  console.log('🔌 Connecting to Postgres...');
  console.log('   host=' + args.host + ':' + args.port + '  db=' + args.db + '  user=' + args.user + '  schema=' + args.schema);

  let schema;
  try {
    schema = await extractSchema(
      {
        host: args.host,
        port: Number(args.port),
        database: args.db,
        user: args.user,
        password: args.pass,
        ssl: args.ssl || false,
      },
      { schema: args.schema }
    );
  } catch (err) {
    printPgConnectionError(err);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Extracted schema: ' + schema.tables.length + ' table(s)');
  schema.tables.forEach((t) => {
    const pkTag = t.hasExplicitPk
      ? ' [PK: ' + t.primaryKeys.join(',') + ']'
      : ' [NO EXPLICIT PK]';
    console.log('   - ' + t.schema + '.' + t.name + ' (' + t.columns.length + ' cols)' + pkTag);
  });

  console.log('📦 Generating backend...');
  await generateBackend(schema, outputDir);

  console.log('🎨 Generating frontend...');
  await generateFrontend(schema, outputDir);

  console.log('');
  console.log('✅ Done! Webapp written to ' + outputDir);
  console.log('');
  console.log('Next steps:');
  console.log('  cd ' + shellEscape(path.relative(process.cwd(), outputDir) || '.'));
  console.log('  cp .env.example .env   # edit credentials (DB password, etc.)');
  console.log('  npm install');
  console.log('  npm start');
  console.log('');
  console.log('Then open http://localhost:3000');
  return true;
}

function ensureOutputDir(dir, overwrite) {
  if (fs.existsSync(dir)) {
    const stats = fs.statSync(dir);
    if (!stats.isDirectory()) {
      throw new Error('Output path exists and is not a directory: ' + dir);
    }
    const entries = fs.readdirSync(dir);
    if (entries.length && !overwrite) {
      throw new Error(
        'Output directory is not empty (' + dir + '). Pass --overwrite to allow.'
      );
    }
    if (entries.length && overwrite) {
      console.warn('⚠️  --overwrite set; writing into existing directory: ' + dir);
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function printPgConnectionError(err) {
  const code = err && err.code;
  const msg = (err && err.message) || String(err);
  console.error('❌ Could not extract schema from Postgres.');
  console.error('   Error: ' + msg);
  if (err && err.detail) console.error('   Detail: ' + err.detail);
  if (code) console.error('   Code:  ' + code);

  const hints = [];
  switch (code) {
    case 'ECONNREFUSED':
      hints.push('Is Postgres running on the given host/port?');
      hints.push('Is a firewall blocking the connection?');
      break;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      hints.push('Hostname could not be resolved — check --host.');
      break;
    case '28P01':
    case 'INVALID_PASSWORD':
      hints.push('Check --pass / PGPASSWORD.');
      break;
    case '28000':
    case '22023':
    case '3D000':
      hints.push('Database name invalid or access denied — check --db.');
      break;
    case '28P01':
      hints.push('Password authentication failed.');
      break;
    default:
      hints.push('Verify host, port, user, password, and database name.');
  }
  hints.forEach((h) => console.error('   • ' + h));
}

function shellEscape(s) {
  if (!s) return '';
  return /[\s'"\\]/.test(s) ? "'" + s.replace(/'/g, "'\\''") + "'" : s;
}

module.exports = { runCli };
