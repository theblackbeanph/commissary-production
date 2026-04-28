# App.tsx Tab Extraction — Design Spec
**Date:** 2026-04-28
**Status:** Approved

## Goal

Extract each of the 5 tabs in App.tsx into its own component file. App.tsx is currently 2,799 lines with all tab JSX, state, and handlers in one file. This is a pure code organisation task — no behaviour changes, no Firestore schema changes, no new features.

## Approach

**Approach B — Full extraction with internal state**, mirroring the existing InventoryTab.tsx pattern.

Each tab component owns:
- Its own local state (form fields, subview, modals, PIN state, etc.)
- Its own internal subview navigation
- Its own Firebase write handlers (saveDoc, saveBatch, deleteDocument)

App.tsx retains only:
- Shared Firestore state (deliveries, productions, invEntries, pullOuts)
- Auth state and login UI
- Tab navigation state (`tab`, `goTab`)
- Firebase onSnapshot listeners
- App version / update banner
- CSS styles block (global — stays in App.tsx)
- Shell chrome: topbar, bottom nav

## File Structure

```
src/
├── App.tsx               — ~740 lines (down from 2,799)
├── HomeTab.tsx           — ~200 lines
├── DeliveryTab.tsx       — ~550 lines
├── ProductionTab.tsx     — ~900 lines
├── SummaryTab.tsx        — ~450 lines
├── InventoryTab.tsx      — unchanged (833 lines, already extracted)
├── firebase.ts           — unchanged
├── data.ts               — unchanged
├── utils.ts              — unchanged
└── main.tsx              — unchanged
```

## Shared Type

Add to App.tsx and export:

```typescript
export type Tab = "home" | "delivery" | "production" | "inventory" | "summary";
```

## Prop Interfaces

### HomeTab
```typescript
interface HomeTabProps {
  deliveries:        any[];
  productions:       any[];
  invEntries:        InvEntry[];
  pullOuts:          PullOutRecord[];
  pendingPortioning: any[];
  currentUser:       AppUser | null;
  isSuperAdmin:      boolean;
  isAdmin:           boolean;
  updateAvailable:   boolean;
  goTab:             (t: Tab) => void;
  setSummTab:        (t: "dashboard" | "log") => void;  // see note below
}
```

### DeliveryTab
```typescript
interface DeliveryTabProps {
  deliveries:   any[];
  productions:  any[];
  currentUser:  AppUser | null;
  isSuperAdmin: boolean;
  isAdmin:      boolean;
  logger:       string;
}
```

### ProductionTab
```typescript
interface ProductionTabProps {
  deliveries:   any[];
  productions:  any[];
  invEntries:   InvEntry[];
  currentUser:  AppUser | null;
  isSuperAdmin: boolean;
  isAdmin:      boolean;
  logger:       string;
  goTab:        (t: Tab) => void;
}
```

### SummaryTab
```typescript
interface SummaryTabProps {
  deliveries:   any[];
  productions:  any[];
  pullOuts:     PullOutRecord[];
  currentUser:  AppUser | null;
  isSuperAdmin: boolean;
  isAdmin:      boolean;
  logger:       string;
  summTab:      "dashboard" | "log";          // see note below
  setSummTab:   (t: "dashboard" | "log") => void;
}
```

## State & Handler Migration

### What stays in App.tsx
```typescript
const [deliveries,       setDeliveries]       = useState<any[]>([]);
const [productions,      setProductions]       = useState<any[]>([]);
const [invEntries,       setInvEntries]        = useState<InvEntry[]>([]);
const [pullOuts,         setPullOuts]          = useState<PullOutRecord[]>([]);
const [currentUser,      setCurrentUser]       = useState<AppUser | null>(null);
const [authReady,        setAuthReady]         = useState(false);
const [tab,              setTab]               = useState<Tab>("home");
const [summTab,          setSummTab]           = useState<"dashboard"|"log">("dashboard");
const [updateAvailable,  setUpdateAvailable]   = useState(false);
const pendingPortioning = productions.filter(/* badge count */);
const goTab = (t: Tab) => { setTab(t); scrollRef.current?.scrollTo({top:0}); };
```

