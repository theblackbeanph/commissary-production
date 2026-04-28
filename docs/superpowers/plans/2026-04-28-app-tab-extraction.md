# App.tsx Tab Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 4 unextracted tabs (Home, Delivery, Production, Summary) from a 2,799-line App.tsx into their own component files, reducing App.tsx to ~740 lines with no behaviour changes.

**Architecture:** Each tab component owns its own local state, internal subview navigation, and Firebase write handlers — mirroring the existing InventoryTab.tsx pattern. App.tsx retains only shared Firestore state (deliveries, productions, invEntries, pullOuts), auth, tab navigation, and global CSS.

**Tech Stack:** React 18 + TypeScript, Firebase Firestore (write-only → onSnapshot), Vite

---

## Modal Ownership Map

Before starting, know where each App-level modal ends up:

| Modal (current line) | Triggered from | Moves to |
|---|---|---|
| VOID PIN MODAL (~2510) | Production tab (void action) | ProductionTab.tsx |
| WRITE OFF MODAL (~2700) | Delivery detail (~1463) | DeliveryTab.tsx |
| DELETE DELIVERY PIN MODAL (~2751) | Delivery detail | DeliveryTab.tsx |
| DELIVERY EDIT (inline, ~1476) | Delivery detail | DeliveryTab.tsx |
| RECIPES MODAL (~2454) | Summary tab (~2323) | SummaryTab.tsx |
| PORTION GUIDE MODAL (~2478) | Summary tab (~2324) | SummaryTab.tsx |
| PULL OUT REPORT MODAL (~2533) | Summary tab | SummaryTab.tsx |
| BACKUP PIN MODAL (~2661) | Summary tab (~2304) | SummaryTab.tsx |
| CLEAR DATA PIN MODAL (~2773) | Summary tab (~2331) | SummaryTab.tsx |

After all extractions, App.tsx has zero modals.

---

## File Map

| File | Action | Result |
|---|---|---|
| `src/App.tsx` | Modify | ~740 lines (from 2,799) |
| `src/SummaryTab.tsx` | Create | ~500 lines |
| `src/HomeTab.tsx` | Create | ~200 lines |
| `src/DeliveryTab.tsx` | Create | ~600 lines |
| `src/ProductionTab.tsx` | Create | ~950 lines |
| `src/InventoryTab.tsx` | No change | 833 lines |

---

## Task 1: Foundation — Export Tab type and update goTab

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the exported Tab type near the top of App.tsx (after imports, before component)**

```typescript
export type Tab = "home" | "delivery" | "production" | "inventory" | "summary";
```

- [ ] **Step 2: Verify `summTab` state already exists in App.tsx (it does — line ~463). Leave it there.**

It currently reads:
```typescript
const [summTab, setSummTab] = useState<"dashboard"|"log">("dashboard");
```
This stays in App.tsx. Both HomeTab and SummaryTab will receive it as a prop.

- [ ] **Step 3: Update the `goTab` function (line ~586) to accept an optional summTab override**

Replace:
```typescript
const goTab = (t: typeof tab) => { setTab(t); setSubview("list"); setForm({}); clearErr(); setSelectedProd(null); setSelectedDel(null); setShowFinished(false); setTimeout(()=>{ scrollRef.current?.scrollTo({top:0}); },0); };
```

With:
```typescript
const goTab = (t: Tab, summTabOverride?: "dashboard" | "log") => {
  setTab(t);
  if (summTabOverride) setSummTab(summTabOverride);
  setTimeout(() => { scrollRef.current?.scrollTo({ top: 0 }); }, 0);
};
```

Note: `setSubview`, `setForm`, `clearErr`, `setSelectedProd`, `setSelectedDel`, `setShowFinished` are all removed here because those states will live inside their respective tab components after extraction. They no longer need to be reset from App.tsx.

- [ ] **Step 4: Run the build to confirm no TypeScript errors**

```bash
cd ~/Documents/commissary-production && npm run build
```

