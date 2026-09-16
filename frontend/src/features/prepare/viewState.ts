type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Stable keys let background profile/plan updates preserve the editor session. */
export function keyPreparationControls(root: HTMLElement): void {
    root.querySelectorAll<HTMLFormElement>('form').forEach((form, index) => {
        form.id ||= `prepare-form-${index}`;
    });
    root.querySelectorAll<HTMLElement>('input, select, textarea, button, summary, a').forEach((control) => {
        if (control.dataset.prepareKey) return;
        const form = control.closest('form');
        const stage = control.closest<HTMLElement>('[data-stage-id]');
        const group = stage ?? form;
        const index = group ? Array.from(group.querySelectorAll('input, select, textarea, button, summary, a')).indexOf(control) : '';
        control.dataset.prepareKey = control.id || `${stage?.dataset.stageId ?? form?.id ?? ''}:${control.tagName}:${index}:${control.getAttribute('name') ?? control.textContent?.trim()}`;
    });
}

export function capturePreparationView(root: HTMLElement) {
    const active = document.activeElement as HTMLElement | null;
    return {
        focusKey: root.contains(active) ? active?.dataset.prepareKey : undefined,
        focusStage: root.contains(active) ? active?.closest<HTMLElement>('[data-stage-id]')?.dataset.stageId : undefined,
        selection: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
            ? [active.selectionStart, active.selectionEnd] as const : null,
        fields: Array.from(root.querySelectorAll<Field>('form input, form select, form textarea, #prepare-transformation')).map((field) => ({
            key: field.dataset.prepareKey,
            value: field.value,
            checked: field instanceof HTMLInputElement ? field.checked : false,
        })),
        disclosures: Array.from(root.querySelectorAll<HTMLDetailsElement>('details[id]')).map((details) => ({ id: details.id, open: details.open })),
    };
}

export function restorePreparationView(
    root: HTMLElement,
    saved: ReturnType<typeof capturePreparationView>,
    addedStageId?: string,
): void {
    const controls = new Map(Array.from(root.querySelectorAll<HTMLElement>('[data-prepare-key]')).map((element) => [element.dataset.prepareKey, element]));
    for (const { key, value, checked } of saved.fields) {
        const field = controls.get(key) as Field | undefined;
        if (!field) continue;
        field.value = value;
        if (field instanceof HTMLInputElement) field.checked = checked;
        field.dispatchEvent(new Event(field.id === 'prepare-transformation' ? 'change' : 'input'));
    }
    for (const { id, open } of saved.disclosures) {
        const details = document.getElementById(id) as HTMLDetailsElement | null;
        if (details && root.contains(details)) details.open = open;
    }
    if (!saved.focusKey && !saved.focusStage) return;
    const stageId = addedStageId ?? saved.focusStage;
    const stage = Array.from(root.querySelectorAll<HTMLElement>('[data-stage-id]')).find((item) => item.dataset.stageId === stageId);
    const original = controls.get(saved.focusKey);
    const target = addedStageId ? stage : original && !original.matches(':disabled') ? original : stage;
    const fallback = root.querySelector<HTMLElement>(original?.id === 'prepare-preview-button' || original?.id === 'prepare-materialize-button'
        ? '#prepare-preview-status' : '#prepare-transformation');
    (target ?? fallback)?.focus({ preventScroll: !addedStageId });
    if (target === original && saved.selection && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        const [start, end] = saved.selection;
        if (start !== null && end !== null) target.setSelectionRange(start, end);
    }
}

export function initPreparationNavigation(root: HTMLElement): () => void {
    const toolbar = root.querySelector<HTMLElement>('.prepare-workspace__toolbar');
    const scroller = root.closest<HTMLElement>('.page-prepare');
    const select = root.querySelector<HTMLSelectElement>('#prepare-section');
    if (!toolbar || !scroller || !select) return () => {};
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-prepare-section]'));
    const sections = links.map((link) => document.getElementById(link.dataset.prepareSection!)).filter((section): section is HTMLElement => !!section);
    let frame = 0;
    const update = () => {
        const boundary = toolbar.getBoundingClientRect().bottom + 20;
        const atEnd = scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        const active = atEnd ? sections.at(-1)
            : sections.filter((section) => section.getBoundingClientRect().top <= boundary).at(-1) ?? sections[0];
        for (const link of links) {
            if (link.dataset.prepareSection === active?.id) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        }
        if (active) select.value = active.id;
        root.style.setProperty('--prepare-toolbar-height', `${toolbar.offsetHeight + 12}px`);
    };
    const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(toolbar);
    update();
    return () => {
        scroller.removeEventListener('scroll', schedule);
        observer?.disconnect();
        cancelAnimationFrame(frame);
    };
}
