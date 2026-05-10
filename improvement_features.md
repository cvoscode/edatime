# UI Audit Issues - Time Series Plot Page

## Fixes Applied
- **404 Errors Fixed:** Rebuilt frontend assets using `npm run build` and restarted the server. All JS assets now load correctly.
- **Alt Text Added:** Added `aria-label` attributes to all navigation buttons and `aria-hidden="true"` to SVG icons for better accessibility.
- **Sample Data Loaded:** Uploaded ETTm1.csv (69,680 rows, 7 numeric series) via API. The timeseries page now displays series chips, color controls, and chart data.
- **Interactive Features Audited:** With data loaded, the UI shows functional series toggles, color pickers, draw tools, export options, and analytics controls. No new issues identified in interactive state.

## Remaining Accessibility Issues
- Potential color reliance: The color scale ("0" to "1") and category labels may not be perceivable for color-blind users without additional text or patterns.
- No ARIA live regions: Dynamic content (e.g., after data load) may not announce changes to screen readers.
- Form grouping: Some controls (e.g., Draw tools) could benefit from `<fieldset>` and `<legend>` for better grouping.

## Remaining Usability Issues
- Empty state confusion: Without data, the page feels incomplete. Users may not know how to proceed (e.g., no link to upload from this page).
- Tool complexity: Advanced tools (e.g., Draw tools, Analytics bands) may overwhelm new users without tooltips or help text.
- Color picker UX: The color input for drawing is a standard HTML color picker, which may not be intuitive on all devices.
- No loading indicators: If data takes time to load, there's no spinner or progress bar.
- Keyboard shortcuts not discoverable: Alt+ keys are mentioned but not highlighted (e.g., no tooltip on hover).

## Remaining Performance Issues
- Preload inefficiency: Warning for `style.css` being preloaded but not used quickly. This wastes bandwidth.

## Remaining Visual Design Issues
- Empty chart area: The main canvas is blank with text, which looks unpolished. A placeholder graphic or wireframe could improve perceived quality.
- Color scale visibility: The "Color" and "Category" labels are present but may not be clear without data.
- Icon consistency: Navigation icons are images; ensure they are SVG for scalability.
- No visual feedback: Buttons lack hover/focus states (beyond cursor=pointer), which could be added via CSS.

## Recommendations
- Add descriptive `alt` text to all images (e.g., `alt="Home icon"`). Ensure color-coded elements have text alternatives. Test with screen readers (e.g., NVDA) and color contrast tools.
- Add tooltips (via `title` attribute or ARIA) for complex controls. Include a "Get started" link to the upload page. Add loading states for async operations.
- Ensure all assets are built and served correctly (check the Rust backend's static file serving). Remove or optimize preloads. Use browser dev tools to audit network requests.
- Add subtle background graphics or animations to the empty state. Ensure CSS includes focus indicators. Test on different screen sizes.
- Integrate automated audits: Lighthouse accessibility and performance checks could be added to CI/CD or as a dev tool, but require Chrome debugging mode in the browser environment.