Expected: build succeeds (there may be unused variable warnings for state that hasn't moved yet — that's fine at this stage).

- [ ] **Step 5: Commit**

```bash
git -C ~/Documents/commissary-production add src/App.tsx
git -C ~/Documents/commissary-production commit -m "refactor: export Tab type, simplify goTab with optional summTab override"
```

---

## Task 2: Extract SummaryTab

**Files:**
- Create: `src/SummaryTab.tsx`
- Modify: `src/App.tsx`

SummaryTab is first because it has zero Firebase writes — pure computation from props. All its modals are triggered internally and move with it.

- [ ] **Step 1: Create `src/SummaryTab.tsx` with the shell and prop interface**

```typescript
import React, { useState } from "react";
import { saveDoc, COLLECTIONS } from "./firebase";
import { SKUS, SKU_CATEGORY, SKU_CAT_LABELS, RECIPES, SKU_RECIPES, LOOSE_GUIDE } from "./data";
import { todayISO, fmt, fmtKg, yieldCls, recipeMatch, toCSV, downloadCSV, exportBackup, importBackup } from "./utils";
import { BUFFER, PROBLEM_YIELD, CLEAR_PIN } from "./data";
import { clearCollection } from "./firebase";
import type { InvEntry, PullOutRecord } from "./InventoryTab";
import type { Tab } from "./App";
import type { AppUser } from "./firebase";

interface SummaryTabProps {
  deliveries:   any[];
  productions:  any[];
  pullOuts:     PullOutRecord[];
  currentUser:  AppUser | null;
  isSuperAdmin: boolean;
  isAdmin:      boolean;
  logger:       string;
  summTab:      "dashboard" | "log";
  setSummTab:   (t: "dashboard" | "log") => void;
  goTab:        (t: Tab, summTab?: "dashboard" | "log") => void;
}

export default function SummaryTab({
  deliveries, productions, pullOuts,
  currentUser, isSuperAdmin, isAdmin, logger,
  summTab, setSummTab, goTab,
}: SummaryTabProps) {
  // local state goes here (Step 2)
  // computed data goes here (Step 3)
  return <>{/* JSX goes here (Step 4) */}</>;
}
```

- [ ] **Step 2: Move all SummaryTab-owned state into the component body**

Add these after the prop destructure, inside the function body:

```typescript
const [logRange,      setLogRange]      = useState<"today"|"week"|"month"|"all">("week");
const [logRecipe,     setLogRecipe]     = useState<string>("all");
const [skuCatTab,     setSkuCatTab]     = useState<"beef"|"poultry"|"pork"|"seafood"|"others">("beef");
const [dashRange,     setDashRange]     = useState<"7"|"30"|"90"|"all">("30");
const [showPOReport,  setShowPOReport]  = useState(false);
const [poRepStart,    setPORepStart]    = useState("");
const [poRepEnd,      setPORepEnd]      = useState("");
const [showRecipes,       setShowRecipes]       = useState(false);
const [showPortionGuide,  setShowPortionGuide]  = useState(false);
const [showPin,      setShowPin]     = useState(false);
const [pinEntry,     setPinEntry]    = useState("");
const [pinError,     setPinError]    = useState(false);
const [showBackupPin, setShowBackupPin] = useState(false);
const [backupPinMode, setBackupPinMode] = useState<"export"|"restore">("export");
const [backupPinEntry,setBackupPinEntry]= useState("");
const [backupPinErr,  setBackupPinErr]  = useState(false);
const [restoreFile,   setRestoreFile]   = useState<File|null>(null);
const [backupError,   setBackupError]   = useState("");
const restoreInputRef = React.useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Move all Summary computed data into the component body**

Cut these blocks from App.tsx and paste them into SummaryTab's function body (after the state declarations):

- `rangeStart` and `inRange` (lines ~990–997 in App.tsx)
- `skuStats` and `totalInventoryValue` (lines ~999–1052)
- `problemBatches` (line ~1054)
- `recipePerformance` (lines ~1058–1080)
- `logRangeStart`, `groupedByDate`, `sortedDates` (lines ~1082–1095)
- `yieldHistory` (lines ~1097–1111)
- `handlePinKey` (lines ~1113–1131) — this clears all Firestore collections; it calls `goTab("home")` which is passed as a prop

- [ ] **Step 4: Cut the Summary JSX from App.tsx and paste as the SummaryTab return**

In App.tsx, locate the block:
```
{/* ══ SUMMARY ══ */}
{tab==="summary" && subview==="list" && <>
  ...
</>}
```
(lines ~2127–2416)

Cut that entire block. Paste it as the component's JSX return, wrapped in a fragment. Remove the outer `tab==="summary" && subview==="list" &&` guard — App.tsx handles tab routing; SummaryTab only renders when active.

Also cut these modal blocks from App.tsx (they come after the bottom nav) and append them after the main summary JSX, inside the return fragment:
- RECIPES MODAL (~2454–2476)
- PORTION GUIDE MODAL (~2478–2508)
- PULL OUT REPORT MODAL (~2533–~2659)
- BACKUP PIN MODAL (~2661–~2697)
- CLEAR DATA PIN MODAL (~2773–end of file, stopping before the closing `</div>` of the app wrapper)

- [ ] **Step 5: Replace the Summary JSX block in App.tsx with the component**

In App.tsx, where the summary JSX was, add:

```tsx
{tab === "summary" && (
  <SummaryTab
    deliveries={deliveries}
    productions={productions}
    pullOuts={pullOuts}
    currentUser={currentUser}
    isSuperAdmin={isSuperAdmin}
    isAdmin={isAdmin}
    logger={logger}
    summTab={summTab}
    setSummTab={setSummTab}
    goTab={goTab}
  />
)}
```

Add the import at the top of App.tsx:
```typescript
import SummaryTab from "./SummaryTab";
```

- [ ] **Step 6: Delete the now-moved state and computed values from App.tsx**

Remove from App.tsx:
- `logRange`, `logRecipe`, `skuCatTab`, `dashRange` state declarations
- `showPOReport`, `poRepStart`, `poRepEnd` state declarations
- `showRecipes`, `showPortionGuide` state declarations
- `showPin`, `pinEntry`, `pinError`, `handlePinKey` (and the associated `useEffect` for pin if any)
- `showBackupPin`, `backupPinMode`, `backupPinEntry`, `backupPinErr`, `restoreFile`, `backupError` state
- `rangeStart`, `inRange`, `skuStats`, `totalInventoryValue`, `problemBatches`
- `recipePerformance`, `logRangeStart`, `groupedByDate`, `sortedDates`, `yieldHistory`

- [ ] **Step 7: Run the build**

```bash
cd ~/Documents/commissary-production && npm run build
```

Expected: zero TypeScript errors. Fix any that appear before continuing.

- [ ] **Step 8: Smoke-test the Summary tab in the browser**

```bash
npm run dev
```

Check:
- Dashboard sub-tab renders SKU cards, inventory value, recipe performance
- Production Log sub-tab renders with filters
- All filter pills work (date range, category, recipe)
- View Recipes modal opens and closes
- Portion Guide modal opens and closes
- Export Backup, Restore Backup (PIN flow)
- Clear All Data (PIN flow — test with wrong PIN, verify error; do NOT enter correct PIN in production)
- Pull Out Report modal opens with date range

- [ ] **Step 9: Commit**

```bash
git -C ~/Documents/commissary-production add src/SummaryTab.tsx src/App.tsx
git -C ~/Documents/commissary-production commit -m "refactor: extract SummaryTab with all summary modals"
```

---

## Task 3: Extract HomeTab

**Files:**
- Create: `src/HomeTab.tsx`
- Modify: `src/App.tsx`

HomeTab has no state and no handlers — it's pure display + navigation calls.

- [ ] **Step 1: Create `src/HomeTab.tsx` with the prop interface**

```typescript
import React from "react";
import type { InvEntry, PullOutRecord } from "./InventoryTab";
import type { Tab } from "./App";
import type { AppUser } from "./firebase";
import { todayISO, fmtKg } from "./utils";
import { SKUS } from "./data";

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
  currentDate:       string;
  goTab:             (t: Tab, summTab?: "dashboard" | "log") => void;
}

