/**
 * pageHelp — shared "?" help modal for page-level help.
 *
 * Every page can opt into a contextual help modal by:
 *   1. Adding a real <button id="<pageId>-help-btn"> to the page markup.
 *   2. Calling `initPageHelp(pageId, content)` from the page's init module.
 *
 * The helper mirrors the established `showKeyboardShortcutsHelp` /
 * `showWhatsNewModal` pattern in `utils/a11y.ts` so the modal looks
 * and behaves consistently with the rest of the app:
 *   - Built from `.modal-backdrop` + `.modal` primitives.
 *   - Closes on the close button, the backdrop, or `Esc`.
 *   - Restores focus to the trigger button on close.
 *
 * Calling `initPageHelp` is idempotent: the trigger button gets a
 * `data-page-help-bound="true"` guard attribute on first call and the
 * function returns early on subsequent calls. This keeps it safe to
 * call from a deferred subsystem that may be re-entered.
 */

export interface PageHelpShortcut {
    keys: string;
    description: string;
}

export interface PageHelpSection {
    title: string;
    /** Free-form body text rendered as a paragraph. */
    body?: string;
    /** Optional bullet list. When provided, rendered after the body. */
    bullets?: string[];
}

export interface PageHelpContent {
    /** Display name shown in the modal header (e.g. "Home"). */
    pageName: string;
    /** 1–2 sentence overview shown at the top of the modal body. */
    intro: string;
    sections: PageHelpSection[];
    /** Optional keyboard-shortcut rows for the page. */
    shortcuts?: PageHelpShortcut[];
    /** Optional tip block; rendered as a callout with accent background. */
    tips?: string[];
}

const MODAL_ID = 'page-help-modal';
const BOUND_ATTR = 'data-page-help-bound';

export function initPageHelp(pageId: string, content: PageHelpContent): void {
    const triggerId = `${pageId}-help-btn`;
    const trigger = document.getElementById(triggerId);
    if (!trigger) return;
    if (trigger.getAttribute(BOUND_ATTR) === 'true') return;
    trigger.setAttribute(BOUND_ATTR, 'true');

    // Setting a clear aria-label/title makes the trigger self-describing
    // even when the help modal is never opened.
    const baseTitle = `Show help for the ${content.pageName} page`;
    trigger.setAttribute('aria-label', baseTitle);
    trigger.setAttribute('title', `${baseTitle} (?)`);

    trigger.addEventListener('click', () => openPageHelp(content, trigger));
}

function openPageHelp(content: PageHelpContent, trigger: HTMLElement): void {
    // Replace any previous instance so the user never sees two stacked
    // help modals. This mirrors showWhatsNewModal's "remove existing" step.
    document.getElementById(MODAL_ID)?.remove();

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'modal-backdrop page-help-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'page-help-title');

    const sectionsHtml = content.sections
        .map((section) => renderSection(section))
        .join('');

    const shortcutsHtml = content.shortcuts && content.shortcuts.length > 0
        ? `
            <section class="page-help-section page-help-section--shortcuts">
                <h4>Keyboard shortcuts</h4>
                <div class="page-help-shortcut-list">
                    ${content.shortcuts
                        .map(
                            (row) => `
                        <div class="page-help-shortcut-row">
                            <kbd>${escapeHtml(row.keys)}</kbd>
                            <span>${escapeHtml(row.description)}</span>
                        </div>`,
                        )
                        .join('')}
                </div>
            </section>`
        : '';

    const tipsHtml = content.tips && content.tips.length > 0
        ? `
            <section class="page-help-section page-help-section--tips">
                <h4>Helpful tips</h4>
                <ul>
                    ${content.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
                </ul>
            </section>`
        : '';

    modal.innerHTML = `
        <div class="modal" role="document">
            <div class="modal-header">
                <h3 class="modal-title" id="page-help-title">${escapeHtml(content.pageName)} — Help</h3>
                <button class="modal-close" id="page-help-close" type="button" aria-label="Close help">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <line x1="4" y1="4" x2="12" y2="12"/>
                        <line x1="12" y1="4" x2="4" y2="12"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body page-help-body">
                <p class="page-help-intro">${escapeHtml(content.intro)}</p>
                <div class="page-help-sections">${sectionsHtml}</div>
                ${shortcutsHtml}
                ${tipsHtml}
            </div>
            <div class="page-help-footer">
                Press <kbd>Esc</kbd> to close, or click outside the dialog.
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => closePageHelp(trigger);
    const closeBtn = modal.querySelector<HTMLButtonElement>('#page-help-close');
    closeBtn?.addEventListener('click', close);

    modal.addEventListener('click', (event) => {
        // Backdrop click closes; clicks inside the .modal do not.
        if (event.target === modal) close();
    });

    const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    };
    window.addEventListener('keydown', onKey);

    // Track the keydown handler so close() can detach it. Stash on the
    // element itself so we don't need a module-level map.
    modal.dataset.escBound = '1';
    modal.addEventListener('cleanup', () => window.removeEventListener('keydown', onKey));

    // Move focus to the close button so keyboard users land in the
    // modal and screen readers announce the title.
    queueMicrotask(() => closeBtn?.focus());
}

function closePageHelp(trigger: HTMLElement): void {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    // Fire the synthetic cleanup event so the Esc listener is detached
    // before we remove the element from the DOM.
    modal.dispatchEvent(new Event('cleanup'));
    modal.remove();

    // Restore focus to the trigger. The button may have been re-rendered
    // (e.g. after a hot reload); if so, fall back to the body.
    const stillThere = document.getElementById(trigger.id);
    if (stillThere) {
        stillThere.focus();
    } else {
        document.body.focus();
    }
}

function renderSection(section: PageHelpSection): string {
    const bodyHtml = section.body
        ? `<p>${escapeHtml(section.body)}</p>`
        : '';
    const bulletsHtml = section.bullets && section.bullets.length > 0
        ? `<ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
        : '';
    return `
        <section class="page-help-section">
            <h4>${escapeHtml(section.title)}</h4>
            ${bodyHtml}
            ${bulletsHtml}
        </section>
    `;
}

/** Minimal HTML escape — only used on the strings we author ourselves
 *  and the user-provided copy. The modal is built with `innerHTML`
 *  so we need this to avoid accidental markup injection. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
