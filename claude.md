# The Black Bean Commissary — Claude Code Handoff

## Overview
A production-grade kitchen operations dashboard built in React + TypeScript, backed by Firebase Firestore. Deployed at `commissary.theblackbean.ph` via Vercel.

---

## Tech Stack
- **Frontend:** React + TypeScript (Vite)
- **Backend:** Firebase Firestore (real-time sync, no offline persistence) + Firebase Auth (email/password)
- **Hosting:** Vercel (CLI deploy via `vercel --prod`)
- **Billing:** Firebase Blaze plan (pay-as-you-go, upgraded from Spark free tier)
- **Fonts:** DM Mono + Syne (Google Fonts)
- **No UI library** — all custom CSS in a single `<style>` block inside App.tsx (global, applies to all tab components)

---

## File Structure
```
src/
├── App.tsx          — Shell + shared state (~745 lines); auth, tab nav, Firestore listeners, global CSS
├── HomeTab.tsx      — Home tab component (~175 lines); pure display + goTab calls, no local state
├── DeliveryTab.tsx  — Delivery tab component (~485 lines); owns delivery state + write handlers
├── ProductionTab.tsx — Production tab component (~855 lines); owns production state + write handlers
├── SummaryTab.tsx   — Summary tab component (~715 lines); owns summary state + write handlers
├── InventoryTab.tsx — Inventory tab component (~833 lines); owns inventory state + write handlers
├── firebase.ts      — Firebase config, helpers, auth, user roles
├── data.ts          — All constants: SKUs, recipes, inventory items, LOOSE_PACK_SIZES, RECIPE_ALIASES, TEAM, CLEAR_PIN
├── utils.ts         — All pure helpers: todayISO (PHT), formatters, CSV export
├── main.tsx         — React entry point
public/
└── logo.png         — The Black Bean logo (white horizontal)
```

---

## App Architecture

### Bottom Nav (5 tabs)
`Home | Delivery | Prod | Inventory | Summary`

### State
App.tsx owns shared Firestore state and navigation only:
```typescript
deliveries:   any[]           // from Firestore 'deliveries' collection
productions:  any[]           // from Firestore 'productions' collection
invEntries:   InvEntry[]      // from Firestore 'invEntries' collection
pullOuts:     PullOutRecord[] // from Firestore 'pullOuts' collection
tab:          Tab             // active tab ("home"|"delivery"|"production"|"inventory"|"summary")
summTab:      "dashboard"|"log"  // Summary sub-tab (stays in App.tsx — HomeTab sets it via goTab override)
```
Each tab component owns its own local state (form fields, subview, modals, PIN state, etc.).

### Firebase Collections
```
deliveries    — delivery batches
productions   — production runs
invEntries    — inventory entries (in/out/count)
pullOuts      — pull out records
settings      — app settings (appVersion for update banner)
```

---

## Authentication & Roles

### Users (defined in firebase.ts → USER_ROLES)
```typescript
"chris@theblackbean.ph"      → superadmin, inventoryAdmin: true
"kliendacasin1996@gmail.com" → viewer (previously superadmin; downgraded)
"hello@theblackbean.ph"      → admin, name: "Team"
"tonixgil04@gmail.com"       → viewer, name: "Toni"
```

### Role Permissions
| Action | Chris | Team | Klien | Toni |
|---|---|---|---|---|
| Log Delivery | ✅ | ❌ | ❌ | ❌ |
| Log Production | ✅ | ❌ | ❌ | ❌ |
| Void / Write Off | ✅ | ❌ | ❌ | ❌ |
| Void past productions | ✅ | ❌ | ❌ | ❌ |
| Edit past portions | ✅ | ❌ | ❌ | ❌ |
| Log IN inventory | ✅ | ✅ | ❌ | ❌ |
| Pull Out | ✅ | ✅ | ❌ | ❌ |
| Manual Count | ✅ | ✅ | ❌ | ❌ |
| View everything | ✅ | ✅ | ✅ | ✅ |
| Export/Backup | ✅ | ✅ | ❌ | ❌ |
| Clear Data | ✅ | ❌ | ❌ | ❌ |

