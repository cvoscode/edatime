# profile.ts

User profile service for column definitions and layout constants.

## Constants

```typescript
const PROFILE_ROW_HEIGHT: number
const PROFILE_OVERSCAN: number
const PROFILE_COLUMNS: ProfileColumnDef[]
```

## Functions

```typescript
function getDefaultProfileColumnWidths(): number[]
```

## Types

```typescript
interface ProfileColumnDef {
    key: string;
    label: string;
    minWidth: number;
    defaultWidth: number;
    sortable: boolean;
}
```
