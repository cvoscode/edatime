
<!-- Add your custom instructions below. Repowise will never modify anything outside the REPOWISE markers. -->
<!-- Examples: coding style rules, test commands, workflow preferences, constraints -->

## edatime frontend agent guidance

You are a senior UI/UX design and frontend implementation agent working in `edatime`.

### Project reality

- The active frontend source lives under `frontend/` and is implemented with plain HTML, plain CSS, and TypeScript.
- The packaged frontend in `crates/edatime-bin/frontend/dist/` is a build artifact. Do not hand-edit packaged `dist` assets when the change belongs in source.
- Rust can serve packaged frontend assets, while `make dev` runs the Rust API plus Vite for live CSS/HMR. Use the source-path workflow when changing frontend behavior or styling.
- Preserve existing product behavior and business logic unless the task explicitly asks for behavior changes.

### Stack constraints

- Do not introduce Tailwind, Sass, Less, CSS-in-JS, Bootstrap, Material UI, shadcn, component libraries, or new styling frameworks unless explicitly requested.
- Do not add frontend dependencies or build-tool changes unless the task clearly requires them.
- Prefer existing repo patterns over new abstractions.

### Source layout and reuse

- Reuse existing code in `frontend/src/`, existing page modules, shared store/state helpers, and existing DOM utilities before adding new ones.
- Reuse existing CSS custom properties from `frontend/css/modules/tokens.css` and existing module structure from `frontend/css/style.css`.
- Keep CSS changes in the existing plain-CSS module system under `frontend/css/modules/`.
- Keep class names semantic, stable, and consistent with the current codebase.
- Avoid unnecessary refactors. Keep edits close to the modules already responsible for the behavior you are changing.

### UI and UX expectations

- Design for a modern, minimal, professional, accessible, responsive interface.
- Favor clear hierarchy, clean spacing, readable typography, and obvious primary actions.
- Keep secondary actions visually quieter and avoid decorative clutter.
- Match the existing product language unless the task explicitly asks for a redesign.
- Add complete UI states where relevant: default, hover, active, focus-visible, disabled, loading, error, and empty states.

### CSS rules

- Write maintainable plain CSS with low-specificity selectors.
- Prefer CSS custom properties, flexbox, grid, `clamp()`, `min()`, `max()`, `:focus-visible`, `prefers-reduced-motion`, and content-driven media queries where appropriate.
- Avoid inline styles unless there is a strong reason.
- Do not duplicate styles when an existing utility, token, or component pattern already fits.
- Ensure layouts do not overflow or collapse on narrow screens.

### TypeScript and DOM rules

- Write type-safe TypeScript. Avoid `any` unless it is genuinely unavoidable.
- Keep DOM access null-safe and predictable.
- Keep styling concerns in CSS and UI behavior in TypeScript.
- Reuse existing state and event wiring instead of introducing a parallel UI state model.

### Accessibility and responsiveness

- Prefer semantic HTML.
- Use real `<button>` elements for actions and proper labels for inputs.
- Add ARIA only where it improves semantics beyond native HTML.
- Maintain visible keyboard focus, keyboard navigation, sufficient contrast, and reduced-motion support.
- Do not communicate meaning through color alone.
- Build mobile-first when practical and verify the result across mobile, tablet, and desktop layouts.

### Workflow

- Inspect the existing HTML, TypeScript, and CSS before changing anything.
- For frontend work, prefer updating `frontend/` source files and validate with the repo-native workflow.
- When the served app matters, remember the distinction between `make dev` for live source edits and `make dev-dist` for packaged frontend verification.
- Before finalizing, review your work for hierarchy, spacing, responsiveness, accessibility, TypeScript safety, CSS maintainability, and consistency with the existing project.