### Key role helpers in App.tsx
```typescript
const role         = currentUser?.role ?? "viewer";
const isSuperAdmin = role === "superadmin";
const isAdmin      = role === "admin" || role === "superadmin";
const isViewer     = role === "viewer";
const canEditInv   = isAdmin || (isSuperAdmin && currentUser?.inventoryAdmin === true);
// canEditInv grants: Log IN, Pull Out, Manual Count
// Chris (superadmin+inventoryAdmin) and Team (admin) both have canEditInv=true
// Klien (superadmin, no inventoryAdmin) has canEditInv=false
```

---

## Data Structures

### Delivery
```typescript
{
  id: number,           // Date.now()
  date: string,         // YYYY-MM-DD
  batchCode: string,    // B-YYMMDD-01
  item: string,         // SKU name
  weight: number,       // grams
  cost: number,         // total cost ₱
  costPerGram: number,
  remainingWeight: number,
  invoiceNo?: string,
  loggedBy: string,
  usedIn: { prodBatchCode, recipe, rawUsed, date }[],
  writtenOff?: number,
  writtenOffBy?: string,
  writtenOffReason?: string,
  writtenOffAt?: string,
}
```

### Production
```typescript
{
  id: number,
  date: string,
  prodBatchCode: string,  // e.g. PATTY-260402-01
  recipe: string,
  prodType: "portion" | "cooked",
  ingredients: { deliveryBatchCode, item, raw, trim, ep, cost, costPerGram }[],
  raw: number,
  trim: number,
  ep: number,             // auto-calculated: raw - trim
  cooked: number,         // cooked recipes only
  yield: number,          // 0-1
  cost: number,
  costPerCooked?: number,
  expectedPortions: number,
  portionsDisabled: boolean,
  actualPortions?: number,
  notes?: string,
  loggedBy: string,
  prodBy: string,
  voided?: boolean,
  voidedBy?: string,
  voidedAt?: string,
}
```

### InvEntry
```typescript
{
  id: number,
  date: string,
  item: string,
  type: "in" | "out" | "count",
  qty: number,
  note?: string,           // Optional for IN and Manual Count entries
  loggedBy: string,
  poRef?: string,
  systemBalance?: number,  // Manual Count only
  variance?: number,       // Manual Count only
  variancePct?: number,    // Manual Count only
  approvedBy?: string,     // Manual Count only
}
```

### PullOutRecord
```typescript
{
  id: number,
  poRef: string,    // MKT-260402-01 or BF-260402-01
  date: string,
  branch: string,   // "MKT" or "BF"
  loggedBy: string,
  preparedBy?: string,  // required in UI via dropdown (team names)
  checkedBy?: string,   // required in UI via dropdown (team names)
  items: { item, category, qty, unit }[],
}
```

---

## Inventory Logic

### Balance Calculation (calcBalance in InventoryTab.tsx)
```typescript
// Finds last Manual Count entry — becomes new baseline
// Only applies IN/OUT entries AFTER the last count
// seed = totalProduced (for Recipe Portioned items, used when NO count exists)
// postCountSeed = productions logged AFTER the last count (added on top of count baseline)
function calcBalance(item, entries, seed=0, postCountSeed=0): number
```

### Recipe Portioned seed
- `seed` = sum of `actualPortions` from all non-voided productions for that recipe (used only when no Manual Count exists)
- `postCountSeed` = sum of `actualPortions` from non-voided productions logged AFTER the last Manual Count
- After a Manual Count: balance = count qty + postCountSeed + IN - OUT (original seed is discarded)
- Before any Manual Count: balance = seed + IN - OUT

### Item Categories
- **Recipe Portioned** — auto-seeded from production `actualPortions`, OUT via Pull Out only
- **Packed** — manual IN, OUT via Pull Out only, unit: pc
- **Loose** — manual IN, OUT via Pull Out only, unit: g

---

## SKUs & Recipes

### SKUs (18)
Beef Brisket, Beef Fats, Beef Shortplate, Beef Chuck, Chicken Leg Fillet, Cobbler, Kimchi, Mozzarella Block, Pork Shoulder, Roast Beef, Salmon Slab, Smoked Salmon, Salmon Crazy Cut, Salmon Premium Belly, Scallops, Bacon Slab, Prosciutto, Tomahawk Porkchops