### DeliveryTab absorbs
**State:** form, subview, selectedDel, showFinished, expandedSKU, isSaving, error, showDelEdit, delEditCost, delEditInvoice, showDelDeletePin, delDeletePinEntry, delDeletePinErr, showPin, pinEntry, pinError, showWriteOff, writeOffTarget, writeOffReason, writeOffPin, writeOffPinErr, showBackupPin, backupPinMode, backupPinEntry, backupPinErr, restoreFile

**Handlers:** saveDelivery, handleEditDelivery, handleDeleteDelivery, handleWriteOff

### ProductionTab absorbs
**State:** form, subview, selectedProd, portionInput, editPortions, editPortionVal, voidPin, voidPinEntry, voidPinError, voidTarget, splitSku, splitBatches, splitRecipes, isSaving, error

**Handlers:** handleSingle, handleMixed, handleSplit, handleVoid, handleEditPortions

### SummaryTab absorbs
**State:** summTab, logRange, logRecipe, skuCatTab, dashRange, showPOReport, poRepStart, poRepEnd

**Handlers:** none (read-only, no Firebase writes)

### HomeTab absorbs
No state, no handlers. Pure display + goTab calls.

**Note on summTab:** `summTab` and `setSummTab` are the one exception — they stay in App.tsx and are passed as props to both HomeTab and SummaryTab. This is necessary because HomeTab's "Summary" quick-action card needs to pre-select the "log" sub-tab when navigating, which requires calling `setSummTab` before the SummaryTab component even mounts. Keeping this state in App.tsx is the simplest correct solution.

## Extraction Order

1. **SummaryTab** — zero Firebase writes, pure computation. Lowest risk.
2. **HomeTab** — tiny, no handlers, just display and goTab calls.
3. **DeliveryTab** — moderate complexity, self-contained handler set.
4. **ProductionTab** — largest (split/mixed/void logic). Extract last.

## Extraction Process (per tab)

Each tab follows this exact sequence:
1. Create `XxxTab.tsx` with the prop interface
2. Move relevant state declarations into the component
3. Move relevant handlers into the component
4. Cut JSX from App.tsx, paste into the component's return
5. Replace JSX block in App.tsx with `<XxxTab ...props />`
6. Delete now-unused state + handlers from App.tsx
7. Run `npm run build` — TypeScript catches any missed props or stale references
8. Smoke-test that tab in the browser
9. Git commit

One tab at a time. Build-verified and committed before moving to the next.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Handler references stale App.tsx state after move | TypeScript catches at build time |
| CSS class names break | CSS stays in App.tsx (global), no change |
| goTab cross-tab navigation breaks | goTab stays in App.tsx, passed as prop |
| Firebase write pattern breaks | Follow InventoryTab pattern exactly |
| pendingPortioning badge disappears | Stays computed in App.tsx, passed to HomeTab |

## Verification Checklist (per tab)

- [ ] `npm run build` passes with zero TypeScript errors
- [ ] Tab renders correctly in browser
- [ ] Form submit works — data appears in Firestore, UI updates via onSnapshot
- [ ] Subview navigation works (list → form → detail → back)
- [ ] Cross-tab goTab() calls work from within the component
- [ ] All other tabs unaffected

## Definition of Done

- [ ] `npm run build` passes with zero errors
- [ ] App.tsx is under 800 lines
- [ ] Each of the 5 tabs is in its own file
- [ ] All existing functionality works identically
- [ ] Each extraction has its own git commit
- [ ] No behaviour changes, no Firestore schema changes

## Out of Scope

- CSS extraction to a separate file (Approach C — can be done later independently)
- Automated tests (separate task, better done after refactoring when boundaries are stable)
- Any Firestore migration or schema changes
- New features (Orders tab comes after this refactoring)
