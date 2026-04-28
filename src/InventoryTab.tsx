import React, { useState, useMemo } from "react";
import { saveDoc, saveBatch, deleteDocument, COLLECTIONS } from "./firebase";
import { PACKED_ITEMS, LOOSE_ITEMS, LOOSE_PACK_SIZES, BRANCHES, VARIANCE_THRESHOLD } from "./data";
import { todayISO, fmt, recipeMatch, genPORef } from "./utils";

// ── TYPES ─────────────────────────────────────────────────────────────────────
export interface InvEntry {
  id:              number;
  date:            string;
  item:            string;
  type:            "in"|"out"|"count";
  qty:             number;
  note?:           string;
  loggedBy:        string;
  poRef?:          string;
  // Manual count fields
  systemBalance?:  number;
  variance?:       number;
  variancePct?:    number;
  approvedBy?:     string;
}

export interface PullOutRecord {
  id:         number;
  poRef:      string;
  date:       string;
  branch:     string;
  loggedBy:   string;
  preparedBy?:string;
  checkedBy?: string;
  items:      { item:string; category:string; qty:number; unit:string }[];
}


function calcBalance(item:string, entries:InvEntry[], seed:number=0, postCountSeed:number=0): number {
  const sorted=[...entries.filter(e=>recipeMatch(e.item,item))].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
  // Find the last Manual count — it becomes the new baseline.
  // Everything before it (including the production seed) is irrelevant.
  // But productions AFTER the count still add via postCountSeed.
  const lastCountIdx = sorted.map(e=>e.type).lastIndexOf("count");
  let bal = lastCountIdx>=0 ? sorted[lastCountIdx].qty + postCountSeed : seed;
  // Only apply IN/OUT entries that occurred AFTER the last count
  const startIdx = lastCountIdx>=0 ? lastCountIdx+1 : 0;
  for (let i=startIdx; i<sorted.length; i++){
    const e = sorted[i];
    if (e.type==="in")    bal+=e.qty;
    if (e.type==="out")   bal-=e.qty;
    if (e.type==="count") { bal=e.qty+postCountSeed; } // handle multiple counts
  }
  return Math.max(0,bal);
}

function todayIN(item:string, entries:InvEntry[], seed:number=0): number {
  return entries.filter(e=>recipeMatch(e.item,item)&&e.type==="in"&&e.date===todayISO()).reduce((s,e)=>s+e.qty,0)+seed;
}
function todayOUT(item:string, entries:InvEntry[]): number {
  return entries.filter(e=>recipeMatch(e.item,item)&&e.type==="out"&&e.date===todayISO()).reduce((s,e)=>s+e.qty,0);
}

// ── PDF GENERATOR ─────────────────────────────────────────────────────────────
function generatePOPDF(po:PullOutRecord) {
  const rows=po.items.map((i,idx)=>{
    const packSizeG = LOOSE_PACK_SIZES[i.item];
    const qtyUnit = i.unit==="pack" && packSizeG
      ? `${i.qty} pack${i.qty!==1?"s":""} × ${packSizeG.toLocaleString()}g`
      : i.unit==="g"
        ? i.qty+"g"
        : i.qty+" pcs";
    const bg = idx%2===0 ? "#f9f9f9" : "#fff";
    return "<tr style=\"background:"+bg+"\"><td style=\"padding:10px 16px;font-size:16px;font-weight:600;border-bottom:1px solid #e0e0e0\">"+i.item.toUpperCase()+"</td><td style=\"padding:10px 16px;font-size:16px;font-weight:700;text-align:right;white-space:nowrap;border-bottom:1px solid #e0e0e0\">"+qtyUnit+"</td></tr>";
  }).join("");
  const branchLabel = po.branch==="MKT" ? "Makati" : po.branch==="BF" ? "BF" : po.branch;
  const nl="\n";
  const html="<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>"+po.poRef+"</title>"+nl+
"<style>"+nl+
"*{box-sizing:border-box;margin:0;padding:0}"+nl+
"body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:40px 50px}"+nl+
".header{text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:3px solid #111}"+nl+
".header h1{font-size:28px;font-weight:900;letter-spacing:.08em;margin-bottom:4px}"+nl+
".header p{font-size:14px;color:#555;letter-spacing:.04em}"+nl+
".meta{margin-bottom:28px;padding-bottom:18px;border-bottom:1px dashed #aaa}"+nl+
".meta .ref{font-size:24px;font-weight:800;letter-spacing:.04em;margin-bottom:6px}"+nl+
".meta .details{font-size:14px;color:#444;line-height:1.8}"+nl+
"table{width:100%;border-collapse:collapse;margin-bottom:30px}"+nl+
"th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#555;border-bottom:2px solid #111;padding:8px 16px;text-align:left}"+nl+
"th:last-child{text-align:right}"+nl+
".total-row{border-top:2px solid #111;font-size:14px;font-weight:700;padding:10px 16px}"+nl+
".footer{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:60px}"+nl+
".sig-block{text-align:center}"+nl+
".sig-line{border-top:2px solid #111;padding-top:8px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-top:50px}"+nl+
"@media print{@page{margin:15mm 18mm}}"+nl+
"</style></head>"+nl+
"<body>"+nl+
"<div class=\"header\"><h1>THE BLACK BEAN</h1><p>Pull Out / Delivery Receipt</p></div>"+nl+
"<div class=\"meta\">"+nl+
"<div class=\"ref\">"+po.poRef+"</div>"+nl+
"<div class=\"details\">"+nl+
"<div>Branch: <strong>"+branchLabel+"</strong></div>"+nl+
"<div>Date: <strong>"+po.date+"</strong></div>"+nl+
"<div>Logged by: <strong>"+po.loggedBy+"</strong></div>"+nl+
"</div></div>"+nl+
"<table><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>"+rows+
"<tr><td class=\"total-row\" style=\"text-align:right\" colspan=\"2\">Total items: "+po.items.length+"</td></tr>"+nl+
"</tbody></table>"+nl+
"<div class=\"footer\">"+nl+
"<div class=\"sig-block\"><div style=\"font-size:16px;font-weight:700;min-height:24px\">"+(po.preparedBy||"")+"</div><div class=\"sig-line\">Prepared by</div></div>"+nl+
"<div class=\"sig-block\"><div style=\"font-size:16px;font-weight:700;min-height:24px\">"+(po.checkedBy||"")+"</div><div class=\"sig-line\">Checked by</div></div>"+nl+
"</div>"+nl+
"</body></html>";
  const win = window.open("", "_blank"); if (!win) return;
  win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400);
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────
interface Props {
  productions:   any[];
  invEntries:    InvEntry[];
  setInvEntries: (fn:(prev:InvEntry[])=>InvEntry[]) => void;
  pullOuts:      PullOutRecord[];
  setPullOuts:   (fn:(prev:PullOutRecord[])=>PullOutRecord[]) => void;
  logger:        string;
  recipes:       { name:string; portionG:number|null }[];
  team:          string[];
  canEdit?:      boolean;
  managerPin:    string;
}

