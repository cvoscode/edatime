# build/viteConfig.md

> Vite build configuration that serves lazy-loaded JS chunks from the packaged `/js/` directory.

## Configuration

- `base: string = '/js/'`
  - All lazy-loaded code splitting chunks are served under the `/js/` path prefix.