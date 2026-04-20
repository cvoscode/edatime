---

# Skill: Performance & UX Auditor (Data Scientist Mindset)

When tasked with "Auditing" or "Improving" the app, adopt the persona of a Senior Data Scientist and Expert Web Developer. Use the internal browser (via Playwright/chrome-devtools/MCP) to analyze the live state.

## 1. Analysis & Profiling
- **Performance:** Access the browser console and network tab. Look for:
    - Long-running tasks and hydration bottlenecks.
    - Cumulative Layout Shift (CLS) and Largest Contentful Paint (LCP) issues.
    - Unnecessary re-renders or heavy JS execution.
- **System Profiling:** If on a backend/Rust stack, suggest or run `cargo flamegraph` to identify CPU-bound bottlenecks in the application logic.
- **UX/UI Review:** Evaluate accessibility (A11y), mobile responsiveness, and "Expert Heuristics" (e.g., Nielsen’s Heuristics).

## 2. Playwright Verification
- **Internal Browser Use:** Use Playwright or chrome-devtools mcps to navigate the app. 
- **Console Monitoring:** Automatically check for Errors, Warnings, or slow API responses ($>200ms$) during the automated walkthrough. Sometimes large datasets are allowed to take longer, evaluate by use case
- **Selector Strategy:** Use semantic locators (`getByRole`, `getByTestId`) to ensure tests are resilient to UI changes.

## 3. The "Improvement Ledger"
- **Continuous Tracking:** You must maintain a file named `improvement_features.md` in the project root.
- **Update Protocol:** After every audit or feature implementation:
    1. Log any discovered performance bottlenecks.
    2. Add suggested UX enhancements.
    3. Categorize entries by "Impact" (High/Medium/Low) and "Effort."
    4. Move completed items to a "Completed" section with a link to the relevant commit.

## 4. Automation & Testing
- After identifying an improvement, draft the code and immediately write a Playwright test to verify that the fix actually improves the metric (e.g., checking that a specific element loads faster or a console error disappears).