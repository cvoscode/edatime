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
        expect(pageStyles).toContain('?url');
        expect(serviceWorker).not.toContain('/js/');
        expect(serviceWorker).not.toContain('/css/style.css');
        expect(serviceWorker).not.toContain('/index.html');
        expect(makefile).not.toContain('rm -rf frontend/dist');
        expect(makefile).not.toContain('$(PWD)/frontend/dist');
        expect(makefile).toContain('crates/edatime-bin/frontend/dist');
    });

    it('keeps heavy shell wiring behind deferred subsystem loaders', () => {
        const deferredSubsystems = readRepoFile('frontend/src/app/shell/deferredSubsystems.ts');
        const appTs = readRepoFile('frontend/src/app.ts');
        const commands = readRepoFile('frontend/src/app/shell/commands.ts');
        const ensureTimeseriesReady = readRepoFile('frontend/src/features/timeseries/ensureReady.ts');
        const analyticsOverlay = readRepoFile('frontend/src/features/timeseries/analyticsOverlay.ts');
        const filtering = readRepoFile('frontend/src/services/timeseries/filtering.ts');
        const session = readRepoFile('frontend/src/utils/session.ts');
        const architectureCheck = readRepoFile('scripts/check-frontend-architecture.mjs');

        expect(deferredSubsystems).toMatch(/import\(['"][^'"]*features\/timeseries\/index\.js['"]\)/);
        expect(deferredSubsystems).toMatch(/import\(['"][^'"]*toolbar\.js['"]\)/);
        expect(deferredSubsystems).toMatch(/import\(['"][^'"]*commands\.js['"]\)/);
        expect(deferredSubsystems).toMatch(/import\(['"][^'"]*annotations\.js['"]\)/);
        expect(deferredSubsystems).toMatch(/import\(['"][^'"]*annotationPanel\.js['"]\)/);
        expect(appTs).not.toContain('APP_COMMAND_DEFINITIONS');
        expect(appTs).not.toContain('appStateCompat');
        expect(commands).not.toMatch(/from ['"][^'"]*session\.js['"]/);
        expect(ensureTimeseriesReady).not.toContain('appStateCompat');
        expect(analyticsOverlay).not.toContain('appStateCompat');
        expect(filtering).not.toContain('appStateCompat');
        expect(session).not.toContain('appStateCompat');
        expect(architectureCheck).not.toContain('appStateCompat');
        expect(architectureCheck).toContain('retired source tree must remain deleted');
        expect(architectureCheck).toContain('retired store/compat* surface must remain deleted');
        expect(architectureCheck).not.toContain('app/bootstrap/datasetBootstrap.ts');
        expect(architectureCheck).not.toContain('isPageImplementationPath');
        expect(architectureCheck).toContain('focused store slices instead of store/index.js');
    });

    it('runs architecture + budget checks in order for --prod builds', () => {
        const buildScript = readRepoFile('scripts/build-frontend.mjs');
        const budgetScript = readRepoFile('scripts/check-frontend-budgets.mjs');
        const assetGraphScript = readRepoFile('scripts/check-frontend-asset-graph.mjs');
        const archIdx = buildScript.indexOf('check-frontend-architecture.mjs');
        const budgetIdx = buildScript.indexOf('check-frontend-budgets.mjs');
        const assetGraphIdx = buildScript.indexOf('check-frontend-asset-graph.mjs');
        const prodGuard = buildScript.match(/if\s*\(\s*isProd\s*\)/g) ?? [];

        expect(archIdx).toBeGreaterThan(-1);
        expect(budgetIdx).toBeGreaterThan(-1);
        expect(assetGraphIdx).toBeGreaterThan(-1);
        expect(assetGraphIdx).toBeLessThan(archIdx);
        // Budget check must run *after* architecture check
        expect(budgetIdx).toBeGreaterThan(archIdx);
        // The budget block must be guarded by isProd
        expect(prodGuard.length).toBeGreaterThanOrEqual(2);
        expect(budgetScript).toContain('Packaged frontend dist is stale or incomplete');
        expect(assetGraphScript).toContain('manifest entry');
    });

    it('keeps reachability and bundle checks wired into check:frontend:all', () => {
        const pkg = readRepoFile('package.json');
        expect(pkg).toMatch(/"check:frontend:all"\s*:\s*"npm run check:frontend && npm run check:frontend:arch && npm run check:frontend:reachability && npm run check:frontend:budgets && npm run check:frontend:assets"/);
    });

    it('ships one bundled ChartGPU graph without production source maps', () => {
        const buildScript = readRepoFile('scripts/build-frontend.mjs');
        const viteConfig = readRepoFile('frontend/vite.config.ts');
        const pkg = readRepoFile('package.json');

        expect(pkg).toContain('"chartgpu": "file:frontend/libs/chartgpu"');
        expect(buildScript).not.toContain('copyRuntimeAssets');
        expect(viteConfig).toContain("sourcemap: mode !== 'production'");
    });

    it('uses Vite for the default dev workflow so CSS updates are served live', () => {
        const makefile = readRepoFile('Makefile');
        const pkg = readRepoFile('package.json');
        const viteConfig = readRepoFile('frontend/vite.config.ts');

        expect(pkg).toMatch(/"dev:full"\s*:\s*"node scripts\/dev\.mjs"/);
        expect(makefile).toMatch(/dev:\n\t@if command -v node .* npm run dev:full/s);
        expect(makefile).not.toMatch(/dev:[\s\S]{0,160}build-frontend\.mjs/);
        expect(viteConfig).toContain('EDATIME_API_ORIGIN');
        expect(viteConfig).toContain('EDATIME_PORT');
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
