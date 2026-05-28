import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');

describe('scatter toolbar disclosure CSS', () => {
    it('allows scatter disclosure menus to escape the toolbar clipping context', () => {
        expect(toolbarCss).toMatch(/\.scatter-toolbar\s*\{[^}]*overflow:\s*visible;[^}]*\}/s);
    });
});
