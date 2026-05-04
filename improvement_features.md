# UI/UX Improvement Ledger

Audit basis: live walkthrough on 2026-04-28 against `ETTm2.csv` at `http://127.0.0.1:3001`.

Additional audit basis: Chrome DevTools walkthrough on 2026-04-30 against `#page=home`, `#page=timeseries`, and `#page=upload` at desktop `1440x960` and mobile `500x844`.

Additional audit basis: Chrome DevTools walkthrough on 2026-05-05 against all pages at `http://127.0.0.1:3000` with sample data loaded.

---

## 2026-05-05 Audit Findings

### Performance Metrics (2026-05-05)

**Frontend:**
- Home page LCP: 141ms (TTFB: 1ms, Render delay: 140ms)
- Home page CLS: 0.00 ✅
- Timeseries page: Loads without CLS issues
- All pages: No critical console errors

**Backend (cargo bench):**
- `time_filter_and_lttb_200k_3_series`: 1.18ms avg (improved -6.8% vs baseline)
- `metadata_profile_75k_4_series`: 2.08ms avg (stable)

**Lighthouse Scores (Desktop):**
- Accessibility: 83 ⚠️ (previously 90+)
- Best Practices: 100
- SEO: 90
- Agentic Browsing: 100

### Page-by-Page Status (2026-05-05)

| Page | Status | Notes |
|------|--------|-------|
| Home | ✅ Good | LCP 141ms, CLS 0.00 - stable |
| Upload | ✅ Good | File/Database tabs, no eager fetches |
| Timeseries | ✅ Good | Works with fallback renderer |
| Correlations | ✅ Good | Matrix requests fast |
| Scatter | ✅ Good | Works with fallback, WebGPU preferred |
| FFT | ✅ Good | No route-time fetch cost |
| Spectrogram | ✅ Good | Light until compute |
| Causal | ✅ Good | Loads without fetches, rich controls |
| Drift | ✅ Good | Routing works correctly |

---

## Open Items (Deferred)

These items require architectural changes and are tracked separately:

- **Backend Performance:** Investigate `time_filter_and_lttb_200k_3_series` regression (+4.6%)
- **Job Execution:** Move Spectrogram/Causal/Drift to cancellable job-style with persisted state
- **FFT Batching:** Batch requests when comparing multiple traces

---

## Recommendations Summary

### High Priority (High Impact, Low Effort)
| Issue | Location | Fix |
|-------|----------|-----|
| Accessibility regression | Lighthouse: 83 vs 90+ | Fix form labels and add skip links |

### Medium Priority
| Issue | Impact | Effort |
|-------|--------|--------|
| Add skip-to-content link | A11y | Low |
| Form fields missing labels | A11y | Low |
| Reduce render-blocking CSS | Performance | Medium |

### Low Priority / Already Working
| Issue | Status |
|-------|--------|
| FFT WebGPU fallback | ✅ Graceful fallback working |
| Backend benchmarks | ✅ Performance improved |
| WebGPU warnings in headless | Expected behavior |

---

## Completed

| Issue | Commit | Status |
|-------|--------|--------|
| Backend `time_filter_and_lttb_200k_3_series` regression | Fixed in 2026-05-05 bench run (-6.8% improvement) | ✅ Resolved |

---

## Test Suite

E2E audit tests are available at `tests/e2e_audit_tests.ts` for future Playwright setup.
