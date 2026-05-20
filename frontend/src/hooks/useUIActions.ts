/**
 * Shared UI action hooks — consolidate duplicate patterns across pages.
 * Provides reusable hooks for: drawer visibility, loading state, toggles.
 */
import { createSignal, Accessor, Setter } from 'solid-js';

/**
 * Creates drawer's show/hide visibility setters.
 * Returns: { showDrawer, hideDrawer, isOpen, setOpen, toggle }
 * Accessors: isOpen() returns boolean, setOpen is the setter
 */
export function createDrawerVisibility(initial = false) {
    const [isOpen, setOpen] = createSignal(initial);
    const showDrawer = () => setOpen(true);
    const hideDrawer = () => setOpen(false);
    const toggleDrawer = () => setOpen(prev => !prev);
    // Also export raw setter for direct assignment in JSX
    const setOpenDirect = (val: boolean | ((prev: boolean) => boolean)) => setOpen(val);
    return { showDrawer, hideDrawer, toggleDrawer, isOpen, setOpen: setOpenDirect };
}

/**
 * Creates loading state with optional skeleton delay support.
 * Returns: { isLoading, setLoading, markLoaded, setSkeleton, hasLoaded }
 */
export function createLoadingState(options?: { skeletonDelay?: number }) {
    const [isLoading, setLoading] = createSignal(false);
    const [hasLoaded, setHasLoaded] = createSignal(false);

    const markLoaded = () => {
        setHasLoaded(true);
        if (options?.skeletonDelay) {
            setTimeout(() => setLoading(false), options.skeletonDelay);
        } else {
            setLoading(false);
        }
    };

    const setSkeleton = (show: boolean) => {
        if (show) {
            setLoading(true);
            setHasLoaded(false);
        }
    };

    return { isLoading, setLoading, markLoaded, setSkeleton, hasLoaded };
}

/**
 * Creates generic on/off toggle state.
 * Returns: { isOn, toggle, setOn, setOff }
 */
export function createToggleState(initial = false) {
    const [isOn, setIsOn] = createSignal(initial);
    const toggle = () => setIsOn(prev => !prev);
    const setOn = () => setIsOn(true);
    const setOff = () => setIsOn(false);
    return { isOn, toggle, setOn, setOff };
}

/**
 * Creates numeric signal with min/max bounds.
 * Returns: { value, setValue, increment, decrement }
 */
export function createBoundedSignal(
    initial: number,
    min: number,
    max: number,
    step = 1
) {
    const [value, setValue] = createSignal(initial);
    const clamp = (v: number) => Math.max(min, Math.min(max, v));
    const increment = () => setValue(prev => clamp(prev + step));
    const decrement = () => setValue(prev => clamp(prev - step));
    const setClamped = (v: number) => setValue(clamp(v));
    return { value, setValue: setClamped, increment, decrement };
}

/**
 * Creates an input value + validity signal pair.
 * Returns: { inputValue, setInputValue, isValid, setValid }
 */
export function createInputState(initial = '') {
    const [inputValue, setInputValue] = createSignal(initial);
    const [isValid, setIsValid] = createSignal(true);
    return { inputValue, setInputValue, isValid, setIsValid };
}

/**
 * Callback hook that ensures a function is called only once per tick.
 * Returns: { once, runNow }
 */
export function createOnceCallback<T extends (...args: any[]) => any>(
    fn: T
): { once: () => void; runNow: T } {
    let called = false;
    const once = () => {
        if (!called) {
            called = true;
            fn();
        }
    };
    return { once, runNow: fn };
}