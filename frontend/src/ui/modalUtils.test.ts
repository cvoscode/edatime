import { describe, expect, it, vi } from 'vitest';
import { createModalController } from './shell/createModalController';

describe('createModalController', () => {
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
});
