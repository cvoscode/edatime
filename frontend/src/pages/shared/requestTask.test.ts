import { describe, it, expect, vi } from 'vitest';
import { createRequestTask } from './requestTask';

describe('createRequestTask', () => {
    const noOp = () => { };

    function makeOptions() {
        const setLoading = vi.fn();
        const onError = vi.fn();
        return { setLoading, onError };
    }

    // --- getSignal ---

    it('getSignal() returns a never-aborted signal when no request has run', () => {
        const { onError } = makeOptions();
        const task = createRequestTask({ setLoading: noOp, onError });
        const signal = task.getSignal();

        // Should not be aborted yet.
        expect(signal.aborted).toBe(false);
    });

    it('getSignal() returns the current controller signal after run() is called', async () => {
        const { onError } = makeOptions();
        const task = createRequestTask({ setLoading: noOp, onError });

        let capturedSignal: AbortSignal | null = null;
        await task.run((signal) => {
            capturedSignal = signal;
            return Promise.resolve();
        });

        expect(capturedSignal).not.toBeNull();
        expect(task.getSignal()).toBe(capturedSignal);
    });

    // --- run() lifecycle ---

    it('run() sets loading true then false on success', async () => {
        const { setLoading, onError } = makeOptions();
        const task = createRequestTask({ setLoading, onError });

        await task.run(() => Promise.resolve());

        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenNthCalledWith(1, true);
        expect(setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('run() sets loading true then false on non-abort error', async () => {
        const { setLoading, onError } = makeOptions();
        const task = createRequestTask({ setLoading, onError });

        await task.run(() => Promise.reject(new Error('test error')));

        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenNthCalledWith(1, true);
        expect(setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('run() calls onError with the message on non-abort error', async () => {
        const { setLoading, onError } = makeOptions();
        const task = createRequestTask({ setLoading, onError });

        await task.run(() => Promise.reject(new Error('something went wrong')));

        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith('something went wrong');
    });

    it('run() does NOT call onError on AbortError', async () => {
        const { setLoading, onError } = makeOptions();
        const task = createRequestTask({ setLoading, onError });

        const abortErr = new Error('request cancelled');
        abortErr.name = 'AbortError';

        await task.run(() => Promise.reject(abortErr));

        expect(onError).not.toHaveBeenCalled();
    });

    it('run() does NOT call onError when aborted via signal', async () => {
        const { setLoading, onError } = makeOptions();
        const task = createRequestTask({ setLoading, onError });

        // Simulate a real fetch-like function that respects the abort signal.
        const pending = task.run(async (signal) => {
            // fetch() throws on abort; use a no-op controller to avoid actual network calls.
            const controller = new AbortController();
            // Race: abort our controller vs. the signal aborting via cancel().
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => resolve(), 2000);
                signal.addEventListener('abort', () => { clearTimeout(timeout); resolve(); }, { once: true });
                // Also abort manually after the outer cancel() is called in the test.
            });
            // If we get here without abort firing, throw to avoid hanging.
            if (!signal.aborted) throw new Error('signal not aborted');
        });

        task.cancel();
        await pending;

        expect(onError).not.toHaveBeenCalled();
    });

    // --- cancellation / abort-before-new ---

    it('run() creates a new controller each time (old one is aborted)', async () => {
        const { onError } = makeOptions();
        const task = createRequestTask({ setLoading: noOp, onError });

        // First request hangs until aborted.
        let firstSignal: AbortSignal | null = null;
        const firstRun = task.run(async (signal) => {
            firstSignal = signal;
            await new Promise<void>(() => { }); // hang forever
        });

        // Second request starts — should abort the first.
        let secondSignal: AbortSignal | null = null;
        await task.run(async (signal) => {
            secondSignal = signal;
            await Promise.resolve(); // succeed immediately
        });

        // First signal should be aborted, second should not.
        expect(firstSignal).not.toBeNull();
        expect(firstSignal!.aborted).toBe(true);
        expect(secondSignal).not.toBeNull();
        expect(secondSignal!.aborted).toBe(false);
    });

    it('cancel() aborts the current controller', async () => {
        const { onError } = makeOptions();
        const task = createRequestTask({ setLoading: noOp, onError });

        let capturedSignal: AbortSignal | null = null;
        const pending = task.run(async (signal) => {
            capturedSignal = signal;
            // Simulate work that respects abort signal.
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => resolve(), 2000);
                signal.addEventListener('abort', () => { clearTimeout(timeout); resolve(); }, { once: true });
            });
            if (!signal.aborted) throw new Error('not aborted');
        });

        task.cancel();
        await pending;

        expect(capturedSignal).not.toBeNull();
        expect(capturedSignal!.aborted).toBe(true);
    });

    it('cancel() is safe when no request is pending', () => {
        const { onError } = makeOptions();
        const task = createRequestTask({ setLoading: noOp, onError });

        // Should not throw.
        task.cancel();
    });

    // --- run-token guard ---

    it('a superseded run() cannot clear loading state or surface errors for a newer run()', async () => {
        const setLoading = vi.fn();
        const onError = vi.fn();
        const task = createRequestTask({ setLoading, onError });

        // Start a slow first run.
        const firstRun = task.run(async (signal) => {
            await new Promise<void>((resolve) => {
                const t = setTimeout(resolve, 2000);
                signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
            });
            // Throw after abort to make sure onError is NOT called.
            throw new Error('first request failed after abort');
        });

        // Start a fast second run.
        await task.run(async () => {
            await Promise.resolve();
        });

        // Wait for the first run to settle (it will throw after abort).
        await firstRun;

        // setLoading(true) called for each run, then only the second run's
        // setLoading(false) is allowed to fire.
        const falseCalls = setLoading.mock.calls.filter(([arg]) => arg === false);
        expect(falseCalls).toHaveLength(1);
        // The superseded run must NOT surface its error.
        expect(onError).not.toHaveBeenCalled();
    });
});