### Recipes (19) with prod type
| Recipe | Portion (g) | Type | Batch Code |
|---|---|---|---|
| Cobbler | 300 | Portion | COBB |
| Salmon Fillet | 150 | Portion | SSLAB |
| Smoked Salmon | 50 | Portion | SMKSALM |
| Aburi Salmon | 120 | Portion | ABURI |
| Beef Tapa | 120 | Portion | TAPA |
| Beef Pares | 100 | Cooked | PARES |
| Buttermilk Chicken 300g | 300 | Portion | BCHX300 |
| Buttermilk Chicken 150g | 150 | Portion | BCHX150 |
| Chicken BBQ | 80 | Cooked | CBBQ |
| Burger Patty | 180 | Portion | PATTY |
| Adobo Flakes | 80 | Cooked | ADOBO |
| Arroz ala Cubana | 130 | Cooked | ARROZ |
| Roast Beef | 120 | Portion | ROAST |
| Mozzarella Sticks | 130 | Portion | MOZZ |
| Kimchi | 500 | Portion | KIMCHI |
| Scallops | 80 | Portion | SCAL |
| Bacon Cubes | 70 | Portion | BCN |
| Prosciutto | 35 | Portion | PRC |
| Tomahawk Porkchop | 600 | Portion | CHOP |

### Inventory Items

**Packed:**
Miso Butter Paste, Au Jus, Bacon Jam, Caramelized Onion, Vodka Sauce, Squid Ink Sauce, Truffle Pasta Sauce, Truffle Mushroom Paste, Loco Moco Gravy, Squash Soup, Tomato Soup, Tuna Spread, Flatbread, Classic Tiramisu, Hojicha Tiramisu, Tres Leches

**Loose (unit: pack — all items have a defined pack size in grams):**
Marinara Sauce (500g), Marinara Sauce (Blend) (300g), Gyudon Sauce (1300g), Tartar (1000g), Aioli (1000g), Caesar Dressing (500g), Raspberry Dressing (500g), Candied Walnut (200g), House Vinaigrette (500g), Nigiri (500g), Burger Dressing (500g), Maple Syrup (300g), Pesto (300g), Beef Pares Sauce (1000g), Adobo Flakes Sauce (500g), Classic Tiramisu Mascarpone (1500g), Hojicha Tiramisu Mascarpone (1500g)

---

## Firebase Configuration

### Persistence
**No offline persistence.** The deprecated `enableIndexedDbPersistence` was removed. `getFirestore(app)` is used directly — writes go straight to the Firestore server. This ensures reliable cross-device sync and eliminates stale cache issues.

