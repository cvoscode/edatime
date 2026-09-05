/** Chart title and axis labels are shared, persisted workspace appearance. */
import { primaryChart } from '../charts/primaryChart.js';
import type { WorkspaceStore } from '../contracts/workspace.js';

export function initChartTextControls(
    workspace: Pick<WorkspaceStore, 'getSnapshot'> & Partial<Pick<WorkspaceStore, 'subscribe'>> & Partial<Pick<WorkspaceStore, 'setAppearance'>>,
): () => void {
    const lifetime = new AbortController();
    const inputs = {
        title: document.getElementById('chart-title-input') as HTMLInputElement | null,
        xLabel: document.getElementById('x-axis-label-input') as HTMLInputElement | null,
        yLabel: document.getElementById('y-axis-label-input') as HTMLInputElement | null,
    };
    const initial = workspace.getSnapshot().appearance.chartText;
    const apply = () => {
        const previous = workspace.getSnapshot().appearance.chartText;
        const chartText = {
            title: inputs.title?.value ?? previous.title,
            xLabel: inputs.xLabel?.value ?? previous.xLabel,
            yLabel: inputs.yLabel?.value ?? previous.yLabel,
        };
        workspace.setAppearance?.({ chartText });
        primaryChart.current?.setChartText?.(chartText.title, chartText.xLabel, chartText.yLabel);
    };
    for (const key of ['title', 'xLabel', 'yLabel'] as const) {
        const input = inputs[key];
        if (!input) continue;
        input.value = initial[key];
        input.addEventListener('input', apply, { signal: lifetime.signal });
    }
    const sync = () => {
        const text = workspace.getSnapshot().appearance.chartText;
        for (const key of ['title', 'xLabel', 'yLabel'] as const) {
            if (inputs[key] && inputs[key]!.value !== text[key]) inputs[key]!.value = text[key];
        }
        primaryChart.current?.setChartText?.(text.title, text.xLabel, text.yLabel);
    };
    const unsubscribe = workspace.subscribe?.(sync);
    const unsubscribeChart = primaryChart.subscribe(sync);
    sync();
    return () => { lifetime.abort(); unsubscribe?.(); unsubscribeChart(); };
}