export default function HomeTab({
  deliveries, productions, invEntries, pullOuts,
  pendingPortioning, currentUser, isSuperAdmin, isAdmin,
  updateAvailable, currentDate, goTab,
}: HomeTabProps) {
  return <>{/* JSX goes here */}</>;
}
```

Note: `currentDate` needs to be added as a prop because the daily snapshot section uses it. It's already state in App.tsx (`const [currentDate, setCurrentDate] = useState(todayISO())`).

- [ ] **Step 2: Cut the Home JSX from App.tsx and paste as the HomeTab return**

In App.tsx, locate:
```
{/* ══ HOME ══ */}
{tab==="home" && subview==="list" && <>
  ...
</>}
```
(lines ~1217–1363)

Cut the entire block. Paste as the HomeTab return body (remove the outer `tab==="home" && subview==="list" &&` guard).

**Key change — fix the Prod quick action button** (currently at ~line 1233):

Before:
```typescript
act:()=>{ setTab("production"); setForm({date:todayISO()}); setSubview("list"); }
```

After (HomeTab has no access to setForm/setSubview):
```typescript
act:()=>goTab("production")
```

ProductionTab initialises its own form and subview internally, so this is equivalent.

**Key change — fix the alert-banner onClick** (currently at ~line 1222):

Before:
```typescript
onClick={()=>{ goTab("summary"); setSummTab("log"); }}
```

After (using the goTab override):
```typescript
onClick={()=>goTab("summary", "log")}
```

- [ ] **Step 3: Replace the Home JSX block in App.tsx with the component**

```tsx
{tab === "home" && (
  <HomeTab
    deliveries={deliveries}
    productions={productions}
    invEntries={invEntries}
    pullOuts={pullOuts}
    pendingPortioning={pendingPortioning}
    currentUser={currentUser}
    isSuperAdmin={isSuperAdmin}
    isAdmin={isAdmin}
    updateAvailable={updateAvailable}
    currentDate={currentDate}
    goTab={goTab}
  />
)}
```

Add the import at the top of App.tsx:
```typescript
import HomeTab from "./HomeTab";
```

- [ ] **Step 4: Run the build**

```bash
cd ~/Documents/commissary-production && npm run build
```

Expected: zero errors.

- [ ] **Step 5: Smoke-test the Home tab**

Check:
- Greeting renders correctly with user name
- Quick action cards navigate to correct tabs
- Pending portioning alert appears/disappears correctly
- Daily snapshot section renders (productions today, deliveries, pull outs, stock alerts)
- Inventory snapshot cards are clickable and navigate correctly

- [ ] **Step 6: Commit**

```bash
git -C ~/Documents/commissary-production add src/HomeTab.tsx src/App.tsx
git -C ~/Documents/commissary-production commit -m "refactor: extract HomeTab"
```

---

## Task 4: Extract DeliveryTab

**Files:**
- Create: `src/DeliveryTab.tsx`
- Modify: `src/App.tsx`

DeliveryTab is the most modal-heavy tab. It absorbs the write-off modal and delete PIN modal in addition to the delivery JSX.

- [ ] **Step 1: Create `src/DeliveryTab.tsx` with the prop interface and state**

```typescript
import React, { useState, useRef } from "react";
import { saveDoc, deleteDocument, COLLECTIONS } from "./firebase";
import { SKUS, CLEAR_PIN } from "./data";
import { todayISO, fmtKg, fmt, toCSV, downloadCSV, exportBackup, importBackup } from "./utils";
import type { Tab } from "./App";
import type { AppUser } from "./firebase";

