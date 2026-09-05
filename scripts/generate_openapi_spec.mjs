#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const contractUrl = new URL('../contracts/api-v1.json', import.meta.url);
const outputUrl = new URL('../contracts/openapi-v1.json', import.meta.url);
const contract = JSON.parse(await readFile(contractUrl, 'utf8'));

function identifier(value) {
    return String(value)
        .replaceAll(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
        .replace(/^[^a-zA-Z]+/, '')
        || 'operation';
}

function schemaName(value) {
    return String(value).replaceAll(/[^A-Za-z0-9_]/g, '') || 'UnknownResponse';
}

function objectSchema(name) {
    return {
        type: 'object',
        additionalProperties: true,
        description: `${name} is a versioned application DTO. Its field-level schema is introduced incrementally in contracts/api-v1.json.`,
    };
}

function binarySchema() {
    return { type: 'string', format: 'binary' };
}

function contentFor(names, contentTypes, schemas) {
    const result = {};
    const responses = String(names).split('|');
    const types = String(contentTypes).split('|');
    for (let index = 0; index < types.length; index += 1) {
        const contentType = types[index];
        const name = responses[index] ?? responses[0];
        const isBinary = contentType === 'application/vnd.apache.arrow.stream'
            || contentType === 'application/vnd.apache.parquet'
            || contentType === 'application/octet-stream'
            || contentType === 'application/zip'
            || contentType === 'text/plain'
            || name === 'File'
            || name === 'ArrowData'
            || name === 'PrometheusMetrics';
        result[contentType] = {
            schema: isBinary
                ? binarySchema()
                : { $ref: `#/components/schemas/${schemaName(name)}` },
        };
        if (!isBinary && !schemas[schemaName(name)]) {
            schemas[schemaName(name)] = objectSchema(name);
        }
    }
    return result;
}

function requestBody(operation, schemas) {
    if (!operation.request || operation.method === 'GET' || operation.method === 'DELETE') return undefined;
    if (operation.request === 'MultipartUpload') {
        return {
            required: true,
            content: {
                'multipart/form-data': {
                    schema: {
                        type: 'object',
                        additionalProperties: true,
                        description: 'Multipart upload payload; file and optional selection fields are validated by the upload handler.',
                    },
                },
            },
        };
    }
    const name = schemaName(operation.request);
    if (!schemas[name]) schemas[name] = objectSchema(operation.request);
    return {
        required: true,
        content: {
            'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
        },
    };
}

function pathParameters(path) {
    return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
        name: match[1],
        in: 'path',
        required: true,
        schema: { type: 'string', minLength: 1 },
    }));
}

const schemas = {
    ErrorResponse: {
        type: 'object',
        additionalProperties: false,
        required: contract.error.required,
        properties: {
            error: { type: 'string', minLength: 1 },
            message: { type: 'string', minLength: 1 },
            kind: {
                type: 'string',
                enum: ['validation', 'conflict', 'internal', 'rate_limit', 'not_found', 'unsupported', 'unavailable'],
            },
            code: { type: 'string', minLength: 1 },
            correlation_id: { type: 'string', minLength: 1 },
            request_id: { type: 'string', minLength: 1 },
        },
    },
    ...(contract.schemas ?? {}),
};

const paths = {};
for (const operation of contract.operations ?? []) {
    const path = operation.path.slice(contract.basePath.length) || '/';
    const method = operation.method.toLowerCase();
    const responseHeaders = {};
    for (const value of Object.values(contract.headers ?? {})) {
        if (typeof value === 'string' && value.startsWith('x-')) {
            responseHeaders[value] = { schema: { type: 'string' } };
        }
    }
    const operationSpec = {
        operationId: identifier(`${method}-${path}`),
        summary: `${operation.method} ${operation.path}`,
        ...(operation.planAware ? { tags: ['plan-aware'] } : {}),
        ...(pathParameters(path).length > 0 ? { parameters: pathParameters(path) } : {}),
        ...(requestBody(operation, schemas) ? { requestBody: requestBody(operation, schemas) } : {}),
        responses: {
            200: {
                description: 'Successful response',
                headers: responseHeaders,
                content: contentFor(operation.response, operation.contentType, schemas),
            },
            default: {
                description: 'Structured application error',
                content: {
                    [contract.error.contentType]: { schema: { $ref: '#/components/schemas/ErrorResponse' } },
                },
            },
        },
    };
    paths[path] ??= {};
    if (paths[path][method]) throw new Error(`Duplicate OpenAPI operation: ${operation.method} ${operation.path}`);
    paths[path][method] = operationSpec;
}

const document = `${JSON.stringify({
    openapi: '3.1.0',
    info: {
        title: contract.title,
        version: contract.version,
        description: 'Generated from contracts/api-v1.json. Route identity is complete; DTO field schemas are migrated incrementally.',
    },
    servers: [{ url: contract.basePath }],
    paths,
    components: { schemas },
}, null, 2)}\n`;

if (process.argv.includes('--check')) {
    const existing = await readFile(outputUrl, 'utf8').catch(() => '');
    if (existing !== document) {
        process.stderr.write('contracts/openapi-v1.json is stale; run npm run generate:openapi\n');
        process.exit(1);
    }
    process.stdout.write(`OpenAPI 3.1 contract OK: ${(contract.operations ?? []).length} operations\n`);
} else {
    await writeFile(outputUrl, document);
    process.stdout.write(`Generated OpenAPI 3.1 contract: ${(contract.operations ?? []).length} operations\n`);
}
