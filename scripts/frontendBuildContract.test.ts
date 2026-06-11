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

    it('runs architecture + budget checks in order for --prod builds', () => {
        const buildScript = readRepoFile('scripts/build-frontend.mjs');
        const archIdx = buildScript.indexOf('check-frontend-architecture.mjs');
        const budgetIdx = buildScript.indexOf('check-frontend-budgets.mjs');
        const prodGuard = buildScript.match(/if\s*\(\s*isProd\s*\)/g) ?? [];

        expect(archIdx).toBeGreaterThan(-1);
        expect(budgetIdx).toBeGreaterThan(-1);
        // Budget check must run *after* architecture check
        expect(budgetIdx).toBeGreaterThan(archIdx);
        // The budget block must be guarded by isProd
        expect(prodGuard.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps check:frontend:budgets wired into check:frontend:all', () => {
        const pkg = readRepoFile('package.json');
        expect(pkg).toMatch(/"check:frontend:all"\s*:\s*"npm run check:frontend && npm run check:frontend:arch && npm run check:frontend:budgets"/);
    });

    it('updates the service worker and reloads on controllerchange in deployed builds', () => {
        const sourceHtml = readRepoFile('frontend/index.html');
        // registration.update() must be called after a successful register()
        expect(sourceHtml).toMatch(/register\(['"]\/sw\.js['"]\)\.then\(/);
        expect(sourceHtml).toMatch(/registration\.update\(\)/);
        // controllerchange listener must guard against reload loops with sessionStorage
        expect(sourceHtml).toMatch(/addEventListener\(['"]controllerchange['"]/);
        expect(sourceHtml).toMatch(/sessionStorage\.(get|set)Item\(['"]edatime-sw-reload['"]/);
        expect(sourceHtml).toMatch(/window\.location\.reload\(\)/);
        // Local dev should still unregister to keep the chunk graph fresh
        expect(sourceHtml).toMatch(/isLocalhost[\s\S]{0,200}\.unregister\(\)/);
    });
});