interface DeliveryTabProps {
  deliveries:   any[];
  productions:  any[];
  currentUser:  AppUser | null;
  isSuperAdmin: boolean;
  isAdmin:      boolean;
  logger:       string;
  goTab:        (t: Tab) => void;
}

export default function DeliveryTab({
  deliveries, productions, currentUser,
  isSuperAdmin, isAdmin, logger, goTab,
}: DeliveryTabProps) {
  const [subview,      setSubview]      = useState<"list"|"form"|"deliverydetail"|"finished">("list");
  const [form,         setForm]         = useState<any>({});
  const [error,        setError]        = useState("");
  const [isSaving,     setIsSaving]     = useState(false);
  const [selectedDel,  setSelectedDel]  = useState<any>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [expandedSKU,  setExpandedSKU]  = useState<string|null>(null);
  const [showDelEdit,       setShowDelEdit]       = useState(false);
  const [delEditCost,       setDelEditCost]       = useState("");
  const [delEditInvoice,    setDelEditInvoice]    = useState("");
  const [showDelDeletePin,  setShowDelDeletePin]  = useState(false);
  const [delDeletePinEntry, setDelDeletePinEntry] = useState("");
  const [delDeletePinErr,   setDelDeletePinErr]   = useState(false);
  const [showWriteOff,  setShowWriteOff]  = useState(false);
  const [writeOffTarget,setWriteOffTarget]= useState<any>(null);
  const [writeOffReason,setWriteOffReason]= useState("Spoilage");
  const [writeOffPin,   setWriteOffPin]   = useState("");
  const [writeOffPinErr,setWriteOffPinErr]= useState(false);

  const setF     = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const clearErr = () => setError("");

  // handlers go here (Step 2)

  return <>{/* JSX goes here (Step 3) */}</>;
}
```

- [ ] **Step 2: Move the delivery handlers into the component body**

Cut these handler blocks from App.tsx and paste inside DeliveryTab, after the state declarations:

- `saveDelivery` (~lines 599–621)
- `handleEditDelivery` (~lines 622–655)
- `handleDeleteDelivery` (~lines 656–673)
- `handleWriteOff` (find by searching `handleWriteOff` in App.tsx)

These handlers call `saveDoc`, `deleteDocument` directly — no changes needed to that pattern.

- [ ] **Step 3: Cut the Delivery JSX from App.tsx and paste as the DeliveryTab return**

Cut these blocks from App.tsx and assemble as the return value:

```
{/* ══ DELIVERY DETAIL ══ */}        lines ~1365–1512
{/* ══ DELIVERY LIST ══ */}           lines ~1513–1582
{/* ══ FINISHED STOCKS ══ */}         lines ~1583–1633
{/* ══ DELIVERY FORM ══ */}           lines ~1634–1662
```

Also cut from after the bottom nav and append to the return:
```
{/* WRITE OFF MODAL */}               lines ~2699–2749
{/* DELETE DELIVERY PIN MODAL */}     lines ~2750–2772
```

Remove the outer `tab==="delivery" &&` / `subview===...` guards from each block — DeliveryTab manages its own `subview` state internally. The JSX should use `subview === "deliverydetail"`, `subview === "list"`, etc. directly (without `tab==="delivery" &&`).

- [ ] **Step 4: Replace the Delivery JSX block in App.tsx with the component**

```tsx
{tab === "delivery" && (
  <DeliveryTab
    deliveries={deliveries}
    productions={productions}
    currentUser={currentUser}
    isSuperAdmin={isSuperAdmin}
    isAdmin={isAdmin}
    logger={logger}
    goTab={goTab}
  />
)}
```

Add the import at the top of App.tsx:
```typescript
import DeliveryTab from "./DeliveryTab";
```

- [ ] **Step 5: Delete the now-moved state and handlers from App.tsx**

Remove from App.tsx:
- `form`, `setForm` state (if not used elsewhere — check; Production also uses `form` so it will move in Task 5)
- `error`, `setError` (same — Production also uses these)
- `isSaving`, `setIsSaving`
- `selectedDel`, `setSelectedDel`
- `showFinished`, `setShowFinished`
- `expandedSKU`, `setExpandedSKU`
- `showDelEdit`, `delEditCost`, `delEditInvoice`
- `showDelDeletePin`, `delDeletePinEntry`, `delDeletePinErr`
- `showWriteOff`, `writeOffTarget`, `writeOffReason`, `writeOffPin`, `writeOffPinErr`
- Handlers: `saveDelivery`, `handleEditDelivery`, `handleDeleteDelivery`, `handleWriteOff`

Note: `form`, `error`, `isSaving` are shared naming between Delivery and Production. Remove them from App.tsx only after Production is also extracted (Task 5). At this stage, leave them if Production still needs them — TypeScript will tell you.

- [ ] **Step 6: Run the build**

```bash
cd ~/Documents/commissary-production && npm run build
```

Expected: zero errors.

- [ ] **Step 7: Smoke-test the Delivery tab**

Check:
- Delivery list renders grouped by SKU (collapsed/expanded)
- Batch detail view loads on tap (all metrics, Used In section)
- "+ LOG NEW DELIVERY" opens the form (superadmin only)
- Save delivery creates new record visible in list
- Finished Stocks sub-view renders
- Write Off flow: enter wrong PIN (error), enter correct PIN (stock written off)
- Edit delivery cost (superadmin only): cost cascade updates linked productions
- Delete delivery PIN flow (superadmin, only on unused batches)
- Back button returns to list from any subview

- [ ] **Step 8: Commit**

```bash
git -C ~/Documents/commissary-production add src/DeliveryTab.tsx src/App.tsx
git -C ~/Documents/commissary-production commit -m "refactor: extract DeliveryTab with write-off and delete PIN modals"
```

---

## Task 5: Extract ProductionTab

**Files:**
- Create: `src/ProductionTab.tsx`
- Modify: `src/App.tsx`

ProductionTab is the largest extraction. It absorbs all production subviews (list, single, mixed, split, batch detail) and the void PIN modal.

- [ ] **Step 1: Create `src/ProductionTab.tsx` with the prop interface and state**

```typescript
import React, { useState } from "react";
import { saveDoc, saveBatch, COLLECTIONS } from "./firebase";
import { SKUS, RECIPES, RECIPE_PROD_TYPE, SKU_RECIPES, TEAM, CLEAR_PIN, BUFFER, PROBLEM_YIELD, RISK_HIGH, RISK_LOW } from "./data";
import { todayISO, fmt, fmtKg, yieldCls, recipeMatch, genProdBatch } from "./utils";
import type { InvEntry } from "./InventoryTab";
import type { Tab } from "./App";
import type { AppUser } from "./firebase";

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

