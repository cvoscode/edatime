# Preparation page UX audit

Date: 2026-09-15  
Surface: EdaTime Preparation  
Dataset: `source-5`, ETTm2, 69,680 rows  
Capture sizes: 1440×1000 desktop and 390×844 narrow screen

## Overall verdict

The page is functional and visually consistent, with a useful pipeline summary, reversible stage controls, exact preview feedback, and a good help dialog. The main risk is sequencing: the interface makes the destructive-looking “Create prepared dataset” action primary and available before a successful preview, while quality review is placed after pipeline editing and exports. The page currently asks users to understand too much before it makes the safe next action obvious.

## Captured flow

1. **Baseline orientation — mixed**  
   [01-baseline.png](./01-baseline.png): clear source/revision context, but the first screen is already dense and does not surface quality review first.

2. **Pipeline composer and export area — mixed**  
   [02-stages.png](./02-stages.png), [03-quality-immediate.png](./03-quality-immediate.png): controls are discoverable, but the page order conflicts with the recommended order in Help and the content is split across a long internal scroll pane.

3. **Sampled quality report — mixed**  
   [04-quality-sampled-ready.png](./04-quality-sampled-ready.png): useful findings and uncertainty language, but repeated no-op actions and raw precision create noise.

4. **Add a stable sort — risky**  
   [05-sort-added.png](./05-sort-added.png): the stage summary and reversible controls are good; however, the plan becomes “Live in every plot” immediately and materialization becomes the bright primary action before preview.

5. **Preview changes — good result, unsafe sequencing**  
   [06-preview-result.png](./06-preview-result.png): exact row/column impact is easy to verify once run. The same verification should be required before materialization.

6. **Narrow-screen layout — mixed**  
   [07-mobile-top.png](./07-mobile-top.png), [08-mobile-stages.png](./08-mobile-stages.png), [09-mobile-quality.png](./09-mobile-quality.png): reflow works, but the horizontal section nav has no visible continuation cue and dense forms/statistics remain tiring to scan.

7. **Help dialog — good**  
   [10-help-modal.png](./10-help-modal.png): concise, readable, and focus returns to the trigger after closing.

## Highest-impact improvements

1. **Gate materialization on a current successful preview.** Disable “Create prepared dataset” until the current plan has a valid preview; make “Preview changes” the primary CTA. In the current implementation, materialization is disabled only when there are zero active stages ([prepare/index.ts:708](/home/crispy/edatime/frontend/src/features/prepare/index.ts:708), [prepare/index.ts:727](/home/crispy/edatime/frontend/src/features/prepare/index.ts:727)).

2. **Reorder the page around the user’s decision.** Put source identity and quality summary first, then pipeline preview, stages, and exports. The Help dialog says quality comes first, but the rendered DOM appends export before quality ([prepare/index.ts:1063](/home/crispy/edatime/frontend/src/features/prepare/index.ts:1063), [prepare/index.ts:1071](/home/crispy/edatime/frontend/src/features/prepare/index.ts:1071)).

3. **Turn Quality findings into an overview, not a wall of rows.** Start with counts such as “0 missing-value findings · 4 zero-run candidates · 7 distribution summaries,” then let users expand a category or column. Only show an action for an actionable finding; the sampled report currently renders “Add missing-value policy” for every `OK` column ([prepare/index.ts:320](/home/crispy/edatime/frontend/src/features/prepare/index.ts:320)). Format values to sensible precision and human units instead of long floats and `900000 ms` ([prepare/index.ts:362](/home/crispy/edatime/frontend/src/features/prepare/index.ts:362), [prepare/index.ts:427](/home/crispy/edatime/frontend/src/features/prepare/index.ts:427)).

4. **Make live-vs-draft state explicit.** After adding a stage, show a persistent banner such as “Working plan active in plots · source unchanged · preview required,” with a clear “Undo” affordance. The current “Live in every plot” label is accurate but easy to miss among the other facts.

5. **Keep section navigation available while scrolling.** The section nav disappears on the lower quality view, forcing users back to the top; on mobile it overflows to 561px inside a 360px viewport without a cue that more links exist. Preserve a sticky nav or add a compact “Sections” control with an active section indicator. The existing sticky rule is overridden by the page-specific workspace rule ([prepare.css:34](/home/crispy/edatime/frontend/css/modules/prepare.css:34), [workspace.css:622](/home/crispy/edatime/frontend/css/modules/workspace.css:622)).

6. **Fix composer labeling and focus continuity.** Several transformation controls rely on placeholders and unlabeled native selects; the visible DOM has no accessible name for `strategy`, `limit`, `every`, or `aggregations`. Adding a stage also re-renders the whole workspace and returns focus to `<body>`, so keyboard users lose their place. Use real labels/`aria-describedby`, then restore focus to the changed stage or the next logical control.

7. **Scale the stage list for real pipelines.** Add step numbers, a drag handle or clearer reorder affordance, and a compact per-stage impact summary. “Up / Down” works for one stage, but becomes slow and hard to reason about as the pipeline grows.

## Evidence limits

- I did not click “Create prepared dataset”; it creates a new immutable dataset version. The pre-materialization state was inspected instead.
- This is not a full WCAG audit: no screen reader, axe scan, zoom test, or non-Chrome browser was run.
- The captured quality state is the sampled report. Exact-report timing, failure, and cancellation states were not included in the screenshot set.
- Focus behavior was checked with keyboard-capable browser automation: the help dialog restores focus correctly; adding a stage does not.

## Verification

- Live local Chrome capture completed with no console errors or failed requests in the accepted desktop flow.
- Focused preparation tests: **22 passed**.
- `git diff --check`: passed for the reviewed preparation files.
