import { describe, expect, it, vi } from 'vitest';

describe('bindInfoPopovers', () => {
    it('shows and hides a shared popover for focusable info icons', async () => {
        document.body.innerHTML = `
            <span
                id="metric-help"
                class="toolbar-info-icon"
                tabindex="0"
                data-info-tip="First line&#10;Second line"
            >?</span>
        `;

        const { bindInfoPopovers } = await import('./infoPopovers.js');
        bindInfoPopovers();

        const icon = document.getElementById('metric-help') as HTMLElement;
        vi.spyOn(icon, 'getBoundingClientRect').mockReturnValue({
            x: 10,
            y: 20,
            width: 16,
            height: 16,
            top: 20,
            right: 26,
            bottom: 36,
            left: 10,
            toJSON: () => ({}),
        } as DOMRect);

        icon.dispatchEvent(new FocusEvent('focus'));

        const popover = document.querySelector('.toolbar-info-popover') as HTMLElement | null;
        expect(popover).not.toBeNull();
        expect(popover?.textContent).toContain('First line');
        expect(popover?.textContent).toContain('Second line');

        icon.dispatchEvent(new FocusEvent('blur'));
        expect(document.querySelector('.toolbar-info-popover')).toBeNull();
    });
});
