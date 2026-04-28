import React, { useState } from "react";
import { saveDoc, COLLECTIONS } from "./firebase";
import { SKUS, RECIPES, RECIPE_PROD_TYPE, SKU_RECIPES, TEAM, CLEAR_PIN, BUFFER } from "./data";
import { todayISO, fmt, fmtKg, yieldCls, recipeMatch, genProdBatch } from "./utils";
import type { InvEntry } from "./InventoryTab";
interface ProductionTabProps {
  deliveries:   any[];
  productions:  any[];
  invEntries:   InvEntry[];
  isSuperAdmin: boolean;
  logger:       string;
}

export default function ProductionTab({
  deliveries, productions, invEntries,
  isSuperAdmin, logger,
}: ProductionTabProps) {
  const [subview,       setSubview]       = useState<"list"|"single"|"mixed"|"split"|"batchdetail">("list");
  const [form,          setForm]          = useState<any>({ date: todayISO() });
  const [error,         setError]         = useState("");
  const [selectedProd,  setSelectedProd]  = useState<any>(null);
  const [portionInput,  setPortionInput]  = useState("");
  const [editPortions,  setEditPortions]  = useState(false);
  const [editPortionVal,setEditPortionVal]= useState("");
  const [voidPin,       setVoidPin]       = useState(false);
  const [voidPinEntry,  setVoidPinEntry]  = useState("");
  const [voidPinError,  setVoidPinError]  = useState(false);
  const [voidTarget,    setVoidTarget]    = useState<any>(null);
  const [splitSku,      setSplitSku]      = useState("");
  const [splitBatches,  setSplitBatches]  = useState<Record<number,{raw:string,trim:string}>>({});
  const [splitRecipes,  setSplitRecipes]  = useState<{recipe:string,ep:string,cooked?:string}[]>([{recipe:"",ep:""}]);

  const setF     = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const clearErr = () => setError("");

  // ── PORTIONING CALC ──────────────────────────────────────────────────────────
  const calcPortioning = (prod: any) => {
    const recipe = RECIPES.find(r => r.name === prod.recipe);
    if (!recipe || !recipe.portionG) return null;
    const isPortion    = recipe.prodType === "portion";
    const epWeight     = prod.ep || Math.max(0, (prod.raw || 0) - (prod.trim || 0));
    const portionable  = isPortion ? epWeight : prod.cooked * (1 - BUFFER);
    if (!portionable) return { recipe, portionable: 0, expected: 0, actual: prod.actualPortions ?? null, variance: null, varianceG: null, costPerPortion: 0, isPortion, flag: null, zeroEP: true };
    const expected     = portionable / recipe.portionG;
    const actual       = prod.actualPortions ?? null;
    const variance     = actual !== null ? actual - expected : null;
    const varianceG    = actual !== null ? actual * recipe.portionG - portionable : null;
    const costPerPortion = prod.cost / (actual ?? expected);
    const pct          = actual !== null ? variance! / expected : null;
    const flag         = pct === null ? null : pct >= 0 ? "ok" : pct >= -0.05 ? "warn" : "bad";
    return { recipe, portionable, expected, actual, variance, varianceG, costPerPortion, isPortion, flag };
  };

  // ── EDIT/VOID TIME GUARD ─────────────────────────────────────────────────────
  const isSameDay = (prodDate: string) => prodDate === todayISO();

  // Simulate balance for a recipe after changing a production's portions
  const simulateBalance = (recipe: string, excludeProdId?: number, overridePortions?: {id:number,qty:number}) => {
    const prods = productions
      .filter(p => !p.voided && recipeMatch(p.recipe, recipe) && p.actualPortions !== undefined && p.id !== excludeProdId)
      .map(p => overridePortions && p.id === overridePortions.id ? { ...p, actualPortions: overridePortions.qty } : p);
    const totalProduced = prods.reduce((s: number, p: any) => s + p.actualPortions, 0);
    const sorted = [...invEntries.filter(e => recipeMatch(e.item, recipe))].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const lastCountIdx = sorted.map(e => e.type).lastIndexOf("count");
    const lastCount = lastCountIdx >= 0 ? sorted[lastCountIdx] : null;
    const postCountProduced = lastCount
      ? prods.filter((p: any) => p.date > lastCount.date || (p.date === lastCount.date && p.id > lastCount.id)).reduce((s: number, p: any) => s + p.actualPortions, 0)
      : 0;
    let bal = lastCount ? lastCount.qty + postCountProduced : totalProduced;
    const startIdx = lastCountIdx >= 0 ? lastCountIdx + 1 : 0;
    for (let i = startIdx; i < sorted.length; i++) {
      const e = sorted[i];
      if (e.type === "in")    bal += e.qty;
      if (e.type === "out")   bal -= e.qty;
      if (e.type === "count") bal = e.qty + postCountProduced;
    }
    return bal;
  };

  const wouldGoNegative = (recipe: string, prodId: number, newPortions: number) => {
    return newPortions === 0
      ? simulateBalance(recipe, prodId) < 0
      : simulateBalance(recipe, undefined, { id: prodId, qty: newPortions }) < 0;
  };

  const minAllowedPortions = (recipe: string, prodId: number) => {
    let lo = 0, hi = 9999;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); simulateBalance(recipe, undefined, { id: prodId, qty: mid }) < 0 ? lo = mid + 1 : hi = mid; }
    return lo;
  };

  // ── SINGLE PRODUCTION ────────────────────────────────────────────────────────
  const handleSingle = (batch: any) => {
    const raw = +form.raw || 0, trim = +form.trim || 0, cooked = +form.cooked || 0;
    const ep = Math.max(0, raw - trim);
    const rec = RECIPES.find(r => r.name === form.recipe);
    const prodType = rec ? (RECIPE_PROD_TYPE[rec.name] || "portion") : "portion";
    const outputW = prodType === "cooked" ? cooked : ep;
    if (!form.date || !raw) { setError("Fill in date and raw weight."); return; }
    if (!form.prodBy) { setError("Please select who produced this batch."); return; }
    if (prodType === "cooked" && !cooked) { setError("Fill in cooked weight for cooked production."); return; }
    if (raw > Math.floor(batch.remainingWeight)) { setError("Exceeds remaining stock."); return; }
    if (trim >= raw) { setError("Trim loss cannot be equal to or greater than raw weight."); return; }
    if (prodType === "cooked" && cooked > ep) { setError("Cooked weight cannot exceed EP weight."); return; }
    const expPortions = rec?.portionG && outputW > 0 ? (prodType === "cooked" ? (outputW * (1 - BUFFER)) / rec.portionG : outputW / rec.portionG) : 0;
    const portionsDisabled = expPortions < 1;
    const prodBatchCode = genProdBatch(form.recipe || "PROD", productions);
    const updatedBatch = { ...batch, remainingWeight: batch.remainingWeight - raw, usedIn: [...(batch.usedIn || []), { prodBatchCode, recipe: form.recipe || null, rawUsed: raw, date: form.date }] };
    const newSingleProd = {
      id: Date.now(), date: form.date,
      prodBatchCode,
      recipe: form.recipe || null,
      prodType,
      ingredients: [{ deliveryBatchCode: batch.batchCode, item: batch.item, raw, trim, ep, cooked: prodType === "cooked" ? cooked : 0, cost: raw * batch.costPerGram, costPerGram: batch.costPerGram }],
      raw, trim, ep, cooked: prodType === "cooked" ? cooked : 0,
      yield: raw > 0 ? outputW / raw : 0,
      cost: raw * batch.costPerGram,
      costPerCooked: prodType === "cooked" && cooked > 0 ? (raw * batch.costPerGram) / cooked : null,
      expectedPortions: portionsDisabled ? 0 : expPortions,
      portionsDisabled,
      notes: form.notes || "",
      loggedBy: logger,
      prodBy: form.prodBy || "",
    };
    Promise.all([
      saveDoc(COLLECTIONS.deliveries, updatedBatch),
      saveDoc(COLLECTIONS.productions, newSingleProd),
    ]).catch(() => setError("Save failed — check your connection and try again."));
    setForm({}); clearErr(); setSubview("list");
  };

  // ── MIXED PRODUCTION ─────────────────────────────────────────────────────────
  const handleMixed = () => {
    const recipe = form.recipe;
    if (!recipe) { setError("No recipe selected."); return; }
    if (!form.date) { setError("Select a production date."); return; }
    if (!form.prodBy) { setError("Please select who produced this batch."); return; }
    const rec = RECIPES.find(r => r.name === recipe);
    const prodType = rec ? (RECIPE_PROD_TYPE[rec.name] || "portion") : "portion";
    const batchCooked = prodType === "cooked" ? +(form.cooked || 0) : 0;
    if (prodType === "cooked" && !batchCooked) { setError("Enter the total cooked output for this batch."); return; }
    const ingredients: any[] = [];
    const updatedDeliveries = [...deliveries];
    for (const d of deliveries) {
      const data = form[d.id];
      if (!data?.raw) continue;
      const raw = +data.raw, trim = +(data.trim || 0);
      const ep = Math.max(0, raw - trim);
      if (raw > Math.floor(d.remainingWeight)) { setError(`"${d.item}" exceeds remaining stock.`); return; }
      if (trim >= raw) { setError(`Trim loss cannot exceed raw weight for "${d.item}".`); return; }
      ingredients.push({ deliveryBatchCode: d.batchCode, item: d.item, raw, trim, ep, cost: raw * d.costPerGram, costPerGram: d.costPerGram });
      const idx = updatedDeliveries.findIndex(x => x.id === d.id);
      if (idx >= 0) updatedDeliveries[idx] = { ...updatedDeliveries[idx], remainingWeight: updatedDeliveries[idx].remainingWeight - raw };
    }
    if (!ingredients.length) { setError("Enter weights for at least one ingredient."); return; }
    const prodBatchCode = genProdBatch(recipe, productions);
    const finalDeliveries = updatedDeliveries.map(d => {
      const ingr = ingredients.find(i => i.deliveryBatchCode === d.batchCode);
      if (!ingr) return d;
      return { ...d, usedIn: [...(d.usedIn || []), { prodBatchCode, recipe, rawUsed: ingr.raw, date: form.date }] };
    });
    const totalRaw  = ingredients.reduce((s, i) => s + i.raw, 0);
    const totalEP   = ingredients.reduce((s, i) => s + i.ep, 0);
    const totalCost = ingredients.reduce((s, i) => s + i.cost, 0);
    const outputW   = prodType === "cooked" ? batchCooked : totalEP;
    const expPortions = rec?.portionG && outputW > 0 ? (prodType === "cooked" ? (outputW * (1 - BUFFER)) / rec.portionG : outputW / rec.portionG) : 0;
    const portionsDisabled = expPortions < 1;
    const newMixedProd = {
      id: Date.now(), date: form.date,
      prodBatchCode, recipe, prodType,
      ingredients,
      raw: totalRaw, trim: ingredients.reduce((s, i) => s + i.trim, 0),
      ep: totalEP, cooked: batchCooked,
      yield: totalRaw > 0 ? outputW / totalRaw : 0,
      cost: totalCost,
      costPerCooked: prodType === "cooked" && batchCooked > 0 ? totalCost / batchCooked : null,
      expectedPortions: portionsDisabled ? 0 : expPortions,
      portionsDisabled,
      notes: form.notes || "",
      loggedBy: logger,
      prodBy: form.prodBy || "",
    };
    const deliveryUpdates = ingredients
      .map(ingr => finalDeliveries.find(d => d.batchCode === ingr.deliveryBatchCode))
      .filter(Boolean)
      .map(d => saveDoc(COLLECTIONS.deliveries, d));
    Promise.all([saveDoc(COLLECTIONS.productions, newMixedProd), ...deliveryUpdates])
      .catch(() => setError("Save failed — check your connection and try again."));
    setForm({}); clearErr(); setSubview("list");
  };

  // ── SPLIT PRODUCTION ─────────────────────────────────────────────────────────
  const handleSplit = () => {
    if (!form.date) { setError("Select a production date."); return; }
    if (!form.prodBy) { setError("Select who produced this batch."); return; }
    if (!splitSku) { setError("No ingredient selected."); return; }
    const activeSplitBatches = deliveries.filter(d => d.item === splitSku && d.remainingWeight > 0);
    const selectedBatches = activeSplitBatches.filter(d => +(splitBatches[d.id]?.raw || 0) > 0);
    if (!selectedBatches.length) { setError("Enter raw weight for at least one batch."); return; }
    for (const d of selectedBatches) {
      const raw = +(splitBatches[d.id].raw || 0), trim = +(splitBatches[d.id].trim || 0);
      if (raw > Math.floor(d.remainingWeight)) { setError(`"${d.batchCode}" exceeds remaining stock.`); return; }
      if (trim >= raw) { setError(`Trim for "${d.batchCode}" cannot equal or exceed raw weight.`); return; }
    }
    const totalRaw  = selectedBatches.reduce((s, d) => s + +(splitBatches[d.id].raw || 0), 0);
    const totalTrim = selectedBatches.reduce((s, d) => s + +(splitBatches[d.id].trim || 0), 0);
    const totalEP   = Math.max(0, totalRaw - totalTrim);
    const validRecipes = splitRecipes.filter(r => r.recipe && +(r.ep || 0) > 0);
    if (validRecipes.length < 2) { setError("Split requires at least 2 recipes."); return; }
    const sumEP = validRecipes.reduce((s, r) => s + +(r.ep || 0), 0);
    if (Math.abs(sumEP - totalEP) > 1) { setError(`EP allocations (${sumEP}g) must equal total EP (${totalEP}g).`); return; }
    for (const rr of validRecipes) {
      const rec = RECIPES.find(r => r.name === rr.recipe);
      if (rec && RECIPE_PROD_TYPE[rec.name] === "cooked" && !(+(rr.cooked || 0) > 0)) {
        setError(`Enter cooked weight for "${rr.recipe}".`); return;
      }
    }
    const batchCodes: string[] = [];
    const tempProductions = [...productions];
    for (const rr of validRecipes) {
      const code = genProdBatch(rr.recipe, tempProductions);
      batchCodes.push(code);
      tempProductions.push({ prodBatchCode: code });
    }
    const now = Date.now();
    const newProductions: any[] = [];
    for (let ri = 0; ri < validRecipes.length; ri++) {
      const rr = validRecipes[ri];
      const recipeEP = +(rr.ep || 0);
      const fraction = totalEP > 0 ? recipeEP / totalEP : 0;
      const rec = RECIPES.find(r => r.name === rr.recipe);
      const prodType = rec ? (RECIPE_PROD_TYPE[rec.name] || "portion") : "portion";
      const cookedW  = prodType === "cooked" ? +(rr.cooked || 0) : 0;
      const recipeRaw  = totalRaw * fraction;
      const recipeTrim = totalTrim * fraction;
      const ingredients: any[] = selectedBatches.map(d => {
        const bRaw  = +(splitBatches[d.id].raw  || 0) * fraction;
        const bTrim = +(splitBatches[d.id].trim || 0) * fraction;
        return { deliveryBatchCode: d.batchCode, item: d.item, raw: bRaw, trim: bTrim, ep: Math.max(0, bRaw - bTrim), cooked: 0, cost: bRaw * d.costPerGram, costPerGram: d.costPerGram };
      });
      const cost = ingredients.reduce((s, i) => s + i.cost, 0);
      const outputW = prodType === "cooked" ? cookedW : recipeEP;
      const expPortions = rec?.portionG && outputW > 0 ? (prodType === "cooked" ? (outputW * (1 - BUFFER)) / rec.portionG : outputW / rec.portionG) : 0;
      const portionsDisabled = expPortions < 1;
      newProductions.push({
        id: now + ri, date: form.date, prodBatchCode: batchCodes[ri],
        recipe: rr.recipe, prodType, ingredients,
        raw: recipeRaw, trim: recipeTrim, ep: recipeEP, cooked: cookedW,
        yield: recipeRaw > 0 ? (prodType === "cooked" ? cookedW / recipeRaw : recipeEP / recipeRaw) : 0,
        cost, costPerCooked: prodType === "cooked" && cookedW > 0 ? cost / cookedW : null,
        expectedPortions: portionsDisabled ? 0 : expPortions, portionsDisabled,
        notes: form.notes || "", loggedBy: logger, prodBy: form.prodBy || "",
        splitBatch: true,
      });
    }
    const deliveryUpdates: any[] = selectedBatches.map(d => {
      const batchRaw = +(splitBatches[d.id].raw || 0);
      const newUsedIn = validRecipes.map((rr, ri) => ({
        prodBatchCode: batchCodes[ri], recipe: rr.recipe,
        rawUsed: batchRaw * (+(rr.ep || 0) / totalEP), date: form.date,
      }));
      return { ...d, remainingWeight: d.remainingWeight - batchRaw, usedIn: [...(d.usedIn || []), ...newUsedIn] };
    });
    Promise.all([
      ...newProductions.map(p => saveDoc(COLLECTIONS.productions, p)),
      ...deliveryUpdates.map(d => saveDoc(COLLECTIONS.deliveries, d)),
    ]).catch(() => setError("Save failed — check your connection and try again."));
    setForm({}); setSplitSku(""); setSplitBatches({}); setSplitRecipes([{ recipe: "", ep: "" }]);
    clearErr(); setSubview("list");
  };

  // ── LOG ACTUAL PORTIONS ──────────────────────────────────────────────────────
  const saveActualPortions = (prod: any) => {
    const actual = +portionInput;
    if (!actual || actual <= 0) { setError("Enter a valid number of portions."); return; }
    if (!Number.isInteger(actual)) { setError("Actual portions must be a whole number."); return; }
    const updated = { ...prod, actualPortions: actual };
    saveDoc(COLLECTIONS.productions, updated)
      .catch(() => setError("Save failed — check your connection and try again."));
    setPortionInput(""); clearErr();
  };

  // ── EDIT ACTUAL PORTIONS ─────────────────────────────────────────────────────
  const saveEditedPortions = (prod: any) => {
    const val = +editPortionVal;
    if (!val || val <= 0) { setError("Enter a valid number of portions."); return; }
    if (!Number.isInteger(val)) { setError("Actual portions must be a whole number."); return; }
    if (!isSuperAdmin && !isSameDay(prod.date)) { setError("Portions can only be edited on the same day they were logged."); return; }
    if (wouldGoNegative(prod.recipe, prod.id, val)) {
      const min = minAllowedPortions(prod.recipe, prod.id);
      setError(`Cannot reduce to ${val} — ${min} portion${min !== 1 ? "s" : ""} already pulled out. Minimum is ${min}.`); return;
    }
    const updatedProd = { ...prod, actualPortions: val };
    saveDoc(COLLECTIONS.productions, updatedProd)
      .catch(() => setError("Save failed — check your connection and try again."));
    setEditPortions(false); setEditPortionVal(""); clearErr();
  };

  // ── VOID PIN HANDLER ─────────────────────────────────────────────────────────
  const handleVoidPin = (key: string) => {
    if (key === "DEL") { setVoidPinEntry(p => p.slice(0, -1)); setVoidPinError(false); return; }
    const next = voidPinEntry + key; setVoidPinEntry(next);
    if (next.length === 4) {
      if (next === CLEAR_PIN) {
        const target = voidTarget;
        const alreadyVoided = productions.find(p => p.id === target?.id)?.voided;
        if (alreadyVoided) { setVoidPin(false); setVoidPinEntry(""); setVoidTarget(null); return; }
        if (!isSuperAdmin && !isSameDay(target?.date || "")) { setVoidPin(false); setVoidPinEntry(""); setVoidPinError(true); setTimeout(() => setVoidPinError(false), 600); return; }
        if (target?.recipe && wouldGoNegative(target.recipe, target.id, 0)) {
          const min = minAllowedPortions(target.recipe, target.id);
          setVoidPin(false); setVoidPinEntry(""); setVoidTarget(null);
          setError(`Cannot void — ${min} portion${min !== 1 ? "s" : ""} already pulled out. Voiding would result in negative inventory.`);
          setSubview("batchdetail"); return;
        }
        const voidedProd = { ...productions.find(p => p.id === target?.id), voided: true, voidedBy: logger, voidedAt: new Date().toISOString() };
        const deliveryUpdates: Promise<any>[] = [];
        if (target?.ingredients?.length) {
          for (const d of deliveries) {
            const ingr = target.ingredients.find((i: any) => i.deliveryBatchCode === d.batchCode);
            if (!ingr) continue;
            const updatedDel = {
              ...d,
              remainingWeight: Math.min(d.weight, d.remainingWeight + ingr.raw),
              usedIn: (d.usedIn || []).filter((u: any) => u.prodBatchCode !== target.prodBatchCode),
            };
            deliveryUpdates.push(saveDoc(COLLECTIONS.deliveries, updatedDel));
          }
        }
        Promise.all([saveDoc(COLLECTIONS.productions, voidedProd), ...deliveryUpdates])
          .catch(() => setError("Void failed — check your connection and try again."));
        setVoidPin(false); setVoidPinEntry(""); setVoidTarget(null); setSelectedProd(null); setSubview("list");
      } else {
        setVoidPinError(true);
        setTimeout(() => { setVoidPinEntry(""); setVoidPinError(false); }, 600);
      }
    }
  };

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ══ PRODUCTION LIST ══ */}
      {subview === "list" && <>
        <div className="page-header"><div className="page-header-row"><div className="page-title">Production</div></div></div>
        {isSuperAdmin && <div style={{display:"flex",gap:8,marginTop:0,marginBottom:20}}>
          <button className="btn-primary" style={{flex:1,marginTop:0}} onClick={()=>{ setForm({date:todayISO()}); clearErr(); setSubview("mixed"); }}>🍳 MIXED BATCH</button>
          <button className="btn-primary" style={{flex:1,marginTop:0}} onClick={()=>{ setForm({date:todayISO()}); setSplitSku(""); setSplitBatches({}); setSplitRecipes([{recipe:"",ep:""}]); clearErr(); setSubview("split"); }}>✂ SPLIT BATCH</button>
        </div>}
        {deliveries.length === 0
          ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">Log deliveries first.</div></div>
          : <>
            <div className="section-label">Single Batch — Select from stock</div>
            {deliveries.filter(d => d.remainingWeight > 0).map(d => (
              <div key={d.id} className="batch-card">
                <div className="batch-top">
                  <div><div className="batch-name">{d.item}</div><div className="batch-code">{d.batchCode}</div></div>
                  <div className={`batch-pill ${d.remainingWeight < d.weight * 0.2 ? "low" : ""}`}>{fmtKg(d.remainingWeight)} left</div>
                </div>
                {isSuperAdmin && <button className="btn-ghost" onClick={()=>{ setForm({batch:d, date:todayISO()}); clearErr(); setSubview("single"); }}>USE THIS BATCH →</button>}
              </div>
            ))}

            <div className="section-label" style={{marginTop:32}}>Production History</div>
            {productions.length === 0
              ? <div className="empty"><div className="empty-icon">🔪</div><div className="empty-text">No productions logged yet.</div></div>
              : productions.slice().sort((a,b)=>b.id-a.id).map(p=>(
                <div key={p.id} className={`record-card${p.voided?" voided":""}`} onClick={()=>{ setSelectedProd(p); setPortionInput(""); setEditPortions(false); setEditPortionVal(""); clearErr(); setSubview("batchdetail"); }}>
                  <div className="record-top">
                    <div>
                      <div className="record-name">{p.recipe||"No recipe"}</div>
                      <div className="prod-batch-code">{p.prodBatchCode}</div>
                      <div className="record-meta">{p.date}{p.prodBy?` · prod by ${p.prodBy}`:""}</div>
                      {p.voided&&<div className="voided-tag">🚫 VOIDED</div>}
                      {!p.voided&&p.actualPortions===undefined&&RECIPES.find(r=>r.name===p.recipe)?.portionG&&(
                        <div className="record-pending">⏳ portions pending</div>
                      )}
                    </div>
                    <div>
                      <div className="record-cost">₱{p.cost?.toFixed(2)}</div>
                      <div className="record-cpu">{fmtKg(p.ep||0)} EP</div>
                    </div>
                  </div>
                  <div className="metrics-row">
                    <div className="metric"><div className="metric-val">{fmt(p.raw)}g</div><div className="metric-lbl">Raw</div></div>
                    <div className="metric"><div className="metric-val">{fmt(p.trim||0)}g</div><div className="metric-lbl">Trim</div></div>
                    <div className="metric"><div className="metric-val">{fmt(p.ep||Math.max(0,p.raw-(p.trim||0)))}g</div><div className="metric-lbl">EP</div></div>
                    <div className="metric"><div className={`metric-val ${yieldCls(p.yield)}`}>{(p.yield*100).toFixed(1)}%</div><div className="metric-lbl">Yield</div></div>
                  </div>
                </div>
              ))
            }
          </>
        }
      </>}

      {/* ══ SINGLE ENTRY ══ */}
      {subview === "single" && (()=>{
        const batch = form.batch;
        const raw = +form.raw || 0, trim = +form.trim || 0, cooked = +form.cooked || 0;
        const ep = Math.max(0, raw - trim);
        const rec = RECIPES.find(r => r.name === form.recipe);
        const prodType = rec ? (RECIPE_PROD_TYPE[rec.name] || "portion") : null;
        const outputW  = prodType === "cooked" ? cooked : ep;
        const yld      = raw > 0 && outputW > 0 ? outputW / raw : 0;
        const expPortions = rec?.portionG && outputW > 0 ? (prodType === "cooked" ? (outputW * (1 - BUFFER)) / rec.portionG : outputW / rec.portionG) : 0;
        const portionsDisabled = expPortions < 1;
        const linkedRecipes = SKU_RECIPES[batch.item] || [];
        return <>
          <div className="page-header">
            <div className="page-header-row">
              <button className="back-btn" onClick={()=>{ setSubview("list"); clearErr(); }}>←</button>
              <div className="page-title">Batch Entry</div>
            </div>
            <div className="page-sub">Single batch · {prodType ? (prodType === "cooked" ? "Cooked Production" : "Portion Only") : "select recipe"}</div>
          </div>
          {error && <div className="error-box">⚠ {error}</div>}
          <div className="batch-card" style={{marginBottom:20}}>
            <div className="batch-name">{batch.item}</div>
            <div className="batch-code" style={{marginTop:3}}>{batch.batchCode}</div>
            <div style={{marginTop:8,fontSize:12,color:"var(--muted)"}}>
              <span style={{color:"var(--text)"}}>{Math.floor(batch.remainingWeight).toLocaleString()}g</span> remaining · ₱{(batch.costPerGram*1000).toFixed(2)}/kg
            </div>
          </div>
          <div className="section-label">Production Date</div>
          <div className="form-group"><input className="form-input" type="date" value={form.date||""} onChange={e=>setF("date",e.target.value)}/></div>
          <div className="section-label">Recipe</div>
          <div className="form-group">
            <select className="form-select" value={form.recipe||""} onChange={e=>{ setF("recipe",e.target.value); setF("ep",""); setF("cooked",""); setF("trim",""); }}>
              <option value="">Select recipe...</option>
              {linkedRecipes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {prodType && <>
            <div className="section-label">Weights</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Raw (g) *</label><input className="form-input" type="number" placeholder="0" value={form.raw||""} onChange={e=>setF("raw",e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Trim Loss (g)</label><input className="form-input" type="number" placeholder="0" value={form.trim||""} onChange={e=>setF("trim",e.target.value)}/></div>
            </div>
            {raw > 0 && <div className="form-hint">EP: <strong>{Math.max(0,raw-(+form.trim||0))}g</strong> <span style={{color:"var(--muted)"}}>(Raw − Trim)</span></div>}
            {prodType === "cooked" && (
              <div className="form-group" style={{marginTop:8}}>
                <label className="form-label">Cooked Weight (g) *</label>
                <input className="form-input" type="number" placeholder="0" value={form.cooked||""} onChange={e=>setF("cooked",e.target.value)}/>
              </div>
            )}
            {raw > 0 && outputW > 0 && (
              <div className="form-hint">
                Yield: <strong className={yieldCls(yld)}>{(yld*100).toFixed(1)}%</strong>
                {prodType === "portion" && <span style={{color:"var(--muted)"}}> (EP÷Raw)</span>}
                {" · "}Cost: <strong>₱{(raw*batch.costPerGram).toFixed(2)}</strong>
                {expPortions > 0 && <>{" · "}Exp. portions: <strong className={portionsDisabled?"yield-lo":""}>{expPortions.toFixed(1)}</strong></>}
                {portionsDisabled && <span style={{color:"var(--red)"}}> — portioning disabled</span>}
              </div>
            )}
          </>}
          <div className="section-label">Notes <span style={{color:"var(--dim)",fontWeight:400}}>(optional)</span></div>
          <div className="form-group"><textarea className="form-textarea" rows={2} placeholder="e.g. New supplier batch..." value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
          <div className="section-label">Prod By</div>
          <div className="form-group">
            <select className="form-select" value={form.prodBy||""} onChange={e=>setF("prodBy",e.target.value)}>
              <option value="">Select staff...</option>
              {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={()=>handleSingle(batch)}>SUBMIT PRODUCTION</button>
        </>;
      })()}

      {/* ══ MIXED ══ */}
      {subview === "mixed" && (()=>{
        const chosenRecipe = form.recipe || "";
        const chosenRec = RECIPES.find(r => r.name === chosenRecipe);
        const chosenProdType = chosenRec ? (RECIPE_PROD_TYPE[chosenRec.name] || "portion") : "portion";
        const linkedSkusForRecipe = chosenRecipe
          ? Object.entries(SKU_RECIPES).filter(([,v]) => v.includes(chosenRecipe)).map(([k]) => k)
          : [];
        const activeBatches = deliveries.filter(d => linkedSkusForRecipe.includes(d.item) && d.remainingWeight > 0);
        return <>
          <div className="page-header">
            <div className="page-header-row">
              <button className="back-btn" onClick={()=>{ if(chosenRecipe){ setF("recipe",""); clearErr(); } else { setSubview("list"); clearErr(); } }}>←</button>
              <div className="page-title">Mixed Batches</div>
            </div>
            <div className="page-sub">{chosenRecipe || "Select a recipe to start"}</div>
          </div>
          {error && <div className="error-box">⚠ {error}</div>}

          {!chosenRecipe ? <>
            <div className="section-label">Which recipe are you prepping?</div>
            {RECIPES.map(r => {
              const hasStock = Object.entries(SKU_RECIPES).filter(([,v]) => v.includes(r.name)).some(([sku]) => deliveries.some(d => d.item === sku && d.remainingWeight > 0));
              return (
                <button key={r.name} onClick={()=>{ if(hasStock){ setF("recipe",r.name); clearErr(); } }}
                  style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"13px 15px",cursor:hasStock?"pointer":"not-allowed",textAlign:"left",marginBottom:6,transition:"all .15s",color:hasStock?"var(--text)":"var(--dim)",fontFamily:"var(--font-mono)",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:hasStock?1:0.4}}
                  onMouseEnter={e=>{ if(hasStock) e.currentTarget.style.borderColor="var(--accent)"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor="var(--border)"; }}>
                  <div>
                    <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:700,marginBottom:2}}>{r.name}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{Object.entries(SKU_RECIPES).filter(([,v])=>v.includes(r.name)).map(([k])=>k).join(", ")}</div>
                  </div>
                  <div style={{fontSize:12,color:"var(--accent)",marginLeft:12,whiteSpace:"nowrap"}}>{r.portionG?`${r.portionG}g/portion`:"trim only"}</div>
                </button>
              );
            })}
          </> : <>
            {activeBatches.length === 0
              ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No active stock for this recipe.<br/>Log a delivery first.</div></div>
              : <>
                <div className="section-label">Production Date</div>
                <div className="form-group"><input className="form-input" type="date" value={form.date||""} onChange={e=>setF("date",e.target.value)}/></div>
                <div className="section-label">Ingredients</div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Leave blank for any batch not used today.</div>
                {activeBatches.map(d => {
                  const data = form[d.id] || {};
                  const raw = +data.raw || 0;
                  const upd = (k: string, v: string) => setForm((p: any) => ({...p,[d.id]:{...p[d.id],[k]:v,recipe:chosenRecipe}}));
                  return (
                    <div key={d.id} className="batch-card">
                      <div className="batch-top">
                        <div><div className="batch-name">{d.item}</div><div className="batch-code">{d.batchCode}</div></div>
                        <div className={`batch-pill ${d.remainingWeight < d.weight * 0.2 ? "low" : ""}`}>{Math.floor(d.remainingWeight).toLocaleString()}g</div>
                      </div>
                      <hr className="batch-divider"/>
                      <div className="mini-grid">
                        <input className="mini-input" placeholder="Raw (g)"       type="number" onChange={e=>upd("raw",e.target.value)}/>
                        <input className="mini-input" placeholder="Trim loss (g)" type="number" onChange={e=>upd("trim",e.target.value)}/>
                      </div>
                      {raw > 0 && (()=>{
                        const calcEP = Math.max(0, raw - (+data.trim || 0));
                        const epYld  = raw > 0 ? calcEP / raw : 0;
                        return <div className="mini-stats">EP: <b>{calcEP}g</b> · EP Yield: <b className={yieldCls(epYld)}>{(epYld*100).toFixed(1)}%</b></div>;
                      })()}
                    </div>
                  );
                })}

                {chosenProdType === "cooked" && (()=>{
                  const totalRaw = activeBatches.reduce((s,d) => s+(+form[d.id]?.raw||0), 0);
                  const cooked   = +(form.cooked || 0);
                  const yld      = totalRaw > 0 && cooked > 0 ? cooked / totalRaw : null;
                  return (
                    <div style={{background:"var(--accent-bg)",border:"1px solid #3d3a1a",borderRadius:10,padding:"14px 15px",marginTop:8}}>
                      <div style={{fontFamily:"var(--font-head)",fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:10}}>Total Cooked Output</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>All ingredients combined after cooking — enter the single total cooked weight.</div>
                      <input className="form-input" type="number" placeholder="Total cooked weight (g)"
                        value={form.cooked||""}
                        onChange={e=>setF("cooked",e.target.value)}/>
                      {yld && <div className="form-hint" style={{marginTop:6}}>
                        Total raw: <strong>{totalRaw}g</strong>
                        {" · "}Yield: <strong className={yieldCls(yld)}>{(yld*100).toFixed(1)}%</strong>
                      </div>}
                    </div>
                  );
                })()}

                <div className="section-label">Notes <span style={{color:"var(--dim)",fontWeight:400}}>(optional)</span></div>
                <div className="form-group"><textarea className="form-textarea" rows={2} placeholder="e.g. AM prep batch..." value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
                <div className="section-label">Prod By</div>
                <div className="form-group">
                  <select className="form-select" value={form.prodBy||""} onChange={e=>setF("prodBy",e.target.value)}>
                    <option value="">Select staff...</option>
                    {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button className="btn-primary" onClick={handleMixed}>SUBMIT PRODUCTION</button>
              </>
            }
          </>}
        </>;
      })()}

      {/* ══ SPLIT BATCH ══ */}
      {subview === "split" && (()=>{
        const availableSkus = [...new Set(deliveries.filter(d => d.remainingWeight > 0).map((d: any) => d.item as string))];
        const splitBatchesForSku = splitSku ? deliveries.filter(d => d.item === splitSku && d.remainingWeight > 0) : [];
        const totalRaw  = splitBatchesForSku.reduce((s,d) => s+(+(splitBatches[d.id]?.raw||0)), 0);
        const totalTrim = splitBatchesForSku.reduce((s,d) => s+(+(splitBatches[d.id]?.trim||0)), 0);
        const totalEP   = Math.max(0, totalRaw - totalTrim);
        const sumAllocated = splitRecipes.reduce((s,r) => s+(+(r.ep||0)), 0);
        const epRemaining  = totalEP - sumAllocated;
        return <>
          <div className="page-header">
            <div className="page-header-row">
              <button className="back-btn" onClick={()=>{
                if(splitSku){ setSplitSku(""); setSplitBatches({}); setSplitRecipes([{recipe:"",ep:""}]); clearErr(); }
                else { setSubview("list"); clearErr(); }
              }}>←</button>
              <div className="page-title">Split Batch</div>
            </div>
            <div className="page-sub">{splitSku || "Select ingredient to split"}</div>
          </div>
          {error && <div className="error-box">⚠ {error}</div>}

          {!splitSku ? <>
            <div className="section-label">Which ingredient are you splitting?</div>
            {availableSkus.length === 0 && <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No active stock to split.</div></div>}
            {availableSkus.map(sku => (
              <button key={sku} onClick={()=>{ setSplitSku(sku); setSplitBatches({}); setSplitRecipes([{recipe:"",ep:""}]); clearErr(); }}
                style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"13px 15px",cursor:"pointer",textAlign:"left",marginBottom:6,color:"var(--text)",fontFamily:"var(--font-mono)",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:700}}>{sku}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{deliveries.filter(d=>d.item===sku&&d.remainingWeight>0).length} batch{deliveries.filter(d=>d.item===sku&&d.remainingWeight>0).length!==1?"es":""} available</div>
              </button>
            ))}
          </> : <>
            <div className="form-group"><label className="form-label">Production Date</label><input className="form-input" type="date" value={form.date||""} onChange={e=>setF("date",e.target.value)}/></div>

            <div className="section-label">Source Batches</div>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Enter raw and trim for each batch used. Leave blank to skip a batch.</div>
            {splitBatchesForSku.map(d => {
              const data = splitBatches[d.id] || {};
              const raw = +(data.raw || 0), trim = +(data.trim || 0), ep = Math.max(0, raw - trim);
              const upd = (k: string, v: string) => setSplitBatches(p => ({...p,[d.id]:{...p[d.id],[k]:v}}));
              return (
                <div key={d.id} className="batch-card">
                  <div className="batch-top">
                    <div><div className="batch-name">{d.item}</div><div className="batch-code">{d.batchCode}</div></div>
                    <div className={`batch-pill ${d.remainingWeight < d.weight * 0.2 ? "low" : ""}`}>{Math.floor(d.remainingWeight).toLocaleString()}g left</div>
                  </div>
                  <hr className="batch-divider"/>
                  <div className="mini-grid">
                    <input className="mini-input" placeholder="Raw (g)" type="number" value={data.raw||""} onChange={e=>upd("raw",e.target.value)}/>
                    <input className="mini-input" placeholder="Trim loss (g)" type="number" value={data.trim||""} onChange={e=>upd("trim",e.target.value)}/>
                  </div>
                  {raw > 0 && <div className="mini-stats">EP: <b>{ep}g</b> · EP Yield: <b className={yieldCls(raw>0?ep/raw:0)}>{raw>0?((ep/raw)*100).toFixed(1):0}%</b></div>}
                </div>
              );
            })}

            {totalEP > 0 && <>
              <div style={{background:"var(--accent-bg)",border:"1px solid #3d3a1a",borderRadius:10,padding:"12px 15px",marginBottom:4,fontSize:12}}>
                Total Raw: <strong>{totalRaw}g</strong> · Trim: <strong>{totalTrim}g</strong> · <span style={{color:"var(--accent)"}}>EP: <strong>{totalEP}g</strong></span>
              </div>

              <div className="section-label">Recipe Allocation</div>
              <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Assign EP (g) to each recipe. Total must equal {totalEP}g.</div>

              {splitRecipes.map((rr,ri) => {
                const rec = RECIPES.find(r => r.name === rr.recipe);
                const prodType = rec ? (RECIPE_PROD_TYPE[rec.name] || "portion") : "portion";
                const validForSku = (SKU_RECIPES[splitSku] || []);
                const recipeEP = +(rr.ep || 0);
                const fraction = totalEP > 0 ? recipeEP / totalEP : 0;
                const recipeRaw = totalRaw * fraction;
                const expP = rec?.portionG && recipeEP > 0 ? (prodType === "cooked" && +(rr.cooked||0) > 0 ? ((+(rr.cooked||0))*(1-BUFFER)/rec.portionG) : (recipeEP/rec.portionG)) : 0;
                return (
                  <div key={ri} className="batch-card" style={{marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{flex:1,fontFamily:"var(--font-head)",fontSize:12,color:"var(--accent)"}}>Recipe {ri+1}</div>
                      {splitRecipes.length > 2 && <button onClick={()=>setSplitRecipes(p=>p.filter((_,i)=>i!==ri))} style={{background:"transparent",border:"none",color:"var(--red)",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>}
                    </div>
                    <div className="form-group" style={{marginBottom:8}}>
                      <select className="form-select" value={rr.recipe} onChange={e=>setSplitRecipes(p=>p.map((x,i)=>i===ri?{...x,recipe:e.target.value,cooked:""}:x))}>
                        <option value="">Select recipe...</option>
                        {RECIPES.filter(r => validForSku.includes(r.name)).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                      </select>
                    </div>
                    <div className={prodType === "cooked" && rr.recipe ? "form-row" : ""}>
                      <div className="form-group" style={{marginBottom:0}}>
                        <label className="form-label">EP Allocation (g)</label>
                        <input className="form-input" type="number" placeholder="0" value={rr.ep} onChange={e=>setSplitRecipes(p=>p.map((x,i)=>i===ri?{...x,ep:e.target.value}:x))}/>
                      </div>
                      {prodType === "cooked" && rr.recipe && (
                        <div className="form-group" style={{marginBottom:0}}>
                          <label className="form-label">Cooked Weight (g)</label>
                          <input className="form-input" type="number" placeholder="0" value={rr.cooked||""} onChange={e=>setSplitRecipes(p=>p.map((x,i)=>i===ri?{...x,cooked:e.target.value}:x))}/>
                        </div>
                      )}
                    </div>
                    {rr.recipe && recipeEP > 0 && <div className="mini-stats" style={{marginTop:6}}>Raw: <b>{recipeRaw.toFixed(0)}g</b>{expP>0?<> · Exp. portions: <b>{expP.toFixed(1)}</b></>:null}</div>}
                  </div>
                );
              })}

              <button onClick={()=>setSplitRecipes(p=>[...p,{recipe:"",ep:""}])}
                style={{width:"100%",background:"transparent",border:"1px dashed var(--border2)",borderRadius:10,padding:"12px",color:"var(--muted)",cursor:"pointer",fontFamily:"var(--font-mono)",fontSize:13,marginBottom:12}}>
                + Add Recipe
              </button>

              <div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:12,background:Math.abs(epRemaining)<2?"var(--accent-bg)":"var(--surface)",border:`1px solid ${Math.abs(epRemaining)<2?"#3d3a1a":"var(--border)"}`}}>
                EP remaining: <strong style={{color:Math.abs(epRemaining)<2?"var(--accent)":epRemaining<0?"var(--red)":"var(--text)"}}>{epRemaining}g</strong>
                {Math.abs(epRemaining)<2&&<span style={{color:"var(--green)"}}> ✓ fully allocated</span>}
              </div>

              <div className="section-label">Notes <span style={{color:"var(--dim)",fontWeight:400}}>(optional)</span></div>
              <div className="form-group"><textarea className="form-textarea" rows={2} value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
              <div className="section-label">Prod By</div>
              <div className="form-group">
                <select className="form-select" value={form.prodBy||""} onChange={e=>setF("prodBy",e.target.value)}>
                  <option value="">Select staff...</option>
                  {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={handleSplit}>SUBMIT SPLIT</button>
            </>}
          </>}
        </>;
      })()}

      {/* ══ BATCH DETAIL ══ */}
      {subview === "batchdetail" && selectedProd && (()=>{
        const p = productions.find(x => x.id === selectedProd.id) || selectedProd;
        const pc = calcPortioning(p);
        return <>
          <div className="page-header">
            <div className="page-header-row">
              <button className="back-btn" onClick={()=>{ setSubview("list"); clearErr(); setPortionInput(""); setEditPortions(false); }}>←</button>
              <div className="page-title">Prod Detail</div>
            </div>
            <div className="page-sub">{p.prodBatchCode}</div>
          </div>
          {error && <div className="error-box">⚠ {error}</div>}
          {p.voided && (
            <div className="voided-banner">
              🚫 This batch has been voided · {p.voidedBy && `by ${p.voidedBy}`} · excluded from all calculations
            </div>
          )}
          <div className={`record-card${p.voided?" voided":""}`} style={{cursor:"default"}}>
            <div className="record-top">
              <div>
                <div className="record-name">{p.recipe || "No recipe"}</div>
                <div className="prod-batch-code">{p.prodBatchCode}</div>
                <div className="record-meta">{p.date}{p.prodBy ? ` · prod by ${p.prodBy}` : ""}</div>
              </div>
              <div>
                <div className="record-cost">₱{p.cost.toFixed(2)}</div>
                <div className="record-cpu">₱{p.costPerCooked?.toFixed(4) ?? "—"}/cooked g</div>
              </div>
            </div>
            <div className="metrics-row">
              <div className="metric"><div className="metric-val">{fmt(p.raw)}g</div><div className="metric-lbl">Raw</div></div>
              <div className="metric"><div className="metric-val">{fmt(p.trim||0)}g</div><div className="metric-lbl">Trim</div></div>
              <div className="metric"><div className="metric-val">{fmt(p.ep||Math.max(0,p.raw-(p.trim||0)))}g</div><div className="metric-lbl">EP</div></div>
              <div className="metric"><div className={`metric-val ${yieldCls(p.yield)}`}>{(p.yield*100).toFixed(1)}%</div><div className="metric-lbl">Yield</div></div>
            </div>
            {p.notes && <div className="record-notes">📝 {p.notes}</div>}
            {p.prodBy && <div className="record-logger">prod by {p.prodBy}</div>}
            {p.voided && <div className="voided-tag">🚫 VOIDED</div>}
          </div>

          {p.ingredients?.length > 0 && <>
            <div className="section-label">Ingredients Used</div>
            <div className="batch-card">
              {p.ingredients.map((i: any, idx: number) => (
                <div key={idx} className="used-in-row">
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{i.item}</div>
                    <div className="used-in-code">{i.deliveryBatchCode}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,color:"var(--text)"}}>{fmtKg(i.raw)} raw → {fmtKg(i.ep||i.cooked||0)} EP</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>₱{i.cost.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>}

          {pc && !p.voided && (pc as any).zeroEP && (
            <div className="portioning-box" style={{marginTop:12}}>
              <div className="portioning-title" style={{color:"var(--red)"}}>⚠ EP Weight is 0</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:6}}>This batch has no usable EP weight — likely because trim loss was entered incorrectly (trim ≥ raw). Please void this batch and re-log with correct weights.</div>
            </div>
          )}
          {pc && !p.voided && !(pc as any).zeroEP && <>
            <div className="section-label">Portioning</div>
            <div className="portioning-box">
              <div className="portioning-title">{pc.recipe.name} · {pc.recipe.portionG}g/portion</div>
              {pc.isPortion ? <>
                <div className="portion-row"><span className="portion-key">EP Weight</span><span className="portion-val">{fmt(p.ep||0)}g</span></div>
                <div className="portion-row"><span className="portion-key">Portionable</span><span className="portion-val">{pc.portionable.toFixed(0)}g</span></div>
              </> : <>
                <div className="portion-row"><span className="portion-key">Cooked output</span><span className="portion-val">{fmt(p.cooked)}g</span></div>
                <div className="portion-row"><span className="portion-key">Buffer (3%)</span><span className="portion-val">−{(p.cooked*BUFFER).toFixed(0)}g</span></div>
                <div className="portion-row"><span className="portion-key">Portionable</span><span className="portion-val">{pc.portionable.toFixed(0)}g</span></div>
              </>}
              <div className="portion-row" style={{marginTop:8}}><span className="portion-key">Expected portions</span><span className="portion-val">{pc.expected.toFixed(1)}</span></div>
              {pc.actual !== null ? <>
                <div className="portion-row"><span className="portion-key">Actual portions</span><span className="portion-val">{pc.actual}</span></div>
                <div className="portion-row"><span className="portion-key">Variance</span><span className="portion-val" style={{color:pc.variance!>=0?"var(--green)":"var(--red)"}}>{pc.variance!>=0?"+":""}{pc.variance!.toFixed(1)} portions ({pc.varianceG!.toFixed(0)}g)</span></div>
                <div className="portion-row"><span className="portion-key">Cost/portion</span><span className="portion-val" style={{color:"var(--accent)"}}>₱{pc.costPerPortion.toFixed(2)}</span></div>
                <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span className={`portion-flag ${pc.flag==="ok"?"flag-ok":pc.flag==="warn"?"flag-warn":"flag-bad"}`}>{pc.flag==="ok"?"🟢 On target":pc.flag==="warn"?"🟡 Watch closely":"🔴 Off target"}</span>
                  {!editPortions && (isSameDay(p.date) || isSuperAdmin) && (
                    <button onClick={()=>{ setEditPortions(true); setEditPortionVal(String(pc.actual)); }} style={{background:"transparent",border:"1px solid var(--border2)",borderRadius:6,color:"var(--muted)",fontFamily:"var(--font-mono)",fontSize:11,padding:"4px 10px",cursor:"pointer"}}>✏ Edit</button>
                  )}
                  {!isSameDay(p.date) && !isSuperAdmin && <span style={{fontSize:10,color:"var(--dim)"}}>Locked after end of day</span>}
                </div>
                {editPortions && (
                  <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}}>
                    <label className="form-label">Correct actual portions</label>
                    <div style={{display:"flex",gap:8}}>
                      <input className="form-input" type="number" placeholder="0" value={editPortionVal} onChange={e=>{ setEditPortionVal(e.target.value); clearErr(); }} style={{flex:1}} autoFocus/>
                      <button className="btn-primary" style={{width:"auto",marginTop:0,padding:"11px 18px"}} onClick={()=>saveEditedPortions(p)}>SAVE</button>
                      <button className="btn-ghost" style={{width:"auto",marginTop:0,padding:"11px 14px"}} onClick={()=>{ setEditPortions(false); clearErr(); }}>✕</button>
                    </div>
                  </div>
                )}
              </> : <>
                <div style={{marginTop:12}}>
                  <label className="form-label">Log actual portions counted</label>
                  <div style={{display:"flex",gap:8}}>
                    <input className="form-input" type="number" placeholder="e.g. 134" step="1" min="1" value={portionInput} onChange={e=>{ setPortionInput(e.target.value); clearErr(); }} style={{flex:1}}/>
                    <button className="btn-primary" style={{width:"auto",marginTop:0,padding:"11px 18px"}} onClick={()=>saveActualPortions(p)}>LOG</button>
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:6}}>Est. cost/portion: ₱{pc.costPerPortion.toFixed(2)}</div>
                </div>
              </>}
            </div>
          </>}

          {/* Manager actions */}
          {!p.voided && (
            <div style={{marginTop:24,paddingTop:20,borderTop:"1px solid var(--border)"}}>
              <div className="section-label" style={{marginTop:0}}>Manager Actions</div>
              {isSuperAdmin ? <>
                <button className="btn-danger" onClick={()=>{ setVoidTarget(p); setVoidPinEntry(""); setVoidPinError(false); setVoidPin(true); }}>
                  🚫 VOID THIS BATCH
                </button>
                <div style={{fontSize:11,color:"var(--dim)",marginTop:6}}>Voiding excludes this batch from all inventory and stats. The record is kept for audit. PIN required.</div>
              </> : (
                <div style={{fontSize:12,color:"var(--dim)",padding:"10px 14px",background:"var(--surface2)",borderRadius:8}}>
                  🔒 Void locked — corrections must be made on the same day.
                </div>
              )}
            </div>
          )}
        </>;
      })()}

      {/* VOID PIN MODAL */}
      {voidPin && (
        <div className="pin-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setVoidPin(false);setVoidPinEntry("");} }}>
          <div className="pin-modal">
            <div className="pin-title">Manager PIN</div>
            <div className="pin-sub">Enter PIN to void {voidTarget?.prodBatchCode}. This cannot be undone.</div>
            <div className={`pin-dots ${voidPinError?"pin-shake":""}`}>
              {[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<voidPinEntry.length?(voidPinError?"error":"filled"):""}`}/>)}
            </div>
            <div className="pin-pad">
              {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k,i)=>
                k===""?<div key={i}/>:(
                  <button key={k} className={`pin-key ${k==="DEL"?"del":""}`} onClick={()=>handleVoidPin(k)}>
                    {k==="DEL"?"⌫":k}
                  </button>
                )
              )}
            </div>
            <button className="pin-cancel" onClick={()=>{ setVoidPin(false); setVoidPinEntry(""); }}>CANCEL</button>
          </div>
        </div>
      )}
    </>
  );
}
