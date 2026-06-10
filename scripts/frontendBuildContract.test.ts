import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readRepoFile(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

describe('frontend build contract', () => {
    it('lets Vite own asset versioning instead of rewriting JS imports', () => {
        const buildScript = readRepoFile('scripts/build-frontend.mjs');
        const viteConfig = readRepoFile('frontend/vite.config.ts');
        const sourceHtml = readRepoFile('frontend/index.html');
        const serviceWorker = readRepoFile('frontend/sw.js');
        const pageStyles = readRepoFile('frontend/src/utils/pageStyles.ts');
        const makefile = readRepoFile('Makefile');

        expect(buildScript).not.toContain('applyCacheBusting');
        expect(buildScript).not.toContain('applyCacheBustingToJs');
        expect(buildScript).not.toContain('collectJsFiles');
        expect(viteConfig).not.toContain("entryFileNames: '[name].js'");
        expect(sourceHtml).not.toMatch(/\?v=/);
        expect(pageStyles).not.toMatch(/\?v=/);
        expect(pageStyles).not.toContain('css/modules/');
        expect(serviceWorker).not.toContain('/js/');
        expect(serviceWorker).not.toContain('/css/style.css');
        expect(serviceWorker).not.toContain('/index.html');
        expect(makefile).not.toContain('rm -rf frontend/dist');
        expect(makefile).not.toContain('$(PWD)/frontend/dist');
        expect(makefile).toContain('crates/edatime-bin/frontend/dist');
    });

    it('does not fake-lazy-load modules that are already startup dependencies', () => {
        const deferredSubsystems = readRepoFile('frontend/src/app/shell/deferredSubsystems.ts');
        const pageModules = readRepoFile('frontend/src/app/pageModules.ts');
        const commands = readRepoFile('frontend/src/bootstrap/commands.ts');

        expect(deferredSubsystems).not.toMatch(/import\(['"][^'"]*analyticsOverlay\.js['"]\)/);
        expect(deferredSubsystems).not.toMatch(/import\(['"][^'"]*toolbar\.js['"]\)/);
        expect(deferredSubsystems).not.toMatch(/import\(['"][^'"]*commands\.js['"]\)/);
        expect(deferredSubsystems).not.toMatch(/import\(['"][^'"]*annotations\.js['"]\)/);
        expect(deferredSubsystems).not.toMatch(/import\(['"][^'"]*annotationPanel\.js['"]\)/);
        expect(pageModules).not.toMatch(/import\(['"][^'"]*pageStyles\.js['"]\)/);
        expect(commands).not.toMatch(/import\(['"][^'"]*session\.js['"]\)/);
    });
});
