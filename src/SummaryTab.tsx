import React, { useState } from "react";
import { db as _db, COLLECTIONS, clearCollection, saveBatch } from "./firebase";
import {
  SKUS, SKU_CATEGORY, SKU_CAT_LABELS,
  RECIPES, SKU_RECIPES, LOOSE_GUIDE, BUFFER, PROBLEM_YIELD, CLEAR_PIN,
} from "./data";
import {
  todayISO, formatDateLabel,
  fmt, fmtKg, yieldCls,
  recipeMatch, toCSV, downloadCSV,
  exportBackup, importBackup,
} from "./utils";
import type { PullOutRecord } from "./InventoryTab";
import type { Tab } from "./App";
import type { AppUser } from "./firebase";

interface SummaryTabProps {
  deliveries:      any[];
  productions:     any[];
  pullOuts:        PullOutRecord[];
  currentUser:     AppUser | null;
  isSuperAdmin:    boolean;
  isAdmin:         boolean;
  isViewer:        boolean;
  logger:          string;
  summTab:         "dashboard" | "log";
  setSummTab:      (t: "dashboard" | "log") => void;
  goTab:           (t: Tab, summTab?: "dashboard" | "log") => void;
  // calcPortioning passed from App so it uses the same RECIPES data
  calcPortioning:  (prod: any) => any;
}

