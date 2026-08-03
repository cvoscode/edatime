#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const deniedDirectories = [
  '.playwright-mcp/',
  'tmp/',
  'docs/_build/',
  'crates/edatime-bin/frontend/dist/',
];
const deniedFiles = new Set([
  '.repowise/state.json',
  '.repowise/wiki.db',
]);
const deniedSuffixes = ['.bak', '.old', '.orig', '~'];

const violations = tracked.filter((file) => (
  deniedFiles.has(file)
  || deniedDirectories.some((directory) => file.startsWith(directory))
  || deniedSuffixes.some((suffix) => file.endsWith(suffix))
));

if (violations.length > 0) {
  process.stderr.write('Tracked generated or backup files are not allowed:\n');
  for (const file of violations) process.stderr.write(`- ${file}\n`);
  process.exit(1);
}

process.stdout.write(`Repository hygiene OK: ${tracked.length} tracked files contain no generated output.\n`);
