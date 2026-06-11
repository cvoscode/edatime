/**
 * Tests for scripts/frontendBuildId.mjs. The helper is intentionally
 * side-effect-free so we cover it without spawning Vite or hitting
 * the filesystem.
 */
import { describe, expect, it } from 'vitest';
import { computeBuildId, substituteBuildId } from './frontendBuildId.mjs';

describe('frontendBuildId', () => {
    describe('computeBuildId', () => {
        it('produces a stable id for a fixed manifest text and fixed time', () => {
            const manifest = JSON.stringify({
                'src/main.tsx': { file: 'assets/main-abc.js' },
                'src/app.ts': { file: 'assets/app-def.js' },
            });
            const now = new Date(Date.UTC(2026, 5, 10, 9, 32, 0, 0));
            const a = computeBuildId(manifest, now);
            const b = computeBuildId(manifest, now);
            expect(a).toBe(b);
            // 16 hex chars + dash + 12-digit minute stamp
            expect(a).toMatch(/^[0-9a-f]{16}-\d{12}$/);
        });

        it('produces the same id regardless of key order in the manifest', () => {
            const manifestA = JSON.stringify({ a: 1, b: 2, c: 3 });
            const manifestB = JSON.stringify({ c: 3, b: 2, a: 1 });
            const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
            expect(computeBuildId(manifestA, now)).toBe(computeBuildId(manifestB, now));
        });

        it('produces the same id whether input is a string or a parsed object', () => {
            const obj = { x: { y: 1 }, z: [1, 2, 3] };
            const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
            expect(computeBuildId(JSON.stringify(obj), now)).toBe(computeBuildId(obj, now));
        });

        it('produces different ids for different manifest content', () => {
            const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
            const a = computeBuildId(JSON.stringify({ a: 1 }), now);
            const b = computeBuildId(JSON.stringify({ a: 2 }), now);
            expect(a).not.toBe(b);
        });

        it('rolls forward when the minute stamp changes', () => {
            const manifest = JSON.stringify({ stable: true });
            const t1 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
            const t2 = new Date(Date.UTC(2026, 0, 1, 0, 1, 0, 0));
            const id1 = computeBuildId(manifest, t1);
            const id2 = computeBuildId(manifest, t2);
            expect(id1).not.toBe(id2);
            // The hash prefix must be identical for the same manifest content.
            expect(id1.split('-')[0]).toBe(id2.split('-')[0]);
        });
    });

    describe('substituteBuildId', () => {
        const SW = [
            '/**',
            ' * Service Worker for EdaTime.',
            ' */',
            '',
            'const CACHE_NAME = `edatime-runtime-__BUILD_ID__`;',
            '',
            'self.addEventListener("activate", () => {});',
            '',
            'const OTHER_PLACEHOLDER = "__LEFT_ALONE__";',
            '',
        ].join('\n');

        it('replaces __BUILD_ID__ with the provided build id', () => {
            const out = substituteBuildId(SW, '1a2b3c4d5e6f7g8h-202606100932');
            expect(out).toContain('edatime-runtime-1a2b3c4d5e6f7g8h-202606100932');
            expect(out).not.toContain('__BUILD_ID__');
        });

        it('leaves other __*__ placeholders untouched', () => {
            const out = substituteBuildId(SW, 'deadbeefcafef00d-202606100932');
            expect(out).toContain('"__LEFT_ALONE__"');
        });

        it('is idempotent: re-substituting has no effect', () => {
            const once = substituteBuildId(SW, '1a2b3c4d5e6f7g8h-202606100932');
            const twice = substituteBuildId(once, 'ffffffffffffffff-202606100932');
            expect(twice).toBe(once);
        });

        it('rejects empty or non-string build ids', () => {
            expect(() => substituteBuildId(SW, '')).toThrow(/non-empty/);
            expect(() => substituteBuildId(SW, null as unknown as string)).toThrow(/non-empty/);
            expect(() => substituteBuildId(SW, undefined as unknown as string)).toThrow(/non-empty/);
        });
    });
});
