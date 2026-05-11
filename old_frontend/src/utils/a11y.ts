/**
 * Accessibility utilities for EdaTime.
 * Provides ARIA live region announcements and global loading indicator management.
 */

import { toast } from './toast.js';

/* ── ARIA Live Region ──────────────────────────────── */

const LIVE_REGION_ID = 'aria-live-region';

function getLiveRegion(): HTMLElement | null {
    return document.getElementById(LIVE_REGION_ID);
}

/** Announce a message to screen readers via ARIA live region. */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const region = getLiveRegion();
    if (!region) return;

    // Update the live region with the new message
    region.setAttribute('aria-live', priority);
    region.textContent = message;

    // Clear after announcement (screen reader will have read it)
    setTimeout(() => {
        if (region.textContent === message) {
            region.textContent = '';
        }
    }, 1000);
}

/** Announce chart loading state. */
export function announceChartLoading(columns: string[]): void {
    const count = columns.length;
    const msg = count === 1
        ? `Loading chart for ${columns[0]}.`
        : `Loading chart for ${count} columns: ${columns.join(', ')}.`;
    announce(msg, 'polite');
}

/** Announce filter changes. */
export function announceFilterChange(filterName: string, value: string): void {
    announce(`Filter ${filterName} changed to ${value}.`, 'polite');
}

/** Announce data updates. */
export function announceDataUpdate(pageName: string): void {
    announce(`Data updated on ${pageName} page.`, 'polite');
}

/* ── Global Loading Indicator ──────────────────────── */

let _loadingCount = 0;
const _loadingEl: HTMLElement | null = null;
let _loadingTimeout: ReturnType<typeof setTimeout> | null = null;

