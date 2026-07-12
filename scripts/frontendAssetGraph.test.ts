import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyPackagedFrontendAssetGraph } from './check-frontend-asset-graph.mjs';

const temporaryRoots: string[] = [];

function createDistFixture(): string {
    const root = mkdtempSync(join(tmpdir(), 'edatime-asset-graph-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'assets'), { recursive: true });
    mkdirSync(join(root, '.vite'), { recursive: true });
    return root;
}

function writeFixture(root: string, html: string, manifest: object, files: Record<string, string> = {}): void {
    writeFileSync(join(root, 'index.html'), html);
    writeFileSync(join(root, '.vite', 'manifest.json'), JSON.stringify(manifest));
    for (const [relativePath, contents] of Object.entries(files)) {
        const path = join(root, relativePath);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, contents);
    }
}

afterEach(() => {
    while (temporaryRoots.length > 0) {
        rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

describe('packaged frontend asset graph', () => {
    it('accepts HTML that boots the Vite manifest entry and existing assets', async () => {
        const root = createDistFixture();
        writeFixture(root,
            '<script type="module" src="/assets/app-abc.js"></script><link rel="stylesheet" href="/assets/app-abc.css">',
            { 'index.html': { file: 'assets/app-abc.js', isEntry: true, css: ['assets/app-abc.css'] } },
            { 'assets/app-abc.js': 'export {};', 'assets/app-abc.css': '' },
        );

        await expect(verifyPackagedFrontendAssetGraph(root)).resolves.toBeUndefined();
    });

    it('rejects missing HTML assets and a stale entry reference', async () => {
        const root = createDistFixture();
        writeFixture(root,
            '<script type="module" src="/assets/app-old.js"></script><link rel="stylesheet" href="/assets/app-old.css">',
            { 'index.html': { file: 'assets/app-new.js', isEntry: true, css: ['assets/app-new.css'] } },
            { 'assets/app-new.js': 'export {};', 'assets/app-new.css': '' },
        );

        await expect(verifyPackagedFrontendAssetGraph(root)).rejects.toThrow(/missing files|manifest entry/i);
    });
});
