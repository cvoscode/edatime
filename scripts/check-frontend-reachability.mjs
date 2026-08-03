#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, dirname, join, normalize } from 'node:path';

const sourceRoot = resolve('frontend/src');
const modules = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(file);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)
      || entry.name.endsWith('.d.ts')
      || /\.(test|spec|bench)\.tsx?$/.test(entry.name)
      || file.includes(`${sourceRoot}/__mocks__/`)) continue;
    modules.push(normalize(file));
  }
}

function resolveImport(from, specifier, knownModules) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.jsx$/, '.tsx'),
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ].map(normalize);
  return candidates.find((candidate) => knownModules.has(candidate)) ?? null;
}

visit(sourceRoot);
const knownModules = new Set(modules);
const roots = [normalize(join(sourceRoot, 'app.ts'))];
const reachable = new Set();
const pending = [...roots];
const importPattern = /(?:\bfrom\s*|\bimport\s*\()["']([^"']+)["']/g;

while (pending.length > 0) {
  const file = pending.pop();
  if (!file || reachable.has(file) || !knownModules.has(file)) continue;
  reachable.add(file);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(importPattern)) {
    const dependency = resolveImport(file, match[1], knownModules);
    if (dependency) pending.push(dependency);
  }
}

const unreachable = modules
  .filter((file) => !reachable.has(file))
  .map((file) => relative(process.cwd(), file))
  .sort();

if (unreachable.length > 0) {
  process.stderr.write('Unreachable production frontend modules:\n');
  for (const file of unreachable) process.stderr.write(`- ${file}\n`);
  process.stderr.write('Add a real entry point or remove the dead module.\n');
  process.exit(1);
}

if (!existsSync(roots[0])) {
  process.stderr.write('Frontend application entry point is missing.\n');
  process.exit(1);
}

process.stdout.write(`Frontend reachability OK: ${reachable.size} production modules reachable from app.ts.\n`);