export default function ProductionTab({
  deliveries, productions, invEntries,
  currentUser, isSuperAdmin, isAdmin, logger, goTab,
}: ProductionTabProps) {
  const [subview,      setSubview]      = useState<"list"|"single"|"mixed"|"split"|"batchdetail">("list");
  const [form,         setForm]         = useState<any>({ date: todayISO() });
  const [error,        setError]        = useState("");
  const [isSaving,     setIsSaving]     = useState(false);
  const [selectedProd, setSelectedProd] = useState<any>(null);
  const [portionInput,   setPortionInput]   = useState("");
  const [editPortions,   setEditPortions]   = useState(false);
  const [editPortionVal, setEditPortionVal] = useState("");
  const [voidPin,       setVoidPin]       = useState(false);
  const [voidPinEntry,  setVoidPinEntry]  = useState("");
  const [voidPinError,  setVoidPinError]  = useState(false);
  const [voidTarget,    setVoidTarget]    = useState<any>(null);
  const [splitSku,     setSplitSku]     = useState("");
  const [splitBatches, setSplitBatches] = useState<Record<number,{raw:string,trim:string}>>({});
  const [splitRecipes, setSplitRecipes] = useState<{recipe:string,ep:string,cooked?:string}[]>([{recipe:"",ep:""}]);
  const [showRecipes,      setShowRecipes]      = useState(false);
  const [showPortionGuide, setShowPortionGuide] = useState(false);

  const setF     = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const clearErr = () => setError("");

  // handlers go here (Step 2)

  return <>{/* JSX goes here (Step 3) */}</>;
}
```

Note: `showRecipes` and `showPortionGuide` appear in both Production and Summary tabs based on search results — verify during implementation. If they appear in Production's JSX, keep them here; if they only appear in Summary, remove them from ProductionTab.

- [ ] **Step 2: Move the production handlers into the component body**

Cut these from App.tsx and paste inside ProductionTab:

- `handleSingle` (~lines 674–713)
- `handleMixed` (~lines 714–774)
- `handleSplit` (~lines 775–997, up to the PIN handler section)
- `handleVoid` (find by searching — handles void PIN confirmation)
- `handleEditPortions` (find by searching)
- `handleVoidPinKey` or the void PIN key handler (part of `voidPin` flow, ~lines 960–988)

These write directly to Firestore via `saveDoc`/`saveBatch` — no changes to the write pattern.

- [ ] **Step 3: Cut the Production JSX from App.tsx and paste as the ProductionTab return**

Cut these blocks:
```
{/* ══ PRODUCTION LIST ══ */}    lines ~1663–1686
{/* ══ SINGLE ENTRY ══ */}       lines ~1687–1759
{/* ══ MIXED ══ */}              lines ~1760–1863
{/* ══ SPLIT BATCH ══ */}        lines ~1864–1994
{/* ══ BATCH DETAIL ══ */}       lines ~1995–2125
```

Also cut from after the bottom nav:
```
{/* VOID PIN MODAL */}           lines ~2510–2532
```

Assemble all of the above as the component return, removing the outer `tab==="production" &&` guards (subview guards remain).

- [ ] **Step 4: Replace the Production JSX block in App.tsx with the component**

```tsx
{tab === "production" && (
  <ProductionTab
    deliveries={deliveries}
    productions={productions}
    invEntries={invEntries}
    currentUser={currentUser}
    isSuperAdmin={isSuperAdmin}
    isAdmin={isAdmin}
    logger={logger}
    goTab={goTab}
  />
)}
```

Add the import at the top of App.tsx:
```typescript
import ProductionTab from "./ProductionTab";
```

- [ ] **Step 5: Delete the remaining moved state and handlers from App.tsx**

After this task, App.tsx should have no remaining tab-specific state. Remove:
- `form`, `setForm` (was shared with Delivery — now gone from both)
- `error`, `setError`
- `isSaving`, `setIsSaving`
- `selectedProd`, `setSelectedProd`
- `portionInput`, `setPortionInput`
- `editPortions`, `setEditPortions`
- `editPortionVal`, `setEditPortionVal`
- `voidPin`, `voidPinEntry`, `voidPinError`, `voidTarget`
- `splitSku`, `splitBatches`, `splitRecipes`
- Handlers: `handleSingle`, `handleMixed`, `handleSplit`, `handleVoid`, `handleEditPortions`
- `pendingPortioning` computation stays in App.tsx (used for HomeTab prop)
- `subview` state — remove it; each tab now manages its own

Also remove the `setF` and `clearErr` helpers from App.tsx (they've moved into each tab).

- [ ] **Step 6: Run the build**

```bash
cd ~/Documents/commissary-production && npm run build
```

Expected: zero TypeScript errors. This is the most complex step — fix any errors methodically. Common issues:
- A reference to a state variable that wasn't moved (TypeScript will name it)
- An import missing in ProductionTab.tsx
- A function called in JSX that is defined in a different scope

- [ ] **Step 7: Smoke-test the Production tab thoroughly**

Check all production modes:
- Production list renders with pending portioning count
- Single production: select recipe → select delivery batch → enter raw/trim → submit → batch appears in list
- Mixed production: select recipe → select multiple batches → submit
- Split production: select SKU → select batches → allocate EP across 2+ recipes → submit
- Batch detail: tap a production → view metrics, portions, void action
- Void: wrong PIN shows error; correct PIN (DO NOT test on real data — use a test batch)
- Log portions: enter actual portions for a pending batch
- Edit portions: superadmin edits portions on any day
- Balance guard: verify void is blocked if it would go negative

- [ ] **Step 8: Commit**

```bash
git -C ~/Documents/commissary-production add src/ProductionTab.tsx src/App.tsx
git -C ~/Documents/commissary-production commit -m "refactor: extract ProductionTab with void PIN modal"
```

---

## Task 6: Final Verification

**Files:**
- Modify: `src/App.tsx` (review and clean up)

- [ ] **Step 1: Check App.tsx line count**

```bash
wc -l ~/Documents/commissary-production/src/App.tsx
```

Expected: under 800 lines.

- [ ] **Step 2: Verify App.tsx only contains expected sections**

App.tsx should now have:
- Imports (including all 4 new tab components)
- `export type Tab`
- `localStorage` helpers (`load`, `save`)
- `STYLES` CSS block
- App component with:
  - Auth state (`currentUser`, `authReady`, login form state)
  - Firebase Firestore state (`deliveries`, `productions`, `invEntries`, `pullOuts`)
  - Tab navigation (`tab`, `summTab`, `goTab`)
  - `updateAvailable` and `fbReady` state
  - `pendingPortioning` computation
  - `onAuthChanged` useEffect
  - `subscribeToCollection` useEffect (4 listeners)
  - `onSnapshot` for app version
  - Date refresh useEffect
  - Auth gate JSX (loading / login screen)
  - App shell JSX (topbar, scroll area with tab router, bottom nav)
  - Zero modals

- [ ] **Step 3: Full smoke test across all tabs**

Open browser to `localhost:5173`. Test each tab:

| Tab | Key flows to verify |
|---|---|
| Home | Quick actions navigate correctly; alert badge shows pending batches; daily snapshot renders |
| Delivery | Log delivery; view batch detail; write off; edit cost (cascade to productions) |
| Production | Single, mixed, split; batch detail; log portions; void (wrong PIN only) |
| Inventory | Log IN; pull out; manual count; history filter chips (unchanged tab) |
| Summary | Dashboard range filters; SKU cards; recipe performance; export backup; view recipes; clear data PIN (wrong only) |

Test cross-tab navigation:
- Home → Summary "log" quick action → lands on Production Log sub-tab
- Home → Prod quick action → lands on Production list
- Production list "Log Delivery" shortcut → lands on Delivery

- [ ] **Step 4: Run final build**

```bash
cd ~/Documents/commissary-production && npm run build
```

Expected: zero errors, zero warnings (or only pre-existing warnings).

- [ ] **Step 5: Commit final cleanup**

```bash
git -C ~/Documents/commissary-production add src/App.tsx
git -C ~/Documents/commissary-production commit -m "refactor: App.tsx tab extraction complete — 5 tabs in 5 files"
```

- [ ] **Step 6: Verify git log shows clean history**

```bash
git -C ~/Documents/commissary-production log --oneline
```

Expected output (newest first):
```
refactor: App.tsx tab extraction complete — 5 tabs in 5 files
refactor: extract ProductionTab with void PIN modal
refactor: extract DeliveryTab with write-off and delete PIN modals
refactor: extract HomeTab
refactor: extract SummaryTab with all summary modals
refactor: export Tab type, simplify goTab with optional summTab override
Fix .gitignore — exclude node_modules, dist, .DS_Store
Add tab extraction design spec
Initial commit — pre-tab-extraction baseline
```
