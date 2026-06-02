# ai/frontend/src/pages/shared/pageRuntime.test.md
> Tests for `createPageRuntime` — init fires once, onVisible fires each activation, onEveryPageChange fires on every event, updateStatus sets element textContent.

## Tests
- **init fires once**: `init` called exactly once even when `page-change` fires multiple times for the same page.
- **init not called for other pages**: `init` does not fire for unrelated pages before the target page is activated.
- **onVisible fires each time**: `onVisible` fires on every activation of the registered page.
- **onVisible not called for other pages**: `onVisible` does not fire for unrelated pages.
- **onEveryPageChange fires on every event**: `onEveryPageChange` fires on every `page-change` regardless of target page.
- **onEveryPageChange fires before init**: `onEveryPageChange` fires even before `init` has fired.
- **updateStatus sets textContent**: `updateStatus(text)` sets `textContent` on the element with `id = statusElId`.
- **setLoading toggles loading element visibility**: `setLoading(true)` hides the loading element; `setLoading(false)` shows it.