export default function SummaryTab({
  deliveries, productions, pullOuts,
  currentUser: _currentUser, isSuperAdmin: _isSuperAdmin, isAdmin: _isAdmin, isViewer, logger,
  summTab, setSummTab, goTab,
  calcPortioning,
}: SummaryTabProps) {
  // ── STATE ──────────────────────────────────────────────────────────────────
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

  // ── DASHBOARD TIME RANGE ──────────────────────────────────────────────────
  const rangeStart = (()=>{
    if (dashRange==="7")  return new Date(Date.now()-7 *86400000).toISOString().slice(0,10);
    if (dashRange==="30") return new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    if (dashRange==="90") return new Date(Date.now()-90*86400000).toISOString().slice(0,10);
    return null; // all time
  })();
  const inRange = (date:string) => !rangeStart || date >= rangeStart;

  // ── SUMMARY DASHBOARD DATA ────────────────────────────────────────────────
  const skuStats = SKUS.map(sku=>{
    const allDels  = deliveries.filter(d=>d.item===sku);
    if (!allDels.length) return null;
    const rangeDels = allDels.filter(d=>inRange(d.date||""));

    const sortedDels = [...allDels].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const latestDel  = sortedDels[0];
    const latestCostPerKg = latestDel ? latestDel.costPerGram*1000 : 0;

    const rangeTotalWeight = rangeDels.reduce((s,d)=>s+d.weight,0);
    const rangeCostPerKg = rangeTotalWeight > 0
      ? (rangeDels.reduce((s,d)=>s+d.cost,0) / rangeTotalWeight * 1000)
      : latestCostPerKg;

    const remaining = allDels.reduce((s,d)=>s+d.remainingWeight,0);
    const inventoryValue = remaining * latestDel.costPerGram;

    const allProds   = productions.filter(p=>!p.voided&&p.ingredients?.some((i:any)=>i.item===sku));
    const rangeProds = allProds.filter(p=>inRange(p.date||""));

    const getOutput = (p:any) => p.ingredients.find((i:any)=>i.item===sku);
    const totalRaw    = rangeProds.reduce((s,p)=>s+(getOutput(p)?.raw||0),0);
    const totalOut    = rangeProds.reduce((s,p)=>s+(getOutput(p)?.ep||getOutput(p)?.cooked||0),0);
    const avgYield    = totalRaw ? totalOut/totalRaw : null;

    const histRaw  = allProds.reduce((s,p)=>s+(getOutput(p)?.raw||0),0);
    const histOut  = allProds.reduce((s,p)=>s+(getOutput(p)?.ep||getOutput(p)?.cooked||0),0);
    const histAvgYield = histRaw ? histOut/histRaw : null;

    const yieldVsHist = (avgYield&&histAvgYield) ? avgYield-histAvgYield : null;

    const batchYields = rangeProds.map(p=>({
      code: p.prodBatchCode,
      yld:  (getOutput(p)?.ep||getOutput(p)?.cooked||0) / (getOutput(p)?.raw||1),
    })).filter(x=>x.yld>0);
    const bestBatch  = batchYields.length ? batchYields.reduce((b,x)=>x.yld>b.yld?x:b) : null;
    const worstBatch = batchYields.length ? batchYields.reduce((w,x)=>x.yld<w.yld?x:w) : null;

    return {
      sku, remaining, latestCostPerKg, rangeCostPerKg,
      avgYield, histAvgYield, yieldVsHist,
      bestBatch, worstBatch, inventoryValue, runs:rangeProds.length
    };
  }).filter(Boolean) as any[];

  const totalInventoryValue = skuStats.reduce((s,x)=>s+x.inventoryValue,0);

  const problemBatches = productions.filter(p=>!p.voided&&p.yield<PROBLEM_YIELD&&inRange(p.date||""));

  // ── RECIPE PERFORMANCE ────────────────────────────────────────────────────
  const recipePerformance = RECIPES.filter(r=>r.portionG!==null).map(r=>{
    const runs = productions.filter(p=>!p.voided&&recipeMatch(p.recipe,r.name)&&p.actualPortions!==undefined);
    if (!runs.length) return null;
    const totalPortions = runs.reduce((s,p)=>s+p.actualPortions,0);
    const sorted = [...runs].sort((a,b)=>(a.date||"").localeCompare(b.date||"")||a.id-b.id);
    const latest   = sorted[sorted.length-1];
    const previous = sorted.length>=2 ? sorted[sorted.length-2] : null;
    const latestCPP   = latest.cost/latest.actualPortions;
    const previousCPP = previous ? previous.cost/previous.actualPortions : null;
    const costTrend   = previousCPP ? ((latestCPP-previousCPP)/previousCPP)*100 : null;
    const allRuns = productions.filter(p=>!p.voided&&recipeMatch(p.recipe,r.name));
    const yieldSorted = [...allRuns].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
    const yields = yieldSorted.map(p=>p.yield);
    const avgYield = yields.reduce((s,y)=>s+y,0)/yields.length;
    const bestYield  = yieldSorted.reduce((b,p)=>p.yield>b.yield?p:b);
    const worstYield = yieldSorted.reduce((w,p)=>p.yield<w.yield?p:w);
    let yieldTrend:"up"|"down"|"stable"="stable";
    if (yields.length>=2){ const mid=Math.ceil(yields.length/2); const diff=yields.slice(-mid).reduce((s,y)=>s+y,0)/mid - yields.slice(0,mid).reduce((s,y)=>s+y,0)/mid; if(diff>0.03) yieldTrend="up"; else if(diff<-0.03) yieldTrend="down"; }
    return { recipe:r.name, portionG:r.portionG, runs:runs.length, totalPortions, latest, previous, latestCPP, previousCPP, costTrend, avgYield, bestYield, worstYield, yieldTrend, yieldCount:allRuns.length };
  }).filter(Boolean) as any[];

  // ── GROUPED PRODUCTIONS (log tab) ─────────────────────────────────────────
  const logRangeStart = (()=>{
    if (logRange==="today") return todayISO();
    if (logRange==="week")  return new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    if (logRange==="month") return new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    return "";
  })();
  const groupedByDate = productions
    .filter(p=>logRangeStart ? (p.date||"")>=logRangeStart : true)
    .filter(p=>logRecipe==="all" ? true : recipeMatch(p.recipe,logRecipe))
    .reduce((acc:Record<string,any[]>,p)=>{
      const k=p.date||"unknown"; if(!acc[k]) acc[k]=[]; acc[k].push(p); return acc;
    },{});
  const sortedDates = Object.keys(groupedByDate).sort((a,b)=>b.localeCompare(a));

  // ── YIELD HISTORY ─────────────────────────────────────────────────────────
  const _yieldHistory = (()=>{
    const map: Record<string,any[]>={};
    for (const p of productions.filter((x:any)=>!x.voided)){ if(!map[p.recipe||p.ingredients?.[0]?.item||"?"])map[p.recipe||p.ingredients?.[0]?.item||"?"]=[]; map[p.recipe||p.ingredients?.[0]?.item||"?"].push(p); }
    return Object.entries(map).map(([item,runs])=>{
      const sorted=[...runs].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      const yields=sorted.map(r=>r.yield);
      const avg=yields.reduce((s,y)=>s+y,0)/yields.length;
      const best=sorted.reduce((b,r)=>r.yield>b.yield?r:b);
      const worst=sorted.reduce((w,r)=>r.yield<w.yield?r:w);
      let trend:"up"|"down"|"stable"="stable";
      if (yields.length>=2){ const mid=Math.ceil(yields.length/2); const diff=yields.slice(-mid).reduce((s,y)=>s+y,0)/mid-yields.slice(0,mid).reduce((s,y)=>s+y,0)/mid; if(diff>0.03) trend="up"; else if(diff<-0.03) trend="down"; }
      return { item,runs:sorted,count:sorted.length,avg,best,worst,trend };
    }).sort((a,b)=>b.count-a.count);
  })();

  // ── CLEAR DATA PIN ────────────────────────────────────────────────────────
  const handlePinKey = (key:string) => {
    if (key==="DEL"){ setPinEntry(p=>p.slice(0,-1)); setPinError(false); return; }
    const next=pinEntry+key; setPinEntry(next);
    if (next.length===4){
      if (next===CLEAR_PIN){
        setShowPin(false); setPinEntry("");
        Promise.all([
          clearCollection(COLLECTIONS.deliveries),
          clearCollection(COLLECTIONS.productions),
          clearCollection(COLLECTIONS.invEntries),
          clearCollection(COLLECTIONS.pullOuts),
        ]).then(()=>goTab("home"));
      }
      else { setPinError(true); setTimeout(()=>{ setPinEntry(""); setPinError(false); },600); }
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return <>
    <div className="page-header"><div className="page-header-row"><div className="page-title">Summary</div></div></div>
    <div className="filter-row">
      {(["dashboard","log"] as const).map(t=>(
        <button key={t} className={`filter-pill ${summTab===t?"active":""}`} onClick={()=>setSummTab(t)}>
          {t==="dashboard"?"Dashboard":"Production Log"}
        </button>
      ))}
    </div>

    {/* ── DASHBOARD TAB ── */}
    {summTab==="dashboard" && <>
      <div className="inv-value-card">
        <div><div className="inv-value-label">Inventory Value</div><div style={{fontSize:11,color:"var(--dim)",marginTop:3}}>Remaining uncooked stock</div></div>
        <div className="inv-value-amount">₱{totalInventoryValue>=1000?(totalInventoryValue/1000).toFixed(1)+"k":totalInventoryValue.toFixed(0)}</div>
      </div>

      {/* Time range */}
      <div className="filter-row" style={{marginBottom:8}}>
        {([["7","7 days"],["30","30 days"],["90","90 days"],["all","All time"]] as const).map(([k,l])=>(
          <button key={k} className={`filter-pill ${dashRange===k?"active":""}`} onClick={()=>setDashRange(k)}>{l}</button>
        ))}
      </div>
      {/* Category */}
      <div className="filter-row">
        {(["beef","poultry","pork","seafood","others"] as const).map(c=>(
          <button key={c} className={`filter-pill ${skuCatTab===c?"active":""}`} onClick={()=>setSkuCatTab(c)}>
            {SKU_CAT_LABELS[c]}
          </button>
        ))}
      </div>

      {skuStats.filter(x=>SKU_CATEGORY[x.sku]===skuCatTab).length===0
        ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No deliveries in this category yet.</div></div>
        : skuStats.filter(x=>SKU_CATEGORY[x.sku]===skuCatTab).map(x=>(
          <div key={x.sku} className="sku-card">
            <div className="sku-card-header">
              <div>
                <div className="sku-card-name">{x.sku}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{x.runs} production run{x.runs!==1?"s":""}</div>
              </div>
              <div className="sku-card-stock">{fmtKg(x.remaining)} left</div>
            </div>
            <div className="sku-metrics">
              <div className="sku-metric">
                <div className="sku-metric-val">₱{x.latestCostPerKg.toFixed(2)}</div>
                <div className="sku-metric-lbl">Latest cost/kg</div>
              </div>
              <div className="sku-metric">
                <div className="sku-metric-val" style={{color:"var(--amber)"}}>₱{x.rangeCostPerKg.toFixed(2)}</div>
                <div className="sku-metric-lbl">Avg cost/kg</div>
              </div>
              <div className="sku-metric">
                {(()=>{
                  const col = x.avgYield===null?"var(--muted)":x.yieldVsHist===null?"var(--text)":x.yieldVsHist>=-0.02?"var(--green)":x.yieldVsHist>=-0.05?"var(--amber)":"var(--red)";
                  return <>
                    <div className="sku-metric-val" style={{color:col}}>{x.avgYield?(x.avgYield*100).toFixed(1)+"%":"—"}</div>
                    <div className="sku-metric-lbl">Yield (range)</div>
                  </>;
                })()}
              </div>
              <div className="sku-metric">
                <div className="sku-metric-val" style={{color:"var(--muted)"}}>{x.histAvgYield?(x.histAvgYield*100).toFixed(1)+"%":"—"}</div>
                <div className="sku-metric-lbl">Hist avg yield</div>
              </div>
            </div>
            {x.yieldVsHist!==null&&(
              <div style={{fontSize:11,marginTop:8,color:x.yieldVsHist>=-0.02?"var(--green)":x.yieldVsHist>=-0.05?"var(--amber)":"var(--red)"}}>
                {x.yieldVsHist>=0?"▲":"▼"} {Math.abs(x.yieldVsHist*100).toFixed(1)}% vs historical avg
              </div>
            )}
            {(x.bestBatch||x.worstBatch)&&(
              <div style={{fontSize:11,color:"var(--muted)",marginTop:6,display:"flex",flexDirection:"column",gap:2}}>
                {x.bestBatch&&<span>Best: <span style={{color:"var(--green)"}}>{(x.bestBatch.yld*100).toFixed(1)}%</span> · {x.bestBatch.code}</span>}
                {x.worstBatch&&x.bestBatch?.code!==x.worstBatch?.code&&<span>Worst: <span style={{color:"var(--red)"}}>{(x.worstBatch.yld*100).toFixed(1)}%</span> · {x.worstBatch.code}</span>}
              </div>
            )}
          </div>
        ))
      }

      {problemBatches.length>0 && <>
        <div className="section-label">⚠ Problem Batches</div>
        <div className="problem-card">
          <div className="problem-title">Below 70% yield threshold</div>
          {problemBatches.map(p=>(
            <div key={p.id} className="problem-item" style={{cursor:"pointer"}} onClick={()=>{ goTab("production"); }}>
              {p.prodBatchCode} → {(p.yield*100).toFixed(1)}% yield {p.recipe?`(${p.recipe})`:""}
            </div>
          ))}
        </div>
      </>}

      {/* Recipe Performance */}
      {recipePerformance.length>0&&<>
        <div className="section-label" style={{marginTop:24}}>Recipe Performance</div>
        <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Latest cost trend + yield consistency per recipe.</div>
        {recipePerformance.map((r:any)=>(
          <div key={r.recipe} className="rp-card">
            {/* Header */}
            <div className="rp-header">
              <div>
                <div className="rp-name">{r.recipe}</div>
                <div className="rp-runs">{r.runs} run{r.runs!==1?"s":""} · {r.totalPortions} portions total</div>
              </div>
              {r.yieldCount>=2
                ? <span className={`trend-badge ${r.yieldTrend==="up"?"trend-up":r.yieldTrend==="down"?"trend-dn":"trend-flat"}`}>{r.yieldTrend==="up"?"↑ Improving":r.yieldTrend==="down"?"↓ Declining":"→ Stable"}</span>
                : <span className="trend-badge trend-flat">— Need more data</span>
              }
            </div>
            <hr className="rp-divider"/>
            {/* Cost section */}
            <div className="rp-row">
              <span className="rp-key">Latest cost/portion</span>
              <span className="rp-val" style={{color:"var(--accent)"}}>₱{r.latestCPP.toFixed(2)} · {r.latest.prodBatchCode}</span>
            </div>
            {r.previousCPP&&(
              <div className="rp-row">
                <span className="rp-key">Previous</span>
                <span className="rp-val" style={{color:r.costTrend<0?"var(--green)":r.costTrend>0?"var(--red)":"var(--muted)"}}>
                  ₱{r.previousCPP.toFixed(2)}
                  {r.costTrend!==null&&<> · {r.costTrend>0?"▲":"▼"} {Math.abs(r.costTrend).toFixed(1)}% {r.costTrend<0?"cheaper":"more expensive"}</>}
                </span>
              </div>
            )}
            {/* Yield section */}
            <hr className="rp-divider"/>
            <div className="rp-row">
              <span className="rp-key">Avg yield</span>
              <span className={`rp-val ${yieldCls(r.avgYield)}`}>{(r.avgYield*100).toFixed(1)}%</span>
            </div>
            <div className="rp-row">
              <span className="rp-key">Best yield</span>
              <span className="rp-val" style={{color:"var(--green)"}}>{(r.bestYield.yield*100).toFixed(1)}% · {r.bestYield.date}</span>
            </div>
            <div className="rp-row">
              <span className="rp-key">Worst yield</span>
              <span className="rp-val" style={{color:"var(--red)"}}>{(r.worstYield.yield*100).toFixed(1)}% · {r.worstYield.date}</span>
            </div>
          </div>
        ))}
      </>}

      {/* Backup & Targets */}
      {!isViewer&&<div style={{marginTop:24,paddingTop:20,borderTop:"1px solid var(--border)"}}>
        <div className="section-label" style={{marginTop:0}}>Data &amp; Settings</div>
        <div className="export-row" style={{marginBottom:8}}>
          <button className="btn-export" onClick={()=>{
            const rows=productions.map(p=>({
              Date:p.date??"","Prod Batch":p.prodBatchCode??"",Recipe:p.recipe??"",
              Status:p.voided?"VOIDED":"Active",
              Ingredients:p.ingredients?.map((i:any)=>`${i.item}(${i.deliveryBatchCode})`).join(";")??"",
              "Raw (g)":p.raw,"Trim (g)":p.trim??0,"EP (g)":(p.ep||Math.max(0,p.raw-(p.trim||0))),"Cooked (g)":p.cooked,
              "Yield %":(p.yield*100).toFixed(1),"Total Cost (₱)":p.cost.toFixed(2),
              "Cost/Cooked g":p.costPerCooked?.toFixed(4)??"",
              "Expected Portions":(()=>{ const pc=calcPortioning(p); return pc?pc.expected.toFixed(1):""; })(),
              "Actual Portions":p.actualPortions??"",
              "Cost/Portion":(()=>{ const pc=calcPortioning(p); return pc?(p.cost/(p.actualPortions??pc.expected)).toFixed(2):""; })(),
              Notes:p.notes??"","Logged By":p.loggedBy??"","Prod By":p.prodBy??"",
              "Voided By":p.voidedBy??"","Voided At":p.voidedAt?.slice(0,10)??"",
            }));
            downloadCSV(`production_log_${new Date().toISOString().slice(0,10)}.csv`,toCSV(rows));
          }}>↓ PRODUCTION LOG</button>
          <button className="btn-export" onClick={()=>{
            const rows=deliveries.map(d=>({
              Date:d.date??"",Item:d.item,"Batch Code":d.batchCode,
              "Initial Wt (g)":d.weight,"Remaining (g)":d.remainingWeight,
              "Total Cost (₱)":d.cost?.toFixed(2)??"","Cost/kg (₱)":(d.costPerGram*1000).toFixed(2),
              "Invoice No":d.invoiceNo??"","Used In":((d.usedIn||[]).map((u:any)=>u.prodBatchCode).join(";")),
              "Logged By":d.loggedBy??"",
            }));
            downloadCSV(`deliveries_${new Date().toISOString().slice(0,10)}.csv`,toCSV(rows));
          }}>↓ DELIVERIES</button>
        </div>
        <div className="backup-row">
          <button className="btn-backup" onClick={()=>{ setBackupPinMode("export"); setBackupPinEntry(""); setBackupPinErr(false); setShowBackupPin(true); }}>⬇ Export Backup</button>
          <>
            <button className="btn-backup" onClick={()=>{
              setBackupPinMode("restore");
              setBackupPinEntry(""); setBackupPinErr(false);
              setShowBackupPin(true);
            }}>⬆ Restore Backup</button>
            <input ref={restoreInputRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>{
              const file=e.target.files?.[0]; if(!file) return;
              importBackup(file,(d,p,_t)=>{
                setBackupError(""); saveBatch(COLLECTIONS.deliveries,d); saveBatch(COLLECTIONS.productions,p);
              }, msg=>setBackupError(msg));
              e.target.value="";
            }}/>
          </>
        </div>
        {backupError&&<div className="backup-error">⚠ {backupError}</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
          <button className="btn-backup" onClick={()=>setShowRecipes(true)}>📋 View Recipes</button>
          <button className="btn-backup" onClick={()=>setShowPortionGuide(true)}>📦 Portion Guide</button>
        </div>
        <button className="btn-backup" style={{width:"100%",marginTop:8}} onClick={()=>setShowPOReport(true)}>📊 Pull Out Report</button>
      </div>}
      {(deliveries.length>0||productions.length>0)&&(
        <div style={{marginTop:16,paddingTop:20,borderTop:"1px solid var(--border)"}}>
          <div className="section-label" style={{marginTop:0}}>Danger Zone</div>
          <button className="btn-danger" onClick={()=>{ setPinEntry(""); setPinError(false); setShowPin(true); }}>🗑 CLEAR ALL DATA</button>
        </div>
      )}
    </>}

    {/* ── PRODUCTION LOG TAB ── */}
    {summTab==="log" && <>
      {/* Filters */}
      <div className="filter-row" style={{marginBottom:8}}>
        {([["today","Today"],["week","This Week"],["month","This Month"],["all","All Time"]] as const).map(([k,l])=>(
          <button key={k} className={`filter-pill ${logRange===k?"active":""}`} onClick={()=>setLogRange(k)}>{l}</button>
        ))}
      </div>
      <div className="form-group" style={{marginBottom:16}}>
        <select className="form-select" value={logRecipe} onChange={e=>setLogRecipe(e.target.value)}>
          <option value="all">All Recipes</option>
          {RECIPES.map(r=><option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      {productions.length===0
        ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">No production records yet.</div></div>
        : sortedDates.length===0
          ? <div className="empty"><div className="empty-icon">🔍</div><div className="empty-text">No records match this filter.</div></div>
          : sortedDates.map((date,di)=>{
              const group=groupedByDate[date];
              const activeGroup=group.filter((p:any)=>!p.voided);
              const gCost=activeGroup.reduce((s:number,p:any)=>s+p.cost,0);
              const gYield=activeGroup.length>0?activeGroup.reduce((s:number,p:any)=>s+p.yield,0)/activeGroup.length:0;
              return (
                <div key={date} className="date-group">
                  <div className="date-header">
                    <span className="date-label">{formatDateLabel(date)}</span>
                    <div className="date-mini-stats">
                      <span className="dms cost">₱{gCost>=1000?(gCost/1000).toFixed(1)+"k":gCost.toFixed(0)}</span>
                      <span className={`dms ${yieldCls(gYield)}`}>{(gYield*100).toFixed(0)}% avg</span>
                    </div>
                  </div>
                  {[...group].reverse().map((p:any)=>{
                    const pc=calcPortioning(p);
                    const isPending=pc&&p.actualPortions===undefined;
                    return (
                      <div key={p.id} className="record-card" style={p.voided?{opacity:0.45}:{}} onClick={()=>{ goTab("production"); }}>
                        <div className="record-top">
                          <div>
                            <div className="record-name">{p.recipe||p.ingredients?.[0]?.item||"Production"}</div>
                            <div className="prod-batch-code">{p.prodBatchCode}</div>
                          </div>
                          <div>
                            <div className="record-cost">₱{p.cost.toFixed(2)}</div>
                            <div className="record-cpu">₱{p.costPerCooked?.toFixed(4)??"—"}/cooked g</div>
                          </div>
                        </div>
                        <div className="metrics-row">
                          <div className="metric"><div className="metric-val">{fmt(p.raw)}g</div><div className="metric-lbl">Raw</div></div>
                          <div className="metric"><div className="metric-val">{fmt(p.trim||0)}g</div><div className="metric-lbl">Trim</div></div>
                          <div className="metric"><div className="metric-val">{fmt(p.ep||Math.max(0,p.raw-(p.trim||0)))}g</div><div className="metric-lbl">EP</div></div>
                          <div className="metric"><div className={`metric-val ${yieldCls(p.yield)}`}>{(p.yield*100).toFixed(1)}%</div><div className="metric-lbl">Yield</div></div>
                        </div>
                        {p.ingredients?.length>1&&(
                          <div className="ingr-list">{p.ingredients.map((i:any)=><span key={i.deliveryBatchCode} className="ingr-tag">{i.item} · {i.deliveryBatchCode}</span>)}</div>
                        )}
                        {pc&&p.actualPortions!==undefined&&(
                          <div style={{marginTop:8,fontSize:11,color:"var(--muted)"}}>
                            {p.actualPortions} portions · ₱{pc.costPerPortion.toFixed(2)}/portion
                            {" · "}<span className={pc.flag==="ok"?"yield-hi":pc.flag==="warn"?"yield-mid":"yield-lo"}>
                              {pc.flag==="ok"?"🟢 On target":pc.flag==="warn"?"🟡 Watch closely":"🔴 Off target"}
                            </span>
                          </div>
                        )}
                        {p.voided&&<div className="voided-tag">🚫 VOIDED</div>}
                        {!p.voided&&isPending&&<div className="record-pending">⏳ Portions not yet logged</div>}
                        {p.notes&&<div className="record-notes">📝 {p.notes}</div>}
                        {p.prodBy&&<div className="record-logger">prod by {p.prodBy}</div>}
                      </div>
                    );
                  })}
                  {di<sortedDates.length-1&&<hr className="date-divider"/>}
                </div>
              );
            })
      }
    </>}

    {/* RECIPES MODAL */}
    {showRecipes&&(
      <div className="modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) setShowRecipes(false); }}>
        <div className="modal-sheet">
          <div className="modal-handle"/>
          <div className="modal-title">Recipes</div>
          <div className="modal-sub">Portion sizes &amp; linked SKUs</div>
          {RECIPES.map(r=>{
            const linked=Object.entries(SKU_RECIPES).filter(([,v])=>v.includes(r.name)).map(([k])=>k);
            return (
              <div key={r.name} className="recipe-card">
                <div>
                  <div className="recipe-name">{r.name}</div>
                  <div className="recipe-sku">{linked.join(", ")}</div>
                </div>
                <div className="recipe-portion">{r.portionG?`${r.portionG}g`:"trim only"}</div>
              </div>
            );
          })}
          <button className="btn-ghost" style={{marginTop:16}} onClick={()=>setShowRecipes(false)}>CLOSE</button>
        </div>
      </div>
    )}

    {/* PORTION GUIDE MODAL */}
    {showPortionGuide&&(
      <div className="modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) setShowPortionGuide(false); }}>
        <div className="modal-sheet">
          <div className="modal-handle"/>
          <div className="modal-title">Portion Guide</div>
          <div className="modal-sub">Loose items — pack sizes &amp; servings</div>
          {/* Column headers */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 70px",gap:6,padding:"6px 4px 8px",borderBottom:"1px solid var(--border)",marginBottom:4}}>
            <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase"}}>Item</div>
            <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase",textAlign:"right"}}>Pack</div>
            <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase",textAlign:"right"}}>Portion</div>
            <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase",textAlign:"right"}}>Servings</div>
          </div>
          {LOOSE_GUIDE.map(g=>(
            <div key={g.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 70px",gap:6,padding:"9px 4px",borderBottom:"1px solid var(--border)"}}>
              <div>
                <div style={{fontSize:13,fontWeight:500}}>{g.item}</div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>{g.subType} · {g.container}</div>
              </div>
              <div style={{textAlign:"right",fontSize:12,fontFamily:"var(--font-mono)",color:"var(--accent)",fontWeight:600,alignSelf:"center"}}>{g.packSize.toLocaleString()}g</div>
              <div style={{textAlign:"right",fontSize:12,fontFamily:"var(--font-mono)",color:"var(--text)",alignSelf:"center"}}>{g.recipePortion}g</div>
              <div style={{textAlign:"right",fontSize:12,fontFamily:"var(--font-mono)",color:"var(--muted)",alignSelf:"center"}}>{g.servings} svgs</div>
            </div>
          ))}
          <div style={{fontSize:10,color:"var(--muted)",textAlign:"center",marginTop:12,fontStyle:"italic"}}>As of April 2026</div>
          <button className="btn-ghost" style={{marginTop:16}} onClick={()=>setShowPortionGuide(false)}>CLOSE</button>
        </div>
      </div>
    )}

    {/* PULL OUT REPORT MODAL */}
    {showPOReport&&(()=>{
      const BRANCHES_LIST = ["MKT","BF"];

      const filtered = pullOuts.filter(po=>{
        if (poRepStart && po.date < poRepStart) return false;
        if (poRepEnd   && po.date > poRepEnd)   return false;
        return true;
      });

      const allItemNames = [...new Set(filtered.flatMap(po=>po.items.map(i=>i.item)))].sort();
      const matrix = allItemNames.map(item=>{
        const category = filtered.flatMap(po=>po.items).find(i=>i.item===item)?.category||"";
        const unit     = filtered.flatMap(po=>po.items).find(i=>i.item===item)?.unit||"pc";
        const byBranch: Record<string,number> = {};
        for (const branch of BRANCHES_LIST){
          byBranch[branch] = filtered
            .filter(po=>po.branch===branch)
            .flatMap(po=>po.items)
            .filter(i=>i.item===item)
            .reduce((s,i)=>s+i.qty,0);
        }
        const total = Object.values(byBranch).reduce((s,v)=>s+v,0);
        return { item, category, unit, byBranch, total };
      }).filter(r=>r.total>0);

      const exportPOReport = () => {
        const period = poRepStart||poRepEnd ? `${poRepStart||"start"} to ${poRepEnd||"end"}` : "All time";
        const nl = "\n";
        const header = "Item,Category,Unit,"+BRANCHES_LIST.join(",")+",Total";
        const rows   = matrix.map(r=>'"'+r.item+'",'+r.category+","+r.unit+","+BRANCHES_LIST.map(b=>r.byBranch[b]||0).join(",")+","+r.total);
        const csv    = "PULL OUT SUMMARY REPORT"+nl+"Period: "+period+nl+nl+header+nl+rows.join(nl);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
        a.download = `pullout_report_${todayISO()}.csv`; a.click();
      };

      return (
        <div className="modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) setShowPOReport(false); }}>
          <div className="modal-sheet" style={{maxHeight:"90vh"}}>
            <div className="modal-handle"/>
            <div className="modal-title">Pull Out Report</div>
            <div className="modal-sub">Qty per item per branch</div>

            {/* Date range */}
            <div className="form-row" style={{marginBottom:16}}>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">From</label>
                <input className="form-input" type="date" value={poRepStart} onChange={e=>setPORepStart(e.target.value)}/>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">To</label>
                <input className="form-input" type="date" value={poRepEnd} onChange={e=>setPORepEnd(e.target.value)}/>
              </div>
            </div>

            {/* Quick filters */}
            <div className="filter-row" style={{marginBottom:16}}>
              {[
                {label:"This week", days:7},
                {label:"This month",days:30},
                {label:"All time",  days:0},
              ].map(f=>(
                <button key={f.label} className="filter-pill" onClick={()=>{
                  if (f.days===0){ setPORepStart(""); setPORepEnd(""); }
                  else {
                    setPORepStart(new Date(Date.now()-f.days*86400000).toISOString().slice(0,10));
                    setPORepEnd(todayISO());
                  }
                }}>{f.label}</button>
              ))}
            </div>

            {/* Table */}
            {matrix.length===0
              ? <div style={{textAlign:"center",padding:"24px 0",color:"var(--muted)",fontSize:12}}>No pull outs in this period.</div>
              : <>
                {/* Header */}
                <div style={{display:"grid",gridTemplateColumns:`1fr ${BRANCHES_LIST.map(()=>"60px").join(" ")} 60px`,gap:6,marginBottom:6,padding:"0 2px"}}>
                  <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase"}}>Item</div>
                  {BRANCHES_LIST.map(b=><div key={b} style={{fontSize:10,color:"var(--accent)",letterSpacing:".08em",textAlign:"right",textTransform:"uppercase"}}>{b}</div>)}
                  <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".08em",textAlign:"right",textTransform:"uppercase"}}>Total</div>
                </div>

                {/* Group by category */}
                {["Recipe Portioned","Packed","Loose"].map(cat=>{
                  const catRows = matrix.filter(r=>r.category===cat);
                  if (!catRows.length) return null;
                  return (
                    <div key={cat} style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:6,paddingBottom:4,borderBottom:"1px solid var(--border)"}}>{cat}</div>
                      {catRows.map(r=>(
                        <div key={r.item} style={{display:"grid",gridTemplateColumns:`1fr ${BRANCHES_LIST.map(()=>"60px").join(" ")} 60px`,gap:6,padding:"6px 2px",borderBottom:"1px solid var(--border)",fontSize:12}}>
                          <div style={{color:"var(--text)"}}>{r.item}</div>
                          {BRANCHES_LIST.map(b=>(
                            <div key={b} style={{textAlign:"right",color:r.byBranch[b]>0?"var(--text)":"var(--dim)"}}>
                              {r.byBranch[b]>0?`${r.byBranch[b]}${r.unit==="g"?"g":r.unit==="pack"?" pack":"pc"}`:"—"}
                            </div>
                          ))}
                          <div style={{textAlign:"right",color:"var(--accent)",fontWeight:600}}>{r.total}{r.unit==="g"?"g":r.unit==="pack"?" pack":"pc"}</div>
                        </div>
                      ))}
                      {/* Category subtotal */}
                      <div style={{display:"grid",gridTemplateColumns:`1fr ${BRANCHES_LIST.map(()=>"60px").join(" ")} 60px`,gap:6,padding:"6px 2px",fontSize:11}}>
                        <div style={{color:"var(--muted)"}}>Subtotal</div>
                        {BRANCHES_LIST.map(b=>(
                          <div key={b} style={{textAlign:"right",color:"var(--muted)"}}>
                            {catRows.reduce((s,r)=>s+(r.byBranch[b]||0),0)}
                          </div>
                        ))}
                        <div style={{textAlign:"right",color:"var(--muted)",fontWeight:600}}>{catRows.reduce((s,r)=>s+r.total,0)}</div>
                      </div>
                    </div>
                  );
                })}
              </>
            }

            <button className="btn-export" style={{width:"100%",marginTop:12}} onClick={exportPOReport}>↓ EXPORT CSV</button>
            <button className="btn-ghost" style={{marginTop:8}} onClick={()=>setShowPOReport(false)}>CLOSE</button>
          </div>
        </div>
      );
    })()}

    {/* BACKUP PIN MODAL */}
    {showBackupPin&&(
      <div className="pin-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setShowBackupPin(false);setBackupPinEntry("");} }}>
        <div className="pin-modal">
          <div className="pin-title">{backupPinMode==="export"?"Export Backup":"Restore Backup"}</div>
          <div className="pin-sub">{backupPinMode==="export"?"Enter PIN to download backup":"Enter PIN to restore from file"}</div>
          <div className={`pin-dots ${backupPinErr?"pin-shake":""}`}>
            {[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<backupPinEntry.length?(backupPinErr?"error":"filled"):""}`}/>)}
          </div>
          <div className="pin-pad">
            {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k,i)=>
              k===""?<div key={i}/>:(
                <button key={k} className={`pin-key ${k==="DEL"?"del":""}`} onClick={()=>{
                  if (k==="DEL"){ setBackupPinEntry(p=>p.slice(0,-1)); setBackupPinErr(false); return; }
                  const next=backupPinEntry+k; setBackupPinEntry(next);
                  if (next.length===4){
                    if (next===CLEAR_PIN){
                      setShowBackupPin(false); setBackupPinEntry("");
                      if (backupPinMode==="export"){
                        exportBackup(deliveries,productions);
                      } else {
                        restoreInputRef.current?.click();
                      }
                    } else {
                      setBackupPinErr(true);
                      setTimeout(()=>{ setBackupPinEntry(""); setBackupPinErr(false); },600);
                    }
                  }
                }}>{k==="DEL"?"⌫":k}</button>
              )
            )}
          </div>
          <button className="pin-cancel" onClick={()=>{ setShowBackupPin(false); setBackupPinEntry(""); setRestoreFile(null); }}>CANCEL</button>
        </div>
      </div>
    )}

    {/* PIN MODAL (Clear All Data) */}
    {showPin&&(
      <div className="pin-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setShowPin(false);setPinEntry("");} }}>
        <div className="pin-modal">
          <div className="pin-title">Enter PIN</div>
          <div className="pin-sub">This will permanently delete all data.</div>
          <div className={`pin-dots ${pinError?"pin-shake":""}`}>
            {[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<pinEntry.length?(pinError?"error":"filled"):""}`}/>)}
          </div>
          <div className="pin-pad">
            {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k,i)=>
              k===""?<div key={i}/>:(
                <button key={k} className={`pin-key ${k==="DEL"?"del":""}`} onClick={()=>handlePinKey(k)}>
                  {k==="DEL"?"⌫":k}
                </button>
              )
            )}
          </div>
          <button className="pin-cancel" onClick={()=>{ setShowPin(false); setPinEntry(""); }}>CANCEL</button>
        </div>
      </div>
    )}
  </>;
}
