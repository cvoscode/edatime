#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const failures = [];

for (const obsolete of [
    'crates/edatime-service/src/dto.rs',
    'crates/edatime-service/src/metrics.rs',
    'src/main.rs',
]) {
    try {
        await access(new URL(obsolete, root));
        failures.push(`obsolete backend surface still exists: ${obsolete}`);
    } catch { /* expected */ }
}

for await (const relative of glob('crates/**/src/**/*.rs', { cwd: new URL(root), exclude: ['**/target/**'] })) {
    const source = await readFile(new URL(relative, root), 'utf8');
    const productionSource = source.split(/#\[cfg\(test\)\]/, 1)[0];
    if (relative !== 'crates/edatime-query/src/executor.rs' && productionSource.includes('tokio::task::spawn_blocking')) {
        failures.push(`production spawn_blocking must be owned by QueryExecutor: ${relative}`);
    }
    for (const match of productionSource.matchAll(/["`]\/api\/(?!v1(?:\/|["`]))[^"`\s]*/g)) {
        failures.push(`unversioned API path in backend source ${relative}: ${match[0]}`);
    }
}

for await (const relative of glob('docs/**/*.md', {
    cwd: new URL(root),
    exclude: ['docs/_build/**', 'docs/superpowers/**', 'docs/developer/architecture.md'],
})) {
    const source = await readFile(new URL(relative, root), 'utf8');
    for (const match of source.matchAll(/(?<!services)\/api\/(?!v1(?:\/|\b))[^\s)`"']*/g)) {
        failures.push(`unversioned API path in active documentation ${relative}: ${match[0]}`);
    }
}

if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exit(1);
}
process.stdout.write('Backend hygiene OK: one binary, metrics owner, DTO surface, blocking executor, and versioned active docs\n');
