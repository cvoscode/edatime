import { afterEach, describe, expect, it } from 'vitest';
import { createDropdown } from './primitives/Dropdown.js';
import { initBreadcrumbs } from './breadcrumbs.js';

describe('pair plot breadcrumbs', () => {
    let cleanup = () => {};

    afterEach(() => cleanup());

    it('does not repeat sidebar navigation on ordinary pages', async () => {
        document.body.innerHTML = `
            <button class="nav-item active" data-page="prepare"></button>
            <section class="page" data-page-name="prepare">
                <div class="page-header"></div>
            </section>
        `;
        cleanup = initBreadcrumbs(() => {});
        await Promise.resolve();

        expect(document.querySelector('.page-breadcrumb')).toBeNull();
    });

    it('waits for a concrete pair before showing deep context', async () => {
        document.body.innerHTML = `
            <button class="nav-item active" data-page="scatter"></button>
            <section class="page" data-page-name="scatter">
                <div class="page-header"></div>
            </section>
        `;
        cleanup = initBreadcrumbs(() => {});
        await Promise.resolve();

        expect(document.querySelector('.page-breadcrumb')).toBeNull();
    });

    it('reads custom dropdown values and follows axis changes', async () => {
        document.body.innerHTML = `
            <button class="nav-item active" data-page="scatter"></button>
            <section class="page" data-page-name="scatter">
                <div class="page-header"></div>
                <div id="axis-controls"></div>
            </section>
        `;
        const x = createDropdown({
            id: 'scatter-x-col', label: 'X column', value: 'HUFL',
            options: [{ value: 'HUFL', label: 'HUFL' }, { value: 'OT', label: 'OT' }],
        });
        const y = createDropdown({
            id: 'scatter-y-col', label: 'Y column', value: 'HULL',
            options: [{ value: 'HULL', label: 'HULL' }, { value: 'MUFL', label: 'MUFL' }],
        });
        document.getElementById('axis-controls')!.append(x.root, y.root);
        const disposeBreadcrumbs = initBreadcrumbs(() => {});
        cleanup = () => { disposeBreadcrumbs(); x.destroy(); y.destroy(); };
        await Promise.resolve();

        expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('HUFL × HULL');
        expect(document.querySelector('.page-breadcrumb')?.textContent).toBe('Correlation matrix›HUFL × HULL');
        expect(document.querySelector('.page-breadcrumb')?.textContent).not.toContain('Workspace');

        y.setValue('MUFL', { emitChange: true });
        await Promise.resolve();
        expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('HUFL × MUFL');
    });
});
