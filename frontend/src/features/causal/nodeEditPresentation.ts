/** Render the editable node form without retaining any modal DOM state. */
export function renderNodeEditHtml(input: {
    label: string;
    color: string;
    attributes: Record<string, unknown>;
}): string {
    return `
      <label class="causal-field-row">
        <span>Label</span>
        <input type="text" id="ep-node-label" class="modal-input" style="flex:1" value="${escapeHtml(input.label)}">
      </label>
      <label class="causal-field-row">
        <span>Color</span>
        <input type="color" id="ep-node-color" value="${escapeHtml(input.color)}" style="width:36px;height:28px;padding:2px;">
      </label>
      <label class="causal-field-stack">
        <span>Attributes (JSON)</span>
        <textarea id="ep-node-attrs" class="modal-input causal-field-textarea">${escapeHtml(JSON.stringify(input.attributes, null, 2))}</textarea>
        <span class="causal-field-hint">Store any node metadata here.</span>
      </label>`;
}

function escapeHtml(value: unknown): string {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
