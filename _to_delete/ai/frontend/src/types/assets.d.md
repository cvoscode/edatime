# ai/frontend/src/types/assets.d.md
> Ambient browser asset typings used by the frontend build and page-style loader.

## Declarations
- `interface ImportMeta { glob<T = unknown>(pattern: string, options?: { eager?: boolean; import?: string; query?: string }): Record<string, T> }`
  - Type support for Vite-style `import.meta.glob(...)`.
- `declare module '*.css?url'`
  - Declares CSS module URL imports as `string`.
