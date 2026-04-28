import React from "react";
import type { InvEntry, PullOutRecord } from "./InventoryTab";
import type { Tab } from "./App";
import { fmtKg } from "./utils";
import { SKUS } from "./data";

interface HomeTabProps {
  deliveries:        any[];
  productions:       any[];
  invEntries:        InvEntry[];
  pendingPortioning: any[];
  currentUser:       any;
  isSuperAdmin:      boolean;
  isAdmin:           boolean;
  currentDate:       string;
  goTab:             (t: Tab, summTab?: "dashboard" | "log") => void;
}

export default function HomeTab({
  deliveries, productions, invEntries,
  pendingPortioning, currentUser, isSuperAdmin, isAdmin,
  currentDate, goTab,
}: HomeTabProps) {
  return (
    <>
      <div style={{fontFamily:"var(--font-head)",fontSize:24,fontWeight:800,marginBottom:4}}>Good day{currentUser?.name?`, ${currentUser.name}`:""}.{isSuperAdmin?" 👑":isAdmin?" 👨‍🍳":""}</div>
      <div style={{fontSize:11,color:"var(--muted)",letterSpacing:"0.08em",marginBottom:20}}>The Black Bean Commissary Prod Dashboard</div>

      {pendingPortioning.length>0 && (
        <div className="alert-banner" onClick={()=>goTab("summary", "log")}>
          <div className="alert-title">⚠ {pendingPortioning.length} batch{pendingPortioning.length>1?"es":""} awaiting portioning</div>
          <div className="alert-items">{pendingPortioning.map(p=>`${p.recipe} · ${p.prodBatchCode}`).join("\n")}</div>
        </div>
      )}

      <div className="section-label">Quick Actions</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        {[
          {icon:"📦",label:"Log Delivery", sub:"Record incoming stock", act:()=>goTab("delivery")},
          {icon:"🗂",label:"Log Inventory",  sub:"Portioned, packed, loose",act:()=>goTab("inventory")},
          {icon:"🔪",label:"Prod", sub:"Single & mixed batches", act:()=>goTab("production")},
          {icon:"📊",label:"Summary",         sub:"Dashboard & logs",       act:()=>goTab("summary")},
        ].map(a=>(
          <button key={a.label} onClick={a.act}
            style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"18px 14px",cursor:"pointer",textAlign:"left",transition:"all .15s",color:"var(--text)",fontFamily:"var(--font-mono)"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
            <div style={{fontSize:22,marginBottom:8}}>{a.icon}</div>
            <div style={{fontFamily:"var(--font-head)",fontSize:13,fontWeight:700,marginBottom:3}}>{a.label}</div>
            <div style={{fontSize:11,color:"var(--muted)"}}>{a.sub}</div>
          </button>
        ))}
      </div>

      {/* ── DAILY SNAPSHOT ── */}
      {(()=>{
        const today     = currentDate;
        const yesterday = new Date(new Date(currentDate).getTime()+86400000*-1).toISOString().slice(0,10);

        // Today vs yesterday productions
        const todayProds = productions.filter(p=>!p.voided&&p.date===today);
        const yestProds  = productions.filter(p=>!p.voided&&p.date===yesterday);
        const prodDiff   = todayProds.length - yestProds.length;

        // Today's pull outs
        const todayPORefs = [...new Set(invEntries.filter(e=>e.type==="out"&&e.date===today&&e.poRef).map(e=>e.poRef))];

        // Stock alerts
        const activeStock = SKUS.map(sku=>({
          sku, rem: deliveries.filter(d=>d.item===sku).reduce((s,d)=>s+d.remainingWeight,0)
        })).filter(x=>x.rem>0);
        const critLow   = activeStock.filter(x=>x.rem<10000);
        const highStock = activeStock.filter(x=>x.rem>30000);

        // Today's deliveries
        const todayDels  = deliveries.filter(d=>d.date===today);
        const yestDels   = deliveries.filter(d=>d.date===yesterday);
        const delDiff    = todayDels.length - yestDels.length;

        // Yesterday's pull outs
        const yestPORefs = [...new Set(invEntries.filter(e=>e.type==="out"&&e.date===yesterday&&e.poRef).map(e=>e.poRef))];
        const poDiff     = todayPORefs.length - yestPORefs.length;

        return <>
          <div className="snapshot-section-label">Today</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>

            {/* Deliveries */}
            <div className="snapshot-card clickable" onClick={()=>goTab("delivery")}>
              <div className="snapshot-val">{todayDels.length}</div>
              <div className="snapshot-lbl">Deliveries</div>
              {(todayDels.length>0||yestDels.length>0)&&(
                <div className={`snapshot-trend ${delDiff>0?"down":delDiff<0?"up":"flat"}`}>
                  {delDiff>0?`↑${delDiff}`:delDiff<0?`↓${Math.abs(delDiff)}`:"="} vs yest
                </div>
              )}
            </div>

            {/* Items Prod */}
            <div className="snapshot-card clickable" onClick={()=>goTab("summary", "log")}>
              <div className="snapshot-val">{todayProds.length}</div>
              <div className="snapshot-lbl">Items Prod</div>
              {(todayProds.length>0||yestProds.length>0)&&(
                <div className={`snapshot-trend ${prodDiff>0?"down":prodDiff<0?"up":"flat"}`}>
                  {prodDiff>0?`↑${prodDiff}`:prodDiff<0?`↓${Math.abs(prodDiff)}`:"="} vs yest
                </div>
              )}
            </div>

            {/* Pull Outs */}
            <div className="snapshot-card clickable" onClick={()=>goTab("inventory")}>
              <div className="snapshot-val">{todayPORefs.length}</div>
              <div className="snapshot-lbl">Pull Outs</div>
              {(todayPORefs.length>0||yestPORefs.length>0)&&(
                <div className={`snapshot-trend ${poDiff>0?"down":poDiff<0?"up":"flat"}`}>
                  {poDiff>0?`↑${poDiff}`:poDiff<0?`↓${Math.abs(poDiff)}`:"="} vs yest
                </div>
              )}
              {todayPORefs.length>0&&(
                <div style={{fontSize:9,color:"var(--muted)",marginTop:2,lineHeight:1.3}}>
                  {todayPORefs.join(" · ")}
                </div>
              )}
            </div>

          </div>

          {/* Manual Count alert for Super Admin */}
        {isSuperAdmin&&(()=>{
          const todayCounts = invEntries
            .filter(e=>e.type==="count"&&e.date===today)
            .sort((a,b)=>b.id-a.id);
          if (!todayCounts.length) return null;
          const withVariance = todayCounts.filter(e=>e.variance!==undefined&&e.variance!==0);
          return (
            <div className="alert-banner" style={{background:"var(--surface2)",borderColor:"var(--accent)",cursor:"pointer"}}
              onClick={()=>goTab("inventory")}>
              <div className="alert-title" style={{color:"var(--accent)"}}>
                {"📋 Manual count submitted"+(withVariance.length>0?" — "+withVariance.length+" with variance":"")}
              </div>
              {withVariance.length===0&&(
                <div className="alert-items" style={{color:"var(--muted)"}}>All items tallied ✓</div>
              )}
            </div>
          );
        })()}

        {(critLow.length>0||highStock.length>0)&&<>
            <div className="snapshot-section-label">Stock Alerts</div>
            <div className="snapshot-card" style={{marginBottom:8,cursor:"pointer"}} onClick={()=>goTab("delivery")}>
              {critLow.map(x=>(
                <div key={x.sku} className="alert-item-row">
                  <span style={{color:"var(--red)"}}>🔴 {x.sku}</span>
                  <span>{fmtKg(x.rem)}</span>
                </div>
              ))}
              {highStock.map(x=>(
                <div key={x.sku} className="alert-item-row">
                  <span style={{color:"var(--amber)"}}>🟡 {x.sku}</span>
                  <span>{fmtKg(x.rem)}</span>
                </div>
              ))}
            </div>
          </>}

          {pendingPortioning.length===0&&todayProds.length===0&&critLow.length===0&&highStock.length===0&&(
            <div style={{textAlign:"center",padding:"20px 0",color:"var(--dim)",fontSize:12}}>No activity yet today.</div>
          )}
        </>;
      })()}
    </>
  );
}