### Firestore Security Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isKnownUser() {
      return request.auth != null && request.auth.token.email in [
        'chris@theblackbean.ph',
        'hello@theblackbean.ph',
        'kliendacasin1996@gmail.com',
        'tonixgil04@gmail.com'
      ];
    }
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if isKnownUser();
    }
  }
}
```
- **Reads:** any authenticated Firebase user
- **Writes:** restricted to the 4 emails in the allowlist
- **No expiration date** — rules stay in effect indefinitely

### Adding a New User
Two steps required:
1. **Code:** add email to `USER_ROLES` in `src/firebase.ts` with desired role, then deploy (`vercel --prod`)
2. **Firebase Console:** create the Auth account (Authentication → Users → Add User)

**If the new user is a writer (admin or superadmin):** also add their email to the `isKnownUser()` allowlist in Firestore → Rules → Publish. Viewers do NOT need a rules update (reads only require authentication).

---

## Update Banner System (App Version)

### How it works
- `APP_VERSION` constant in App.tsx (current: `3.5`)
- Firestore document: `settings/appVersion` with field `version` (type: double)
- On load, App.tsx subscribes to `settings/appVersion` via `onSnapshot`
- If Firestore version > APP_VERSION, a gold banner appears: "New update available — tap to refresh"
- Tapping reloads the page, loading the latest deployed code
- User's login session persists across refresh (Firebase Auth)

### When to bump version
- **Bump for:** bug fixes, feature changes, data integrity fixes
- **Skip for:** minor styling tweaks, item additions/renames
- After deploying, ask user whether to bump (per saved preference in memory)

### Steps to bump
1. Update `APP_VERSION` in App.tsx to new value
2. Deploy with `vercel --prod`
3. In Firestore console: `settings/appVersion` → change `version` to match

---

## Light/Dark Mode

- Toggle button (☀️/🌙) in the top-right corner of the topbar
- Default: **dark mode**
- Preference saved in `localStorage` key `commissary_theme`
- `.light` CSS class on the app container overrides `:root` CSS variables
- Both themes use CSS variables for consistent theming

---

## Bug Fix History

### BUG 1: Partial Pull Out writes ✅ FIXED
**Symptom:** Pull Out with 5 items only saved 2-3 items to Firestore.
**Fix:** `saveBatch(COLLECTIONS.invEntries, newEntries)` — atomic Firestore batch write.

### BUG 2: onSnapshot feedback loop ✅ FIXED
**Symptom:** Inventory items flickering/blinking.
**Fix:** Removed all sync useEffects. All mutations write ONLY to Firestore. onSnapshot is single source of truth.

### BUG 3: Log IN not updating UI ✅ FIXED
**Symptom:** After Log IN, balance didn't update. Manual Count worked.
**Root cause:** Two issues found:
1. `note:noteInput||undefined` — Firebase v12 rejects `undefined` values. `saveDoc` threw silently (not awaited). Manual Count always had a string note so it worked.
2. onSnapshot functional setter mismatch — fixed with `()=>docs` wrapper.
**Fix:** Removed `undefined` from note field. Use conditional: `if (noteInput) newEntry.note = noteInput`.

### BUG 4: Clear All Data persistent listeners ✅ FIXED
**Fix:** `clearCollection()` helper uses `getDocs` (one-time fetch) + batch delete.

### BUG 5: Offline cache stale data ✅ FIXED
**Root cause:** `enableIndexedDbPersistence` (deprecated in Firebase v12) was causing writes to go to IndexedDB cache without syncing to server. Also caused 20K+ writes/day from retry loops, exhausting free tier quota.
**Fix:** Removed offline persistence entirely. `getFirestore(app)` used directly. Upgraded to Firebase Blaze plan.

### BUG 6: Void not reversing delivery remainingWeight ✅ FIXED
**Fix:** Void handler restores `remainingWeight` (capped at original `weight`), removes `usedIn` entry, calls `saveDoc`.

### BUG 7: Multi-ingredient production not saving delivery updates ✅ FIXED
**Symptom:** When logging a production with multiple ingredients, delivery `remainingWeight` and `usedIn` were only updated in local state — never saved to Firestore. Other devices showed full weight.
**Root cause:** The multi-ingredient submit handler called `setDeliveries(finalDeliveries)` but never called `saveDoc` for each updated delivery. The single-ingredient flow correctly called `saveDoc`.
**Fix:** Added `saveDoc` calls for each ingredient's delivery after saving the production.

### BUG 8: Post-count productions not adding to inventory ✅ FIXED
**Symptom:** Productions logged after a Manual Count didn't appear in Recipe Portioned inventory balance.
**Root cause:** `calcBalance` discarded the production seed entirely when a Manual Count existed. Productions after the count had no way to contribute to the balance.
**Fix:** Added `postCountSeed` parameter to `calcBalance`. Computed from productions logged after the last Manual Count. Added on top of count baseline.

### BUG 9: wouldGoNegative guard too aggressive ✅ FIXED
**Symptom:** Couldn't void productions even when balance would be 0 (not negative). Guard counted ALL historical OUT entries instead of only post-count ones.
**Root cause:** `wouldGoNegative` used `newPortions - totalOut < 0` without accounting for Manual Count baseline.
**Fix:** Replaced with `simulateBalance` function that computes the actual resulting balance using the same logic as `calcBalance`, including count baselines and post-count seeds.

### BUG 10: Void remainingWeight exceeding original weight ✅ FIXED
**Symptom:** After voiding, delivery showed e.g. "20kg of 12kg" because void handler added raw weight back to an already-full `remainingWeight` (from Bug 7).
**Fix:** `remainingWeight: Math.min(d.weight, d.remainingWeight + ingr.raw)` — capped at original weight.

### BUG 11: "Off target" flagging positive variance ✅ FIXED
**Symptom:** Productions with MORE portions than expected were flagged as "Off target".
**Fix:** Changed variance check from absolute to directional. Positive variance (more than expected) = 🟢 On target. Only negative variance (less than expected) triggers 🟡 Watch closely (≤5% below) or 🔴 Off target (>5% below).

### BUG 12: InventoryTab todayISO() using UTC instead of PHT ✅ FIXED
**Symptom:** `todayIN` / `todayOUT` counts in InventoryTab were off by 8 hours (UTC vs PHT).
**Fix:** Removed InventoryTab's local `todayISO()`. Now uses the shared PHT-correct version from `utils.ts`.

---

## Patterns & Architecture Notes

### Correct Firebase Pattern (write-only → onSnapshot reads)
```typescript
// CORRECT: Write to Firestore, let onSnapshot update state
saveDoc(COLLECTIONS.invEntries, newEntry);
// onSnapshot fires → setInvEntries(()=>updatedDocs) → UI re-renders

