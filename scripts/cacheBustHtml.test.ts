import { describe, expect, it } from 'vitest';

import { applyCacheBusting } from './cacheBustHtml.mjs';

describe('applyCacheBusting', () => {
    it('replaces an existing cache-busting token for script and stylesheet assets', () => {
        const html = `
<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="css/style.css?v=139">
  </head>
  <body>
    <script type="module" src="js/app.js?v=139"></script>
  </body>
</html>`;

        const result = applyCacheBusting(html, 'fresh123');

        expect(result).toContain('href="css/style.css?v=fresh123"');
        expect(result).toContain('src="js/app.js?v=fresh123"');
        expect(result).not.toContain('?v=139');
    });

    it('adds a cache-busting token when the asset URL has no query string', () => {
        const html = '<script type="module" src="js/app.js"></script>';

        expect(applyCacheBusting(html, 'fresh123')).toContain('src="js/app.js?v=fresh123"');
    });
});
