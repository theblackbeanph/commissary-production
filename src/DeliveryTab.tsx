import React, { useState } from "react";
import { saveDoc, deleteDocument, COLLECTIONS } from "./firebase";
import { SKUS, CLEAR_PIN } from "./data";
import { todayISO, fmtKg } from "./utils";
import type { Tab } from "./App";

interface DeliveryTabProps {
  deliveries:   any[];
  productions:  any[];
  isSuperAdmin: boolean;
  logger:       string;
  goTab:        (t: Tab) => void;
}

export default function DeliveryTab({
  deliveries, productions,
  isSuperAdmin, logger, goTab,
}: DeliveryTabProps) {
  const [subview,      setSubview]      = useState<"list"|"form"|"deliverydetail"|"finished">("list");
  const [form,         setForm]         = useState<any>({});
  const [error,        setError]        = useState("");
  const [isSaving,     setIsSaving]     = useState(false);
  const [selectedDel,  setSelectedDel]  = useState<any>(null);
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

  // ── SAVE DELIVERY ──────────────────────────────────────────────────────────
  const saveDelivery = () => {
    if (!form.date||!form.item||!form.weight||!form.cost){ setError("All fields are required."); return; }
    // Generate delivery batch code with date
    const d = new Date(form.date+"T12:00:00");
    const dateStr = String(d.getFullYear()).slice(2)+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
    const prefix = `B-${dateStr}-`;
    const seq = String(deliveries.filter(x=>x.batchCode?.startsWith(prefix)).length+1).padStart(2,"0");
    const batchCode = prefix+seq;
    const newDel = {
      ...form, id:Date.now(), batchCode,
      costPerGram: form.cost/form.weight,
      remainingWeight: form.weight,
      loggedBy: logger,
      usedIn: [],
    };
    setIsSaving(true);
    saveDoc(COLLECTIONS.deliveries, newDel)
      .then(()=>{ setForm({}); clearErr(); setSubview("list"); })
      .catch(()=>setError("Save failed — check your connection and try again."))
      .finally(()=>setIsSaving(false));
  };

  // ── DELIVERY EDIT ─────────────────────────────────────────────────────────────
  const saveDeliveryEdit = (d: any) => {
    const cost = +delEditCost;
    if (!cost || cost <= 0) { setError("Enter a valid cost."); return; }
    const newCostPerGram = cost / d.weight;
    const updated: any = { ...d, cost, costPerGram: newCostPerGram };
    if (delEditInvoice.trim()) updated.invoiceNo = delEditInvoice.trim();
    else delete updated.invoiceNo; // saveDoc uses setDoc (full overwrite) — omitting removes the field

    // Cascade cost update to all productions that used this delivery batch
    const affectedProds = productions.filter(p =>
      !p.voided && p.ingredients?.some((i: any) => i.deliveryBatchCode === d.batchCode)
    );
    const updatedProds = affectedProds.map(p => {
      const newIngredients = p.ingredients.map((i: any) => {
        if (i.deliveryBatchCode !== d.batchCode) return i;
        return { ...i, costPerGram: newCostPerGram, cost: i.raw * newCostPerGram };
      });
      const totalCost = newIngredients.reduce((s: number, i: any) => s + i.cost, 0);
      return {
        ...p,
        ingredients: newIngredients,
        cost: totalCost,
        costPerCooked: p.prodType === "cooked" && p.cooked > 0 ? totalCost / p.cooked : p.costPerCooked,
      };
    });

    Promise.all([
      saveDoc(COLLECTIONS.deliveries, updated),
      ...updatedProds.map(p => saveDoc(COLLECTIONS.productions, p)),
    ]).catch(() => setError("Save failed."));
    setShowDelEdit(false); clearErr();
  };

  // ── DELIVERY DELETE PIN ───────────────────────────────────────────────────────
  const handleDelDeletePinKey = (key: string) => {
    if (key === "DEL") { setDelDeletePinEntry(p => p.slice(0, -1)); setDelDeletePinErr(false); return; }
    const next = delDeletePinEntry + key; setDelDeletePinEntry(next);
    if (next.length === 4) {
      if (next === CLEAR_PIN) {
        if (selectedDel) {
          deleteDocument(COLLECTIONS.deliveries, selectedDel.id).catch(() => setError("Delete failed."));
        }
        setShowDelDeletePin(false); setDelDeletePinEntry("");
        setSubview("list"); setSelectedDel(null);
      } else {
        setDelDeletePinErr(true);
        setTimeout(() => { setDelDeletePinEntry(""); setDelDeletePinErr(false); }, 600);
      }
    }
  };

  return (
    <>
      {/* ══ DELIVERY DETAIL ══ */}
      {subview==="deliverydetail" && selectedDel && (()=>{
        const d = deliveries.find(x=>x.id===selectedDel.id)||selectedDel;
        return <>
          <div className="page-header">
            <div className="page-header-row">
              <button className="back-btn" onClick={()=>{ setSubview("list"); setSelectedDel(null); }}>←</button>
              <div className="page-title">Batch Detail</div>
            </div>
            <div className="page-sub">{d.batchCode}</div>
          </div>
          <div className="batch-card" style={{marginBottom:16}}>
            <div className="batch-name">{d.item}</div>
            <div className="batch-code" style={{marginTop:3}}>{d.batchCode}</div>
            <div style={{marginTop:8,fontSize:12,color:"var(--muted)"}}>
              Delivered {d.date} · {fmtKg(d.weight)} · ₱{d.cost?.toFixed(2)} · ₱{(d.costPerGram*1000).toFixed(2)}/kg{d.invoiceNo?<> · <span style={{color:"var(--text)"}}>Inv# {d.invoiceNo}</span></>:""}
            </div>
            {(()=>{
              const prodRuns   = productions.filter(p=>!p.voided&&p.ingredients?.some((i:any)=>i.deliveryBatchCode===d.batchCode));
              const totalEP    = prodRuns.reduce((s,p)=>{ const ingr=p.ingredients?.find((i:any)=>i.deliveryBatchCode===d.batchCode); return s+(ingr?.ep||ingr?.cooked||0); },0);
              const rawUsed    = (d.usedIn||[]).reduce((s:number,u:any)=>s+u.rawUsed,0);
              const writtenOff = d.writtenOff||0;
              // Loss = trim loss from production runs only
              const trimLossG  = totalEP>0 ? rawUsed-totalEP : 0;
              const trimLossPct= rawUsed>0&&trimLossG>0 ? (trimLossG/rawUsed)*100 : 0;
              const woQty      = writtenOff;
              const woPct      = d.weight>0 ? (woQty/d.weight)*100 : 0;
              // Actual cost/kg uses total cost ÷ total EP (includes write-off impact)
              const totalCost  = d.cost||0;
              const actualCPK  = totalEP>0 ? (totalCost/(totalEP/1000)) : null;
              return (
                <div style={{marginTop:10}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                    <div className="metric"><div className="metric-val">{fmtKg(d.weight)}</div><div className="metric-lbl">Initial Raw</div></div>
                    <div className="metric"><div className="metric-val" style={{color:d.remainingWeight>0?"var(--green)":"var(--muted)"}}>{fmtKg(d.remainingWeight)}</div><div className="metric-lbl">Remaining</div></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                    <div className="metric">
                      <div className="metric-val" style={{color:trimLossG>0?"var(--red)":"var(--muted)"}}>{totalEP>0?`${fmtKg(trimLossG)} (${trimLossPct.toFixed(1)}%)`:"—"}</div>
                      <div className="metric-lbl">Trim Loss</div>
                    </div>
                    <div className="metric">
                      <div className="metric-val" style={{color:woQty>0?"var(--red)":"var(--muted)"}}>{woQty>0?`${fmtKg(woQty)} (${woPct.toFixed(1)}%)`:"—"}</div>
                      <div className="metric-lbl">Written Off</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <div className="metric">
                      <div className="metric-val" style={{color:"var(--amber)"}}>{actualCPK?"₱"+actualCPK.toFixed(2):"—"}</div>
                      <div className="metric-lbl">Actual cost/kg</div>
                    </div>
                    <div className="metric">
                      <div className="metric-val">₱{(d.costPerGram*1000).toFixed(2)}</div>
                      <div className="metric-lbl">Invoice cost/kg</div>
                    </div>
                  </div>
                  {d.writtenOff&&d.writtenOff>0&&(
                    <div style={{marginTop:8,fontSize:11,color:"var(--dim)"}}>
                      ✍ Written off by {d.writtenOffBy||"—"} · {d.writtenOffReason||""} · {d.writtenOffAt?.slice(0,10)||""}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          {(d.usedIn||[]).length>0 && <>
            <div className="section-label">Used In</div>
            <div className="batch-card">
              {(d.usedIn||[]).map((u:any,i:number)=>{
                const linkedProd = productions.find((p:any)=>p.prodBatchCode===u.prodBatchCode);
                return (
                  <>
                  {/* TODO(Task 5): restore onClick to navigate to ProductionTab batch detail once ProductionTab is extracted */}
                  <div key={i} className="used-in-row">
                    <div>
                      <div className="used-in-code" style={{color:linkedProd?"var(--accent)":"var(--muted)"}}>{u.prodBatchCode}</div>
                      <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{u.recipe||"No recipe"} · {u.date}</div>
                    </div>
                    <div style={{fontSize:13,color:"var(--text)",textAlign:"right"}}>{fmtKg(u.rawUsed)}</div>
                  </div>
                  </>
                );
              })}
            </div>
          </>}
          {(d.usedIn||[]).length===0 && <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">Not used in any production yet.</div></div>}

          {/* Write Off Remaining Stock */}
          {d.remainingWeight>0&&!d.writtenOff&&isSuperAdmin&&(
            <div style={{marginTop:20,paddingTop:20,borderTop:"1px solid var(--border)"}}>
              <div className="section-label" style={{marginTop:0}}>Stock Adjustment</div>
              <button className="btn-danger" onClick={()=>{ setWriteOffTarget(d); setWriteOffReason("Spoilage"); setWriteOffPin(""); setWriteOffPinErr(false); setShowWriteOff(true); }}>
                ✍ Write Off Remaining Stock
              </button>
              <div style={{fontSize:11,color:"var(--dim)",marginTop:6}}>
                Zeros out {fmtKg(d.remainingWeight)} remaining. Affects actual cost/kg. PIN required.
              </div>
            </div>
          )}

          {/* ── MANAGE BATCH (superadmin) ── */}
          {isSuperAdmin&&(
            <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--border)"}}>
              <div className="section-label" style={{marginTop:0}}>Manage Batch</div>
              {!showDelEdit?(
                <button className="btn-ghost" onClick={()=>{ setShowDelEdit(true); setDelEditCost(String(d.cost||"")); setDelEditInvoice(d.invoiceNo||""); clearErr(); }}>
                  ✏ Edit Cost / Invoice No.
                </button>
              ):(
                <>
                  {error&&<div className="error-box">⚠ {error}</div>}
                  <div className="form-group">
                    <label className="form-label">Total Cost (₱)</label>
                    <input className="form-input" type="number" value={delEditCost} onChange={e=>{setDelEditCost(e.target.value);clearErr();}}/>
                  </div>
                  {+delEditCost>0&&<div className="form-hint">Cost/kg: ₱{(+delEditCost/d.weight*1000).toFixed(2)}</div>}
                  <div className="form-group">
                    <label className="form-label">Invoice No. <span style={{color:"var(--dim)",fontWeight:400}}>(optional)</span></label>
                    <input className="form-input" placeholder="e.g. INV-001" value={delEditInvoice} onChange={e=>setDelEditInvoice(e.target.value)}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button className="btn-primary" style={{flex:1,marginTop:0}} onClick={()=>saveDeliveryEdit(d)}>SAVE</button>
                    <button className="btn-ghost" style={{flex:1,marginTop:0}} onClick={()=>{setShowDelEdit(false);clearErr();}}>CANCEL</button>
                  </div>
                </>
              )}
              {(!d.usedIn||d.usedIn.length===0)&&!d.writtenOff&&(
                <div style={{marginTop:12}}>
                  <button className="btn-danger" onClick={()=>{ setShowDelDeletePin(true); setDelDeletePinEntry(""); setDelDeletePinErr(false); }}>
                    🗑 Delete Batch
                  </button>
                  <div style={{fontSize:11,color:"var(--dim)",marginTop:6}}>
                    This batch hasn't been used in any production. Deleting it is permanent.
                  </div>
                </div>
              )}
            </div>
          )}
        </>;
      })()}

      {/* ══ DELIVERY LIST ══ */}
      {subview==="list" && (()=>{
        const active   = deliveries.filter(d=>d.remainingWeight>0);
        const finished = deliveries.filter(d=>d.remainingWeight<=0);
        return <>
          <div className="page-header"><div className="page-header-row"><div className="page-title">Deliveries</div></div></div>
          {isSuperAdmin&&<button className="btn-primary" style={{marginTop:0,marginBottom:20}} onClick={()=>{ setForm({date:todayISO()}); clearErr(); setSubview("form"); }}>+ LOG NEW DELIVERY</button>}
          {deliveries.length===0
            ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No deliveries yet.</div></div>
            : <>
              {active.length===0
                ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No active stock.</div></div>
                : (()=>{
                  const grouped = SKUS.map(sku=>({
                    sku,
                    batches: active.filter(d=>d.item===sku).sort((a,b)=>(a.date||"").localeCompare(b.date||"")),
                    totalRemaining: active.filter(d=>d.item===sku).reduce((s,d)=>s+d.remainingWeight,0),
                    totalWeight: active.filter(d=>d.item===sku).reduce((s,d)=>s+d.weight,0),
                  })).filter(g=>g.batches.length>0);
                  return grouped.map(g=>(
                    <div key={g.sku} style={{marginBottom:8}}>
                      <button
                        onClick={()=>setExpandedSKU(expandedSKU===g.sku?null:g.sku)}
                        style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"13px 15px",cursor:"pointer",textAlign:"left",transition:"all .15s",color:"var(--text)",fontFamily:"var(--font-mono)",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="var(--border2)"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                        <div>
                          <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:700}}>{g.sku}</div>
                          <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{g.batches.length} batch{g.batches.length!==1?"es":""}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:600,color:g.totalRemaining<g.totalWeight*0.2?"var(--red)":"var(--green)"}}>{fmtKg(g.totalRemaining)}</div>
                          <div style={{fontSize:10,color:"var(--muted)"}}>of {fmtKg(g.totalWeight)}</div>
                        </div>
                      </button>
                      {expandedSKU===g.sku&&(
                        <div style={{marginTop:4,paddingLeft:8}}>
                          {g.batches.map(d=>(
                            <div key={d.id} className="delivery-row" style={{borderRadius:8,marginBottom:4}}
                              onClick={()=>{ setSelectedDel(d); setSubview("deliverydetail"); }}>
                              <div>
                                <div className="delivery-row-name" style={{fontSize:12}}>{d.batchCode}</div>
                                <div className="delivery-row-meta">{d.date}{d.loggedBy?` · ${d.loggedBy}`:""}{d.invoiceNo?` · ${d.invoiceNo}`:""}</div>
                              </div>
                              <div>
                                <div className={`delivery-row-weight ${d.remainingWeight<d.weight*0.2?"yield-lo":""}`}>{fmtKg(d.remainingWeight)} left</div>
                                <div className="delivery-row-cost">of {fmtKg(d.weight)} · ₱{(d.costPerGram*1000).toFixed(2)}/kg</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()
              }
              {finished.length>0&&(
                <button onClick={()=>{ setExpandedSKU(null); setSubview("finished"); }}
                  style={{width:"100%",marginTop:16,background:"transparent",border:"1px solid var(--border2)",borderRadius:8,color:"var(--accent)",fontFamily:"var(--font-mono)",fontSize:12,padding:"12px",cursor:"pointer",letterSpacing:".06em",transition:"all .15s",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border2)"}>
                  <span>📦 Finished Stocks</span>
                  <span style={{color:"var(--muted)"}}>{finished.length} batch{finished.length!==1?"es":""} →</span>
                </button>
              )}
            </>
          }
        </>;
      })()}

      {/* ══ FINISHED STOCKS ══ */}
      {subview==="finished" && (()=>{
        const finished = deliveries.filter(d=>d.remainingWeight<=0);
        // Group by SKU
        const grouped = SKUS.map(sku=>({
          sku,
          batches: finished.filter(d=>d.item===sku).sort((a,b)=>(b.date||"").localeCompare(a.date||"")),
        })).filter(g=>g.batches.length>0);
        return <>
          <div className="page-header">
            <div className="page-header-row">
              <button className="back-btn" onClick={()=>setSubview("list")}>←</button>
              <div className="page-title">Finished Stocks</div>
            </div>
            <div className="page-sub">{finished.length} batch{finished.length!==1?"es":""} fully used</div>
          </div>
          {grouped.map(g=>(
            <div key={g.sku} style={{marginBottom:8}}>
              <button
                onClick={()=>setExpandedSKU(expandedSKU===g.sku?null:g.sku)}
                style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"13px 15px",cursor:"pointer",textAlign:"left",transition:"all .15s",color:"var(--text)",fontFamily:"var(--font-mono)",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="var(--border2)"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                <div>
                  <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:700}}>{g.sku}</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{g.batches.length} finished batch{g.batches.length!==1?"es":""}</div>
                </div>
                <span style={{color:"var(--muted)",fontSize:13}}>{expandedSKU===g.sku?"▲":"▼"}</span>
              </button>
              {expandedSKU===g.sku&&(
                <div style={{marginTop:4,paddingLeft:8}}>
                  {g.batches.map(d=>(
                    <div key={d.id} className="delivery-row" style={{opacity:0.7,borderRadius:8,marginBottom:4}}
                      onClick={()=>{ setSelectedDel(d); setSubview("deliverydetail"); }}>
                      <div>
                        <div className="delivery-row-name" style={{fontSize:12}}>{d.batchCode}</div>
                        <div className="delivery-row-meta">{d.date}{d.invoiceNo?` · ${d.invoiceNo}`:""}</div>
                      </div>
                      <div>
                        <div style={{fontSize:12,color:"var(--red)"}}>Finished</div>
                        <div className="delivery-row-cost">{fmtKg(d.weight)} · ₱{(d.costPerGram*1000).toFixed(2)}/kg</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>;
      })()}

      {/* ══ DELIVERY FORM ══ */}
      {subview==="form" && <>
        <div className="page-header">
          <div className="page-header-row">
            <button className="back-btn" onClick={()=>{ setSubview("list"); clearErr(); }}>←</button>
            <div className="page-title">New Delivery</div>
          </div>
          <div className="page-sub">Log incoming stock</div>
        </div>
        {error && <div className="error-box">⚠ {error}</div>}
        <div className="section-label">Details</div>
        <div className="form-group"><label className="form-label">Delivery Date</label><input className="form-input" type="date" value={form.date||""} onChange={e=>setF("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Invoice No. <span style={{color:"var(--dim)",fontWeight:400}}>(optional)</span></label><input className="form-input" placeholder="e.g. INV-001" value={form.invoiceNo||""} onChange={e=>setF("invoiceNo",e.target.value)}/></div>
        <div className="form-group">
          <label className="form-label">Item / SKU</label>
          <select className="form-select" value={form.item||""} onChange={e=>setF("item",e.target.value)}>
            <option value="">Select item...</option>
            {SKUS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="section-label">Weight &amp; Cost</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Total Weight (g)</label><input className="form-input" type="number" placeholder="0" value={form.weight||""} onChange={e=>setF("weight",+e.target.value)}/></div>
          <div className="form-group"><label className="form-label">Total Cost (₱)</label><input className="form-input" type="number" placeholder="0.00" value={form.cost||""} onChange={e=>setF("cost",+e.target.value)}/></div>
        </div>
        {form.weight>0&&form.cost>0&&<div className="form-hint">Cost/kg: <strong>₱{(form.cost/form.weight*1000).toFixed(2)}</strong></div>}
        <button className="btn-primary" onClick={saveDelivery} disabled={isSaving}>{isSaving?"SAVING...":"SAVE DELIVERY"}</button>
      </>}

      {/* WRITE OFF MODAL */}
      {showWriteOff&&writeOffTarget&&(
        <div className="pin-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setShowWriteOff(false);setWriteOffPin("");} }}>
          <div className="pin-modal">
            <div className="pin-title">Write Off Stock</div>
            <div className="pin-sub" style={{marginBottom:12}}>
              {writeOffTarget.item} · {fmtKg(writeOffTarget.remainingWeight)} remaining
            </div>
            <div className="form-group" style={{marginBottom:16}}>
              <label className="form-label">Reason</label>
              <select className="form-select" value={writeOffReason} onChange={e=>setWriteOffReason(e.target.value)}>
                <option>Spoilage</option>
                <option>Shrinkage</option>
                <option>Loss</option>
                <option>Untracked Trim</option>
                <option>Other</option>
              </select>
            </div>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>
              This will zero out remaining stock and affect actual cost/kg calculations. Enter manager PIN to confirm.
            </div>
            <div className={`pin-dots ${writeOffPinErr?"pin-shake":""}`}>
              {[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<writeOffPin.length?(writeOffPinErr?"error":"filled"):""}`}/>)}
            </div>
            <div className="pin-pad">
              {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k,i)=>
                k===""?<div key={i}/>:(
                  <button key={k} className={`pin-key ${k==="DEL"?"del":""}`} onClick={()=>{
                    if (k==="DEL"){ setWriteOffPin(p=>p.slice(0,-1)); setWriteOffPinErr(false); return; }
                    const next=writeOffPin+k; setWriteOffPin(next);
                    if (next.length===4){
                      if (next===CLEAR_PIN){
                        const wo = {...writeOffTarget, remainingWeight:0, writtenOff:writeOffTarget.remainingWeight, writtenOffBy:logger, writtenOffReason:writeOffReason, writtenOffAt:new Date().toISOString()};
                        saveDoc(COLLECTIONS.deliveries, wo)
                          .catch(()=>setError("Write off failed — check your connection and try again."));
                        setShowWriteOff(false); setWriteOffPin(""); setWriteOffTarget(null);
                        setSelectedDel(deliveries.find(d=>d.id===writeOffTarget.id)||writeOffTarget);
                      } else {
                        setWriteOffPinErr(true);
                        setTimeout(()=>{ setWriteOffPin(""); setWriteOffPinErr(false); },600);
                      }
                    }
                  }}>{k==="DEL"?"⌫":k}</button>
                )
              )}
            </div>
            <button className="pin-cancel" onClick={()=>{ setShowWriteOff(false); setWriteOffPin(""); }}>CANCEL</button>
          </div>
        </div>
      )}

      {/* DELETE DELIVERY PIN MODAL */}
      {showDelDeletePin&&(
        <div className="pin-backdrop" onClick={e=>{ if(e.target===e.currentTarget){setShowDelDeletePin(false);setDelDeletePinEntry("");} }}>
          <div className="pin-modal">
            <div className="pin-title">Delete Batch?</div>
            <div className="pin-sub">This permanently removes the delivery record.</div>
            <div className={`pin-dots ${delDeletePinErr?"pin-shake":""}`}>
              {[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<delDeletePinEntry.length?(delDeletePinErr?"error":"filled"):""}`}/>)}
            </div>
            <div className="pin-pad">
              {["1","2","3","4","5","6","7","8","9","","0","DEL"].map((k,i)=>
                k===""?<div key={i}/>:(
                  <button key={k} className={`pin-key ${k==="DEL"?"del":""}`} onClick={()=>handleDelDeletePinKey(k)}>
                    {k==="DEL"?"⌫":k}
                  </button>
                )
              )}
            </div>
            <button className="pin-cancel" onClick={()=>{ setShowDelDeletePin(false); setDelDeletePinEntry(""); }}>CANCEL</button>
          </div>
        </div>
      )}
    </>
  );
}
