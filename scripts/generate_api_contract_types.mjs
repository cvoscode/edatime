#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const contractUrl = new URL('../contracts/api-v1.json', import.meta.url);
const outputUrl = new URL('../frontend/src/contracts/api/v1/generated.ts', import.meta.url);
const contract = JSON.parse(await readFile(contractUrl, 'utf8'));

function identifier(value) {
    return String(value)
        .replaceAll(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
        .replace(/^[^a-zA-Z]+/, '')
        || 'operation';
}

const seen = new Set();
const operations = (contract.operations ?? []).map((operation) => {
    const id = identifier(operation.method.toLowerCase() + '-' + operation.path.slice('/api/v1/'.length));
    if (seen.has(id)) throw new Error('Generated operation ID collision: ' + id);
    seen.add(id);
    return {
        id,
        method: operation.method,
        path: operation.path,
        request: operation.request ?? null,
        response: operation.response,
        contentType: operation.contentType,
        planAware: Boolean(operation.planAware),
    };
});

const document = [
    '/**',
    ' * Generated from contracts/api-v1.json by scripts/generate_api_contract_types.mjs.',
    ' * Do not edit by hand.',
    ' */',
    '',
    'export const apiContractVersion = ' + JSON.stringify(contract.version) + ' as const;',
    '',
    'export const apiV1Operations = ' + JSON.stringify(operations, null, 4) + ' as const;',
    '',
    'export type ApiV1Operation = typeof apiV1Operations[number];',
    'export type ApiV1OperationId = ApiV1Operation[\'id\'];',
    'export type ApiV1OperationMethod = ApiV1Operation[\'method\'];',
    '',
].join('\n');

if (process.argv.includes('--check')) {
    const existing = await readFile(outputUrl, 'utf8').catch(() => '');
    if (existing !== document) {
        process.stderr.write('frontend/src/contracts/api/v1/generated.ts is stale; run npm run generate:api-contract\n');
        process.exit(1);
    }
    process.stdout.write('Generated API operation contract OK: ' + operations.length + ' operations\n');
} else {
    await writeFile(outputUrl, document);
    process.stdout.write('Generated API operation contract: ' + operations.length + ' operations\n');
}
