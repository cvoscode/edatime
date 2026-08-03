#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const contract = JSON.parse(await readFile(new URL('../contracts/api-v1.json', import.meta.url)));
const router = await readFile(new URL('../crates/edatime-service/src/handlers/routes/mod.rs', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../frontend/src/contracts/api/v1/routes.ts', import.meta.url), 'utf8');

const failures = [];
const keys = new Set();
for (const operation of contract.operations ?? []) {
    const key = `${operation.method} ${operation.path}`;
    if (keys.has(key)) failures.push(`duplicate contract operation: ${key}`);
    keys.add(key);
    if (!operation.path.startsWith('/api/v1/')) failures.push(`unversioned path: ${key}`);

    const relative = operation.path.slice('/api/v1'.length).replaceAll(/\{[^}]+\}/g, '{');
    const staticPrefix = relative.split('{')[0];
    const routerFragment = staticPrefix.startsWith('/analytics/')
        ? staticPrefix.slice('/analytics'.length)
        : staticPrefix;
    if (!router.includes(`\"${routerFragment}`)) failures.push(`backend route missing from router source: ${key}`);
}

for (const match of frontend.matchAll(/['`]\/api\/v1\/([^'`$]*)/g)) {
    const prefix = `/api/v1/${match[1]}`;
    if (!contract.operations.some((operation) => operation.path.startsWith(prefix))) {
        failures.push(`frontend route missing from contract: ${prefix}`);
    }
}

for (const required of ['error', 'headers', 'version']) {
    if (!contract[required]) failures.push(`contract section missing: ${required}`);
}

if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exit(1);
}
process.stdout.write(`API contract OK: ${keys.size} operations\n`);
