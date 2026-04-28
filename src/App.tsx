import React, { useState, useEffect, useRef } from "react";
import {
  db, COLLECTIONS,
  subscribeToCollection,
  getUserInfo, loginWithEmail, logoutUser, onAuthChanged,
  AppUser,
  doc, onSnapshot,
} from "./firebase";
import InventoryTab, { InvEntry, PullOutRecord } from "./InventoryTab";
import SummaryTab from "./SummaryTab";
import HomeTab from "./HomeTab";
import DeliveryTab from "./DeliveryTab";
import ProductionTab from "./ProductionTab";
import {
  BUFFER, CLEAR_PIN,
  RECIPES,
  TEAM,
} from "./data";
import {
  todayISO, getTodayLabel,
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
  const [tab,          setTab]         = useState<Tab>("home");
  const [deliveries,   setDeliveries]  = useState<any[]>([]);
  const [productions,  setProductions] = useState<any[]>([]);
  const [saved,        setSaved]       = useState(false);
  const [summTab,      setSummTab]     = useState<"dashboard"|"log">("dashboard");
  const [invEntries,   setInvEntries]  = useState<InvEntry[]>([]);
  const [pullOuts,     setPullOuts]    = useState<PullOutRecord[]>([]);

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
  const [fbReady,         setFbReady]         = useState(false);
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


  // ── PORTIONING CALC — kept here for SummaryTab prop ─────────────────────────
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
          {tab === "home" && (
            <HomeTab
              deliveries={deliveries}
              productions={productions}
              invEntries={invEntries}
              pendingPortioning={pendingPortioning}
              currentUser={currentUser}
              isSuperAdmin={isSuperAdmin}
              isAdmin={isAdmin}
              currentDate={currentDate}
              goTab={goTab}
            />
          )}

          {tab === "delivery" && (
            <DeliveryTab
              deliveries={deliveries}
              productions={productions}
              isSuperAdmin={isSuperAdmin}
              logger={logger}
              goTab={goTab}
            />
          )}


          {tab === "production" && (
            <ProductionTab
              deliveries={deliveries}
              productions={productions}
              invEntries={invEntries}
              isSuperAdmin={isSuperAdmin}
              isAdmin={isAdmin}
              logger={logger}
              goTab={goTab}
            />
          )}

          {/* ══ SUMMARY ══ */}
          {tab === "summary" && (
            <SummaryTab
              deliveries={deliveries}
              productions={productions}
              pullOuts={pullOuts}
              isViewer={isViewer}
              logger={logger}
              summTab={summTab}
              setSummTab={setSummTab}
              goTab={goTab}
              calcPortioning={calcPortioning}
            />
          )}


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


      </div>
    </>
  );
}
