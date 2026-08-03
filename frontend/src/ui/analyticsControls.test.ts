import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    analyticsState,
    setRollingDisplayMode,
    setRollingEnabled,
} from '../store/analyticsState.js';
import {
    getDropdownController,
    setDropdownValue,
    upgradeSelects,
} from './primitives/Dropdown.js';
import { initAnalyticsControls } from './analyticsControls.js';

describe('analytics rolling display controls', () => {
    beforeEach(() => {
        setRollingEnabled(false);
        setRollingDisplayMode('both');
        document.body.innerHTML = `
            <input id="rolling-enabled" type="checkbox">
            <input id="rolling-window" type="number" value="50">
            <select id="rolling-display-mode">
                <option value="both">Raw + smooth</option>
                <option value="smooth">Smooth / hull only</option>
                <option value="raw">Raw data only</option>
            </select>
        `;
        upgradeSelects(document);
        initAnalyticsControls();
    });

    afterEach(() => {
        getDropdownController('rolling-display-mode')?.destroy();
        document.body.replaceChildren();
    });

    it('reads the upgraded dropdown value instead of a removed native select', () => {
        setDropdownValue('rolling-display-mode', 'smooth', { emitChange: true });

        expect(analyticsState.rollingDisplayMode).toBe('smooth');
    });

    it('keeps smooth-only selected when rolling bands are enabled afterward', () => {
        setDropdownValue('rolling-display-mode', 'smooth', { emitChange: true });
        const enabled = document.getElementById('rolling-enabled') as HTMLInputElement;
        enabled.checked = true;
        enabled.dispatchEvent(new Event('change', { bubbles: true }));

        expect(analyticsState).toMatchObject({
            rollingEnabled: true,
            rollingDisplayMode: 'smooth',
        });
    });
});
