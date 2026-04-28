import { RECIPE_ALIASES, RECIPE_CODES } from "./data";
import type { PullOutRecord } from "./InventoryTab";

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
export const todayISO = (): string => {
  const pht = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 10);
};

export const getTodayLabel = (): string =>
  new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export function formatDateLabel(iso: string): string {
  const t = todayISO();
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === t) return `Today — ${new Date(iso + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
  if (iso === y) return `Yesterday — ${new Date(iso + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
  return new Date(iso + "T12:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────────
export const fmt    = (n: number): string => n.toLocaleString();
export const fmtKg  = (g: number): string => (g / 1000).toFixed(2) + "kg";
export const yieldCls = (y: number): string => y >= 0.75 ? "yield-hi" : y >= 0.55 ? "yield-mid" : "yield-lo";

// ── RECIPE HELPERS ────────────────────────────────────────────────────────────
export const recipeMatch = (stored: string, target: string): boolean =>
  stored === target || RECIPE_ALIASES[stored] === target;

export function genProdBatch(recipe: string, existingProductions: any[]): string {
  const code = RECIPE_CODES[recipe] || recipe.slice(0, 5).toUpperCase().replace(/\s/g, "");
  const d = new Date();
  const dateStr = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const prefix = `${code}-${dateStr}-`;
  const existing = existingProductions.filter(p => p.prodBatchCode?.startsWith(prefix));
  return prefix + String(existing.length + 1).padStart(2, "0");
}

export function genPORef(date: string, branch: string, existingPOs: PullOutRecord[]): string {
  const d = new Date(date + "T12:00:00");
  const ds = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const dayPrefix = `-${ds}-`;
  const countToday = existingPOs.filter(p => p.poRef.includes(dayPrefix)).length;
  return `${branch}-${ds}-${String(countToday + 1).padStart(2, "0")}`;
}

// ── CSV HELPERS ───────────────────────────────────────────────────────────────
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const hdrs = Object.keys(rows[0]);
  const esc  = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [hdrs.join(","), ...rows.map(r => hdrs.map(h => esc(r[h])).join(","))].join("\n");
}

export function downloadCSV(name: string, csv: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = name;
  a.click();
}

// ── BACKUP HELPERS ────────────────────────────────────────────────────────────
export function exportBackup(deliveries: any[], productions: any[]): void {
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), deliveries, productions }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `commissary_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

export function importBackup(
  file: File,
  onSuccess: (d: any[], p: any[], t: Record<string, number>) => void,
  onError: (msg: string) => void
): void {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target?.result as string);
      if (!data.deliveries || !data.productions) throw new Error("Invalid backup file.");
      onSuccess(data.deliveries, data.productions, data.targetYields || {});
    } catch {
      onError("Could not read backup file. Make sure it's a valid commissary backup.");
    }
  };
  reader.readAsText(file);
}
