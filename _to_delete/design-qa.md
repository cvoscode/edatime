# Drift plot options — design QA

final result: passed

## Comparison target

- Source visual truth: `/home/crispy/edatime/audit/drift/implementation-final.png` (the previously accepted drift page and histogram evidence layout), together with the user-provided histogram screenshot and requested Raincloud, ECDF, Box, Violin, Boxplots-over-time, and Violins-over-time states.
- Browser-rendered implementation: `/home/crispy/edatime/audit/drift/14-final-default-normalized.png`.
- Full-view paired comparison: `/home/crispy/edatime/audit/drift/design-qa-followup-comparison.png`.
- Focused evidence paired comparison: `/home/crispy/edatime/audit/drift/design-qa-followup-evidence-comparison.png`.
- Alternate-state captures: `05-ecdf.png`, `06-boxplot.png`, `07-violin.png`, `08-boxplots-over-time.png`, `09-violins-over-time.png`, and `15-ecdf-final.png` under `/home/crispy/edatime/audit/drift/`.
- Responsive capture: `/home/crispy/edatime/audit/drift/11-responsive.png`.

## Normalization and state

- Desktop viewport: 1440×1024 CSS px at device scale factor 1; source and implementation are both 1440×1024 pixels.
- Full-view paired comparison: 2880×1060 pixels, with a 36 px label strip and no resizing or density conversion.
- Focused comparison: matching 1178×268 px evidence regions placed side-by-side in a 2356×304 px image.
- Responsive viewport: 900×900 CSS px at device scale factor 1.
- State: light theme, ETTm2 data loaded, daily windows, first 50% reference, all seven traces selected, later windows evaluated, analysis complete, HUFL/latest selected, severity map and Raincloud selected by default.

## Findings

No actionable P0, P1, or P2 findings remain.

- [P3] The density silhouette is constrained by the API histogram bin resolution.
  - Location: Raincloud and Violin comparison views.
  - Evidence: the reference distribution can look broad or stepped when its histogram bins are coarse, while its quartile and whisker summary remains precise.
  - Impact: no statistical claim is obscured; the chart truthfully reflects the available response data.
  - Follow-up: optionally expose a backend density estimate or additional bins in a later analytics iteration.
- [P3] The final heatmap date label remains slightly clipped at the far-right chart boundary.
  - Location: severity map.
  - Impact: intermediate dates, the selected window, and the drift conclusion remain readable.

## Required fidelity surfaces

- Fonts and typography: passed. Existing EdaTime family, weights, compact sizing, and hierarchy are preserved. Dropdown labels and chart titles remain legible without harmful wrapping.
- Spacing and layout rhythm: passed. The new view selectors fit the existing section and evidence headers without changing the approved page hierarchy. The 900 px responsive capture wraps controls without hiding the verdict or overview.
- Colors and visual tokens: passed. Reference remains blue/neutral, the selected window inherits semantic severity red, and all controls use existing surface, border, accent, and focus tokens.
- Image quality and asset fidelity: passed. All requested plots are rendered from real ECharts series and API distribution data; no raster substitutes, placeholder imagery, or approximate decorative assets were introduced.
- Copy and content: passed. `View` controls the whole-dataset/selected-trace time view, while `Distribution` controls the selected-window evidence view. The selected-trace scope is stated whenever Boxplots or Violins over time are active.
- Affordances and accessibility: passed. Both controls retain accessible combobox names, visible labels, focus treatments, and keyboard operation through the existing dropdown primitive.
- Responsiveness: passed at 1440×1024 and 900×900. The evidence header stacks at narrower product breakpoints and the overview selector remains usable.

## Comparison history

### Pass 1 — blocked

- [P1] Violins over time rendered an empty plot because the custom series did not expose its y-value extent to ECharts.
- [P2] The ECDF y-axis title occupied the chart title row and reduced label clarity.
- [P2] Custom density renderers emitted an ECharts deprecation warning through `api.style()`.
- Fixes: encoded min/max distribution values for the custom violin series; moved the ECDF axis title to the centered y-axis with an explicit gap; replaced deprecated style lookup with literal series-item styles.
- Post-fix evidence: `09-violins-over-time.png`, `15-ecdf-final.png`, and a clean browser console.

### Pass 2 — passed

- Raincloud, ECDF, Box plot, and Violin all render for the selected reference/window comparison.
- Severity map remains the default dataset view. Boxplots and Violins over time render the active trace with inside scrolling and a navigator for 363 windows.
- The accepted verdict, heatmap, trace table, metric table, and conclusion hierarchy remain unchanged.

## Browser verification

- Browser: user-approved Playwright browser, left open on the local Drift page.
- Primary interactions tested: Run analysis; change selected-window distribution among Raincloud, ECDF, Box plot, and Violin; change overview among Severity map, Boxplots over time, and Violins over time; inspect navigator visibility; resize to 900×900; restore default Severity map + Raincloud state.
- Console after final reload and interaction pass: 0 errors and 0 warnings.
- Automated verification: TypeScript check passed; production build passed; all 248 test files / 1375 tests passed, including new view-model coverage for every requested mode.

## Implementation checklist

- [x] Raincloud default comparison with density, quartiles, and sampled observations.
- [x] ECDF, Box plot, and Violin selected-window options.
- [x] Boxplots and Violins over time for the selected trace.
- [x] Whole-dataset severity map retained as the default.
- [x] Dense-window navigator and scroll/zoom support.
- [x] Responsive controls and accessible labels.
- [x] Browser, console, typecheck, build, full tests, and paired visual comparison.