// WRONG: Write to Firestore AND update local state
saveDoc(COLLECTIONS.invEntries, newEntry);
setInvEntries(prev=>[...prev, newEntry]); // creates inconsistency
```

### Never use `undefined` in Firestore documents
Firebase v12 rejects `undefined` field values. Always use conditional field assignment:
```typescript
// CORRECT
const entry: Record<string,any> = {id, date, item, type, qty, loggedBy};
if (noteInput) entry.note = noteInput;

// WRONG — will silently fail
const entry = {id, date, item, type, qty, note: noteInput || undefined, loggedBy};
```

### ID Generation
All records use `Date.now()` for IDs. Pull Out entries use `now+i` for the array index.

### Philippine Time
```typescript
const todayISO = () => {
  const pht = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 10);
};
```
Defined once in `utils.ts` and shared across App.tsx and InventoryTab.tsx. InventoryTab previously had its own UTC-based version (bug) — now fixed.

### EP Auto-calculation
EP is never manually entered. Always: `EP = Math.max(0, raw - trim)`

### calcPortioning for Portion vs Cooked
```typescript
const epWeight    = prod.ep || Math.max(0, prod.raw - prod.trim);
const portionable = isPortion ? epWeight : prod.cooked * (1 - BUFFER);
// BUFFER = 0.03 (3%) for cooked recipes only
```

---

## PIN System
PIN: `0317` (stored as `CLEAR_PIN` constant in `data.ts` — single source of truth, shared by App.tsx and InventoryTab.tsx)

PIN required for:
- Void batch (superadmins can void past days; others same-day only)
- Write Off remaining stock
- Clear All Data
- Export Backup
- Restore Backup
- Delete IN entry (inventory history)

---

## Key Business Rules
1. **Trim validation:** trim must be < raw (blocked on submit)
2. **Void time limit:** superadmins can void any day; others same-day only
3. **Edit portions time limit:** superadmins can edit any day; others same-day only
4. **Balance guard:** void/edit blocked if would cause negative inventory (uses `simulateBalance` for accurate check including count baselines)
5. **Whole numbers:** pc items (portions, packed) must be integers
6. **EP auto-calc:** EP = Raw − Trim, never manually entered
7. **Manual Count:** no PIN required, optional note field for variance explanation, Super Admin notified of any variance
8. **PO format:** `[Branch]-[YYMMDD]-[Seq]` e.g. `MKT-260402-01`, shared counter per day
9. **Void remainingWeight cap:** `Math.min(d.weight, d.remainingWeight + ingr.raw)` — can never exceed original delivery weight

---

## UI Features

### Delivery List — Grouped by SKU
Active deliveries are grouped by SKU name (collapsible). Each SKU header shows total remaining vs total weight. Batches within each SKU are sorted oldest first. Finished stocks (remainingWeight=0) are in a separate "Finished Stocks" section, also grouped by SKU.

### Inventory History — Production Entries
Recipe Portioned items show PROD entries in the history modal alongside OUT and MANUAL COUNT entries. PROD entries display the production batch code and portion count in green.

### Manual Count Notes
Optional note field on Manual Count for documenting variance reasons. Notes appear in history view (italicized with 📝) and in the CSV export report. Old default "Manual physical count" text is hidden from display.

### Pull Out PDF — Letter Format
Pull Out receipt generates as letter-size portrait HTML, opened via `window.open` + `document.write`. Includes header, PO ref, branch, date, items table with alternating rows, total items count, and signature lines. Selected `preparedBy` and `checkedBy` names are printed above the respective signature lines on the PDF.

### Pull Out — Prepared by / Checked by
Before confirming a pull out, the review modal has two required dropdowns: **Prepared by** and **Checked by** (populated from `TEAM` constant in App.tsx: JR, Aljo, Don, Rowell). Both must be selected — the Confirm button is disabled and an error banner shows until both are filled. Names are saved on the PullOutRecord and printed on the PDF receipt.

### Pull Out Contrast
In the Pull Out tab, balance values are displayed in accent yellow with bold weight. Qty input uses full text color (14px, bold). Unit labels use full text color. Works in both dark and light modes.

### Delivery Edit / Delete (superadmin only)
In the Batch Detail view, a "Manage Batch" section lets superadmins:
- **Edit** cost and invoice number on any delivery. Cost/kg is auto-recalculated. Saving does a full `setDoc` overwrite — omitting `invoiceNo` removes the field cleanly.
- **Delete** a batch (PIN required) — only shown when the batch has never been used in a production and has not been written off. Calls `deleteDocument(COLLECTIONS.deliveries, id)`.

### Delivery Cost Cascade
When a superadmin edits the cost of a delivery, the change cascades automatically to all linked productions — each ingredient's `costPerGram` and total `cost` are recalculated and saved to Firestore.

### RECIPE_ALIASES (data.ts)
Maps old Firestore recipe names → current names for backward compatibility after renames (e.g. `"Salmon Slab" → "Salmon Fillet"`, `"Squid Ink" → "Squid Ink Sauce"`). Used when reading historical production/inventory records so old entries still resolve correctly without a data migration.

### Inventory History Filter Chips
History modal has filter chips: **ALL / IN / OUT / COUNT / PROD** — lets user quickly isolate entry types without scrolling through the full log.

### Edit IN Entry — Negative Balance Guard
Editing a Log IN entry is blocked if reducing the qty would push the current balance below zero. Uses the same `simulateBalance` logic as the void guard.

### Split Production
New production mode (alongside Single and Mixed). Entry point: **✂ SPLIT BATCH** button on the Production tab (superadmin only).
- **Single**: 1 batch → 1 recipe
- **Mixed**: many batches → 1 recipe
- **Split**: 1 or more batches → 2+ recipes

**Workflow:** Select ingredient SKU → pick batches + enter raw/trim per batch → allocate total EP across recipe rows → submit.

**Handler:** `handleSplit()` in ProductionTab.tsx. Each recipe gets a proportional share of the raw weight and trim (`raw = totalRaw × fraction`, `trim = totalTrim × fraction`). Each delivery's `usedIn` gets one entry per recipe with proportional `rawUsed`. Productions are saved with `splitBatch: true` marker.

**Validation:** sum of recipe EP allocations must equal total EP (within 1g tolerance). Cooked recipes require cooked weight input. Minimum 2 recipes required.

---

## Deploy Process
```bash
cd ~/Documents/commissary-production
vercel --prod   # deploys to production
```

**No environment variables needed** — Firebase config is hardcoded in `src/firebase.ts`.

**No GitHub integration** — deploy is done manually via Vercel CLI only.

**After deploy:** Ask user whether to bump `APP_VERSION` and Firestore `settings/appVersion` to trigger update banner for team.

**Domain:** `commissary.theblackbean.ph`
**Vercel project:** `theblackbeanphs-projects/commissary-production`
**Firebase project:** `commissary-dashboard-ccd7c`

---

## What To Test After Deploy
1. Log IN → balance updates on all devices within 1-2 seconds
2. Pull Out with 5+ items → all items appear in Firestore invEntries
3. Submit production → delivery remainingWeight updates in Firestore
4. Multi-ingredient production → all delivery remainingWeights update in Firestore
5. Manual Count → balance resets, post-count productions still add
6. Void → remainingWeight restored (capped at original weight), usedIn entry removed
7. Update banner → appears when Firestore version > APP_VERSION

---

## Multi-Recipe Production Workflow
When one delivery batch is split across multiple recipes (e.g., 60kg Chicken Leg Fillet → 3 recipes):
1. Put all trim on the first production
2. Zero trim on remaining productions
3. EP for each = the actual weight allocated to that recipe
4. Total raw across all productions = original delivery weight

Example:
- Prod 1 (Buttermilk 150g): raw=21.4kg, trim=1.4kg, EP=20kg
- Prod 2 (Buttermilk 300g): raw=32kg, trim=0, EP=32kg
- Prod 3 (Chicken BBQ): raw=6.6kg, trim=0, EP=6.6kg

---

## Pending / Future Work

### General
- [x] App.tsx tab extraction — extracted all 5 tabs into their own component files (2026-04-28)
- [ ] Admin panel for adding items/recipes without code changes

### Branch Inventory Integration (Commissary App Side)
- [x] Migrate 17 loose items (per Portion Guide) from grams to pack-based tracking — `LOOSE_PACK_SIZES` constant in data.ts, unit updated to `"pack"`, all unit-aware logic updated (PDF receipt, validation labels, summary tab)
- [x] Migration plan: one-time Manual Count in packs for all 16 items after deploy — **post-deploy action: go to Inventory → Recipe Portioned → Kimchi → Manual Count → enter 0, then log actual count tomorrow**

**Phase 2 — Transfer Integration (NEXT PRIORITY — agreed 2026-04-28)**

Design decisions locked:
- **Branch-only initiation**: all pull-out requests come from branch via `pull_outs` collection; commissary ONLY fulfills
- **On Phase 2 launch**: the existing manual `pullOuts` creation flow in THIS app will be DISABLED (superadmin override only)
- **Discrepancy handling**: commissary adjusts inventory + notifies branch; branch re-requests if replacement needed; NO auto-replacement sends
- **Cutover strategy**: 1-week shadow mode (Orders tab read-only visible) → then hard disable old flow

Tasks:
- [ ] New **Orders tab** — real-time `onSnapshot` listener on shared `pull_outs` Firestore collection; show PENDING_REVIEW queue
- [ ] **Order confirmation** — adjust `confirmed_qty` per line item; update `pull_outs` status → CONFIRMED; auto-create `delivery_notes` record
- [ ] **Dispatch workflow** — mark pull_out → DISPATCHED; delivery_note → IN_TRANSIT
- [ ] **Discrepancy review panel** — read `invEntries` where `source === 'branch_app'`; adjust commissary inventory accordingly
- [ ] **Disable manual Pull Out** — remove Pull Out tab from Inventory (superadmin override switch to keep escape hatch)
- [ ] **Firestore rules update** — allow anonymous auth (branch) to write to `pull_outs`, `delivery_notes`; email auth (commissary) to write back

**Shared Firestore collections for Phase 2:**
```
pull_outs        — branch writes (PENDING_REVIEW); commissary reads + updates status
delivery_notes   — commissary creates on confirm; branch reads + marks RECEIVED
invEntries       — already shared; branch writes discrepancy entries (source: 'branch_app')
```

### Recipe Database (future 3rd app)
- [ ] Migrate hardcoded `RECIPES` array in `src/data.ts` → Firestore `recipes` collection (prerequisite for Recipe DB app)
- This app will then read recipes from Firestore instead of hardcoded data

@AGENTS.md

## App Context

My current app state, architecture, and feature tracker are in Notion.
Read this page before starting any task:
https://www.notion.so/Commissary-Dashboard-App-Context-34cd0e7b27b6804a85cdd973a3ed716c

After any session where a feature is completed, a bug is fixed, or the architecture changes — update the Notion context page:
- Add a bullet under "Recent Changes" with today's date and what was built
- Move features from "In Progress" → "Live" if applicable
- Add any new technical debt to "Known Issues"
- Remove resolved items from "Open Questions"
