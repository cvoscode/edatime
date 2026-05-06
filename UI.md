UI Assessment — Design consistency & ease of use
===============================================

Summary
-------
- A pragmatic, feature-rich UI with solid structure and keyboard-first flows. Good defaults, but a few consistency and discoverability issues make the experience uneven for new users.

Source of assessment
- Conducted by inspecting the running app in the browser (home page, header, sidebar, and timeseries page flows).

Strengths
- **Clear hierarchy:** Sidebar + header + main content is well structured and predictable.
- **Compact controls:** Toolbars and grouped controls keep advanced actions close to the chart.
- **Keyboard support:** Wide set of shortcuts and focusable elements improves power-user workflows.
- **Accessibility hooks present:** Skip link, ARIA live region, and many aria-labels exist.
- **Modular CSS:** Styles are split into modules, making targeted improvements straightforward.
- **Usercommunication** Communicate sucess or error messages only via toasts that disapear after a while

Design consistency issues
- **Visual weight mismatch:** Header buttons, sidebar items, and toolbar controls use similar styles but inconsistent spacing and icon/text alignment. Standardize paddings and icon sizes.
- **Button style variety:** Multiple button variants are used across toolbars and panels with little visual logic — pick a small set of semantic styles (primary/secondary/ghost) and apply consistently.
- **Nested disclosures:** Many controls are inside `details` drop‑downs; nested labels and summaries show different copy and state text which reduces discoverability.
- **Chip affordance variance:** Series chips mix checkbox toggles, color pickers, and ctrl+click metadata — the interaction surface is dense and can be inconsistent across window sizes.
- **Visual feedback gaps:** Data freshness and loading indicators use terse text ("Loading…", "—"). Use clearer states and skeletons for async actions.

Ease-of-use issues
- **Hidden advanced actions:** Export, transforms, and analytics live inside small disclosure menus — novice users may miss them. Consider surfacing the most-used exports and actions.
- **Non-intuitive adaptive filter UX:** `Ctrl+click` to set adaptive-target is powerful but not discoverable. Provide a visible control or an explicit action in the chip menu.
- **Overloaded toolbars:** Several toolbar groups contain many inputs (numbers, selects, toggles) packed tightly; this is overwhelming on first use. Group by task and collapse truly advanced options under "Advanced".
- **Color controls placement:** The global "Color by" selector sits above chips; users expect color controls adjacent to the series they affect.

Accessibility & internationalization
- **Good base:** Skip link and ARIA live region are implemented.
- **Focus visibility & keyboard wording:** Ensure all interactive controls have visible focus outlines (especially when custom scrollbars are hidden). Spell out keyboard alternatives in help modal for screen reader users.
- **Contrast checks:** Some thin stroke icons and light meta text risk low contrast — verify against WCAG AA.

Prioritized recommendations (short-term)
- **1. Standardize control styles:** Define and apply a small palette of button styles and spacings in `modules/buttons.css` and `modules/toolbar.css`.
- **2. Surface key actions:** Move common exports (PNG/CSV) out of nested disclosures into the toolbar. Keep less-used formats (Parquet) in an overflow menu.
- **3. Improve chip UX:** Make the chip color picker and checkbox visually unified; add a small kebab/menu on each chip for advanced actions (target adaptive, open filter) to avoid Ctrl+click discoverability problems.
- **4. Clarify async states:** Replace bare "Loading…" with contextual skeletons or spinners and add explicit data-freshness text (e.g., "Fresh: 2m ago").
- **5. Add discoverability hints:** Small inline hints or a first-run tour that highlights Ctrl+click, drawing tools, and export options.

Medium-term recommendations
- **6. Reduce nested details:** Convert frequently used `details` panels into persistent toolbar groups with collapse toggles; reserve `details` for truly advanced settings.
- **7. Accessibility sweep:** Run automated color-contrast and keyboard navigation tests, then fix missing aria-labels or non-focusable controls.
- **8. Mobile/responsive polish:** Test the collapsed sidebar state and chip wrapping on small widths; increase tap targets for touch devices.

Low-effort UX wins
- Show inline keyboard shortcut hints next to toolbar labels (e.g., "Export (P)").
- Add microcopy consistency: pick sentence case or title case and apply globally (header vs toolbar currently mix styles).
- Replace preload warning by ensuring `link rel=preload` uses correct `as` attribute or remove it if unused.

Next steps
- I can open a focused PR with small, testable changes: unify button tokens, surface PNG/CSV export, and add a visible adaptive-target menu on chips. Say which you'd like prioritized.

— End of assessment