type ModalMode = "in"|"sunday"|"history";
type SubTab    = "portioned"|"packed"|"loose"|"pullout";

// PIN keypad component (reusable)
function PinPad({ title, sub, pin, onSuccess, onCancel }: { title:string; sub:string; pin:string; onSuccess:(pin:string)=>void; onCancel:()=>void }) {
  const [entry, setEntry] = useState("");
  const [err,   setErr]   = useState(false);

  const handleKey = (key:string) => {
    if (key==="DEL"){ setEntry(p=>p.slice(0,-1)); setErr(false); return; }
    const next=entry+key; setEntry(next);
    if (next.length===4){
      if (next===pin){ onSuccess(next); }
      else { setErr(true); setTimeout(()=>{ setEntry(""); setErr(false); },600); }
    }
  };

  return (
    <div className="pin-backdrop" onClick={e=>{ if(e.target===e.currentTarget) onCancel(); }}>
      <div className="pin-modal">
        <div className="pin-title">{title}</div>
        <div className="pin-sub">{sub}</div>
        <div className={`pin-dots ${err?"pin-shake":""}`}>
          {[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<entry.length?(err?"error":"filled"):""}`}/>)}
        </div>
        <div className="pin-pad">
          {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k,i)=>
            k===""?<div key={i}/>:(
              <button key={k} className={`pin-key ${k==="DEL"?"del":""}`} onClick={()=>handleKey(k)}>
                {k==="DEL"?"⌫":k}
              </button>
            )
          )}
        </div>
        <button className="pin-cancel" onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

export default function InventoryTab({ productions, invEntries, setInvEntries, pullOuts, setPullOuts, logger, recipes, team, canEdit=false, managerPin }:Props) {
  const [subTab,      setSubTab]      = useState<SubTab>("portioned");
  const [modal,       setModal]       = useState<{item:string; mode:ModalMode; unit:string}|null>(null);
  const [qtyInput,    setQtyInput]    = useState("");
  const [noteInput,   setNoteInput]   = useState("");
  const [dateInput,   setDateInput]   = useState(todayISO());
  const [modalError,  setModalError]  = useState("");
  const [saveError,   setSaveError]   = useState("");
  const [isSaving,    setIsSaving]    = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all"|"in"|"out"|"count"|"prod">("all");

  // Edit/delete IN entries
  const [editEntry,   setEditEntry]   = useState<InvEntry|null>(null);
  const [editQty,     setEditQty]     = useState("");
  const [editNote,    setEditNote]    = useState("");
  const [showEditPin, setShowEditPin] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InvEntry|null>(null);

  // Manual count PIN approval
  const [sundayPending, setSundayPending] = useState<{item:string; qty:number; systemBalance:number; variance:number; variancePct:number; unit:string}|null>(null);
  const [showSundayPin, setShowSundayPin] = useState(false);

  // Pull Out
  const [poDate,     setPODate]     = useState(todayISO());
  const [poBranch,   setPOBranch]   = useState("MKT");
  const [showReview, setShowReview] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy,  setCheckedBy]  = useState("");
  const [poQtys,     setPOQtys]     = useState<Record<string,string>>({});
  const [poError,    setPOError]    = useState("");
  const [poSuccess,  setPOSuccess]  = useState("");
  const [showPOHist, setShowPOHist] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PullOutRecord|null>(null);

  // ── Build item lists ───────────────────────────────────────────────────────
  const recipeItems = useMemo(() => recipes.filter(r=>r.portionG!==null).map(r=>{
    const totalProduced = productions.filter(p=>recipeMatch(p.recipe,r.name)&&p.actualPortions!==undefined).reduce((s:number,p:any)=>s+p.actualPortions,0);
    const todayProduced = productions.filter(p=>recipeMatch(p.recipe,r.name)&&p.actualPortions!==undefined&&p.date===todayISO()).reduce((s:number,p:any)=>s+p.actualPortions,0);
    const lastCount = [...invEntries.filter(e=>recipeMatch(e.item,r.name)&&e.type==="count")].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id).pop();
    const postCountProduced = lastCount
      ? productions.filter(p=>recipeMatch(p.recipe,r.name)&&p.actualPortions!==undefined&&(p.date>lastCount.date||(p.date===lastCount.date&&p.id>lastCount.id))).reduce((s:number,p:any)=>s+p.actualPortions,0)
      : 0;
    return {
      name:r.name, unit: LOOSE_PACK_SIZES[r.name] ? "pack" : "pc", category:"Recipe Portioned", portionG:r.portionG,
      balance:  calcBalance(r.name, invEntries, totalProduced, postCountProduced),
      todayIN:  todayIN(r.name, invEntries, todayProduced),
      todayOUT: todayOUT(r.name, invEntries),
    };
  }), [recipes, productions, invEntries]);

  const packedItems = useMemo(() => PACKED_ITEMS.map(name=>({
    name, unit:"pc", category:"Packed",
    balance:  calcBalance(name, invEntries),
    todayIN:  todayIN(name, invEntries),
    todayOUT: todayOUT(name, invEntries),
  })), [invEntries]);

  const looseItems = useMemo(() => LOOSE_ITEMS.map(name=>({
    name, unit: LOOSE_PACK_SIZES[name] ? "pack" : "g", category:"Loose",
    balance:  calcBalance(name, invEntries),
    todayIN:  todayIN(name, invEntries),
    todayOUT: todayOUT(name, invEntries),
  })), [invEntries]);
  const allItems     = [...recipeItems,...packedItems,...looseItems];

  const currentItems = subTab==="portioned" ? recipeItems
    : subTab==="packed"  ? packedItems
    : subTab==="loose"   ? looseItems
    : allItems;

  const isPortioned = subTab==="portioned";

  const openModal = (item:string, mode:ModalMode, unit:string) => {
    setModal({item,mode,unit}); setQtyInput(""); setNoteInput(""); setDateInput(todayISO()); setModalError("");
  };

  // ── Submit IN ──────────────────────────────────────────────────────────────
  const submitIn = async () => {
    const qty=+qtyInput;
    if (!qty||qty<=0){ setModalError("Enter a valid quantity."); return; }
    if ((modal!.unit==="pc"||modal!.unit==="pack")&&!Number.isInteger(qty)){ setModalError("Qty must be a whole number."); return; }
    const newEntry: Record<string,any> = {id:Date.now(),date:dateInput,item:modal!.item,type:"in" as const,qty,loggedBy:logger};
    if (noteInput) newEntry.note = noteInput;
    setIsSaving(true);
    try {
      await saveDoc(COLLECTIONS.invEntries, newEntry);
      setQtyInput(""); setNoteInput(""); setModal(null); setModalError("");
    } catch {
      setModalError("Save failed — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Edit IN entry (PIN-protected) ──────────────────────────────────────────
  const startEditEntry = (e:InvEntry) => { setEditEntry(e); setEditQty(String(e.qty)); setEditNote(e.note||""); setShowEditPin(true); };

  const confirmEdit = async () => {
    const qty=+editQty;
    if (!qty||qty<=0){ setModalError("Enter a valid quantity."); return; }
    const unit = allItems.find(x=>x.name===editEntry!.item)?.unit;
    if ((unit==="pc"||unit==="pack")&&!Number.isInteger(qty)){ setModalError("Qty must be a whole number."); return; }
    // Guard: reducing an IN entry cannot make current balance go negative
    if (editEntry!.type==="in") {
      const currentItem = allItems.find(x=>x.name===editEntry!.item);
      if (currentItem) {
        const newBalance = currentItem.balance + (qty - editEntry!.qty);
        if (newBalance < 0) {
          setModalError(`Cannot reduce to ${qty} — ${Math.abs(qty - editEntry!.qty)} already committed. Minimum ${editEntry!.qty + Math.min(0, currentItem.balance)}.`);
          return;
        }
      }
    }
    const updated: Record<string,any> = {...editEntry!, qty};
    if (editNote) updated.note = editNote; else delete updated.note;
    setIsSaving(true);
    try {
      await saveDoc(COLLECTIONS.invEntries, updated);
      setEditEntry(null); setEditQty(""); setEditNote(""); setModalError("");
    } catch {
      setModalError("Save failed — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const startDeleteEntry = (e:InvEntry) => { setPendingDelete(e); setShowEditPin(true); };

  const confirmDelete = async () => {
    setIsSaving(true);
    try {
      await deleteDocument(COLLECTIONS.invEntries, pendingDelete!.id);
      setPendingDelete(null);
    } catch {
      setSaveError("Delete failed — check your connection and try again.");
      setPendingDelete(null);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Manual Count ───────────────────────────────────────────────────────────
  const submitCount = () => {
    const qty=+qtyInput;
    if (qtyInput===""||qty<0){ setModalError("Enter physical count (0 or more)."); return; }
    if ((modal!.unit==="pc"||modal!.unit==="pack")&&!Number.isInteger(qty)){ setModalError("Physical count must be a whole number."); return; }
    const cur = currentItems.find(x=>x.name===modal!.item);
    const systemBalance = cur?.balance ?? 0;
    const variance = qty - systemBalance;
    const variancePct = systemBalance > 0 ? Math.abs(variance/systemBalance) : 0;

    const entry = {
      item: modal!.item, qty, systemBalance,
      variance, variancePct, unit: modal!.unit,
    };

    // No PIN needed — always commit directly
    // Super Admin gets notified of any variance on Home screen
    commitSundayCount(entry, logger);
  };

  const commitSundayCount = async (entry: typeof sundayPending, approvedBy: string) => {
    if (!entry) return;
    const countEntry: Record<string,any> = {
      id:Date.now(), date:dateInput, item:entry.item,
      type:"count" as const, qty:entry.qty,
      loggedBy:logger, approvedBy,
      systemBalance: entry.systemBalance,
      variance:      entry.variance,
      variancePct:   entry.variancePct,
    };
    if (noteInput) countEntry.note = noteInput;
    setIsSaving(true);
    try {
      await saveDoc(COLLECTIONS.invEntries, countEntry);
      setQtyInput(""); setNoteInput(""); setModal(null); setModalError("");
      setSundayPending(null); setShowSundayPin(false);
    } catch {
      setModalError("Save failed — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Pull Out ───────────────────────────────────────────────────────────────
  const submitPullOut = async (printNow:boolean=false) => {
    const overLimit = allItems.filter(x=>+poQtys[x.name]>0&&+poQtys[x.name]>x.balance);
    if (overLimit.length>0){ setPOError(`Qty exceeds balance for: ${overLimit.map(x=>x.name).join(", ")}`); return; }
    const nonInteger = allItems.filter(x=>+poQtys[x.name]>0&&(x.unit==="pc"||x.unit==="pack")&&!Number.isInteger(+poQtys[x.name]));
    if (nonInteger.length>0){ setPOError(`Whole numbers only for: ${nonInteger.map(x=>x.name).join(", ")}`); return; }
    const pulled = allItems.filter(x=>+poQtys[x.name]>0).map(x=>({ item:x.name, category:x.category, qty:+poQtys[x.name], unit:x.unit }));
    if (!pulled.length){ setPOError("Enter at least one item quantity."); return; }
    const poRef = genPORef(poDate, poBranch, pullOuts);
    const now = Date.now();
    const newEntries = pulled.map((p,i)=>({ id:now+i, date:poDate, item:p.item, type:"out" as const, qty:p.qty, note:`Pull Out ${poRef}`, loggedBy:logger, poRef }));
    const newPO:PullOutRecord = { id:now, poRef, date:poDate, branch:poBranch, loggedBy:logger, items:pulled };
    if (preparedBy) newPO.preparedBy = preparedBy;
    if (checkedBy)  newPO.checkedBy  = checkedBy;
    setIsSaving(true);
    try {
      await saveBatch(COLLECTIONS.invEntries, newEntries);
      await saveDoc(COLLECTIONS.pullOuts, newPO);
      if (printNow) generatePOPDF(newPO);
      setPOQtys({}); setPOError(""); setPreparedBy(""); setCheckedBy("");
      setPOSuccess(`${poRef} submitted!`);
      setTimeout(()=>setPOSuccess(""),4000);
    } catch {
      setPOError("Save failed — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportInventory = () => {
    // Section 1: Current balances
    const h1="Category,Item,Today IN,Today OUT,Ending Balance,Unit,Export Date";
    const r1=allItems.map(x=>`${x.category},"${x.name}",${x.todayIN},${x.todayOUT},${x.balance},${x.unit},${todayISO()}`);

    // Section 2: Full entry log
    const h2="Date,Item,Type,Qty,Note,PO Ref,Logged By";
    const r2=[...invEntries].sort((a,b)=>a.date.localeCompare(b.date)).map(e=>
      `${e.date},"${e.item}",${e.type.toUpperCase()},${e.qty},"${e.note??''}",${e.poRef??''},${e.loggedBy}`
    );

    // Section 3: Manual Count variance report
    const countEntries = invEntries.filter(e=>e.type==="count"&&e.systemBalance!==undefined);
    const h3="Date,Item,System Balance,Physical Count,Variance,Variance %,Approved By,Note";
    const r3=countEntries.map(e=>
      `${e.date},"${e.item}",${e.systemBalance},${e.qty},${e.variance??0},${e.variancePct!==undefined?(e.variancePct*100).toFixed(1)+"%":""},${e.approvedBy??e.loggedBy},"${e.note??''}"`
    );

    const csv=[
      "INVENTORY BALANCES",h1,...r1,
      "","ENTRY LOG",h2,...r2,
      "","MANUAL COUNT VARIANCE REPORT",h3,...(r3.length?r3:["No Manual counts yet"]),
    ].join("\n");

    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`inventory_${todayISO()}.csv`; a.click();
  };

  const historyEntries = modal ? (()=>{
    const inv = invEntries.filter(e=>recipeMatch(e.item,modal.item)).map(e=>({...e, _src:"inv" as const}));
    // Include production entries for recipe portioned items
    const isRecipe = recipes.some(r=>r.name===modal.item&&r.portionG!==null);
    const prod = isRecipe
      ? productions.filter(p=>recipeMatch(p.recipe,modal.item)&&p.actualPortions!==undefined).map((p:any)=>({
          id:p.id, date:p.date, item:modal.item, type:"prod" as const, qty:p.actualPortions,
          note:p.prodBatchCode, loggedBy:p.loggedBy||p.prodBy||"", _src:"prod" as const,
        }))
      : [];
    return [...inv,...prod].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  })() : [];

  return (
    <>
      <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,marginBottom:16,marginTop:0}}>Inventory</div>
      {saveError&&<div className="error-box" style={{marginBottom:12,cursor:"pointer"}} onClick={()=>setSaveError("")}>⚠ {saveError} · tap to dismiss</div>}

      <div className="inv-subtab-row">
        {([["portioned","Recipe Portioned"],["packed","Packed"],["loose","Loose"]] as const).map(([k,l])=>(
          <button key={k} className={`inv-subtab ${subTab===k?"active":""}`} onClick={()=>setSubTab(k)}>{l}</button>
        ))}
        <button className={`inv-subtab pullout ${subTab==="pullout"?"active":""}`} onClick={()=>setSubTab("pullout")}>🚚 Pull Out</button>
      </div>

      {/* ── PULL OUT TAB ── */}
      {subTab==="pullout"&&<>
        {poSuccess&&<div style={{background:"var(--green-bg)",border:"1px solid #1a3d26",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--green)",marginBottom:16}}>✓ {poSuccess}</div>}
        {poError&&<div className="error-box">⚠ {poError}</div>}
        <div className="form-group"><label className="form-label">Pull Out Date</label><input className="form-input" type="date" value={poDate} onChange={e=>setPODate(e.target.value)}/></div>
        <div className="form-group">
          <label className="form-label">Branch</label>
          <select className="form-select" value={poBranch} onChange={e=>setPOBranch(e.target.value)}>
            {BRANCHES.map(b=><option key={b.code} value={b.code}>{b.label} ({b.code})</option>)}
          </select>
        </div>

        {[
          { label:"Recipe Portioned", items:recipeItems },
          { label:"Packed",           items:packedItems },
          { label:"Loose",            items:looseItems  },
        ].map(section=>(
          <React.Fragment key={section.label}>
            <div className="po-section-label">{section.label}</div>
            {section.items.map(x=>{
              const packSizeG = LOOSE_PACK_SIZES[x.name] ?? (x as any).portionG ?? null;
              const enteredQty = +poQtys[x.name];
              const packLabel = x.unit==="pack" ? "pack" : "pc";
              return (
              <div key={x.name} className="po-item-row">
                <div style={{flex:1}}>
                  <div className="po-item-name">{x.name}</div>
                  {packSizeG&&(
                    <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>
                      {enteredQty>0
                        ? <span style={{color:"var(--accent)",fontWeight:500}}>{enteredQty} {packLabel}{enteredQty!==1&&packLabel==="pack"?"s":""} × {packSizeG.toLocaleString()}g</span>
                        : <span>{packSizeG.toLocaleString()}g / {packLabel}</span>
                      }
                    </div>
                  )}
                  <div style={{fontSize:10,marginTop:1}}><span style={{color:"var(--muted)"}}>Balance: </span><span style={{color:"var(--accent)",fontWeight:600}}>{fmt(x.balance)} {x.unit}</span></div>
                </div>
                <input className="po-qty-input" type="number" min="0" placeholder="0"
                  value={poQtys[x.name]||""}
                  disabled={x.balance<=0}
                  style={{opacity:x.balance<=0?0.3:1,cursor:x.balance<=0?"not-allowed":"text",borderColor:+poQtys[x.name]>x.balance&&x.balance>0?"var(--red)":""}}
                  onChange={e=>setPOQtys(p=>({...p,[x.name]:e.target.value}))}
                />
                <span className="po-item-unit">{x.unit}</span>
              </div>
            )})}
          </React.Fragment>
        ))}

        {canEdit&&<button className="btn-primary" style={{marginTop:16}} disabled={isSaving} onClick={()=>{
          const overLimit = allItems.filter(x=>+poQtys[x.name]>0&&+poQtys[x.name]>x.balance);
          if (overLimit.length>0){ setPOError(`Qty exceeds balance for: ${overLimit.map(x=>x.name).join(", ")}`); return; }
          const pulled = allItems.filter(x=>+poQtys[x.name]>0);
          if (!pulled.length){ setPOError("Enter at least one item quantity."); return; }
          setPOError(""); setShowReview(true);
        }}>REVIEW PULL OUT →</button>}

        {pullOuts.length>0&&<>
          <div style={{marginTop:24,paddingTop:20,borderTop:"1px solid var(--border)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:10,color:"var(--muted)",letterSpacing:".14em",textTransform:"uppercase"}}>Pull Out History</span>
              <button onClick={()=>setShowPOHist(s=>!s)} style={{background:"transparent",border:"none",color:"var(--muted)",fontFamily:"var(--font-mono)",fontSize:11,cursor:"pointer"}}>
                {showPOHist?"▲ Hide":"▼ Show"}
              </button>
            </div>
            {showPOHist&&[...pullOuts].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id).map(po=>(
              <div key={po.id} className="po-history-card" onClick={()=>setSelectedPO(po)}>
                <div className="po-history-ref">{po.poRef}</div>
                <div className="po-history-meta">{po.poRef} · {po.date} · {po.loggedBy}</div>
                <div className="po-summary-badge">{po.items.length} items pulled</div>
              </div>
            ))}
          </div>
        </>}
      </>}

      {/* ── INVENTORY TABS ── */}
      {subTab!=="pullout"&&<>
        {currentItems.length===0
          ? <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">No data yet.<br/>{isPortioned?"Log portions in production first.":"Log IN to start tracking."}</div></div>
          : currentItems.map(x=>(
            <div key={x.name} className="inv-balance-card">
              <div className="inv-balance-header">
                <div>
                  <div className="inv-balance-name">{x.name}</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{isPortioned?"Auto from portioning":"Manual IN / Manual count"}</div>
                </div>
                <div>
                  <div className="inv-balance-end">{fmt(x.balance)}</div>
                  <div className="inv-balance-unit">ON HAND</div>
                </div>
              </div>
              <div className="inv-metrics-row">
                <div className="inv-metric"><div className="inv-metric-val" style={{color:"var(--green)"}}>+{fmt(x.todayIN)}</div><div className="inv-metric-lbl">Today IN</div></div>
                <div className="inv-metric"><div className="inv-metric-val" style={{color:"var(--red)"}}>−{fmt(x.todayOUT)}</div><div className="inv-metric-lbl">Today OUT</div></div>
                <div className="inv-metric"><div className="inv-metric-val" style={{color:"var(--accent)"}}>{fmt(x.balance)}</div><div className="inv-metric-lbl">Ending</div></div>
              </div>
              <div style={{gridTemplateColumns:isPortioned?"1fr":"1fr 1fr"}} className={`inv-action-row${isPortioned?" no-in":""}`}>
                {!isPortioned&&canEdit&&<button className="inv-action-btn in-btn" onClick={()=>openModal(x.name,"in",x.unit)}>+ Log IN</button>}
                {canEdit&&<button className="inv-action-btn sunday" onClick={()=>openModal(x.name,"sunday",x.unit)}>📋 Manual Count</button>}
              </div>
              <button onClick={()=>openModal(x.name,"history",x.unit)} style={{width:"100%",marginTop:6,background:"transparent",border:"none",color:"var(--dim)",fontFamily:"var(--font-mono)",fontSize:11,cursor:"pointer",textAlign:"left",padding:"4px 0",letterSpacing:".06em"}}>
                VIEW HISTORY →
              </button>
            </div>
          ))
        }
        <div className="inv-export-bar">
          <button className="btn-export" style={{width:"100%"}} onClick={exportInventory}>↓ EXPORT INVENTORY REPORT</button>
        </div>
      </>}

      {/* ── IN MODAL ── */}
      {modal?.mode==="in"&&(
        <div className="inv-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setModal(null);setModalError("");} }}>
          <div className="inv-modal">
            <div className="inv-modal-handle"/>
            <div className="inv-modal-title">Log IN</div>
            <div className="inv-modal-sub">{modal.item}</div>
            {modalError&&<div className="error-box">⚠ {modalError}</div>}
            <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={dateInput} onChange={e=>setDateInput(e.target.value)}/></div>
            <div className="form-group">
              <label className="form-label">{modal.unit==="g"?"Qty (g)":modal.unit==="pack"?"Qty (pack)":"Qty (pc)"}</label>
              <input className="form-input" type="number" placeholder="0" value={qtyInput} onChange={e=>setQtyInput(e.target.value)} autoFocus/>
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input className="form-input" placeholder="e.g. batch produced" value={noteInput} onChange={e=>setNoteInput(e.target.value)}/>
            </div>
            <button className="btn-primary" onClick={submitIn} disabled={isSaving}>{isSaving?"SAVING...":"SAVE IN"}</button>
            <button className="btn-ghost" onClick={()=>{setModal(null);setModalError("");}}>CANCEL</button>
          </div>
        </div>
      )}

      {/* ── SUNDAY COUNT MODAL ── */}
      {modal?.mode==="sunday"&&(
        <div className="inv-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setModal(null);setModalError("");setSundayPending(null);} }}>
          <div className="inv-modal">
            <div className="inv-modal-handle"/>
            <div className="inv-modal-title">Manual Count</div>
            <div className="inv-modal-sub">{modal.item}</div>
            {(()=>{
              const cur=currentItems.find(x=>x.name===modal.item);
              const counted=qtyInput!==""?+qtyInput:null;
              const variance=counted!==null&&cur?counted-cur.balance:null;
              const variancePct=cur&&cur.balance>0&&variance!==null?Math.abs(variance/cur.balance):0;
              const needsPin=variancePct>VARIANCE_THRESHOLD&&cur&&cur.balance>0;
              return <>
                <div style={{background:"var(--surface2)",borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:"var(--muted)"}}>System balance</span>
                    <span>{cur?fmt(cur.balance):0} {modal.unit}</span>
                  </div>
                  {counted!==null&&variance!==null&&<>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:6,paddingTop:8,borderTop:"1px solid var(--border)"}}>
                      <span style={{color:"var(--muted)"}}>Variance</span>
                      <span className={variance>0?"inv-variance-pos":variance<0?"inv-variance-neg":"inv-variance-zero"}>
                        {variance>0?"+":""}{fmt(variance)} {modal.unit}{variance<0?" ⚠":variance>0?" ↑":""}
                      </span>
                    </div>
                    {counted!==null&&variance!==null&&variance!==0&&(
                      <div style={{marginTop:8,fontSize:11,color:"var(--amber)",padding:"6px 8px",background:"var(--accent-bg)",borderRadius:5}}>
                        ℹ Variance will be flagged to Super Admin for review
                      </div>
                    )}
                  </>}
                </div>
                {modalError&&<div className="error-box">⚠ {modalError}</div>}
                <div className="form-group"><label className="form-label">Count Date</label><input className="form-input" type="date" value={dateInput} onChange={e=>setDateInput(e.target.value)}/></div>
                <div className="form-group">
                  <label className="form-label">Physical count ({modal.unit})</label>
                  <input className="form-input" type="number" placeholder="0" value={qtyInput} onChange={e=>setQtyInput(e.target.value)} autoFocus/>
                </div>
                <div className="form-group">
                  <label className="form-label">Note (optional)</label>
                  <input className="form-input" placeholder="e.g. reason for variance" value={noteInput} onChange={e=>setNoteInput(e.target.value)}/>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>
                  Balance will be reset to physical count. Any variance will be flagged to Super Admin.
                </div>
                <button className="btn-primary" onClick={submitCount} disabled={isSaving}>{isSaving?"SAVING...":"CONFIRM COUNT"}</button>
                <button className="btn-ghost" onClick={()=>{setModal(null);setModalError("");setSundayPending(null);}}>CANCEL</button>
              </>;
            })()}
          </div>
        </div>
      )}

      {/* ── HISTORY MODAL ── */}
      {modal?.mode==="history"&&(
        <div className="inv-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget){ setModal(null); setHistoryFilter("all"); } }}>
          <div className="inv-modal">
            <div className="inv-modal-handle"/>
            <div className="inv-modal-title">History</div>
            <div className="inv-modal-sub">{modal.item}</div>
            {/* Filter chips */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {(["all","in","out","count","prod"] as const).map(f=>(
                <button key={f} onClick={()=>setHistoryFilter(f)}
                  style={{fontFamily:"var(--font-mono)",fontSize:10,letterSpacing:".1em",padding:"3px 10px",borderRadius:20,cursor:"pointer",border:"1px solid",borderColor:historyFilter===f?"var(--accent)":"var(--border)",background:historyFilter===f?"var(--accent-bg)":"transparent",color:historyFilter===f?"var(--accent)":"var(--muted)"}}>
                  {f==="all"?"ALL":f==="count"?"COUNT":f==="prod"?"PROD":f.toUpperCase()}
                </button>
              ))}
            </div>
            {(() => {
              const filtered = historyFilter==="all" ? historyEntries : historyEntries.filter(e=>e.type===historyFilter);
              return filtered.length===0
              ? <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>No entries yet.</div>
              : filtered.map(e=>(
                <div key={e.id} className="inv-history-row">
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span className={`inv-history-type-${e.type==="prod"?"in":e.type}`}>{e.type==="count"?"MANUAL COUNT":e.type==="prod"?"PROD":e.type.toUpperCase()}</span>
                      {e.type==="prod"&&e.note&&<span style={{fontSize:10,color:"var(--accent)"}}>{e.note}</span>}
                      {e.type!=="prod"&&(e as any).poRef&&<span style={{fontSize:10,color:"var(--accent)"}}>{(e as any).poRef}</span>}
                      <span style={{color:"var(--muted)",fontSize:11}}>{e.date}</span>
                    </div>
                    {e.type==="count"&&e.variance!==undefined&&(
                      <div style={{fontSize:11,color:e.variance<0?"var(--red)":e.variance>0?"var(--green)":"var(--muted)",marginTop:2}}>
                        Variance: {e.variance>0?"+":""}{fmt(e.variance)} · {e.approvedBy?`Approved by ${e.approvedBy}`:"No approval needed"}
                      </div>
                    )}
                    {e.type==="count"&&e.note&&e.note!=="Manual physical count"&&(
                      <div style={{fontSize:11,color:"var(--muted)",marginTop:2,fontStyle:"italic"}}>📝 {e.note}</div>
                    )}
                    {e.type==="in"&&!e.poRef&&(
                      <div style={{display:"flex",gap:6,marginTop:4}}>
                        <button onClick={()=>startDeleteEntry(e)} style={{background:"transparent",border:"1px solid #3d1a1a",borderRadius:5,color:"var(--red)",fontFamily:"var(--font-mono)",fontSize:10,padding:"2px 8px",cursor:"pointer"}}>✕ Delete</button>
                      </div>
                    )}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:13,color:e.type==="out"?"var(--red)":(e.type==="in"||e.type==="prod")?"var(--green)":"var(--accent)"}}>{e.type==="out"?"−":(e.type==="in"||e.type==="prod")?"+":"="}{fmt(e.qty)}</div>
                    <div style={{fontSize:10,color:"var(--dim)"}}>{e.loggedBy}</div>
                  </div>
                </div>
              ))
            })()}
            <button className="btn-ghost" style={{marginTop:16}} onClick={()=>{ setModal(null); setHistoryFilter("all"); }}>CLOSE</button>
          </div>
        </div>
      )}

      {/* ── PO DETAIL MODAL ── */}
      {selectedPO&&(
        <div className="inv-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) setSelectedPO(null); }}>
          <div className="inv-modal">
            <div className="inv-modal-handle"/>
            <div className="inv-modal-title">{selectedPO.poRef}</div>
            <div className="inv-modal-sub">{selectedPO.branch||""} · {selectedPO.date} · {selectedPO.loggedBy}</div>
            {selectedPO.items.map((i,idx)=>(
              <div key={idx} className="inv-history-row">
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{i.item}</div>
                  <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>{i.category}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,color:"var(--red)"}}>−{fmt(i.qty)} {i.unit}</div>
                </div>
              </div>
            ))}
            <button className="btn-primary" style={{marginTop:16}} onClick={()=>generatePOPDF(selectedPO)}>🖨 REPRINT RECEIPT</button>
            <button className="btn-ghost" onClick={()=>setSelectedPO(null)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* ── PULL OUT REVIEW MODAL ── */}
      {showReview&&(()=>{
        const reviewItems = allItems.filter(x=>+poQtys[x.name]>0).map(x=>({
          ...x, qty:+poQtys[x.name]
        }));
        const branchLabel = BRANCHES.find(b=>b.code===poBranch)?.label||poBranch;
        return (
          <div className="inv-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) setShowReview(false); }}>
            <div className="inv-modal">
              <div className="inv-modal-handle"/>
              <div className="inv-modal-title">Review Pull Out</div>
              <div className="inv-modal-sub">{branchLabel} · {poDate} · {logger}</div>

              {/* Grouped by category */}
              {["Recipe Portioned","Packed","Loose"].map(cat=>{
                const catItems = reviewItems.filter(x=>x.category===cat);
                if (!catItems.length) return null;
                return (
                  <div key={cat} style={{marginBottom:16}}>
                    <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".12em",textTransform:"uppercase",marginBottom:8}}>{cat}</div>
                    {catItems.map(x=>{
                      const packSizeG = LOOSE_PACK_SIZES[x.name] ?? (x as any).portionG ?? null;
                      return (
                      <div key={x.name} className="inv-history-row">
                        <div>
                          <div style={{fontSize:13,fontWeight:500}}>{x.name}</div>
                          {x.unit==="pack"&&packSizeG&&<div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>{packSizeG.toLocaleString()}g / pack</div>}
                          <div style={{fontSize:10,marginTop:1}}><span style={{color:"var(--muted)"}}>Balance: </span><span style={{color:"var(--accent)",fontWeight:600}}>{fmt(x.balance)} {x.unit}</span></div>
                        </div>
                        <div style={{textAlign:"right",fontWeight:600}}>
                          <div style={{fontSize:13,color:"var(--red)"}}>
                            −{x.unit==="pack"&&packSizeG ? `${fmt(x.qty)} pack${x.qty!==1?"s":""} × ${packSizeG.toLocaleString()}g` : `${fmt(x.qty)} ${x.unit}`}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                );
              })}

              {/* Totals — per unit type, not combined */}
              <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{color:"var(--muted)"}}>Items pulled</span>
                  <span style={{fontWeight:600}}>{reviewItems.length} items</span>
                </div>
                {(()=>{
                  const pcTotal   = reviewItems.filter(x=>x.unit==="pc").reduce((s,x)=>s+x.qty,0);
                  const gTotal    = reviewItems.filter(x=>x.unit==="g").reduce((s,x)=>s+x.qty,0);
                  const packTotal = reviewItems.filter(x=>x.unit==="pack").reduce((s,x)=>s+x.qty,0);
                  return <>
                    {pcTotal>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:3}}><span style={{color:"var(--muted)"}}>Total portions/pcs</span><span style={{fontWeight:600}}>{fmt(pcTotal)} pc</span></div>}
                    {gTotal>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:3}}><span style={{color:"var(--muted)"}}>Total loose (g)</span><span style={{fontWeight:600}}>{fmt(gTotal)} g</span></div>}
                    {packTotal>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:3}}><span style={{color:"var(--muted)"}}>Total loose (packs)</span><span style={{fontWeight:600}}>{fmt(packTotal)} pack</span></div>}
                  </>;
                })()}
              </div>

              <div className="form-group">
                <label className="form-label">Prepared by</label>
                <select className="form-select" value={preparedBy} onChange={e=>setPreparedBy(e.target.value)}>
                  <option value="">— Select —</option>
                  {team.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Checked by</label>
                <select className="form-select" value={checkedBy} onChange={e=>setCheckedBy(e.target.value)}>
                  <option value="">— Select —</option>
                  {team.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div style={{fontSize:11,color:"var(--muted)",marginBottom:16,textAlign:"center"}}>
                Please double-check before confirming. This cannot be undone.
              </div>

              {(!preparedBy||!checkedBy)&&<div className="error-box" style={{marginBottom:8}}>⚠ Prepared by and Checked by are required.</div>}
              <button className="btn-primary" style={{marginTop:0,opacity:(!preparedBy||!checkedBy||isSaving)?0.5:1,cursor:(!preparedBy||!checkedBy||isSaving)?"not-allowed":"pointer"}} disabled={!preparedBy||!checkedBy||isSaving} onClick={()=>{ setShowReview(false); submitPullOut(true); }}>
                🖨 CONFIRM &amp; PRINT FORM
              </button>
              <button className="btn-ghost" style={{marginTop:8}} onClick={()=>setShowReview(false)}>
                ← EDIT
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── EDIT IN ENTRY PIN ── */}
      {showEditPin&&(
        <PinPad
          title={pendingDelete?"Delete Entry":"Edit Entry"}
          sub={pendingDelete?`Delete this IN entry? This cannot be undone.`:`Edit this IN entry. Manager PIN required.`}
          pin={managerPin}
          onSuccess={()=>{
            setShowEditPin(false);
            if (pendingDelete){ confirmDelete(); }
            else { confirmEdit(); }
          }}
          onCancel={()=>{ setShowEditPin(false); setEditEntry(null); setPendingDelete(null); }}
        />
      )}

      {/* Edit form — shown after PIN if editing (not deleting) */}
      {editEntry&&!showEditPin&&!pendingDelete&&(
        <div className="inv-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setEditEntry(null);} }}>
          <div className="inv-modal">
            <div className="inv-modal-handle"/>
            <div className="inv-modal-title">Edit IN Entry</div>
            <div className="inv-modal-sub">{editEntry.item} · {editEntry.date}</div>
            {modalError&&<div className="error-box">⚠ {modalError}</div>}
            <div className="form-group">
              <label className="form-label">Qty</label>
              <input className="form-input" type="number" value={editQty} onChange={e=>setEditQty(e.target.value)} autoFocus/>
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input className="form-input" value={editNote} onChange={e=>setEditNote(e.target.value)}/>
            </div>
            <button className="btn-primary" onClick={confirmEdit} disabled={isSaving}>{isSaving?"SAVING...":"SAVE CHANGES"}</button>
            <button className="btn-ghost" onClick={()=>{ setEditEntry(null); setModalError(""); }}>CANCEL</button>
          </div>
        </div>
      )}


    </>
  );
}
