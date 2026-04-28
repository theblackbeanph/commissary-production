import React, { useState, useEffect, useRef } from "react";
import {
  db, COLLECTIONS, saveDoc, saveBatch, deleteDocument,
  subscribeToCollection,
  auth, getUserInfo, loginWithEmail, logoutUser, onAuthChanged,
  AppUser, UserRole, clearCollection,
  doc, onSnapshot,
} from "./firebase";
import InventoryTab, { InvEntry, PullOutRecord } from "./InventoryTab";
import {
  BUFFER, PROBLEM_YIELD, RISK_HIGH, RISK_LOW, CLEAR_PIN,
  SKUS, SKU_CATEGORY, SKU_CAT_LABELS,
  RECIPES, RECIPE_PROD_TYPE, SKU_RECIPES,
  LOOSE_GUIDE,
  TEAM,
} from "./data";
import {
  todayISO, getTodayLabel, formatDateLabel,
  fmt, fmtKg, yieldCls,
  recipeMatch, genProdBatch,
  toCSV, downloadCSV,
  exportBackup, importBackup,
} from "./utils";

// ── TYPES ──────────────────────────────────────────────────────────────────────
export type Tab = "home" | "delivery" | "production" | "inventory" | "summary";

// ── STORAGE ───────────────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Syne:wght@700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0a0a0a;--surface:#131313;--surface2:#1a1a1a;
    --border:#232323;--border2:#2e2e2e;--text:#f0ede6;
    --muted:#555;--dim:#333;--accent:#e8c547;--accent-bg:#1d1b0e;
    --green:#4ecb71;--green-bg:#0c1f12;--red:#e05a5a;--red-bg:#1f0e0e;
    --amber:#e89047;--font-mono:'DM Mono',monospace;--font-head:'Syne',sans-serif;
  }
  .light{
    --bg:#f5f3ef;--surface:#ffffff;--surface2:#edeae4;
    --border:#ddd8d0;--border2:#ccc7be;--text:#1a1a1a;
    --muted:#888;--dim:#bbb;--accent:#b8941e;--accent-bg:#f5efd6;
    --green:#2a9d4e;--green-bg:#e8f5ec;--red:#c53030;--red-bg:#fde8e8;
    --amber:#c6701a;
  }
  html,body,#root{height:100%}
  body{background:var(--bg);color:var(--text);font-family:var(--font-mono);font-size:14px;-webkit-font-smoothing:antialiased}
  .app{display:flex;flex-direction:column;height:100%;max-width:480px;margin:0 auto;position:relative;background:var(--bg);color:var(--text)}
  @media(min-width:768px){
    .app{max-width:720px}

    .who-overlay{max-width:720px}
    .scroll-area{padding:24px 36px 120px}
    .modal-sheet,.inv-modal,.pin-modal{max-width:560px;margin:0 auto}
    .form-input,.form-select,.form-textarea{font-size:15px;padding:13px 14px}
    .btn-primary{font-size:14px;padding:15px}
    .metrics-row{grid-template-columns:repeat(4,1fr)}
    .delivery-row,.record-card,.batch-card,.rp-card{padding:16px 20px}
    .inv-balance-card{padding:18px 22px}
    .snapshot-row,.inv-action-row{gap:10px}
  }
  @media(min-width:1024px){
    .app{max-width:900px}

    .who-overlay{max-width:900px}
    .scroll-area{padding:32px 60px 120px}
  }

  /* WHO OVERLAY */
  .who-overlay{position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999;padding:32px 24px;max-width:480px;margin:0 auto}
  .who-title{font-family:var(--font-head);font-size:28px;font-weight:800;margin-bottom:6px;text-align:center}
  .who-sub{font-size:12px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:36px;text-align:center}
  .who-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-bottom:24px}
  .who-btn{background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:20px 12px;cursor:pointer;text-align:center;transition:all .15s;color:var(--text);font-family:var(--font-head);font-size:16px;font-weight:700}
  .who-btn:hover{border-color:var(--accent);background:var(--accent-bg)}
  .who-divider{font-size:11px;color:var(--dim);margin-bottom:16px;letter-spacing:.08em}
  .who-custom{display:flex;gap:8px;width:100%}
  .who-input{flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:14px;padding:11px 13px;outline:none;transition:border-color .15s}
  .who-input:focus{border-color:var(--accent)}
  .who-input::placeholder{color:var(--dim)}
  .who-go{background:var(--accent);color:#0a0a0a;border:none;border-radius:8px;font-family:var(--font-head);font-size:13px;font-weight:700;padding:11px 18px;cursor:pointer;transition:background .15s}
  .who-go:hover{background:#f5d55c}

  /* TOPBAR */
  .topbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--border);z-index:100;box-sizing:border-box}
  .topbar-logo{font-family:var(--font-head);font-size:18px;font-weight:800;letter-spacing:.1em}
  .topbar-logo em{color:var(--accent);font-style:normal}
  .topbar-right{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
  .topbar-date{font-size:11px;color:var(--muted);letter-spacing:.08em}
  .topbar-user{font-size:11px;color:var(--accent);letter-spacing:.08em;cursor:pointer}
  .topbar-user:hover{text-decoration:underline}
  .saved-flash{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--green);letter-spacing:.1em;animation:fadeIn .2s ease}
  .update-banner{background:var(--accent);color:#111;text-align:center;padding:10px 16px;font-size:12px;font-weight:600;letter-spacing:.04em;cursor:pointer;font-family:var(--font-mono)}
  .theme-toggle{background:none;border:none;cursor:pointer;font-size:16px;padding:4px;line-height:1;opacity:.7;transition:opacity .15s}
  .theme-toggle:hover{opacity:1}
  @keyframes fadeIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

  /* LAYOUT */
  .scroll-area{flex:1;overflow-y:auto;padding:24px 20px 32px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
  .scroll-area::-webkit-scrollbar{width:4px}
  .scroll-area::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}

  /* BOTTOM NAV */
  .bottom-nav{flex-shrink:0;display:flex;background:var(--surface);border-top:1px solid var(--border);z-index:100;box-sizing:border-box}
  .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0 14px;cursor:pointer;border:none;background:transparent;color:var(--muted);font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;transition:color .15s;position:relative}
  .nav-item.active{color:var(--accent)}
  .nav-item.active::before{content:'';position:absolute;top:0;left:20%;right:20%;height:2px;background:var(--accent);border-radius:0 0 2px 2px}
  .nav-icon{font-size:18px;line-height:1}

  /* PAGE HEADER */
  .page-header{margin-bottom:24px}
  .page-header-row{display:flex;align-items:center;gap:12px}
  .back-btn{width:34px;height:34px;border-radius:8px;background:var(--surface2);border:1px solid var(--border2);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
  .back-btn:hover{border-color:var(--muted);color:var(--text)}
  .page-title{font-family:var(--font-head);font-size:24px;font-weight:800}
  .page-sub{font-size:11px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-top:4px;padding-left:46px}

  /* SECTION LABEL */
  .section-label{font-size:10px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px;margin-top:24px}
  .section-label:first-child{margin-top:0}

  /* FORM */
  .form-group{margin-bottom:12px}
  .form-label{display:block;font-size:10px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
  .form-input{width:100%;background:var(--surface);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:14px;padding:11px 13px;outline:none;transition:border-color .15s,background .15s}
  .form-input:focus{border-color:var(--accent);background:var(--accent-bg)}
  .form-input::placeholder{color:var(--dim)}
  .form-select{width:100%;background:var(--surface);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:14px;padding:11px 13px;outline:none;transition:border-color .15s;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23555' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center}
  .form-select:focus{border-color:var(--accent)}
  .form-select option{background:var(--surface2);color:var(--text)}
  .form-textarea{width:100%;background:var(--surface);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:13px;padding:11px 13px;outline:none;transition:border-color .15s;resize:none;line-height:1.5}
  .form-textarea:focus{border-color:var(--accent)}
  .form-textarea::placeholder{color:var(--dim)}
  input[type="date"]{width:100%;min-width:0;box-sizing:border-box;-webkit-appearance:none;appearance:none}
  input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(.35);cursor:pointer;flex-shrink:0}
  .form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .form-hint{text-align:right;font-size:11px;color:var(--muted);margin-top:-6px;margin-bottom:10px}
  .form-hint strong{color:var(--accent)}

  /* BUTTONS */
  .btn-primary{width:100%;background:var(--accent);color:#0a0a0a;border:none;border-radius:9px;font-family:var(--font-head);font-size:14px;font-weight:700;letter-spacing:.1em;padding:14px;cursor:pointer;margin-top:10px;transition:all .15s}
  .btn-primary:hover{background:#f5d55c;transform:translateY(-1px)}
  .btn-ghost{width:100%;background:transparent;color:var(--text);border:1px solid var(--border2);border-radius:8px;font-family:var(--font-mono);font-size:12px;padding:10px;cursor:pointer;margin-top:6px;transition:all .15s;letter-spacing:.06em}
  .btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
  .btn-danger{width:100%;background:transparent;color:var(--red);border:1px solid #3d1a1a;border-radius:8px;font-family:var(--font-mono);font-size:12px;padding:10px;cursor:pointer;margin-top:6px;transition:all .15s;letter-spacing:.06em}
  .btn-danger:hover{background:var(--red-bg);border-color:var(--red)}
  .export-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
  .btn-export{background:transparent;color:var(--green);border:1px solid #1a3d26;border-radius:8px;font-family:var(--font-mono);font-size:12px;padding:10px;cursor:pointer;transition:all .15s;letter-spacing:.06em}
  .btn-export:hover{background:var(--green-bg);border-color:var(--green)}

  /* ERROR */
  .error-box{background:var(--red-bg);border:1px solid #3d1a1a;border-radius:8px;padding:10px 13px;font-size:12px;color:var(--red);margin-bottom:16px;display:flex;align-items:center;gap:8px}

  /* DAILY SNAPSHOT */
  .snapshot-section{margin-bottom:20px}
  .snapshot-section-label{font-size:10px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;margin-top:20px}
  .snapshot-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  .snapshot-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 15px}
  .snapshot-card.full{grid-column:1/-1}
  .snapshot-card.clickable{cursor:pointer;transition:border-color .15s}
  .snapshot-card.clickable:hover{border-color:var(--border2)}
  .snapshot-val{font-family:var(--font-head);font-size:22px;font-weight:800;color:var(--accent);line-height:1}
  .snapshot-val.green{color:var(--green)}
  .snapshot-val.red{color:var(--red)}
  .snapshot-val.amber{color:var(--amber)}
  .snapshot-lbl{font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-top:5px}
  .snapshot-sub{font-size:11px;color:var(--muted);margin-top:3px}
  .snapshot-trend{font-size:11px;margin-top:4px}
  .snapshot-trend.up{color:var(--red)}
  .snapshot-trend.down{color:var(--green)}
  .snapshot-trend.flat{color:var(--muted)}
  .alert-item-row{font-size:11px;padding:3px 0;display:flex;justify-content:space-between}
  .alert-item-row span{color:var(--muted)}

  /* ALERT BANNER */
  .alert-banner{background:var(--accent-bg);border:1px solid #3d3a1a;border-radius:10px;padding:12px 14px;margin-bottom:16px;cursor:pointer;transition:border-color .15s}
  .alert-banner:hover{border-color:var(--accent)}
  .alert-title{font-size:12px;color:var(--accent);font-weight:500;margin-bottom:4px;letter-spacing:.06em}
  .alert-items{font-size:11px;color:var(--muted);line-height:1.7}

  /* FILTER PILLS */
  .filter-row{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}
  .filter-pill{font-size:11px;padding:6px 12px;border-radius:20px;border:1px solid var(--border2);color:var(--muted);background:transparent;cursor:pointer;font-family:var(--font-mono);letter-spacing:.06em;transition:all .15s}
  .filter-pill.active{background:var(--accent);color:#0a0a0a;border-color:var(--accent);font-weight:600}

  /* STAT STRIP */
  .stat-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 10px;text-align:center}
  .stat-value{font-family:var(--font-head);font-size:22px;font-weight:800;color:var(--accent);line-height:1}
  .stat-label{font-size:9px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-top:5px}

  /* INVENTORY VALUE */
  .inv-value-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
  .inv-value-label{font-size:12px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
  .inv-value-amount{font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--accent)}

  /* SKU BREAKDOWN CARD */
  .sku-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 15px;margin-bottom:8px}
  .sku-card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .sku-card-name{font-family:var(--font-head);font-size:14px;font-weight:700}
  .sku-card-stock{font-size:12px;color:var(--accent);font-weight:500}
  .sku-metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .sku-metric{background:var(--surface2);border-radius:7px;padding:8px 10px}
  .sku-metric-val{font-size:13px;color:var(--text)}
  .sku-metric-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:2px}

  /* PROBLEM / RISK CARDS */
  .problem-card{background:var(--red-bg);border:1px solid #3d1a1a;border-radius:10px;padding:12px 14px;margin-bottom:6px}
  .problem-title{font-size:12px;color:var(--red);font-weight:500;margin-bottom:6px;letter-spacing:.06em}
  .problem-item{font-size:12px;color:#e09090;margin-bottom:3px}
  .risk-card{border-radius:10px;padding:12px 14px;margin-bottom:6px}
  .risk-high{background:#1a0e0e;border:1px solid #3d1a1a}
  .risk-low{background:var(--accent-bg);border:1px solid #3d3a1a}
  .risk-title{font-size:12px;font-weight:500;margin-bottom:6px;letter-spacing:.06em}
  .risk-high .risk-title{color:var(--red)}
  .risk-low .risk-title{color:var(--accent)}
  .risk-item{font-size:12px;margin-bottom:3px}
  .risk-high .risk-item{color:#e09090}
  .risk-low .risk-item{color:#c8a840}

  /* DATE GROUP */
  .date-group{margin-bottom:6px}
  .date-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:0 2px}
  .date-label{font-size:10px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
  .date-mini-stats{display:flex;gap:12px}
  .dms{font-size:11px;font-family:var(--font-mono)}
  .dms.cost{color:var(--accent)}
  .date-divider{border:none;border-top:1px solid var(--border);margin:14px 0}

  /* BATCH CARD */
  .batch-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:15px 16px;margin-bottom:8px}
  .batch-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .batch-name{font-family:var(--font-head);font-size:16px;font-weight:700}
  .batch-code{font-size:11px;color:var(--accent);letter-spacing:.1em;margin-top:2px;font-style:italic}
  .batch-pill{font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid var(--border2);color:#aaa;white-space:nowrap}
  .batch-pill.low{border-color:#3d1a1a;color:var(--red);background:var(--red-bg)}
  .batch-divider{border:none;border-top:1px solid var(--border);margin:12px 0}

  /* MINI INPUTS */
  .mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}
  .mini-input{background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:var(--font-mono);font-size:13px;padding:9px 11px;outline:none;width:100%;transition:border-color .15s}
  .mini-input:focus{border-color:var(--accent)}
  .mini-input::placeholder{color:var(--dim)}
  .mini-stats{display:flex;gap:16px;font-size:11px;color:var(--muted);padding-top:2px}
  .mini-stats b{color:var(--text)}

  /* DELIVERY ROW */
  .delivery-row{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:var(--surface);border:1px solid var(--border);border-radius:9px;margin-bottom:6px;cursor:pointer;transition:border-color .15s}
  .delivery-row:hover{border-color:var(--border2)}
  .delivery-row-name{font-size:13px;font-weight:500}
  .delivery-row-meta{font-size:11px;color:var(--muted);margin-top:2px;font-style:italic}
  .delivery-row-weight{font-size:13px;color:var(--text);text-align:right}
  .delivery-row-cost{font-size:11px;color:var(--muted);margin-top:2px;text-align:right}

  /* RECORD CARD */
  .record-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 15px;margin-bottom:8px;cursor:pointer;transition:border-color .15s}
  .record-card:hover{border-color:var(--border2)}
  .record-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .record-name{font-family:var(--font-head);font-size:15px;font-weight:700}
  .record-meta{font-size:11px;color:var(--muted);margin-top:2px;font-style:italic}
  .record-cost{font-size:15px;color:var(--accent);font-weight:500;text-align:right}
  .record-cpu{font-size:10px;color:var(--muted);margin-top:2px;text-align:right}
  .metrics-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .metric{background:var(--surface2);border-radius:7px;padding:7px 6px;text-align:center}
  .metric-val{font-size:13px;color:var(--text)}
  .metric-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:3px}
  .record-notes{font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-style:italic;line-height:1.5}
  .record-logger{font-size:10px;color:var(--dim);margin-top:6px;letter-spacing:.06em}
  .record-pending{display:inline-block;font-size:10px;color:var(--amber);border:1px solid #3d2a0e;background:#1f1508;border-radius:20px;padding:2px 8px;margin-top:6px;letter-spacing:.06em}
  .prod-batch-code{font-size:11px;color:var(--accent);font-weight:500;letter-spacing:.08em;margin-top:2px}
  .yield-hi{color:var(--green)!important}
  .yield-mid{color:var(--amber)!important}
  .yield-lo{color:var(--red)!important}

  /* INGREDIENTS TAG LIST */
  .ingr-list{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .ingr-tag{font-size:10px;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;letter-spacing:.04em}

  /* PORTIONING */
  .portioning-box{background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:14px;margin-top:12px}
  .portioning-title{font-family:var(--font-head);font-size:13px;font-weight:700;margin-bottom:10px;color:var(--accent);letter-spacing:.04em}
  .portion-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px}
  .portion-key{color:var(--muted)}
  .portion-val{color:var(--text)}
  .portion-flag{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:500}
  .flag-ok{background:var(--green-bg);color:var(--green);border:1px solid #1a3d26}
  .flag-warn{background:var(--accent-bg);color:var(--accent);border:1px solid #3d3a1a}
  .flag-bad{background:var(--red-bg);color:var(--red);border:1px solid #3d1a1a}

  /* USED-IN LIST (delivery detail) */
  .used-in-row{display:flex;justify-content:space-between;font-size:12px;padding:7px 0;border-bottom:1px solid var(--border)}
  .used-in-row:last-child{border-bottom:none}
  .used-in-code{color:var(--accent);font-style:italic;font-size:11px}

  /* RECIPE CARDS */
  .recipe-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
  .recipe-name{font-size:13px;font-weight:500}
  .recipe-sku{font-size:11px;color:var(--muted);margin-top:3px;font-style:italic}
  .recipe-portion{font-size:13px;color:var(--accent);font-family:var(--font-mono)}

  /* MODAL */
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:400;display:flex;align-items:flex-end;justify-content:center;padding:0}
  .modal-sheet{background:var(--surface);border-radius:16px 16px 0 0;padding:20px 20px 40px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto}
  .modal-handle{width:36px;height:3px;background:var(--border2);border-radius:2px;margin:0 auto 20px}
  .modal-title{font-family:var(--font-head);font-size:20px;font-weight:800;margin-bottom:4px}
  .modal-sub{font-size:11px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:20px}

  /* YIELD HISTORY */
  .yh-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 15px;margin-bottom:8px}
  .yh-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .yh-name{font-family:var(--font-head);font-size:15px;font-weight:700}
  .yh-runs{font-size:11px;color:var(--muted);margin-top:2px}
  .trend-badge{font-size:11px;padding:4px 10px;border-radius:20px;font-weight:500;white-space:nowrap}
  .trend-up{background:#0c1f12;color:var(--green);border:1px solid #1a3d26}
  .trend-dn{background:var(--red-bg);color:var(--red);border:1px solid #3d1a1a}
  .trend-flat{background:var(--accent-bg);color:var(--accent);border:1px solid #3d3a1a}
  .yh-divider{border:none;border-top:1px solid var(--border);margin:10px 0}
  .yh-stats{display:flex;flex-direction:column;gap:4px}
  .yh-stat-row{display:flex;justify-content:space-between;font-size:12px}
  .yh-stat-key{color:var(--muted)}
  .yh-stat-val{color:var(--text)}

  /* PIN */
  .pin-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px}
  .pin-modal{background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:28px 24px;width:100%;max-width:320px}
  .pin-title{font-family:var(--font-head);font-size:18px;font-weight:800;margin-bottom:6px}
  .pin-sub{font-size:12px;color:var(--muted);margin-bottom:24px;line-height:1.5}
  .pin-dots{display:flex;justify-content:center;gap:14px;margin-bottom:20px}
  .pin-dot{width:14px;height:14px;border-radius:50%;border:1px solid var(--border2);background:transparent;transition:all .15s}
  .pin-dot.filled{background:var(--accent);border-color:var(--accent)}
  .pin-dot.error{background:var(--red);border-color:var(--red)}
  .pin-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .pin-key{background:var(--surface2);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font-head);font-size:18px;font-weight:700;padding:16px;cursor:pointer;transition:all .12s}
  .pin-key:hover{background:var(--border2)}
  .pin-key:active{transform:scale(.95)}
  .pin-key.del{font-size:14px;color:var(--muted)}
  .pin-cancel{width:100%;background:transparent;border:none;color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:10px;cursor:pointer;letter-spacing:.06em}
  .pin-cancel:hover{color:var(--text)}
  @keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
  .pin-shake{animation:pinShake .35s ease}

  /* VOIDED */
  .voided-banner{background:#1a0808;border:1px solid #5c1a1a;border-radius:8px;padding:10px 14px;font-size:12px;color:var(--red);margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .record-card.voided{opacity:0.45;border-color:#2a1a1a}
  .voided-tag{display:inline-block;font-size:10px;color:var(--red);border:1px solid #3d1a1a;background:var(--red-bg);border-radius:20px;padding:2px 8px;margin-top:4px;letter-spacing:.06em}

  /* EMPTY */
  .empty{text-align:center;padding:52px 16px;color:var(--dim)}
  .empty-icon{font-size:40px;margin-bottom:12px}
  .empty-text{font-size:12px;letter-spacing:.08em;line-height:1.7}

  /* RECIPE PERFORMANCE */
  .rp-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 15px;margin-bottom:8px}
  .rp-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .rp-name{font-family:var(--font-head);font-size:14px;font-weight:700}
  .rp-runs{font-size:11px;color:var(--muted);margin-top:2px}
  .rp-avg{font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--accent);text-align:right}
  .rp-avg-lbl{font-size:9px;color:var(--muted);text-align:right;margin-top:2px;letter-spacing:.08em;text-transform:uppercase}
  .rp-divider{border:none;border-top:1px solid var(--border);margin:10px 0}
  .rp-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px}
  .rp-key{color:var(--muted)}
  .rp-val{color:var(--text)}

  /* TARGET YIELD EDITOR */
  .target-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)}
  .target-row:last-child{border-bottom:none}
  .target-sku{font-size:13px;color:var(--text)}
  .target-input{width:72px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:13px;padding:6px 8px;outline:none;text-align:right;transition:border-color .15s}
  .target-input:focus{border-color:var(--accent)}

  /* BACKUP */
  .backup-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
  .btn-backup{background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:10px;cursor:pointer;transition:all .15s;letter-spacing:.06em;text-align:center}
  .btn-backup:hover{border-color:var(--accent);color:var(--accent)}
  .backup-error{font-size:11px;color:var(--red);margin-top:6px}

  .inv-subtab-row{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}
  .inv-subtab{font-size:11px;padding:6px 12px;border-radius:20px;border:1px solid var(--border2);color:var(--muted);background:transparent;cursor:pointer;font-family:var(--font-mono);letter-spacing:.06em;transition:all .15s;white-space:nowrap}
  .inv-subtab.active{background:var(--accent);color:#0a0a0a;border-color:var(--accent);font-weight:600}
  .inv-subtab.pullout{border-color:#3d3a1a;color:var(--accent)}
  .inv-subtab.pullout.active{background:var(--accent);color:#0a0a0a}

  .inv-balance-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 15px;margin-bottom:8px}
  .inv-balance-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .inv-balance-name{font-family:var(--font-head);font-size:14px;font-weight:700}
  .inv-balance-end{font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--accent);text-align:right}
  .inv-balance-unit{font-size:9px;color:var(--muted);text-align:right;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
  .inv-metrics-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
  .inv-metric{background:var(--surface2);border-radius:7px;padding:7px 6px;text-align:center}
  .inv-metric-val{font-size:13px;color:var(--text)}
  .inv-metric-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:3px}

  .inv-action-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .inv-action-btn{background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:11px;padding:8px 4px;cursor:pointer;transition:all .15s;letter-spacing:.04em;text-align:center}
  .inv-action-btn:hover{border-color:var(--accent);color:var(--accent)}
  .inv-action-btn.in-btn{border-color:#1a3d26;color:var(--green)}
  .inv-action-btn.in-btn:hover{background:var(--green-bg)}
  .inv-action-btn.sunday{border-color:#3d3a1a;color:var(--accent);background:var(--accent-bg)}
  .inv-action-btn.sunday:hover{background:#2a2708}

  .inv-variance-pos{color:var(--green)!important}
  .inv-variance-neg{color:var(--red)!important}
  .inv-variance-zero{color:var(--muted)!important}

  .inv-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:300;display:flex;align-items:flex-end;justify-content:center}
  .inv-modal{background:var(--surface);border-radius:16px 16px 0 0;padding:20px 20px 40px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto}
  .inv-modal-handle{width:36px;height:3px;background:var(--border2);border-radius:2px;margin:0 auto 20px}
  .inv-modal-title{font-family:var(--font-head);font-size:18px;font-weight:800;margin-bottom:4px}
  .inv-modal-sub{font-size:11px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:20px}

  .inv-history-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
  .inv-history-row:last-child{border-bottom:none}
  .inv-history-type-in{color:var(--green)}
  .inv-history-type-out{color:var(--red)}
  .inv-history-type-count{color:var(--accent)}

  .inv-export-bar{margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}

  /* PULL OUT */
  .po-section-label{font-size:10px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;margin-top:20px}
  .po-section-label:first-of-type{margin-top:0}
  .po-item-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:6px}
  .po-item-name{font-size:13px;font-weight:500;flex:1}
  .po-item-unit{font-size:11px;color:var(--text);margin-left:4px;font-weight:500}
  .po-qty-input{width:72px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:14px;font-weight:600;padding:7px 8px;outline:none;text-align:right;transition:border-color .15s;-moz-appearance:textfield}
  .po-qty-input:focus{border-color:var(--accent)}
  .po-qty-input::placeholder{color:var(--dim)}
  .po-qty-input::-webkit-outer-spin-button,.po-qty-input::-webkit-inner-spin-button{-webkit-appearance:none}

  .po-history-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:border-color .15s}
  .po-history-card:hover{border-color:var(--border2)}
  .po-history-ref{font-family:var(--font-head);font-size:13px;font-weight:700;color:var(--accent)}
  .po-history-meta{font-size:11px;color:var(--muted);margin-top:2px}
  .po-summary-badge{display:inline-block;font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:2px 8px;margin-top:6px;color:var(--muted)}`;

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<"dark"|"light">(()=>(localStorage.getItem("commissary_theme") as "dark"|"light")||"dark");
  const toggleTheme = () => { const next = theme==="dark"?"light":"dark"; setTheme(next); localStorage.setItem("commissary_theme",next); };
  const [currentUser,  setCurrentUser] = useState<AppUser|null>(null);
  const [currentDate,  setCurrentDate] = useState(todayISO());
  const [todayLabel,   setTodayLabel]  = useState(getTodayLabel());
  const [authReady,    setAuthReady]   = useState(false);
  const [loginEmail,   setLoginEmail]  = useState("");
  const [loginPassword,setLoginPassword]= useState("");
  const [loginError,   setLoginError]  = useState("");
  const [loginLoading, setLoginLoading]= useState(false);
  const [customName,   setCustomName]  = useState("");
  const [tab,          setTab]         = useState<"home"|"delivery"|"production"|"inventory"|"summary">("home");
  const [subview,      setSubview]     = useState<"list"|"form"|"single"|"mixed"|"split"|"batchdetail"|"deliverydetail"|"finished">("list");
  const [deliveries,   setDeliveries]  = useState<any[]>([]);
  const [productions,  setProductions] = useState<any[]>([]);
  const [form,         setForm]        = useState<any>({});
  const [error,        setError]       = useState("");
  const [saved,        setSaved]       = useState(false);
  const [summTab,      setSummTab]     = useState<"dashboard"|"log">("dashboard");
  const [logRange,     setLogRange]    = useState<"today"|"week"|"month"|"all">("week");
  const [logRecipe,    setLogRecipe]   = useState<string>("all");
  const [skuCatTab,    setSkuCatTab]   = useState<"beef"|"poultry"|"pork"|"seafood"|"others">("beef");
  const [selectedProd, setSelectedProd]= useState<any>(null);
  const [selectedDel,  setSelectedDel] = useState<any>(null);
  const [portionInput,  setPortionInput]  = useState("");
  const [editPortions,  setEditPortions]  = useState(false);
  const [editPortionVal,setEditPortionVal]= useState("");
  const [voidPin,       setVoidPin]       = useState(false);
  const [voidPinEntry,  setVoidPinEntry]  = useState("");
  const [voidPinError,  setVoidPinError]  = useState(false);
  const [voidTarget,    setVoidTarget]     = useState<any>(null);
  const [showRecipes,       setShowRecipes]       = useState(false);
  const [showPortionGuide,  setShowPortionGuide]  = useState(false);
  const [showPOReport,  setShowPOReport] = useState(false);
  const [poRepStart,    setPORepStart]   = useState("");
  const [poRepEnd,      setPORepEnd]     = useState("");
  const [showPin,      setShowPin]     = useState(false);
  const [pinEntry,     setPinEntry]    = useState("");
  const [pinError,     setPinError]    = useState(false);
  const [dashRange,    setDashRange]    = useState<"7"|"30"|"90"|"all">("30");
  const [backupError,  setBackupError]  = useState("");
  const [showFinished,  setShowFinished]  = useState(false);
  const [expandedSKU,   setExpandedSKU]   = useState<string|null>(null);
  const [showWriteOff,  setShowWriteOff]  = useState(false);
  const [showBackupPin, setShowBackupPin] = useState(false);
  const [backupPinMode, setBackupPinMode] = useState<"export"|"restore">("export");
  const [backupPinEntry,setBackupPinEntry]= useState("");
  const [backupPinErr,  setBackupPinErr]  = useState(false);
  const [restoreFile,   setRestoreFile]   = useState<File|null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [writeOffTarget,setWriteOffTarget]= useState<any>(null);
  const [writeOffReason,setWriteOffReason]= useState("Spoilage");
  const [writeOffPin,   setWriteOffPin]   = useState("");
  const [writeOffPinErr,setWriteOffPinErr]= useState(false);
  const [invEntries,    setInvEntries]    = useState<InvEntry[]>([]);
  const [pullOuts,      setPullOuts]      = useState<PullOutRecord[]>([]);
  const [fbReady,       setFbReady]       = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  // ── DELIVERY EDIT / DELETE STATE ──────────────────────────────────────────
  const [showDelEdit,       setShowDelEdit]       = useState(false);
  const [delEditCost,       setDelEditCost]       = useState("");
  const [delEditInvoice,    setDelEditInvoice]    = useState("");
  const [showDelDeletePin,  setShowDelDeletePin]  = useState(false);
  const [delDeletePinEntry, setDelDeletePinEntry] = useState("");
  const [delDeletePinErr,   setDelDeletePinErr]   = useState(false);
  // ── SPLIT PRODUCTION STATE ────────────────────────────────────────────────
  const [splitSku,     setSplitSku]     = useState("");
  const [splitBatches, setSplitBatches] = useState<Record<number,{raw:string,trim:string}>>({});
  const [splitRecipes, setSplitRecipes] = useState<{recipe:string,ep:string,cooked?:string}[]>([{recipe:"",ep:""}]);

  // ── ROLE HELPERS ───────────────────────────────────────────────────────
  const role           = currentUser?.role ?? "viewer";
  const isSuperAdmin   = role === "superadmin";
  const isAdmin        = role === "admin" || role === "superadmin";
  const isViewer       = role === "viewer";
  const canEditInv     = isAdmin || (isSuperAdmin && currentUser?.inventoryAdmin === true);
  const logger         = currentUser?.name || "";

  // ── DATE REFRESH — checks every minute, resets at midnight ─────────────
  useEffect(()=>{
    const tick = setInterval(()=>{
      const newDate = todayISO();
      if (newDate !== currentDate){
        setCurrentDate(newDate);
        setTodayLabel(getTodayLabel());
      }
    }, 60000); // check every minute
    return ()=>clearInterval(tick);
  },[currentDate]);

  // ── FIREBASE AUTH LISTENER ───────────────────────────────────────────────
  useEffect(()=>{
    const unsub = onAuthChanged(user=>{
      if (user) {
        const info = getUserInfo(user.email);
        setCurrentUser(info);
      } else {
        setCurrentUser(null);
      }
      setAuthReady(true);
    });
    return ()=>unsub();
  },[]);

  // ── FIREBASE: onSnapshot is the ONLY source of truth ───────────────────
  // All mutations write ONLY to Firestore. onSnapshot updates local state.
  // Never update local state directly for persistent data.

  // ── APP VERSION — bump in Firestore settings/appVersion to notify users ───
  const APP_VERSION = 3.5;
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(()=>{
    const ref = doc(db, COLLECTIONS.settings, "appVersion");
    const unsub = onSnapshot(ref, snap => {
      const data = snap.data();
      if (data?.version && data.version > APP_VERSION) setUpdateAvailable(true);
    });
    return ()=>unsub();
  },[]);

  // ── FIREBASE: real-time listeners ────────────────────────────────────────
  useEffect(()=>{
    setFbReady(true);
    const unsubs = [
      subscribeToCollection(COLLECTIONS.deliveries,  docs=>setDeliveries(docs)),
      subscribeToCollection(COLLECTIONS.productions, docs=>setProductions(docs)),
      subscribeToCollection(COLLECTIONS.invEntries,  docs=>setInvEntries(()=>docs as InvEntry[])),
      subscribeToCollection(COLLECTIONS.pullOuts,    docs=>setPullOuts(()=>docs as PullOutRecord[])),
    ];
    return ()=>unsubs.forEach(u=>u());
  },[]);
  useEffect(()=>{
    if (!deliveries.length && !productions.length) return;
    setSaved(true);
    const t = setTimeout(()=>setSaved(false),1800);
    return ()=>clearTimeout(t);
  },[deliveries,productions]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const setF     = (k:string,v:any) => setForm((p:any)=>({...p,[k]:v}));
  const clearErr = () => setError("");
  const goTab    = (t: Tab, summTabOverride?: "dashboard" | "log") => {
    setTab(t);
    if (summTabOverride) setSummTab(summTabOverride);
    setTimeout(() => { scrollRef.current?.scrollTo({ top: 0 }); }, 0);
  };

  const pendingPortioning = productions.filter(p=>{
    if (p.voided) return false;
    const recipe = RECIPES.find(r=>r.name===p.recipe);
    if (!recipe||recipe.portionG===null) return false;
    if (p.actualPortions!==undefined) return false;
    // Exclude if EP is 0 (bad data — trim >= raw)
    const ep = p.ep||Math.max(0,(p.raw||0)-(p.trim||0));
    if (ep<=0) return false;
    return true;
  });

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

  // ── SINGLE PRODUCTION ──────────────────────────────────────────────────────
  const handleSingle = (batch: any) => {
    const raw=+form.raw||0, trim=+form.trim||0, cooked=+form.cooked||0;
    const ep = Math.max(0, raw - trim); // auto-calculated
    const rec = RECIPES.find(r=>r.name===form.recipe);
    const prodType = rec ? (RECIPE_PROD_TYPE[rec.name]||"portion") : "portion";
    const outputW = prodType==="cooked" ? cooked : ep;
    if (!form.date||!raw){ setError("Fill in date and raw weight."); return; }
    if (!form.prodBy){ setError("Please select who produced this batch."); return; }
    if (prodType==="cooked"&&!cooked){ setError("Fill in cooked weight for cooked production."); return; }
    if (raw>Math.floor(batch.remainingWeight)){ setError("Exceeds remaining stock."); return; }
    if (trim>=raw){ setError("Trim loss cannot be equal to or greater than raw weight."); return; }
    if (prodType==="cooked"&&cooked>ep){ setError("Cooked weight cannot exceed EP weight."); return; }
    const expPortions = rec?.portionG && outputW>0 ? (prodType==="cooked"?(outputW*(1-BUFFER))/rec.portionG : outputW/rec.portionG) : 0;
    const portionsDisabled = expPortions<1;
    const prodBatchCode = genProdBatch(form.recipe||"PROD", productions);
    const updatedBatch = {...batch, remainingWeight:batch.remainingWeight-raw, usedIn:[...(batch.usedIn||[]),{prodBatchCode, recipe:form.recipe||null, rawUsed:raw, date:form.date}]};
    const newSingleProd = {
      id:Date.now(), date:form.date,
      prodBatchCode,
      recipe:form.recipe||null,
      prodType,
      ingredients:[{ deliveryBatchCode:batch.batchCode, item:batch.item, raw, trim, ep, cooked:prodType==="cooked"?cooked:0, cost:raw*batch.costPerGram, costPerGram:batch.costPerGram }],
      raw, trim, ep, cooked:prodType==="cooked"?cooked:0,
      yield: raw>0 ? outputW/raw : 0,
      cost:raw*batch.costPerGram,
      costPerCooked: prodType==="cooked"&&cooked>0 ? (raw*batch.costPerGram)/cooked : null,
      expectedPortions: portionsDisabled ? 0 : expPortions,
      portionsDisabled,
      notes:form.notes||"",
      loggedBy:logger,
      prodBy:form.prodBy||"",
    };
    Promise.all([
      saveDoc(COLLECTIONS.deliveries, updatedBatch),
      saveDoc(COLLECTIONS.productions, newSingleProd),
    ]).catch(()=>setError("Save failed — check your connection and try again."));
    setForm({}); clearErr(); setSubview("list");
  };

  // ── MIXED PRODUCTION ───────────────────────────────────────────────────────
  const handleMixed = () => {
    const recipe = form.recipe;
    if (!recipe){ setError("No recipe selected."); return; }
    if (!form.date){ setError("Select a production date."); return; }
    if (!form.prodBy){ setError("Please select who produced this batch."); return; }
    const rec = RECIPES.find(r=>r.name===recipe);
    const prodType = rec ? (RECIPE_PROD_TYPE[rec.name]||"portion") : "portion";
    // Single cooked weight at batch level (cooked production only)
    const batchCooked = prodType==="cooked" ? +(form.cooked||0) : 0;
    if (prodType==="cooked"&&!batchCooked){ setError("Enter the total cooked output for this batch."); return; }
    const ingredients: any[] = [];
    const updatedDeliveries = [...deliveries];
    for (const d of deliveries) {
      const data = form[d.id];
      if (!data?.raw) continue;
      const raw=+data.raw, trim=+(data.trim||0);
      const ep = Math.max(0, raw - trim); // auto-calculated
      if (raw>Math.floor(d.remainingWeight)){ setError(`"${d.item}" exceeds remaining stock.`); return; }
      if (trim>=raw){ setError(`Trim loss cannot exceed raw weight for "${d.item}".`); return; }
      ingredients.push({ deliveryBatchCode:d.batchCode, item:d.item, raw, trim, ep, cost:raw*d.costPerGram, costPerGram:d.costPerGram });
      const idx = updatedDeliveries.findIndex(x=>x.id===d.id);
      if (idx>=0) updatedDeliveries[idx]={...updatedDeliveries[idx], remainingWeight:updatedDeliveries[idx].remainingWeight-raw};
    }
    if (!ingredients.length){ setError("Enter weights for at least one ingredient."); return; }
    const prodBatchCode = genProdBatch(recipe, productions);
    const finalDeliveries = updatedDeliveries.map(d=>{
      const ingr = ingredients.find(i=>i.deliveryBatchCode===d.batchCode);
      if (!ingr) return d;
      return {...d, usedIn:[...(d.usedIn||[]),{prodBatchCode, recipe, rawUsed:ingr.raw, date:form.date}]};
    });
    const totalRaw  = ingredients.reduce((s,i)=>s+i.raw,0);
    const totalEP   = ingredients.reduce((s,i)=>s+i.ep,0);
    const totalCost = ingredients.reduce((s,i)=>s+i.cost,0);
    const outputW   = prodType==="cooked" ? batchCooked : totalEP;
    const expPortions = rec?.portionG&&outputW>0 ? (prodType==="cooked"?(outputW*(1-BUFFER))/rec.portionG : outputW/rec.portionG) : 0;
    const portionsDisabled = expPortions<1;
    const newMixedProd = {
      id:Date.now(), date:form.date,
      prodBatchCode, recipe, prodType,
      ingredients,
      raw:totalRaw, trim:ingredients.reduce((s,i)=>s+i.trim,0),
      ep:totalEP, cooked:batchCooked,
      yield: totalRaw>0 ? outputW/totalRaw : 0,
      cost:totalCost,
      costPerCooked: prodType==="cooked"&&batchCooked>0 ? totalCost/batchCooked : null,
      expectedPortions: portionsDisabled?0:expPortions,
      portionsDisabled,
      notes:form.notes||"",
      loggedBy:logger,
      prodBy:form.prodBy||"",
    };
    const deliveryUpdates = ingredients
      .map(ingr=>finalDeliveries.find(d=>d.batchCode===ingr.deliveryBatchCode))
      .filter(Boolean)
      .map(d=>saveDoc(COLLECTIONS.deliveries, d));
    Promise.all([saveDoc(COLLECTIONS.productions, newMixedProd), ...deliveryUpdates])
      .catch(()=>setError("Save failed — check your connection and try again."));
    setForm({}); clearErr(); setSubview("list");
  };

  // ── SPLIT PRODUCTION ───────────────────────────────────────────────────────
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
    // Generate batch codes sequentially so same-day codes don't collide
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
        return { deliveryBatchCode:d.batchCode, item:d.item, raw:bRaw, trim:bTrim, ep:Math.max(0,bRaw-bTrim), cooked:0, cost:bRaw*d.costPerGram, costPerGram:d.costPerGram };
      });
      const cost = ingredients.reduce((s, i) => s + i.cost, 0);
      const outputW = prodType === "cooked" ? cookedW : recipeEP;
      const expPortions = rec?.portionG && outputW > 0 ? (prodType === "cooked" ? (outputW*(1-BUFFER))/rec.portionG : outputW/rec.portionG) : 0;
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
    // Update deliveries: deduct full raw, add proportional usedIn per recipe
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
    setForm({}); setSplitSku(""); setSplitBatches({}); setSplitRecipes([{ recipe:"", ep:"" }]);
    clearErr(); setSubview("list");
  };

  // ── PORTIONING CALC ────────────────────────────────────────────────────────
  const calcPortioning = (prod: any) => {
    const recipe = RECIPES.find(r=>r.name===prod.recipe);
    if (!recipe||!recipe.portionG) return null;
    const isPortion    = recipe.prodType==="portion";
    // Portion Only: portionable = EP (no buffer — no cooking loss)
    // Cooked:       portionable = cooked * (1 - buffer)
    const epWeight     = prod.ep || Math.max(0,(prod.raw||0)-(prod.trim||0)); // fallback for old records
    const portionable  = isPortion ? epWeight : prod.cooked*(1-BUFFER);
    if (!portionable) return { recipe, portionable:0, expected:0, actual:prod.actualPortions??null, variance:null, varianceG:null, costPerPortion:0, isPortion, flag:null, zeroEP:true };
    const expected     = portionable/recipe.portionG;
    const actual       = prod.actualPortions??null;
    const variance     = actual!==null ? actual-expected : null;
    const varianceG    = actual!==null ? actual*recipe.portionG-portionable : null;
    const costPerPortion = prod.cost/(actual??expected);
    const pct          = actual!==null ? variance!/expected : null;
    const flag         = pct===null?null:pct>=0?"ok":pct>=-0.05?"warn":"bad";
    return { recipe, portionable, expected, actual, variance, varianceG, costPerPortion, isPortion, flag };
  };

  // ── LOG ACTUAL PORTIONS ────────────────────────────────────────────────────
  const saveActualPortions = (prod: any) => {
    const actual = +portionInput;
    if (!actual||actual<=0){ setError("Enter a valid number of portions."); return; }
    if (!Number.isInteger(actual)){ setError("Actual portions must be a whole number."); return; }
    const updated = {...prod, actualPortions:actual};
    saveDoc(COLLECTIONS.productions, updated)
      .catch(()=>setError("Save failed — check your connection and try again."));
    setPortionInput(""); clearErr();
    setSelectedProd(updated);
  };

  // ── EDIT/VOID TIME GUARD ─────────────────────────────────────────────────────
  const isSameDay = (prodDate: string) => prodDate === todayISO();

  // Simulate balance for a recipe after changing a production's portions
  // excludeProdId: production to void (excluded entirely)
  // overridePortions: {prodId, qty} to simulate editing portions
  const simulateBalance = (recipe: string, excludeProdId?: number, overridePortions?: {id:number,qty:number}) => {
    const prods = productions.filter(p=>!p.voided&&recipeMatch(p.recipe,recipe)&&p.actualPortions!==undefined&&p.id!==excludeProdId)
      .map(p=> overridePortions&&p.id===overridePortions.id ? {...p,actualPortions:overridePortions.qty} : p);
    const totalProduced = prods.reduce((s:number,p:any)=>s+p.actualPortions,0);
    const sorted = [...invEntries.filter(e=>recipeMatch(e.item,recipe))].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
    const lastCountIdx = sorted.map(e=>e.type).lastIndexOf("count");
    const lastCount = lastCountIdx>=0 ? sorted[lastCountIdx] : null;
    const postCountProduced = lastCount
      ? prods.filter((p:any)=>p.date>lastCount.date||(p.date===lastCount.date&&p.id>lastCount.id)).reduce((s:number,p:any)=>s+p.actualPortions,0)
      : 0;
    let bal = lastCount ? lastCount.qty+postCountProduced : totalProduced;
    const startIdx = lastCountIdx>=0 ? lastCountIdx+1 : 0;
    for (let i=startIdx;i<sorted.length;i++){
      const e=sorted[i];
      if(e.type==="in") bal+=e.qty;
      if(e.type==="out") bal-=e.qty;
      if(e.type==="count") bal=e.qty+postCountProduced;
    }
    return bal;
  };

  const wouldGoNegative = (recipe: string, prodId: number, newPortions: number) => {
    return newPortions===0
      ? simulateBalance(recipe, prodId) < 0          // void
      : simulateBalance(recipe, undefined, {id:prodId, qty:newPortions}) < 0;  // edit
  };

  const minAllowedPortions = (recipe: string, prodId: number) => {
    // Binary search for minimum portions that don't go negative
    let lo=0, hi=9999;
    while(lo<hi){ const mid=Math.floor((lo+hi)/2); simulateBalance(recipe,undefined,{id:prodId,qty:mid})<0 ? lo=mid+1 : hi=mid; }
    return lo;
  };

  // ── EDIT ACTUAL PORTIONS ──────────────────────────────────────────────────
  const saveEditedPortions = (prod: any) => {
    const val = +editPortionVal;
    if (!val||val<=0){ setError("Enter a valid number of portions."); return; }
    if (!Number.isInteger(val)){ setError("Actual portions must be a whole number."); return; }
    if (!isSuperAdmin && !isSameDay(prod.date)){ setError("Portions can only be edited on the same day they were logged."); return; }
    if (wouldGoNegative(prod.recipe, prod.id, val)){
      const min = minAllowedPortions(prod.recipe, prod.id);
      setError(`Cannot reduce to ${val} — ${min} portion${min!==1?"s":""} already pulled out. Minimum is ${min}.`); return;
    }
    const updatedProd = {...prod, actualPortions:val};
    saveDoc(COLLECTIONS.productions, updatedProd)
      .catch(()=>setError("Save failed — check your connection and try again."));
    setEditPortions(false); setEditPortionVal(""); clearErr();
    setSelectedProd(updatedProd);
  };

  // ── VOID BATCH ─────────────────────────────────────────────────────────────
  const handleVoidPin = (key:string) => {
    if (key==="DEL"){ setVoidPinEntry(p=>p.slice(0,-1)); setVoidPinError(false); return; }
    const next=voidPinEntry+key; setVoidPinEntry(next);
    if (next.length===4){
      if (next===CLEAR_PIN){
        const target = voidTarget;
        // Guard: already voided — do nothing
        const alreadyVoided = productions.find(p=>p.id===target?.id)?.voided;
        if (alreadyVoided){ setVoidPin(false); setVoidPinEntry(""); setVoidTarget(null); return; }
        // Guard: same day only (superadmins can bypass)
        if (!isSuperAdmin && !isSameDay(target?.date||"")){ setVoidPin(false); setVoidPinEntry(""); setVoidPinError(true); setTimeout(()=>setVoidPinError(false),600); return; }
        // Guard: would go negative
        if (target?.recipe && wouldGoNegative(target.recipe, target.id, 0)){
          const min = minAllowedPortions(target.recipe, target.id);
          setVoidPin(false); setVoidPinEntry(""); setVoidTarget(null);
          setError(`Cannot void — ${min} portion${min!==1?"s":""} already pulled out. Voiding would result in negative inventory.`);
          setSubview("batchdetail"); return;
        }
        // Mark production as voided
        const voidedProd = {...productions.find(p=>p.id===target?.id), voided:true, voidedBy:logger, voidedAt:new Date().toISOString()};
        const deliveryUpdates: Promise<any>[] = [];
        if (target?.ingredients?.length) {
          for (const d of deliveries) {
            const ingr = target.ingredients.find((i:any)=>i.deliveryBatchCode===d.batchCode);
            if (!ingr) continue;
            const updatedDel = {
              ...d,
              remainingWeight: Math.min(d.weight, d.remainingWeight + ingr.raw),
              usedIn: (d.usedIn||[]).filter((u:any)=>u.prodBatchCode!==target.prodBatchCode),
            };
            deliveryUpdates.push(saveDoc(COLLECTIONS.deliveries, updatedDel));
          }
        }
        Promise.all([saveDoc(COLLECTIONS.productions, voidedProd), ...deliveryUpdates])
          .catch(()=>setError("Void failed — check your connection and try again."));
        setVoidPin(false); setVoidPinEntry(""); setVoidTarget(null); setSelectedProd(null); setSubview("list");
      } else {
        setVoidPinError(true);
        setTimeout(()=>{ setVoidPinEntry(""); setVoidPinError(false); },600);
      }
    }
  };

  // ── DASHBOARD TIME RANGE ──────────────────────────────────────────────────────
  const rangeStart = (()=>{
    if (dashRange==="7")  return new Date(Date.now()-7 *86400000).toISOString().slice(0,10);
    if (dashRange==="30") return new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    if (dashRange==="90") return new Date(Date.now()-90*86400000).toISOString().slice(0,10);
    return null; // all time
  })();
  const inRange = (date:string) => !rangeStart || date >= rangeStart;

  // ── SUMMARY DASHBOARD DATA ─────────────────────────────────────────────────
  const skuStats = SKUS.map(sku=>{
    const allDels  = deliveries.filter(d=>d.item===sku);
    if (!allDels.length) return null;
    const rangeDels = allDels.filter(d=>inRange(d.date||""));

    // Latest delivery cost/kg (from most recent delivery, all time)
    const sortedDels = [...allDels].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const latestDel  = sortedDels[0];
    const latestCostPerKg = latestDel ? latestDel.costPerGram*1000 : 0;

    // Weighted avg cost/kg (within range) = total cost / total weight
    const rangeTotalWeight = rangeDels.reduce((s,d)=>s+d.weight,0);
    const rangeCostPerKg = rangeTotalWeight > 0
      ? (rangeDels.reduce((s,d)=>s+d.cost,0) / rangeTotalWeight * 1000)
      : latestCostPerKg;

    // Remaining stock + inventory value at latest cost
    const remaining = allDels.reduce((s,d)=>s+d.remainingWeight,0);
    const inventoryValue = remaining * latestDel.costPerGram;

    // Productions in range for this SKU
    const allProds   = productions.filter(p=>!p.voided&&p.ingredients?.some((i:any)=>i.item===sku));
    const rangeProds = allProds.filter(p=>inRange(p.date||""));

    const getOutput = (p:any) => p.ingredients.find((i:any)=>i.item===sku);
    const totalRaw    = rangeProds.reduce((s,p)=>s+(getOutput(p)?.raw||0),0);
    const totalOut    = rangeProds.reduce((s,p)=>s+(getOutput(p)?.ep||getOutput(p)?.cooked||0),0);
    const avgYield    = totalRaw ? totalOut/totalRaw : null;

    // Historical avg yield (all time) for comparison
    const histRaw  = allProds.reduce((s,p)=>s+(getOutput(p)?.raw||0),0);
    const histOut  = allProds.reduce((s,p)=>s+(getOutput(p)?.ep||getOutput(p)?.cooked||0),0);
    const histAvgYield = histRaw ? histOut/histRaw : null;

    // Yield vs historical avg
    const yieldVsHist = (avgYield&&histAvgYield) ? avgYield-histAvgYield : null;

    // Batch variability — best/worst in range
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



  // ── RECIPE PERFORMANCE ────────────────────────────────────────────────────────
  const recipePerformance = RECIPES.filter(r=>r.portionG!==null).map(r=>{
    const runs = productions.filter(p=>!p.voided&&recipeMatch(p.recipe,r.name)&&p.actualPortions!==undefined);
    if (!runs.length) return null;
    const totalPortions = runs.reduce((s,p)=>s+p.actualPortions,0);
    // Latest and previous run by date for cost trend
    const sorted = [...runs].sort((a,b)=>(a.date||"").localeCompare(b.date||"")||a.id-b.id);
    const latest   = sorted[sorted.length-1];
    const previous = sorted.length>=2 ? sorted[sorted.length-2] : null;
    const latestCPP   = latest.cost/latest.actualPortions;
    const previousCPP = previous ? previous.cost/previous.actualPortions : null;
    const costTrend   = previousCPP ? ((latestCPP-previousCPP)/previousCPP)*100 : null;
    // Yield data
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

  // ── GROUPED PRODUCTIONS ────────────────────────────────────────────────────
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

  // ── YIELD HISTORY ──────────────────────────────────────────────────────────
  const yieldHistory = (()=>{
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

  // ── PIN ────────────────────────────────────────────────────────────────────
  const handlePinKey = (key:string) => {
    if (key==="DEL"){ setPinEntry(p=>p.slice(0,-1)); setPinError(false); return; }
    const next=pinEntry+key; setPinEntry(next);
    if (next.length===4){
      if (next===CLEAR_PIN){
        setShowPin(false); setPinEntry("");
        // Clear local state
        // Clear all Firestore collections atomically
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

  // ── AUTH GATE ─────────────────────────────────────────────────────────────
  // Show loading while Firebase Auth initialises
  if (!authReady) return (
    <div className={theme==="light"?"light":""}>
      <style>{STYLES}</style>
      <div className="who-overlay">
        <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,color:"var(--accent)",marginBottom:8}}>COMM•ISSARY</div>
        <div style={{fontSize:11,color:"var(--muted)",letterSpacing:".14em"}}>LOADING...</div>
      </div>
    </div>
  );

  // Show login screen if not authenticated
  if (!currentUser) return (
    <div className={theme==="light"?"light":""}>
      <style>{STYLES}</style>
      <div className="who-overlay">
        <img src="/logo.png" alt="The Black Bean" style={{width:200,marginBottom:20,opacity:0.95}}/>
        <div style={{fontFamily:"var(--font-head)",fontSize:26,fontWeight:800,color:"var(--accent)",marginBottom:4,letterSpacing:".05em"}}>COMM•ISSARY</div>
        <div style={{fontSize:11,color:"var(--muted)",letterSpacing:".14em",marginBottom:36}}>PRODUCTION DASHBOARD</div>
        {loginError&&<div className="error-box" style={{width:"100%",marginBottom:12}}>⚠ {loginError}</div>}
        <div className="form-group" style={{width:"100%"}}>
          <label className="form-label">Email</label>
          <input className="form-input" type="email" placeholder="your@email.com"
            value={loginEmail} onChange={e=>{ setLoginEmail(e.target.value); setLoginError(""); }}
            autoCapitalize="none" autoCorrect="off"/>
        </div>
        <div className="form-group" style={{width:"100%",marginTop:12}}>
          <label className="form-label">Password</label>
          <input className="form-input" type="password" placeholder="••••••••"
            value={loginPassword} onChange={e=>{ setLoginPassword(e.target.value); setLoginError(""); }}/>
        </div>
        <button className="btn-primary" style={{width:"100%",marginTop:16}} disabled={loginLoading}
          onClick={async()=>{
            if (!loginEmail||!loginPassword){ setLoginError("Enter email and password."); return; }
            setLoginLoading(true);
            try {
              await loginWithEmail(loginEmail.trim(), loginPassword);
              setLoginEmail(""); setLoginPassword("");
            } catch(e:any) {
              setLoginError("Invalid email or password.");
            }
            setLoginLoading(false);
          }}>
          {loginLoading?"SIGNING IN...":"SIGN IN"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{STYLES}</style>
      <div className={`app ${theme==="light"?"light":""}`}>

        <div className="topbar">
          <div className="topbar-logo">COMM<em>●</em>ISSARY</div>
          <div className="topbar-right">
            <button className="theme-toggle" onClick={toggleTheme} title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}>{theme==="dark"?"☀️":"🌙"}</button>
            <div className="topbar-date">{todayLabel}</div>
            {saved
              ? <div className="saved-flash">✓ SAVED</div>
              : <div className="topbar-user" onClick={()=>{ if(window.confirm("Sign out?")) logoutUser(); }}>
                  {currentUser?.name||currentUser?.email||""} ▾
                </div>
            }
          </div>
        </div>

        {updateAvailable&&(
          <div className="update-banner" onClick={()=>{ window.location.href = window.location.pathname + '?v=' + Date.now(); }}>
            New update available — tap to refresh
          </div>
        )}

        {!fbReady&&(
          <div style={{position:"fixed",inset:0,background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:9999}}>
            <div style={{fontFamily:"var(--font-head)",fontSize:20,fontWeight:800,color:"var(--accent)",marginBottom:12}}>COMM•ISSARY</div>
            <div style={{fontSize:12,color:"var(--muted)",letterSpacing:".1em"}}>SYNCING DATA...</div>
          </div>
        )}
        <div className="scroll-area" ref={scrollRef}>

          {/* ══ HOME ══ */}
          {tab==="home" && subview==="list" && <>
            <div style={{fontFamily:"var(--font-head)",fontSize:24,fontWeight:800,marginBottom:4}}>Good day{currentUser?.name?`, ${currentUser.name}`:""}.{isSuperAdmin?" 👑":isAdmin?" 👨‍🍳":""}</div>
            <div style={{fontSize:11,color:"var(--muted)",letterSpacing:"0.08em",marginBottom:20}}>The Black Bean Commissary Prod Dashboard</div>

            {pendingPortioning.length>0 && (
              <div className="alert-banner" onClick={()=>{ goTab("summary"); setSummTab("log"); }}>
                <div className="alert-title">⚠ {pendingPortioning.length} batch{pendingPortioning.length>1?"es":""} awaiting portioning</div>
                <div className="alert-items">{pendingPortioning.map(p=>`${p.recipe} · ${p.prodBatchCode}`).join("\n")}</div>
              </div>
            )}

            <div className="section-label">Quick Actions</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              {[
                {icon:"📦",label:"Log Delivery", sub:"Record incoming stock", act:()=>goTab("delivery")},
                {icon:"🗂",label:"Log Inventory",  sub:"Portioned, packed, loose",act:()=>goTab("inventory")},
                {icon:"🔪",label:"Prod", sub:"Single & mixed batches", act:()=>{ setTab("production"); setForm({date:todayISO()}); setSubview("list"); }},
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
                  <div className="snapshot-card clickable" onClick={()=>{ goTab("summary"); setSummTab("log"); }}>
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
          </>}

          {/* ══ DELIVERY DETAIL ══ */}
          {subview==="deliverydetail" && selectedDel && (()=>{
            const d = deliveries.find(x=>x.id===selectedDel.id)||selectedDel;
            const totalUsed = (d.usedIn||[]).reduce((s:number,u:any)=>s+u.rawUsed,0);
            const pct = d.weight ? (totalUsed/d.weight)*100 : 0;
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
                      <div key={i} className="used-in-row"
                        style={{cursor:linkedProd?"pointer":"default"}}
                        onClick={()=>{
                          if (!linkedProd) return;
                          setSelectedProd(linkedProd);
                          setPortionInput(""); clearErr();
                          setSubview("batchdetail");
                        }}>
                        <div>
                          <div className="used-in-code" style={{color:linkedProd?"var(--accent)":"var(--muted)"}}>{u.prodBatchCode}</div>
                          <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{u.recipe||"No recipe"} · {u.date}</div>
                          {linkedProd&&<div style={{fontSize:10,color:"var(--dim)",marginTop:1}}>Tap to view production →</div>}
                        </div>
                        <div style={{fontSize:13,color:"var(--text)",textAlign:"right"}}>{fmtKg(u.rawUsed)}</div>
                      </div>
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
          {tab==="delivery" && subview==="list" && (()=>{
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
          {tab==="delivery" && subview==="finished" && (()=>{
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
          {tab==="delivery" && subview==="form" && <>
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

          {/* ══ PRODUCTION LIST ══ */}
          {tab==="production" && subview==="list" && <>
            <div className="page-header"><div className="page-header-row"><div className="page-title">Production</div></div></div>
            {isSuperAdmin&&<div style={{display:"flex",gap:8,marginTop:0,marginBottom:20}}>
              <button className="btn-primary" style={{flex:1,marginTop:0}} onClick={()=>{ setForm({date:todayISO()}); clearErr(); setSubview("mixed"); }}>🍳 MIXED BATCH</button>
              <button className="btn-primary" style={{flex:1,marginTop:0}} onClick={()=>{ setForm({date:todayISO()}); setSplitSku(""); setSplitBatches({}); setSplitRecipes([{recipe:"",ep:""}]); clearErr(); setSubview("split"); }}>✂ SPLIT BATCH</button>
            </div>}
            {deliveries.length===0
              ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">Log deliveries first.</div></div>
              : <>
                <div className="section-label">Single Batch — Select from stock</div>
                {deliveries.filter(d=>d.remainingWeight>0).map(d=>(
                  <div key={d.id} className="batch-card">
                    <div className="batch-top">
                      <div><div className="batch-name">{d.item}</div><div className="batch-code">{d.batchCode}</div></div>
                      <div className={`batch-pill ${d.remainingWeight<d.weight*0.2?"low":""}`}>{fmtKg(d.remainingWeight)} left</div>
                    </div>
                    {isSuperAdmin&&<button className="btn-ghost" onClick={()=>{ setForm({batch:d, date:todayISO()}); clearErr(); setSubview("single"); }}>USE THIS BATCH →</button>}
                  </div>
                ))}
              </>
            }
          </>}

          {/* ══ SINGLE ENTRY ══ */}
          {tab==="production" && subview==="single" && (()=>{
            const batch=form.batch;
            const raw=+form.raw||0, trim=+form.trim||0, cooked=+form.cooked||0;
            const ep=Math.max(0,raw-trim); // auto-calculated
            const rec = RECIPES.find(r=>r.name===form.recipe);
            const prodType = rec ? (RECIPE_PROD_TYPE[rec.name]||"portion") : null;
            const outputW  = prodType==="cooked" ? cooked : ep;
            const yld      = raw>0&&outputW>0 ? outputW/raw : 0;
            const expPortions = rec?.portionG && outputW>0 ? (prodType==="cooked"?(outputW*(1-BUFFER))/rec.portionG : outputW/rec.portionG) : 0;
            const portionsDisabled = expPortions<1;
            const linkedRecipes=SKU_RECIPES[batch.item]||[];
            return <>
              <div className="page-header">
                <div className="page-header-row">
                  <button className="back-btn" onClick={()=>{ setSubview("list"); clearErr(); }}>←</button>
                  <div className="page-title">Batch Entry</div>
                </div>
                <div className="page-sub">Single batch · {prodType ? (prodType==="cooked"?"Cooked Production":"Portion Only") : "select recipe"}</div>
              </div>
              {error&&<div className="error-box">⚠ {error}</div>}
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
                  {linkedRecipes.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {prodType && <>
                <div className="section-label">Weights</div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Raw (g) *</label><input className="form-input" type="number" placeholder="0" value={form.raw||""} onChange={e=>setF("raw",e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Trim Loss (g)</label><input className="form-input" type="number" placeholder="0" value={form.trim||""} onChange={e=>setF("trim",e.target.value)}/></div>
                </div>
                {raw>0&&<div className="form-hint">EP: <strong>{Math.max(0,raw-(+form.trim||0))}g</strong> <span style={{color:"var(--muted)"}}>(Raw − Trim)</span></div>}
                {prodType==="cooked" && (
                  <div className="form-group" style={{marginTop:8}}>
                    <label className="form-label">Cooked Weight (g) *</label>
                    <input className="form-input" type="number" placeholder="0" value={form.cooked||""} onChange={e=>setF("cooked",e.target.value)}/>
                  </div>
                )}
                {raw>0&&outputW>0&&(
                  <div className="form-hint">
                    Yield: <strong className={yieldCls(yld)}>{(yld*100).toFixed(1)}%</strong>
                    {prodType==="portion"&&<span style={{color:"var(--muted)"}}> (EP÷Raw)</span>}
                    {" · "}Cost: <strong>₱{(raw*batch.costPerGram).toFixed(2)}</strong>
                    {expPortions>0&&<>{" · "}Exp. portions: <strong className={portionsDisabled?"yield-lo":""}>{expPortions.toFixed(1)}</strong></>}
                    {portionsDisabled&&<span style={{color:"var(--red)"}}> — portioning disabled</span>}
                  </div>
                )}
              </>}
              <div className="section-label">Notes <span style={{color:"var(--dim)",fontWeight:400}}>(optional)</span></div>
              <div className="form-group"><textarea className="form-textarea" rows={2} placeholder="e.g. New supplier batch..." value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
              <div className="section-label">Prod By</div>
              <div className="form-group">
                <select className="form-select" value={form.prodBy||""} onChange={e=>setF("prodBy",e.target.value)}>
                  <option value="">Select staff...</option>
                  {TEAM.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={()=>handleSingle(batch)}>SUBMIT PRODUCTION</button>
            </>;
          })()}

          {/* ══ MIXED ══ */}
          {tab==="production" && subview==="mixed" && (()=>{
            const chosenRecipe=form.recipe||"";
            const chosenRec=RECIPES.find(r=>r.name===chosenRecipe);
            const chosenProdType=chosenRec?(RECIPE_PROD_TYPE[chosenRec.name]||"portion"):"portion";
            const linkedSkusForRecipe=chosenRecipe
              ? Object.entries(SKU_RECIPES).filter(([,v])=>v.includes(chosenRecipe)).map(([k])=>k)
              : [];
            const activeBatches=deliveries.filter(d=>linkedSkusForRecipe.includes(d.item)&&d.remainingWeight>0);
            return <>
              <div className="page-header">
                <div className="page-header-row">
                  <button className="back-btn" onClick={()=>{ if(chosenRecipe){ setF("recipe",""); clearErr(); } else { setSubview("list"); clearErr(); } }}>←</button>
                  <div className="page-title">Mixed Batches</div>
                </div>
                <div className="page-sub">{chosenRecipe||"Select a recipe to start"}</div>
              </div>
              {error&&<div className="error-box">⚠ {error}</div>}

              {!chosenRecipe ? <>
                <div className="section-label">Which recipe are you prepping?</div>
                {RECIPES.map(r=>{
                  const hasStock=Object.entries(SKU_RECIPES).filter(([,v])=>v.includes(r.name)).some(([sku])=>deliveries.some(d=>d.item===sku&&d.remainingWeight>0));
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
                {activeBatches.length===0
                  ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No active stock for this recipe.<br/>Log a delivery first.</div></div>
                  : <>
                    <div className="section-label">Production Date</div>
                    <div className="form-group"><input className="form-input" type="date" value={form.date||""} onChange={e=>setF("date",e.target.value)}/></div>
                    <div className="section-label">Ingredients</div>
                    <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Leave blank for any batch not used today.</div>
                    {activeBatches.map(d=>{
                      const data=form[d.id]||{};
                      const raw=+data.raw||0, ep=+data.ep||0;
                      const upd=(k:string,v:string)=>setForm((p:any)=>({...p,[d.id]:{...p[d.id],[k]:v,recipe:chosenRecipe}}));
                      return (
                        <div key={d.id} className="batch-card">
                          <div className="batch-top">
                            <div><div className="batch-name">{d.item}</div><div className="batch-code">{d.batchCode}</div></div>
                            <div className={`batch-pill ${d.remainingWeight<d.weight*0.2?"low":""}`}>{Math.floor(d.remainingWeight).toLocaleString()}g</div>
                          </div>
                          <hr className="batch-divider"/>
                          <div className="mini-grid">
                            <input className="mini-input" placeholder="Raw (g)"       type="number" onChange={e=>upd("raw",e.target.value)}/>
                            <input className="mini-input" placeholder="Trim loss (g)" type="number" onChange={e=>upd("trim",e.target.value)}/>
                          </div>
                          {raw>0&&(()=>{
                            const calcEP = Math.max(0, raw - (+data.trim||0));
                            const epYld  = raw>0 ? calcEP/raw : 0;
                            return <div className="mini-stats">EP: <b>{calcEP}g</b> · EP Yield: <b className={yieldCls(epYld)}>{(epYld*100).toFixed(1)}%</b></div>;
                          })()}
                        </div>
                      );
                    })}

                    {/* Single cooked weight for the whole batch — cooked recipes only */}
                    {chosenProdType==="cooked"&&(()=>{
                      const totalRaw = activeBatches.reduce((s,d)=>s+(+form[d.id]?.raw||0),0);
                      const cooked   = +(form.cooked||0);
                      const yld      = totalRaw>0&&cooked>0 ? cooked/totalRaw : null;
                      return (
                        <div style={{background:"var(--accent-bg)",border:"1px solid #3d3a1a",borderRadius:10,padding:"14px 15px",marginTop:8}}>
                          <div style={{fontFamily:"var(--font-head)",fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:10}}>Total Cooked Output</div>
                          <div style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>All ingredients combined after cooking — enter the single total cooked weight.</div>
                          <input className="form-input" type="number" placeholder="Total cooked weight (g)"
                            value={form.cooked||""}
                            onChange={e=>setF("cooked",e.target.value)}/>
                          {yld&&<div className="form-hint" style={{marginTop:6}}>
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
                        {TEAM.map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <button className="btn-primary" onClick={handleMixed}>SUBMIT PRODUCTION</button>
                  </>
                }
              </>}
            </>;
          })()}

          {/* ══ SPLIT BATCH ══ */}
          {tab==="production" && subview==="split" && (()=>{
            const availableSkus = [...new Set(deliveries.filter(d=>d.remainingWeight>0).map((d:any)=>d.item as string))];
            const splitBatchesForSku = splitSku ? deliveries.filter(d=>d.item===splitSku&&d.remainingWeight>0) : [];
            const totalRaw  = splitBatchesForSku.reduce((s,d)=>s+(+(splitBatches[d.id]?.raw||0)),0);
            const totalTrim = splitBatchesForSku.reduce((s,d)=>s+(+(splitBatches[d.id]?.trim||0)),0);
            const totalEP   = Math.max(0, totalRaw - totalTrim);
            const sumAllocated = splitRecipes.reduce((s,r)=>s+(+(r.ep||0)),0);
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
                <div className="page-sub">{splitSku||"Select ingredient to split"}</div>
              </div>
              {error&&<div className="error-box">⚠ {error}</div>}

              {!splitSku ? <>
                {/* Step 1: Select SKU */}
                <div className="section-label">Which ingredient are you splitting?</div>
                {availableSkus.length===0&&<div className="empty"><div className="empty-icon">📦</div><div className="empty-text">No active stock to split.</div></div>}
                {availableSkus.map(sku=>(
                  <button key={sku} onClick={()=>{ setSplitSku(sku); setSplitBatches({}); setSplitRecipes([{recipe:"",ep:""}]); clearErr(); }}
                    style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"13px 15px",cursor:"pointer",textAlign:"left",marginBottom:6,color:"var(--text)",fontFamily:"var(--font-mono)",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                    <div style={{fontFamily:"var(--font-head)",fontSize:14,fontWeight:700}}>{sku}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{deliveries.filter(d=>d.item===sku&&d.remainingWeight>0).length} batch{deliveries.filter(d=>d.item===sku&&d.remainingWeight>0).length!==1?"es":""} available</div>
                  </button>
                ))}
              </> : <>
                {/* Step 2: Batches + Recipe allocation */}
                <div className="form-group"><label className="form-label">Production Date</label><input className="form-input" type="date" value={form.date||""} onChange={e=>setF("date",e.target.value)}/></div>

                <div className="section-label">Source Batches</div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Enter raw and trim for each batch used. Leave blank to skip a batch.</div>
                {splitBatchesForSku.map(d=>{
                  const data = splitBatches[d.id]||{};
                  const raw=+(data.raw||0), trim=+(data.trim||0), ep=Math.max(0,raw-trim);
                  const upd=(k:string,v:string)=>setSplitBatches(p=>({...p,[d.id]:{...p[d.id],[k]:v}}));
                  return (
                    <div key={d.id} className="batch-card">
                      <div className="batch-top">
                        <div><div className="batch-name">{d.item}</div><div className="batch-code">{d.batchCode}</div></div>
                        <div className={`batch-pill ${d.remainingWeight<d.weight*0.2?"low":""}`}>{Math.floor(d.remainingWeight).toLocaleString()}g left</div>
                      </div>
                      <hr className="batch-divider"/>
                      <div className="mini-grid">
                        <input className="mini-input" placeholder="Raw (g)" type="number" value={data.raw||""} onChange={e=>upd("raw",e.target.value)}/>
                        <input className="mini-input" placeholder="Trim loss (g)" type="number" value={data.trim||""} onChange={e=>upd("trim",e.target.value)}/>
                      </div>
                      {raw>0&&<div className="mini-stats">EP: <b>{ep}g</b> · EP Yield: <b className={yieldCls(raw>0?ep/raw:0)}>{raw>0?((ep/raw)*100).toFixed(1):0}%</b></div>}
                    </div>
                  );
                })}

                {totalEP>0&&<>
                  <div style={{background:"var(--accent-bg)",border:"1px solid #3d3a1a",borderRadius:10,padding:"12px 15px",marginBottom:4,fontSize:12}}>
                    Total Raw: <strong>{totalRaw}g</strong> · Trim: <strong>{totalTrim}g</strong> · <span style={{color:"var(--accent)"}}>EP: <strong>{totalEP}g</strong></span>
                  </div>

                  <div className="section-label">Recipe Allocation</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Assign EP (g) to each recipe. Total must equal {totalEP}g.</div>

                  {splitRecipes.map((rr,ri)=>{
                    const rec=RECIPES.find(r=>r.name===rr.recipe);
                    const prodType=rec?(RECIPE_PROD_TYPE[rec.name]||"portion"):"portion";
                    const validForSku=(SKU_RECIPES[splitSku]||[]);
                    const recipeEP=+(rr.ep||0);
                    const fraction=totalEP>0?recipeEP/totalEP:0;
                    const recipeRaw=totalRaw*fraction;
                    const expP=rec?.portionG&&recipeEP>0?(prodType==="cooked"&&+(rr.cooked||0)>0?((+(rr.cooked||0))*(1-BUFFER)/rec.portionG):(recipeEP/rec.portionG)):0;
                    return (
                      <div key={ri} className="batch-card" style={{marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <div style={{flex:1,fontFamily:"var(--font-head)",fontSize:12,color:"var(--accent)"}}>Recipe {ri+1}</div>
                          {splitRecipes.length>2&&<button onClick={()=>setSplitRecipes(p=>p.filter((_,i)=>i!==ri))} style={{background:"transparent",border:"none",color:"var(--red)",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>}
                        </div>
                        <div className="form-group" style={{marginBottom:8}}>
                          <select className="form-select" value={rr.recipe} onChange={e=>setSplitRecipes(p=>p.map((x,i)=>i===ri?{...x,recipe:e.target.value,cooked:""}:x))}>
                            <option value="">Select recipe...</option>
                            {RECIPES.filter(r=>validForSku.includes(r.name)).map(r=><option key={r.name} value={r.name}>{r.name}</option>)}
                          </select>
                        </div>
                        <div className={prodType==="cooked"&&rr.recipe?"form-row":""}>
                          <div className="form-group" style={{marginBottom:0}}>
                            <label className="form-label">EP Allocation (g)</label>
                            <input className="form-input" type="number" placeholder="0" value={rr.ep} onChange={e=>setSplitRecipes(p=>p.map((x,i)=>i===ri?{...x,ep:e.target.value}:x))}/>
                          </div>
                          {prodType==="cooked"&&rr.recipe&&(
                            <div className="form-group" style={{marginBottom:0}}>
                              <label className="form-label">Cooked Weight (g)</label>
                              <input className="form-input" type="number" placeholder="0" value={rr.cooked||""} onChange={e=>setSplitRecipes(p=>p.map((x,i)=>i===ri?{...x,cooked:e.target.value}:x))}/>
                            </div>
                          )}
                        </div>
                        {rr.recipe&&recipeEP>0&&<div className="mini-stats" style={{marginTop:6}}>Raw: <b>{recipeRaw.toFixed(0)}g</b>{expP>0?<> · Exp. portions: <b>{expP.toFixed(1)}</b></>:null}</div>}
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
                      {TEAM.map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <button className="btn-primary" onClick={handleSplit}>SUBMIT SPLIT</button>
                </>}
              </>}
            </>;
          })()}

          {/* ══ BATCH DETAIL ══ */}
          {subview==="batchdetail" && selectedProd && (()=>{
            const p=productions.find(x=>x.id===selectedProd.id)||selectedProd;
            const pc=calcPortioning(p);
            return <>
              <div className="page-header">
                <div className="page-header-row">
                  <button className="back-btn" onClick={()=>{ setSubview("list"); clearErr(); setPortionInput(""); setEditPortions(false); }}>←</button>
                  <div className="page-title">Prod Detail</div>
                </div>
                <div className="page-sub">{p.prodBatchCode}</div>
              </div>
              {error&&<div className="error-box">⚠ {error}</div>}
              {p.voided&&(
                <div className="voided-banner">
                  🚫 This batch has been voided · {p.voidedBy&&`by ${p.voidedBy}`} · excluded from all calculations
                </div>
              )}
              <div className={`record-card${p.voided?" voided":""}`} style={{cursor:"default"}}>
                <div className="record-top">
                  <div>
                    <div className="record-name">{p.recipe||"No recipe"}</div>
                    <div className="prod-batch-code">{p.prodBatchCode}</div>
                    <div className="record-meta">{p.date}{p.prodBy?` · prod by ${p.prodBy}`:""}</div>
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
                {p.notes&&<div className="record-notes">📝 {p.notes}</div>}
                {p.prodBy&&<div className="record-logger">prod by {p.prodBy}</div>}
                {p.voided&&<div className="voided-tag">🚫 VOIDED</div>}
              </div>

              {p.ingredients?.length>0 && <>
                <div className="section-label">Ingredients Used</div>
                <div className="batch-card">
                  {p.ingredients.map((i:any,idx:number)=>(
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
                  {pc.actual!==null ? <>
                    <div className="portion-row"><span className="portion-key">Actual portions</span><span className="portion-val">{pc.actual}</span></div>
                    <div className="portion-row"><span className="portion-key">Variance</span><span className="portion-val" style={{color:pc.variance!>=0?"var(--green)":"var(--red)"}}>{pc.variance!>=0?"+":""}{pc.variance!.toFixed(1)} portions ({pc.varianceG!.toFixed(0)}g)</span></div>
                    <div className="portion-row"><span className="portion-key">Cost/portion</span><span className="portion-val" style={{color:"var(--accent)"}}>₱{pc.costPerPortion.toFixed(2)}</span></div>
                    <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span className={`portion-flag ${pc.flag==="ok"?"flag-ok":pc.flag==="warn"?"flag-warn":"flag-bad"}`}>{pc.flag==="ok"?"🟢 On target":pc.flag==="warn"?"🟡 Watch closely":"🔴 Off target"}</span>
                      {!editPortions&&(isSameDay(p.date)||isSuperAdmin)&&(
                        <button onClick={()=>{ setEditPortions(true); setEditPortionVal(String(pc.actual)); }} style={{background:"transparent",border:"1px solid var(--border2)",borderRadius:6,color:"var(--muted)",fontFamily:"var(--font-mono)",fontSize:11,padding:"4px 10px",cursor:"pointer"}}>✏ Edit</button>
                      )}
                      {!isSameDay(p.date)&&!isSuperAdmin&&<span style={{fontSize:10,color:"var(--dim)"}}>Locked after end of day</span>}
                    </div>
                    {editPortions&&(
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
              {!p.voided&&(
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

          {/* ══ SUMMARY ══ */}
          {tab==="summary" && subview==="list" && <>
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
                    <div key={p.id} className="problem-item" style={{cursor:"pointer"}} onClick={()=>{ setSelectedProd(p); setPortionInput(""); clearErr(); setSubview("batchdetail"); }}>
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
                      importBackup(file,(d,p)=>{
                        setDeliveries(d); setProductions(p);
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
                            <div key={p.id} className="record-card" style={p.voided?{opacity:0.45}:{}} onClick={()=>{ setSelectedProd(p); setPortionInput(""); clearErr(); setSubview("batchdetail"); }}>
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
          </>}


          {/* ══ INVENTORY TAB ══ */}
          {tab==="inventory" && (
            <InventoryTab
              productions={productions.filter((p:any)=>!p.voided)}
              invEntries={invEntries}
              setInvEntries={setInvEntries}
              pullOuts={pullOuts}
              setPullOuts={setPullOuts}
              logger={logger}
              recipes={RECIPES}
              team={TEAM}
              canEdit={canEditInv}
              managerPin={CLEAR_PIN}
            />
          )}

        </div>

        {/* BOTTOM NAV */}
        <div className="bottom-nav">
          {([
            {id:"home"       as const,icon:"🏠",label:"Home"},
            {id:"delivery"   as const,icon:"📦",label:"Delivery"},
            {id:"production" as const,icon:"🔪",label:"Prod"},
            {id:"inventory"  as const,icon:"🗂",label:"Inventory"},
            {id:"summary"    as const,icon:"📊",label:"Summary"},
          ]).map(n=>(
            <button key={n.id} className={`nav-item ${tab===n.id?"active":""}`}
              onClick={()=>goTab(n.id)} style={{fontSize:"9px"}}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>

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


                {/* VOID PIN MODAL */}
        {voidPin&&(
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

        {/* PULL OUT REPORT MODAL */}
        {showPOReport&&(()=>{
          const BRANCHES_LIST = ["MKT","BF"];

          // Filter POs by date range
          const filtered = pullOuts.filter(po=>{
            if (poRepStart && po.date < poRepStart) return false;
            if (poRepEnd   && po.date > poRepEnd)   return false;
            return true;
          });

          // Build item × branch matrix
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

          // CSV export
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
                      const rows = matrix.filter(r=>r.category===cat);
                      if (!rows.length) return null;
                      return (
                        <div key={cat} style={{marginBottom:14}}>
                          <div style={{fontSize:10,color:"var(--muted)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:6,paddingBottom:4,borderBottom:"1px solid var(--border)"}}>{cat}</div>
                          {rows.map(r=>(
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
                                {rows.reduce((s,r)=>s+(r.byBranch[b]||0),0)}
                              </div>
                            ))}
                            <div style={{textAlign:"right",color:"var(--muted)",fontWeight:600}}>{rows.reduce((s,r)=>s+r.total,0)}</div>
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
                            exportBackup(deliveries,productions,{},invEntries);
                          } else {
                            // PIN approved — open file browser
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

        {/* PIN MODAL */}
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

      </div>
    </>
  );
}
