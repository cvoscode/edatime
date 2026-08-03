import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const readFrontend = (path: string) => readFileSync(join(process.cwd(), 'frontend', path), 'utf8');

describe('shared workspace visual system', () => {
    const html = readFrontend('index.html');
    const style = readFrontend('css/style.css');
    const tokens = readFrontend('css/modules/tokens.css');
    const workspace = readFrontend('css/modules/workspace.css');

    it('loads the shared hierarchy after page and responsive modules', () => {
        expect(style.trim().endsWith('@import "modules/workspace.css";')).toBe(true);
    });

    it('ships explicit dark and light workspace palettes without a runtime font dependency', () => {
        expect(tokens).toContain(':root[data-theme="light"]');
        expect(tokens).toContain('--bg: #0B0F14');
        expect(tokens).toContain('--bg: #F5F7FA');
        expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
    });

    it('uses the same task-based page names in navigation and page headings', () => {
        for (const label of [
            'Overview', 'Data source', 'Signals', 'Preparation', 'Correlation matrix',
            'Pair plot', 'Spectrum', 'Time-frequency', 'Causality', 'Drift',
        ]) {
            expect(html).toContain(`>${label}<`);
        }
    });

    it('keeps shared help, status, action, and responsive patterns centralized', () => {
        expect(workspace).toContain('.page-help-trigger');
        expect(workspace).toContain('.analysis-status:not(:empty)');
        expect(workspace).toContain('#spectrogram-compute-btn');
        expect(workspace).toContain('#causal-compute-btn');
        expect(workspace).toContain('#drift-compute-btn');
        expect(workspace).toContain('@media (max-width: 640px)');
        expect(html).toContain('aria-label="Toggle light or dark theme"');
    });

    it('keeps analysis controls on one shared sizing contract', () => {
        expect(workspace).toContain('--analysis-control-h: var(--ctrl-h)');
        expect(workspace).toContain('height: var(--analysis-control-h)');
        expect(workspace).toContain('.timeseries-utility-shelf__secondary');
    });

    it('lets Preparation context scroll with the workbench', () => {
        expect(workspace).toMatch(/#page-prepare \.prepare-workspace__local-nav,[\s\S]*?position: static;/);
        expect(workspace).toContain('#page-prepare .prepare-workspace__history');
    });

    it('gives the desktop Correlation controls dedicated working width', () => {
        expect(workspace).toContain('grid-template-columns: 430px minmax(0, 1fr)');
        expect(workspace).toContain('flex: 0 0 540px');
        expect(workspace).toContain('flex: 0 0 230px');
    });
});
