#!/usr/bin/env node
'use strict';

const { runCli } = require('./src/generator/cli');

runCli(process.argv).then(
  () => { /* exit code already set on failure */ },
  (err) => {
    console.error('Fatal error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
);
