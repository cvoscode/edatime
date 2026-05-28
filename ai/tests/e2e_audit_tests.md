# e2e_audit_tests.ts

**Purpose:** Playwright E2E tests that verify the improvements identified in the 2026-05-05 audit.

## Test Suites

```typescript
test.describe('Audit Verification Tests', () => { ... })
```

```typescript
test.describe('Page Load Performance', () => { ... })
```

```typescript
test.describe('Console Error Monitoring', () => { ... })
```

## Tests

```typescript
test('drift page routing works correctly', async ({ page }) => { ... })
```

```typescript
test('home page has no layout shifts (CLS = 0)', async ({ page }) => { ... })
```

```typescript
test('upload page does not eagerly fetch metadata', async ({ page }) => { ... })
```

```typescript
test('no ECharts zero-size warnings on page transitions', async ({ page }) => { ... })
```

```typescript
test('scatter matrix is a sub-tab inside Scatter page', async ({ page }) => { ... })
```

```typescript
test('API response times are acceptable', async ({ page }) => { ... })
```

```typescript
test('accessibility - form fields have labels', async ({ page }) => { ... })
```

```typescript
test('lighthouse accessibility score improves', async ({ page }) => { ... })
```

```typescript
test('home page loads within 500ms', async ({ page }) => { ... })
```

```typescript
test('timeseries page renders chart within 1s of navigation', async ({ page }) => { ... })
```

```typescript
test('no console errors on any page', async ({ page }) => { ... })
```