export function showGlobalLoading(message = 'Loading…'): void {
    _loadingCount++;
    const existing = document.getElementById('header-global-loading');
    if (existing) {
        existing.querySelector('.header-loading-text')!.textContent = message;
        existing.hidden = false;
        return;
    }

    const el = document.createElement('div');
    el.id = 'header-global-loading';
    el.className = 'header-loading';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
        <span class="header-loading-spinner"></span>
        <span class="header-loading-text">${message}</span>
    `;

    const meta = document.getElementById('header-meta');
    if (meta) {
        meta.insertBefore(el, meta.firstChild);
    }

    // Clear any pending timeout
    if (_loadingTimeout) {
        clearTimeout(_loadingTimeout);
        _loadingTimeout = null;
    }
}

export function hideGlobalLoading(delay = 200): void {
    _loadingCount = Math.max(0, _loadingCount - 1);
    if (_loadingCount > 0) return;

    _loadingTimeout = setTimeout(() => {
        const el = document.getElementById('header-global-loading');
        if (el) {
            el.classList.add('header-loading--hiding');
            setTimeout(() => el.remove(), 300);
        }
    }, delay);
}

/* ── Data Freshness Indicator ─────────────────────── */

interface FreshnessState {
    lastUpdate: number | null;
    source: string;
}

let _freshnessState: FreshnessState = { lastUpdate: null, source: 'initial' };

export function updateDataFreshness(source: string): void {
    _freshnessState = {
        lastUpdate: Date.now(),
        source,
    };

    const indicator = document.getElementById('data-freshness-indicator');
    if (indicator) {
        indicator.hidden = false;
        indicator.classList.remove('data-freshness--loading', 'data-freshness--stale', 'data-freshness--outdated');

        const timeEl = indicator.querySelector('.data-freshness-time');
        if (timeEl) {
            timeEl.textContent = `Fresh: ${formatFreshnessTime(_freshnessState.lastUpdate!)}`;
        }
        const dot = indicator.querySelector('.data-freshness-dot');
        if (dot) {
            dot.className = 'data-freshness-dot';
        }

        // Show loading state when actively fetching
        if (source === 'fetching') {
            indicator.classList.add('data-freshness--loading');
            if (timeEl) timeEl.textContent = 'Loading…';
        }
    }
}

export function setDataFreshnessStale(): void {
    const indicator = document.getElementById('data-freshness-indicator');
    if (!indicator) return;
    indicator.classList.remove('data-freshness--loading');
    indicator.classList.add('data-freshness--stale');
    const timeEl = indicator.querySelector('.data-freshness-time');
    if (timeEl) timeEl.textContent = 'Stale';
}

function formatFreshnessTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export function getDataFreshnessAge(): number | null {
    if (!_freshnessState.lastUpdate) return null;
    return Date.now() - _freshnessState.lastUpdate;
}

export function isDataStale(thresholdMs = 5 * 60 * 1000): boolean {
    const age = getDataFreshnessAge();
    return age !== null && age > thresholdMs;
}

/* ── Keyboard Shortcuts Help ──────────────────────── */

export interface KeyboardShortcut {
    keys: string;
    description: string;
    category: string;
}

const SHORTCUTS: KeyboardShortcut[] = [
    // Navigation
    { keys: 'Alt+1', description: 'Upload page', category: 'Navigation' },
    { keys: 'Alt+2', description: 'Timeseries page', category: 'Navigation' },
    { keys: 'Alt+3', description: 'Scatter page', category: 'Navigation' },
    { keys: 'Alt+4', description: 'Scatter matrix view', category: 'Navigation' },
    { keys: 'Alt+6', description: 'FFT page', category: 'Navigation' },
    { keys: 'Alt+7', description: 'Heatmap page', category: 'Navigation' },
    { keys: 'Alt+8', description: 'Spectrogram page', category: 'Navigation' },
    { keys: 'Alt+9', description: 'Causal page', category: 'Navigation' },
    { keys: 'Alt+0', description: 'Drift page', category: 'Navigation' },
    { keys: 'Ctrl+K', description: 'Command palette', category: 'Navigation' },
    { keys: 'Ctrl+I', description: 'Analysis context panel', category: 'Navigation' },

    // Chart
    { keys: 'Double-click', description: 'Reset zoom', category: 'Chart' },
    { keys: 'Ctrl+click', description: 'Set adaptive filter', category: 'Chart' },
    { keys: 'Drag', description: 'Pan / draw', category: 'Chart' },
    { keys: 'Shift+C', description: 'Clear adaptive filters', category: 'Chart' },

    // Session
    { keys: 'Ctrl+S', description: 'Save session', category: 'Session' },
    { keys: 'Ctrl+Shift+S', description: 'Export session file', category: 'Session' },
    { keys: 'Ctrl+O', description: 'Import session file', category: 'Session' },

    // Export
    { keys: 'Ctrl+E', description: 'Export data', category: 'Export' },
];

let _shortcutsModal: HTMLElement | null = null;

export function showKeyboardShortcutsHelp(): void {
    // Remove existing modal if present
    const existing = document.getElementById('keyboard-help-modal');
    if (existing) existing.remove();

    const categories = [...new Set(SHORTCUTS.map(s => s.category))];

    const modal = document.createElement('div');
    modal.id = 'keyboard-help-modal';
    modal.className = 'modal-backdrop keyboard-help-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'keyboard-help-title');

    const content = categories.map(cat => {
        const shortcuts = SHORTCUTS.filter(s => s.category === cat);
        return `
            <div class="keyboard-help-section">
                <h4>${cat}</h4>
                ${shortcuts.map(s => `
                    <div class="keyboard-shortcut-row">
                        <kbd>${s.keys}</kbd>
                        <span>${s.description}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal">
            <div class="keyboard-help-header">
                <h3 class="keyboard-help-title" id="keyboard-help-title">Keyboard Shortcuts</h3>
                <button class="keyboard-help-close" id="keyboard-help-close" aria-label="Close">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="4" y1="4" x2="12" y2="12"/>
                        <line x1="12" y1="4" x2="4" y2="12"/>
                    </svg>
                </button>
            </div>
            <div class="keyboard-help-content">
                ${content}
            </div>
            <div class="keyboard-help-hint">
                Press <kbd>?</kbd> to toggle this help, or <kbd>Esc</kbd> to close.
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeBtn = document.getElementById('keyboard-help-close');
    closeBtn?.addEventListener('click', hideKeyboardShortcutsHelp);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) hideKeyboardShortcutsHelp();
    });

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            hideKeyboardShortcutsHelp();
            window.removeEventListener('keydown', escHandler);
        }
    };
    window.addEventListener('keydown', escHandler);

    // Focus trap
    const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
        focusable[0].focus();
    }

    _shortcutsModal = modal;
}

export function hideKeyboardShortcutsHelp(): void {
    const modal = document.getElementById('keyboard-help-modal');
    if (modal) {
        modal.remove();
        _shortcutsModal = null;
    }
}

/* ── What's New Modal ─────────────────────────────── */

interface ChangelogEntry {
    date: string;
    version: string;
    changes: string[];
}

const CHANGELOG: ChangelogEntry[] = [
    {
        date: '2026-05-05',
        version: '1.0.0',
        changes: [
            'Initial accessibility improvements with ARIA live regions',
            'Added skip-to-content link for keyboard navigation',
            'Implemented visible focus indicators for WCAG AA compliance',
            'Added global loading indicator in header',
            'Keyboard shortcuts help modal (Ctrl+?)',
            'Toast notification queue for async feedback',
            'Data freshness indicator',
        ],
    },
];

export function showWhatsNewModal(): void {
    const existing = document.getElementById('whats-new-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'whats-new-modal';
    modal.className = 'modal-backdrop whats-new-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'whats-new-title');

    const entries = CHANGELOG.map(entry => `
        <div class="whats-new-section">
            <h4 class="whats-new-section-title">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="8" cy="8" r="6"/>
                    <path d="M8 5v3l2 1"/>
                </svg>
                Version ${entry.version}
            </h4>
            <div class="whats-new-changelog">
                ${entry.changes.map(change => `
                    <div class="whats-new-item">
                        <div class="whats-new-item-icon">
                            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="2,5 4,7 8,3"/>
                            </svg>
                        </div>
                        <span class="whats-new-item-text">${change}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    const latest = CHANGELOG[0];

    modal.innerHTML = `
        <div class="modal">
            <div class="whats-new-header">
                <span class="whats-new-badge">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="8,1 10,6 15,6 11,10 13,15 8,12 3,15 5,10 1,6 6,6"/>
                    </svg>
                    NEW
                </span>
                <h3 class="whats-new-title" id="whats-new-title">What's New</h3>
                <span class="whats-new-version">${latest.version} — ${latest.date}</span>
            </div>
            <div class="whats-new-content">
                ${entries}
            </div>
            <div class="whats-new-footer">
                <div class="whats-new-dismiss">
                    <label>
                        <input type="checkbox" id="whats-new-dismiss-checkbox">
                        Don't show again
                    </label>
                </div>
            </div>
            <div class="modal-actions">
                <div class="modal-actions-right">
                    <button class="btn btn-primary" id="whats-new-close-btn" type="button">Got it</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeBtn = document.getElementById('whats-new-close-btn');
    closeBtn?.addEventListener('click', () => {
        const checkbox = document.getElementById('whats-new-dismiss-checkbox') as HTMLInputElement;
        if (checkbox?.checked) {
            localStorage.setItem('edatime_whats_new_dismissed', latest.version);
        }
        hideWhatsNewModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) hideWhatsNewModal();
    });

    // Auto-dismiss check
    const dismissed = localStorage.getItem('edatime_whats_new_dismissed');
    if (dismissed === latest.version) {
        hideWhatsNewModal();
        return;
    }

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            hideWhatsNewModal();
            window.removeEventListener('keydown', escHandler);
        }
    };
    window.addEventListener('keydown', escHandler);
}

export function hideWhatsNewModal(): void {
    const modal = document.getElementById('whats-new-modal');
    if (modal) {
        modal.remove();
    }
}

/* ── Init keyboard shortcut toggle ────────────────── */

export function initAccessibilityShortcuts(): void {
    // Ctrl+? or ? (when not in input) to show shortcuts help
    const handleKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

        if (isInput) return;

        // Show shortcuts help with ?
        if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            if (_shortcutsModal) {
                hideKeyboardShortcutsHelp();
            } else {
                showKeyboardShortcutsHelp();
            }
            return;
        }

        // Show shortcuts help with Ctrl+/
        if ((e.key === '/' || e.key === '?') && e.ctrlKey) {
            e.preventDefault();
            if (_shortcutsModal) {
                hideKeyboardShortcutsHelp();
            } else {
                showKeyboardShortcutsHelp();
            }
        }
    };

    window.addEventListener('keydown', handleKey);
}