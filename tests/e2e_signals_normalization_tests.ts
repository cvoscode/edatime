import { test, expect, type Page } from '@playwright/test';

type Point = { x: number; y: number; move: boolean };

test.beforeEach(async ({ page, request }) => {
    const response = await request.post('/api/v1/upload', {
        multipart: { file: { name: 'normalization.csv', mimeType: 'text/csv', buffer: Buffer.from([
            'date,signal,peer',
            '2024-01-01 00:00:00,10,100',
            '2024-01-02 00:00:00,20,110',
            '2024-01-03 00:00:00,1000,120',
            '2024-01-04 00:00:00,30,130',
            '2024-01-05 00:00:00,40,140',
        ].join('\n')) } },
    });
    expect(response.ok()).toBeTruthy();
    // Exercise the real Canvas renderer and observe its output paths. The
    // numeric ChartGPU projection is covered separately in the renderer tests.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
        const proto = CanvasRenderingContext2D.prototype;
        const paths = new WeakMap<CanvasRenderingContext2D, Point[]>();
        const isSignals = (ctx: CanvasRenderingContext2D) => ctx.canvas.parentElement?.id === 'main-chart';
        const clearRect = proto.clearRect;
        proto.clearRect = function (...args) {
            if (isSignals(this)) (window as any).__signalsPaths = [];
            return clearRect.apply(this, args);
        };
        const beginPath = proto.beginPath;
        proto.beginPath = function () { paths.set(this, []); return beginPath.call(this); };
        const moveTo = proto.moveTo;
        proto.moveTo = function (x, y) { paths.get(this)?.push({ x, y, move: true }); return moveTo.call(this, x, y); };
        const lineTo = proto.lineTo;
        proto.lineTo = function (x, y) { paths.get(this)?.push({ x, y, move: false }); return lineTo.call(this, x, y); };
        const stroke = proto.stroke;
        proto.stroke = function (...args: any[]) {
            if (isSignals(this) && this.lineWidth === 1.5) (window as any).__signalsPaths.push(paths.get(this) ?? []);
            return (stroke as any).apply(this, args);
        };
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#page=timeseries');
    await expect(page.locator('#main-chart canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => paths(page).then((traces) => traces.map((trace) => trace.length))).toEqual([5, 5]);
});

async function paths(page: Page): Promise<Point[][]> {
    return page.evaluate(() => (window as any).__signalsPaths ?? []);
}

async function applyRange(page: Page, from: string, to: string) {
    await page.getByRole('button', { name: 'Filter range for signal', exact: true }).click();
    await page.locator('#column-filter-min').fill(from);
    await page.locator('#column-filter-max').fill(to);
    await page.locator('#column-filter-apply-btn').click();
    await expect(page.locator('#column-filter-modal')).toBeHidden();
}

test('Signals normalization follows local range edits and clearing while preserving gaps and peer traces', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await applyRange(page, '15', '45');
    await expect.poll(() => paths(page).then((traces) => traces.map((trace) => trace.length))).toEqual([3, 5]);
    const filteredRaw = await paths(page);
    await page.locator('#timeseries-normalize-series').check();
    await expect(page.locator('#main-chart')).toHaveAttribute('aria-label', /Normalized value/);
    await expect.poll(async () => {
        const [signal, peer] = await paths(page);
        return signal?.map((point) => point.y === peer[0].y ? 0 : point.y === peer[2].y ? 0.5 : point.y === peer[4].y ? 1 : -1);
    }).toEqual([0, 0.5, 1]);
    const [filtered, peer] = await paths(page);
    expect(filtered.map((point) => point.move)).toEqual([true, true, false]);
    await page.screenshot({ path: testInfo.outputPath('normalized-local-filter.png') });

    await page.locator('#timeseries-normalize-series').uncheck();
    await expect.poll(() => paths(page)).toEqual(filteredRaw);
    await page.locator('#timeseries-normalize-series').check();

    await applyRange(page, '15', '35');
    await expect.poll(() => paths(page).then((traces) => traces.map((trace) => trace.length))).toEqual([2, 5]);
    const [edited, unchangedPeer] = await paths(page);
    expect(edited.map((point) => point.y)).toEqual([peer[0].y, peer[4].y]);
    expect(unchangedPeer).toEqual(peer);

    await page.getByRole('button', { name: 'Filter range for signal', exact: true }).click();
    await page.locator('#column-filter-clear-btn').click();
    await expect.poll(() => paths(page).then((traces) => traces.map((trace) => trace.length))).toEqual([5, 5]);
    const [cleared, clearedPeer] = await paths(page);
    expect(cleared[0].y).toBe(peer[0].y);
    expect(cleared[2].y).toBe(peer[4].y);
    expect(clearedPeer).toEqual(peer);
    expect(errors).toEqual([]);
});
