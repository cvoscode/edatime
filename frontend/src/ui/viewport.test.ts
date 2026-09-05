import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';
import { initZoomRangeBadge, updateZoomRangeBadge, getCurrentView } from './viewport.js';

let workspace = createWorkspaceStore();
let dispose = () => {};
const setRange = (min: number, max: number) => workspace.commitDataset(
    workspace.beginDatasetSession(), { time_range: { min, max }, columns: [] } as any, 1,
);
const text = () => document.getElementById('zoom-range-badge')?.textContent;

describe('workspace zoom badge', () => {
    beforeEach(() => {
        workspace = createWorkspaceStore();
        document.body.innerHTML = '<span id="zoom-range-badge">—</span>';
        dispose = initZoomRangeBadge(workspace);
    });
    afterEach(() => { dispose(); workspace.dispose(); });
    it('renders a placeholder until metadata provides the initial range', () => {
        updateZoomRangeBadge(workspace);
        expect(text()).toBe('—');
    });
    it('renders 100 percent when metadata and viewport arrive', () => {
        workspace.setViewport({ xMin: 0, xMax: 100, yMin: null, yMax: null });
        setRange(0, 100);
        expect(text()).toBe('Viewing 100%');
    });
    it('observes chart gestures, quick ranges and session restoration through one viewport', () => {
        setRange(0, 100);
        workspace.setViewport({ xMin: 25, xMax: 75, yMin: 1, yMax: 2 });
        expect(text()).toBe('Viewing 50%');
        expect(getCurrentView(workspace)).toMatchObject({ xMin: 25, xMax: 75 });
    });
    it('updates its baseline on dataset replacement', () => {
        workspace.setViewport({ xMin: 50, xMax: 100, yMin: null, yMax: null });
        setRange(0, 100);
        expect(text()).toBe('Viewing 50%');
        setRange(50, 100);
        expect(text()).toBe('Viewing 100%');
    });
    it('removes subscriptions when the toolbar is disposed', () => {
        setRange(0, 100);
        workspace.setViewport({ xMin: 0, xMax: 100, yMin: null, yMax: null });
        dispose();
        workspace.setViewport({ xMin: 25, xMax: 75, yMin: null, yMax: null });
        expect(text()).toBe('Viewing 100%');
    });
});
