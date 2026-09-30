# CLAUDE.md

Project guidance lives in `AGENTS.md` at the repo root, shared by all coding
agents. Edit that file, not this one, for anything that isn't Claude-specific.

@../AGENTS.md

## Claude Code specifics

- Start the app with `make dev`. To check a UI change in a browser, open
  http://127.0.0.1:5173 (Vite), not :3000.
- On this machine, bare `node` is usually missing and `npm` resolves to the
  Windows install. Use `make` targets, or the VS Code Server node described in
  `AGENTS.md`.
- `.mcp.json` configures a Repowise MCP server. Its index is often stale, and
  the `repowise` binary may not be installed. If the tools aren't available,
  work from the source. Don't treat Repowise output as authoritative.
- Don't read, edit, or cite anything under `_to_delete/` or `_unsure/`. Those
  folders are waiting for the owner to review and delete them.
