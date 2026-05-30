# Legacy Frontend Archive

This directory stores archived frontend implementations preserved for reference.

- **Do not import from `frontend/src/legacy/` in live runtime code.**
- Files here are excluded from normal typechecking and architecture validation.
- If logic needs to return to the live app, reintroduce it through canonical modules under `app/`, `features/`, `pages/`, `services/`, `store/`, `ui/`, or `utils/`.
