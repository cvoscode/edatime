import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModalController } from './shell/createModalController';

describe('createModalController', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflow = '';
    });

    it('closes on cancel button click', () => {
        document.body.innerHTML = `
      <div id="settings-modal" hidden>
        <button id="settings-close-btn"></button>
        <button id="settings-cancel-btn"></button>
      </div>
    `;
        const onClose = vi.fn();
        const controller = createModalController({
            modalId: 'settings-modal',
            closeButtonIds: ['settings-close-btn', 'settings-cancel-btn'],
            onClose,
        });
        controller.open();
        document.getElementById('settings-cancel-btn')?.dispatchEvent(new Event('click'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on close button click', () => {
        document.body.innerHTML = `
      <div id="settings-modal" hidden>
        <button id="settings-close-btn"></button>
        <button id="settings-cancel-btn"></button>
      </div>
    `;
        const onClose = vi.fn();
        const controller = createModalController({
            modalId: 'settings-modal',
            closeButtonIds: ['settings-close-btn', 'settings-cancel-btn'],
            onClose,
        });
        controller.open();
        document.getElementById('settings-close-btn')?.dispatchEvent(new Event('click'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on backdrop click', () => {
        document.body.innerHTML = `
      <div id="settings-modal" hidden>
        <button id="settings-close-btn"></button>
      </div>
    `;
        const onClose = vi.fn();
        const controller = createModalController({
            modalId: 'settings-modal',
            closeButtonIds: ['settings-close-btn'],
            onClose,
        });
        controller.open();
        const modal = document.getElementById('settings-modal');
        modal?.dispatchEvent(new Event('click', { bubbles: false }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('opens and closes the modal', () => {
        document.body.innerHTML = '<div id="test-modal" hidden></div>';
        const controller = createModalController({
            modalId: 'test-modal',
            closeButtonIds: [],
        });
        const modal = document.getElementById('test-modal');
        controller.open();
        expect(modal?.hidden).toBe(false);
        controller.close();
        expect(modal?.hidden).toBe(true);
    });

    it('calls onOpen when opening', () => {
        document.body.innerHTML = '<div id="test-modal" hidden></div>';
        const onOpen = vi.fn();
        const controller = createModalController({
            modalId: 'test-modal',
            closeButtonIds: [],
            onOpen,
        });
        controller.open();
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape and restores blocked shell state', () => {
        document.body.innerHTML = `
      <div class="app-layout">
        <button id="outside-btn" type="button">Outside</button>
      </div>
      <div id="settings-modal" hidden>
        <div role="dialog" tabindex="-1">
          <button id="settings-close-btn"></button>
          <button id="settings-cancel-btn"></button>
        </div>
      </div>
    `;
        const onClose = vi.fn();
        const controller = createModalController({
            modalId: 'settings-modal',
            closeButtonIds: ['settings-close-btn', 'settings-cancel-btn'],
            onClose,
        });
        const layout = document.querySelector('.app-layout') as HTMLElement;
        controller.open();

        expect(document.body.style.overflow).toBe('hidden');
        expect(layout.getAttribute('aria-hidden')).toBe('true');
        expect(layout.hasAttribute('inert')).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.body.style.overflow).toBe('');
        expect(layout.hasAttribute('inert')).toBe(false);
        expect(layout.hasAttribute('aria-hidden')).toBe(false);
    });

    it('traps focus within the dialog while open', () => {
        document.body.innerHTML = `
      <button id="outside-before" type="button">Before</button>
      <div id="settings-modal" hidden>
        <div role="dialog" tabindex="-1">
          <button id="first-btn" type="button">First</button>
          <button id="last-btn" type="button">Last</button>
        </div>
      </div>
      <button id="outside-after" type="button">After</button>
    `;
        const controller = createModalController({
            modalId: 'settings-modal',
            closeButtonIds: [],
        });
        const first = document.getElementById('first-btn') as HTMLButtonElement;
        const last = document.getElementById('last-btn') as HTMLButtonElement;

        controller.open();
        expect(document.activeElement).toBe(first);

        last.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(document.activeElement).toBe(first);

        first.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        expect(document.activeElement).toBe(last);
    });
});
