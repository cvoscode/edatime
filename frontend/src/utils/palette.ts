/**
 * Command palette (Ctrl+K) for EdaTime.
 *
 * Provides fuzzy-searchable access to all pages, shortcuts, and actions.
 */

export interface PaletteCommand {
    id: string;
    label: string;
    /** Short description shown to the right. */
    hint?: string;
    /** Keyboard shortcut label. */
    shortcut?: string;
    /** Category for grouping. */
    category: 'Navigation' | 'Export' | 'Session' | 'Chart' | 'Analysis';
    action: () => void;
}

let _overlay: HTMLElement | null = null;
let _input: HTMLInputElement | null = null;
let _list: HTMLElement | null = null;
let _commands: PaletteCommand[] = [];
let _filtered: PaletteCommand[] = [];
let _selectedIdx = 0;

function buildDOM(): void {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.className = 'palette-overlay';
    _overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'palette-panel';

    _input = document.createElement('input');
    _input.className = 'palette-input';
    _input.type = 'text';
    _input.placeholder = 'Type a command…';
    _input.setAttribute('aria-label', 'Command search');

    _list = document.createElement('div');
    _list.className = 'palette-list';
    _list.setAttribute('role', 'listbox');

    panel.appendChild(_input);
    panel.appendChild(_list);
    _overlay.appendChild(panel);
    document.body.appendChild(_overlay);

    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    _input.addEventListener('input', () => { filterAndRender(_input!.value); });
    _input.addEventListener('keydown', onInputKeydown);
}

function onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); return; }
    if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = _filtered[_selectedIdx];
        if (cmd) { close(); cmd.action(); }
    }
}

function moveSelection(delta: number): void {
    _selectedIdx = Math.max(0, Math.min(_filtered.length - 1, _selectedIdx + delta));
    renderList();
    // Scroll selected into view
    const el = _list?.children[_selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
}

function filterAndRender(query: string): void {
    const q = query.trim().toLowerCase();
    _filtered = q
        ? _commands.filter((c) =>
            c.label.toLowerCase().includes(q) ||
            (c.hint || '').toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q))
        : [..._commands];
    _selectedIdx = 0;
    renderList();
}

function renderList(): void {
    if (!_list) return;
    _list.innerHTML = '';

    if (_filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'palette-empty';
        empty.textContent = 'No matching commands';
        _list.appendChild(empty);
        return;
    }

    let lastCategory = '';
    for (let i = 0; i < _filtered.length; i++) {
        const cmd = _filtered[i];

        if (cmd.category !== lastCategory) {
            lastCategory = cmd.category;
            const header = document.createElement('div');
            header.className = 'palette-category';
            header.textContent = cmd.category;
            _list.appendChild(header);
        }

        const row = document.createElement('div');
        row.className = 'palette-item' + (i === _selectedIdx ? ' palette-item--selected' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === _selectedIdx));

        const label = document.createElement('span');
        label.className = 'palette-item-label';
        label.textContent = cmd.label;
        row.appendChild(label);

        if (cmd.hint) {
            const hint = document.createElement('span');
            hint.className = 'palette-item-hint';
            hint.textContent = cmd.hint;
            row.appendChild(hint);
        }

        if (cmd.shortcut) {
            const kbd = document.createElement('kbd');
            kbd.className = 'palette-item-kbd';
            kbd.textContent = cmd.shortcut;
            row.appendChild(kbd);
        }

        row.addEventListener('click', () => { close(); cmd.action(); });
        row.addEventListener('mouseenter', () => { _selectedIdx = i; renderList(); });

        _list.appendChild(row);
    }
}

function close(): void {
    if (_overlay) _overlay.hidden = true;
}

function open(): void {
    buildDOM();
    if (_input) { _input.value = ''; }
    filterAndRender('');
    if (_overlay) _overlay.hidden = false;
    requestAnimationFrame(() => _input?.focus());
}

/** Register the full command list. Call once during app init. */
export function registerCommands(commands: PaletteCommand[]): void {
    _commands = commands;
}

/** Open the command palette. */
export function openPalette(): void {
    open();
}

/** Bind Ctrl+K to open the palette. */
export function initCommandPalette(): void {
    buildDOM();

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (_overlay?.hidden === false) close();
            else open();
        }
    });
}
