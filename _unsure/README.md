# _unsure

Files moved here on 2026-09-29 during a repository cleanup. They are not used by
the build, tests, CI, or `make dev`, but they may still have value. Decide for
each: move it back (to its original path, or into `docs/`) or delete it. Original
paths are preserved underneath this folder.

| Item | Why it is here | Suggestion |
|---|---|---|
| `backend_issues.md`, `backend_fix_plan.md`, `frontent_issues.md` | Review findings and fix plan from 2026-09-24/25. May still be an open backlog. | Keep open items as GitHub issues, then delete. |
| `sol_improvements.md` | Data-scientist review from 2026-09-28, the most recent one. | Same as above. |
| `issues.md`, `review_gcp.md` | UI/UX reviews from 2026-09-11. Probably superseded by the 2026-09-24 reviews. | Probably delete. |
| `usage_issue.md` | All-page layout audit from 2026-07-17. **Cited by section number in code comments** (`crates/edatime-service/src/handlers/scatter/correlations.rs`, `config.toml.example`, several CSS modules, `frontend/src/chart/DataChart.ts`). | If you delete it, those comments point at nothing. That is harmless but worth knowing. |
| `backend_improvments.md` | Backend backlog; its header says P0–P2 were completed on 2026-08-03. | Probably delete. |
| `UX_improvements_and_new_features.md` | Product ideas that were deliberately left unimplemented. | Keep if it's your feature wishlist. |
| `UI_design_guide.md` | 1,165-line "proposed" UI redesign spec (2026-07-17). | Move to `docs/` if it's still the design direction. |
| `rust_style.md` | Broad Rust style/performance knowledge base, not specific to this repo. | Delete, or keep as a personal reference. |
| `Modelfile` | Ollama model config (gemma4) for local reviews. Already listed in `.gitignore` but it was tracked. | Keep locally, untracked. |
| `benchmarks/2026*` | Benchmark results from 2026-07-14. `benchmarks/.gitignore` says results should not be tracked, but they could serve as a baseline. | Delete unless you compare against them. |
| `scripts/check-frontend.mjs` | Syntax check over built `dist` JS. Not wired into `package.json`, the Makefile, or CI. | Delete, or add an npm script for it. |
| `.github/agents/*` | GitHub Copilot custom-agent prompts (UI, feature, performance audit, refactoring, Rust anti-patterns). Generic, and they overlap with `AGENTS.md`. | Move back only if you use Copilot agents. |
