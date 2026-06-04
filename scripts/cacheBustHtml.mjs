export function applyCacheBusting(html, version) {
  return html.replace(
    /(src|href)="([^"]+\.(?:js|css))(?:\?v=[^"]*)?"/g,
    (_match, attr, assetPath) => `${attr}="${assetPath}?v=${version}"`,
  );
}
