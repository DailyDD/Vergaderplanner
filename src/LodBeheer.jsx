import React, { useState, useEffect } from "react";

// ── LOD Beheer Module ───────────────────────────────────────────

// Module-level referenties — worden gezet via initLodDeps() vanuit App
let _sbFetch = null;
let _showToast = null;
let _today = null;

export function initLodDeps({ sbFetch, showToast, today }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
  _today = today;
}

// ── Warme kleurconstanten (C-ramp) ──
const C = {
  ink: "#2D2D2D", inkSoft: "#3f3d3b", tekst2: "#6B6560", tekst3: "#9B958E",
  bordeaux: "#991A21", bordeauxDonker: "#7A1419", bordeauxTint: "#F6ECEC", bordeauxRand: "#E3C9C9",
  papier: "#F2EFEC", wit: "#FFFFFF", inset: "#FAF8F5",
  lijn: "#E7E2DB", lijnZacht: "#EFEBE4", randHover: "#C9BEB2",
  groen: "#3B7A57", groenTint: "#EAF2EC", groenRand: "#CFE0D5",
  amber: "#B07414", amberTint: "#F7EEDD", amberRand: "#E8D5B0",
  blauw: "#4A6B8A", blauwTint: "#EAEFF4", blauwRand: "#C4D2DE",
}

const calcFmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
let _calcId = 0
const calcUid = () => ++_calcId

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

// ── Inline input styling ──
const lodInp = {
  width:'100%', padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:10,
  fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.ink, background:C.wit,
  outline:'none', boxSizing:'border-box', MozAppearance:'textfield', appearance:'textfield',
};

// ── SVG-iconen ──
const I = {
  shield: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  clip: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
  chk: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  clock: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  arrowL: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  print: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  cal: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  warn: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17.01"/></svg>,
  plus: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  chev: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  file: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  users: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  coins: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="7"/><path d="M15.35 9.35a7 7 0 11-5.7 5.7"/><line x1="9" y1="6" x2="9" y2="12"/><line x1="6" y1="9" x2="12" y2="9"/></svg>,
  hammer: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 010-3L12 9"/><path d="M17.64 15L22 10.64"/><path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 00-3.94-1.64H9l.92.82A6.18 6.18 0 0112 8.4v1.56l2 2h2.47l2.26 1.91"/></svg>,
  timeline: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/><line x1="14" y1="6" x2="20" y2="6"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="18" x2="20" y2="18"/></svg>,
};

// ── Sub-componenten ──
function LodCard({children}) {
  return <div style={{background:C.wit,border:'1px solid '+C.lijn,borderRadius:12,overflow:'hidden',marginBottom:14}}>{children}</div>;
}
function LodCardHdr({icon, bg, title, sub}) {
  return <div style={{padding:'14px 20px',borderBottom:'1px solid '+C.lijn,display:'flex',alignItems:'center',gap:10}}><div style={{width:30,height:30,borderRadius:7,background:bg,display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</div><div><div style={{fontSize:13,fontWeight:600,color:C.ink}}>{title}</div>{sub&&<div style={{fontSize:11,color:C.tekst2,marginTop:1}}>{sub}</div>}</div></div>;
}
function SecTitle({children,style:st}) {
  return <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:C.tekst2,marginBottom:10,marginTop:22,display:'flex',alignItems:'center',gap:8,...st}}>{children}<div style={{flex:1,height:1,background:C.lijn}}/></div>;
}
function LodField({label,children}) {
  return <div><label style={{fontSize:10,fontWeight:600,color:C.tekst2,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>{label}</label>{children}</div>;
}
function LodInp(props) {
  return <input {...props} style={{...lodInp,...props.style}} />;
}

// ── LOD data ──
let _lodId = 0;
const lodUid = () => 'lod_' + (++_lodId) + '_' + Date.now();

const LOD_STATUS = {
  nieuw:            { label: 'Nieuw ontvangen',      color: C.blauw,    bg: C.blauwTint,    dot: C.blauw },
  in_behandeling:   { label: 'In behandeling',       color: C.bordeaux, bg: C.bordeauxTint, dot: C.bordeaux },
  offertes_afwacht: { label: 'Offerte in afwachting', color: C.amber,    bg: C.amberTint,    dot: C.amber },
  offertes_lopen:   { label: 'Offertes lopen',       color: C.blauw,    bg: C.blauwTint,    dot: C.blauw },
  vve_afwachting:   { label: 'In afwachting van VvE', color: C.groen,    bg: C.groenTint,    dot: C.groen },
  vve_akkoord:      { label: 'VvE akkoord',           color: C.groen,    bg: C.groenTint,    dot: C.groen },
  opdracht_uit:     { label: 'Opdracht verstrekt',    color: C.blauw,    bg: C.blauwTint,    dot: C.blauw },
  afgerond:         { label: 'Afgerond',               color: C.tekst2,   bg: C.lijnZacht,    dot: C.tekst3 },
  overschreden:     { label: 'Deadline overschreden', color: C.bordeaux, bg: C.bordeauxTint, dot: C.bordeaux },
};

const LOD_TABLE = 'lod_data';

export async function lodSupaLoad() {
  try {
    const rows = await _sbFetch(`${LOD_TABLE}?select=id,data&order=created_at.desc`);
    if (!rows || !rows.length) return [];
    return rows.map(r => ({ id: r.id, ...r.data }));
  } catch {
    _showToast("LOD laden mislukt — controleer je verbinding.");
    return [];
  }
}

async function lodSupaSave(lod) {
  try {
    const existing = await _sbFetch(`${LOD_TABLE}?id=eq.${lod.id}&select=id`);
    if (existing && existing.length) {
      await _sbFetch(`${LOD_TABLE}?id=eq.${lod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: lod })
      });
    } else {
      await _sbFetch(LOD_TABLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: lod.id, data: lod })
      });
    }
  } catch {
    _showToast("LOD opslaan mislukt — controleer je verbinding.");
  }
}

async function lodSupaDelete(id) {
  try {
    await _sbFetch(`${LOD_TABLE}?id=eq.${id}`, { method: 'DELETE' });
  } catch {
    _showToast("LOD verwijderen mislukt — controleer je verbinding.");
  }
}

function lodDagenTot(deadline) {
  if (!deadline) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((new Date(deadline) - now) / 86400000);
}
function lodDeadlineStijl(dagen) {
  if (dagen===null) return {};
  if (dagen<0) return {color:C.bordeaux,fontWeight:700};
  if (dagen<=14) return {color:C.bordeaux,fontWeight:600};
  if (dagen<=30) return {color:C.amber,fontWeight:600};
  return {color:C.tekst2};
}
function lodFmt(n) {
  if (!n||isNaN(n)) return '-';
  return '€ '+Number(n).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function lodNow() { return new Date().toISOString(); }
function lodFmtDt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function berekenAutoStatus(lod) {
  const s = lod.status;
  if (s==='afgerond'||s==='overschreden') return s;
  const ofs = lod.offertes||[];
  if (ofs.some(o=>o.opdrachtAfgerond))     return 'opdracht_uit';
  if (ofs.some(o=>o.opdracht))             return 'opdracht_uit';
  if (ofs.some(o=>o.vveAkkoord))           return 'vve_akkoord';
  if (ofs.some(o=>o.vveVoorlegd))          return 'vve_afwachting';
  const aangevraagd = ofs.filter(o=>o.aangevraagd);
  const allemaalOntvangen = aangevraagd.length > 0 && aangevraagd.every(o=>o.ontvangen);
  if (allemaalOntvangen)                   return 'offertes_lopen';
  if (aangevraagd.some(o=>!o.ontvangen))   return 'offertes_afwacht';
  if (aangevraagd.length > 0)              return 'in_behandeling';
  return 'nieuw';
}

function LodStatusBadge({ status }) {
  const s = LOD_STATUS[status]||LOD_STATUS.nieuw;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:999,background:s.bg,color:s.color,fontSize:11,fontWeight:600}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,display:'inline-block'}} />
      {s.label}
    </span>
  );
}

function buildTijdlijn(lod) {
  const events = [];
  const add = (ts,tekst,kleur) => { if(ts) events.push({ts,tekst,kleur}); };
  add(lod.tijdlijn?.vveGenotificeerd,          'VvE in kennis gesteld',                C.blauw);
  add(lod.tijdlijn?.vergaderingUitgeschreven,  'Vergadering uitgeschreven',            C.bordeaux);
  (lod.offertes||[]).forEach(o=>{
    add(o.tijdlijn?.aangevraagd,`Offerte aangevraagd bij ${o.partij||'onbekend'}`,    C.blauw);
    add(o.tijdlijn?.ontvangen,  `Offerte ontvangen van ${o.partij||'onbekend'}`,      C.blauw);
    add(o.tijdlijn?.vveVoorlegd,`Offerte voorgelegd aan VvE (${o.partij||'onbekend'})`,C.amber);
    add(o.tijdlijn?.vveAkkoord, `VvE akkoord op offerte ${o.partij||'onbekend'}`,     C.groen);
    add(o.tijdlijn?.opdracht,         `Opdracht verstrekt aan ${o.partij||'onbekend'}`,  C.blauw);
    add(o.tijdlijn?.opdrachtAfgerond, `Opdracht afgerond door ${o.partij||'onbekend'}`,   C.groen);
  });
  add(lod.tijdlijn?.uitstelAangevraagd,'Uitstel aangevraagd bij gemeente',             C.amber);
  add(lod.tijdlijn?.uitstelGoedgekeurd,'Uitstel goedgekeurd door gemeente',             C.groen);
  add(lod.tijdlijn?.gemeenteBevestigd,'Gemeente bevestigd / gereed gemeld',            C.groen);
  add(lod.tijdlijn?.afgerond,         'LOD afgerond',                                  C.tekst2);
  return events.sort((a,b)=>new Date(a.ts)-new Date(b.ts));
}

function lodVoortgang(lod) {
  const ofs = lod.offertes||[];
  const aangevraagd = ofs.filter(o=>o.aangevraagd);
  const allemaalOntvangen = aangevraagd.length > 0 && aangevraagd.every(o=>o.ontvangen);
  return [
    { lbl:'VvE in kennis gesteld',        ok: !!lod.vveGenotificeerd },
    { lbl:'Offertes aangevraagd',         ok: ofs.some(o=>o.aangevraagd) },
    { lbl:'Alle offertes ontvangen',      ok: allemaalOntvangen },
    { lbl:'Aan VvE voorgelegd/vergaderd', ok: ofs.some(o=>o.vveVoorlegd) || !!lod.vergaderingUitgeschreven },
    { lbl:'VvE akkoord',                  ok: ofs.some(o=>o.vveAkkoord) },
    { lbl:'Opdracht verstrekt',           ok: ofs.some(o=>o.opdracht) },
    { lbl:'Opdracht afgerond',            ok: ofs.some(o=>o.opdrachtAfgerond) },
    { lbl:'Afronding gemeld gemeente',    ok: !!lod.gemeenteBevestigd },
  ];
}

function LodVoortgangBalk({ lod }) {
  const stappen = lodVoortgang(lod);
  const gedaan  = stappen.filter(s=>s.ok).length;
  const pct     = Math.round(gedaan/stappen.length*100);
  return (
    <div style={{minWidth:160,maxWidth:200}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <span style={{fontSize:10,fontWeight:600,color:C.tekst2,textTransform:'uppercase',letterSpacing:'0.05em'}}>Voortgang</span>
        <span style={{fontSize:11,fontWeight:700,color:pct===100?C.groen:C.bordeaux,fontVariantNumeric:'tabular-nums'}}>{pct}%</span>
      </div>
      <div style={{height:6,background:C.lijnZacht,borderRadius:3,overflow:'hidden',marginBottom:5}}>
        <div style={{height:'100%',width:pct+'%',background:pct===100?C.groen:C.bordeaux,borderRadius:3,transition:'width .3s'}} />
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {stappen.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:9,color:s.ok?C.groen:C.tekst3}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:s.ok?C.groen:C.lijn,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{s.ok?I.chk(7,'#fff'):''}</span>
            {s.lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function lodExportPDF(lod, eenmaligResult) {
  const tijdlijn  = buildTijdlijn(lod);
  const dagen     = lodDagenTot(lod.deadlineAlgemeen);
  const statusLbl = (LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).label;
  const stappen   = lodVoortgang(lod);
  const gedaan    = stappen.filter(s=>s.ok).length;

  const offerteRijen = (lod.offertes||[]).map((o,i)=>`
    <tr style="background:${i%2===0?'#fff':'${C.inset}'}">
      <td>${o.partij||'-'}</td><td style="text-align:right">${lodFmt(o.bedrag)}</td>
      <td style="text-align:center">${o.aangevraagd?'✓':''}</td>
      <td style="text-align:center">${o.ontvangen?'✓':''}</td>
      <td style="text-align:center">${o.vveVoorlegd?'✓':''}</td>
      <td style="text-align:center">${o.vveAkkoord?'✓':''}</td>
      <td style="text-align:center">${o.opdracht?'✓':''}</td>
    </tr>`).join('');

  const puntenRijen = (lod.onderdelen||[]).map((o,i)=>`
    <tr style="background:${i%2===0?'#fff':'${C.inset}'}"><td>${i+1}</td><td>${o.omschrijving||'-'}</td></tr>`).join('');

  const tijdlijnRijen = tijdlijn.map(e=>`
    <tr><td style="white-space:nowrap;color:${C.tekst2}">${lodFmtDt(e.ts)}</td><td style="color:${e.kleur};font-weight:500">${e.tekst}</td></tr>`).join('');

  const voortgangRijen = stappen.map(s=>`
    <tr><td style="color:${s.ok?C.groen:C.tekst3}">${s.ok?'✓':'○'} ${s.lbl}</td></tr>`).join('');

  let eenmaligHTML = '';
  if (eenmaligResult && eenmaligResult.length) {
    eenmaligHTML = '<div class="sec">Eenmalige bijdragen per eigenaar</div>';
    eenmaligResult.forEach(item => {
      eenmaligHTML += `<p style="font-size:9pt;font-weight:600;margin:10px 0 4px">${item.omschrijving} — Offerte: ${lodFmt(item.offerte)}${item.totaleKorting>0?' — Netto: '+lodFmt(item.nettoOfferte):''} — ${item.tekort>0?'Tekort: '+lodFmt(item.tekort):'Volledig gedekt'}</p>`;
      eenmaligHTML += `<p style="font-size:8pt;color:${C.tekst2};margin-bottom:6px">Reserve: ${lodFmt(item.reserve)} — buffer: ${lodFmt(item.buffer)} — beschikbaar: ${lodFmt(item.beschikbaar)}</p>`;
      if (item.tekort>0 && item.perEigenaar.length) {
        eenmaligHTML += `<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Korting</th><th style="text-align:right">Bijdrage</th></tr></thead><tbody>`;
        item.perEigenaar.forEach((e,i)=>{
          eenmaligHTML += `<tr style="background:${i%2===0?'#fff':C.inset}"><td>${e.naam}</td><td style="text-align:right">${(e.aandeel*100).toFixed(2)}%</td><td style="text-align:right;color:${C.groen}">${e.korting>0?lodFmt(e.korting):'—'}</td><td style="text-align:right;font-weight:600;color:${C.bordeaux}">${lodFmt(e.bijdrage)}</td></tr>`;
        });
        eenmaligHTML += `</tbody><tfoot><tr><td colspan="3"><strong>Totaal tekort</strong></td><td style="text-align:right">${lodFmt(item.tekort)}</td></tr></tfoot></table>`;
      }
    });
  }

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
    <title>LOD Dossier - ${lod.vveNaam||'onbekend'}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:${C.ink};font-size:10pt;background:#fff;padding:32px 40px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid ${C.bordeaux};margin-bottom:22px}
    .hdr h1{font-family:"DM Sans",sans-serif;font-size:18pt;color:${C.bordeaux};font-weight:700}.hdr .meta{font-size:9pt;color:${C.tekst2};margin-top:3px}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:9pt;font-weight:600;background:${C.bordeauxTint};color:${C.bordeaux}}
    .sec{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${C.tekst2};margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid ${C.lijn}}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
    .info-block{background:${C.papier};border-left:3px solid ${C.bordeaux};padding:10px 14px;border-radius:4px}
    .info-label{font-size:8pt;color:${C.tekst2};text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
    .info-val{font-size:10pt;font-weight:600;color:${C.ink}}
    table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:14px}
    thead tr{background:${C.bordeaux};color:#fff}thead th{padding:7px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    tbody td{padding:6px 10px;border-bottom:1px solid ${C.lijn}}
    tfoot td{padding:7px 10px;font-weight:600;color:${C.bordeaux};border-top:2px solid ${C.bordeaux};background:${C.bordeauxTint}}
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid ${C.lijn};display:flex;justify-content:space-between;font-size:7.5pt;color:${C.tekst3}}
    .print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:${C.bordeaux};color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:"DM Sans",sans-serif}
    @media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>
    <div class="hdr">
      <div><h1>LOD Dossier</h1><div class="meta">${lod.vveNaam||'onbekend'} · Ref: ${lod.gemeenteReferentie||'-'} · Opgesteld op ${new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'})}</div></div>
      <div style="text-align:right"><span class="badge">${statusLbl}</span><div style="font-size:9pt;color:${C.tekst2};margin-top:4px">Voortgang: ${gedaan}/${stappen.length} stappen</div></div>
    </div>
    <div class="grid2">
      <div class="info-block"><div class="info-label">VvE</div><div class="info-val">${lod.vveNaam||'-'}</div></div>
      <div class="info-block"><div class="info-label">Behandelend beheerder</div><div class="info-val">${lod.behandelaar||'-'}</div></div>
      <div class="info-block"><div class="info-label">Gemeente referentie</div><div class="info-val">${lod.gemeenteReferentie||'-'}</div></div>
      <div class="info-block"><div class="info-label">Contactpersoon gemeente</div><div class="info-val">${lod.contactpersoon||'-'} ${lod.contactGemeente?'· '+lod.contactGemeente:''}</div></div>
      <div class="info-block"><div class="info-label">Ontvangstdatum</div><div class="info-val">${lod.ontvangstdatum?new Date(lod.ontvangstdatum).toLocaleDateString('nl-NL'):'-'}</div></div>
      <div class="info-block"><div class="info-label">Algehele deadline</div><div class="info-val" style="color:${dagen!==null&&dagen<0?C.bordeaux:'inherit'}">${lod.deadlineAlgemeen?new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL'):'-'}${dagen!==null?' ('+Math.abs(dagen)+(dagen<0?' dagen over':' dagen')+')':''}</div></div>
      <div class="info-block"><div class="info-label">Max. boete totaal</div><div class="info-val">${lodFmt(lod.boeteMax)}</div></div>
    </div>
    ${lod.notitie?`<div style="margin-bottom:10px;padding:10px 14px;background:${C.papier};border-radius:6px;font-size:9pt"><strong>Notitie:</strong> ${lod.notitie}</div>`:''}
    ${lod.uitstelAangevraagd?`<div style="margin-bottom:16px;padding:10px 14px;background:${C.amberTint};border-left:3px solid ${C.amber};border-radius:6px;font-size:9pt"><strong style="color:${C.amber}">Uitstel aangevraagd${lod.uitstelTot?' t/m '+new Date(lod.uitstelTot).toLocaleDateString('nl-NL'):''}</strong>${lod.uitstelReden?' — '+lod.uitstelReden:''}</div>`:''}
    <div class="sec">Voortgang</div>
    <table style="width:auto"><tbody>${voortgangRijen}</tbody></table>
    <div class="sec">Onderhoudspunten</div>
    <table><thead><tr><th>#</th><th>Omschrijving</th></tr></thead><tbody>${puntenRijen||'<tr><td colspan=2 style="color:'+C.tekst3+'">Geen onderhoudspunten</td></tr>'}</tbody></table>
    <div class="sec">Offertes</div>
    <table><thead><tr><th>Partij</th><th style="text-align:right">Bedrag</th><th style="text-align:center">Aangevraagd</th><th style="text-align:center">Ontvangen</th><th style="text-align:center">VvE voorgelegd</th><th style="text-align:center">VvE akkoord</th><th style="text-align:center">Opdracht</th></tr></thead><tbody>${offerteRijen||'<tr><td colspan=7 style="color:'+C.tekst3+'">Geen offertes</td></tr>'}</tbody></table>
    ${eenmaligHTML}
    <div class="sec">Tijdlijn dossier</div>
    <table><thead><tr><th>Datum en tijd</th><th>Actie</th></tr></thead><tbody>${tijdlijnRijen||'<tr><td colspan=2 style="color:'+C.tekst3+'">Geen tijdlijn</td></tr>'}</tbody></table>
    <div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>Last onder Dwangsom module</span></div>
    </body></html>`;

  const w = window.open('','_blank','width=1050,height=850');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Pop-up geblokkeerd.');
}


function exportTotaalLodPDF(lods) {
  const actief = lods.filter(l=>l.status!=='afgerond');
  const nu = new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});

  const rijen = actief.map((lod,i) => {
    const dagen  = lodDagenTot(lod.deadlineAlgemeen);
    const status = (LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).label;
    const stappen = lodVoortgang(lod);
    const gedaan  = stappen.filter(s=>s.ok).length;
    const pct     = Math.round(gedaan/stappen.length*100);
    const aantalOf = (lod.offertes||[]).filter(o=>o.aangevraagd).length;
    const deadlineKleur = dagen===null?C.ink:dagen<0?C.bordeaux:dagen<=14?C.amber:C.ink;
    return `<tr style="background:${i%2===0?'#fff':C.inset}">
      <td style="font-weight:600">${lod.vveNaam||'-'}</td>
      <td>${lod.gemeenteReferentie||'-'}</td>
      <td>${lod.behandelaar||'-'}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:8pt;font-weight:600;background:${(LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).bg};color:${(LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).color}">${status}</span></td>
      <td style="text-align:center;color:${deadlineKleur};font-weight:${dagen!==null&&dagen<=14?'600':'400'}">${lod.deadlineAlgemeen?new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL'):'-'}${dagen!==null?' ('+Math.abs(dagen)+(dagen<0?'d over':' d')+')':''}</td>
      <td style="text-align:right;color:${C.bordeaux};font-weight:600">${lodFmt(lod.boeteMax)}</td>
      <td style="text-align:center">${aantalOf}</td>
      <td style="text-align:center">
        <div style="display:flex;align-items:center;gap:6px;justify-content:center">
          <div style="width:60px;height:6px;background:${C.lijnZacht};border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct===100?C.groen:C.bordeaux};border-radius:3px"></div>
          </div>
          <span style="font-size:8pt;font-weight:600;color:${pct===100?C.groen:C.bordeaux}">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const totaalBoete = actief.reduce((s,l)=>s+(parseFloat(l.boeteMax)||0),0);
  const overschreden = actief.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0;}).length;
  const urgent = actief.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d>=0&&d<=14;}).length;

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
    <title>LOD Totaaloverzicht - ${nu}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:${C.ink};font-size:10pt;background:#fff;padding:32px 40px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid ${C.bordeaux};margin-bottom:22px}
    .hdr h1{font-family:"DM Sans",sans-serif;font-size:18pt;color:${C.bordeaux};font-weight:700}.hdr .meta{font-size:9pt;color:${C.tekst2};margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
    .stat{background:${C.papier};border-left:3px solid ${C.bordeaux};padding:10px 14px;border-radius:4px}
    .stat-num{font-family:"DM Sans",sans-serif;font-size:22pt;color:${C.bordeaux};font-weight:700}
    .stat-lbl{font-size:8pt;color:${C.tekst2};text-transform:uppercase;letter-spacing:.05em}
    table{width:100%;border-collapse:collapse;font-size:9pt}
    thead tr{background:${C.bordeaux};color:#fff}thead th{padding:8px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    tbody td{padding:7px 10px;border-bottom:1px solid ${C.lijn}}
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid ${C.lijn};display:flex;justify-content:space-between;font-size:7.5pt;color:${C.tekst3}}
    .print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:${C.bordeaux};color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:"DM Sans",sans-serif}
    @media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>
    <div class="hdr"><div><h1>LOD Totaaloverzicht</h1><div class="meta">Alle actieve LOD dossiers · Opgesteld op ${nu}</div></div></div>
    <div class="stats">
      <div class="stat"><div class="stat-num">${actief.length}</div><div class="stat-lbl">Actieve LODs</div></div>
      <div class="stat"><div class="stat-num" style="color:${C.amber}">${urgent}</div><div class="stat-lbl">Urgent (≤14 dagen)</div></div>
      <div class="stat"><div class="stat-num">${overschreden}</div><div class="stat-lbl">Deadline voorbij</div></div>
      <div class="stat"><div class="stat-num" style="font-size:16pt">${lodFmt(totaalBoete)}</div><div class="stat-lbl">Totaal boeterisico</div></div>
    </div>
    <table><thead><tr>
      <th>VvE</th><th>Ref. gemeente</th><th>Behandelaar</th><th>Status</th>
      <th>Deadline</th><th style="text-align:right">Max. boete</th>
      <th style="text-align:center">Offertes</th><th style="text-align:center">Voortgang</th>
    </tr></thead>
    <tbody>${rijen||'<tr><td colspan=8 style="color:'+C.tekst3+';text-align:center;padding:20px">Geen actieve LODs</td></tr>'}</tbody></table>
    <div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>Last onder Dwangsom module</span></div>
    </body></html>`;

  const w = window.open('','_blank','width=1200,height=850');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Pop-up geblokkeerd.');
}

// ── Eenmalige bijdrage tab ────────────────────────────────────────
function LodEenmaligTab({ lod, onUpdate }) {
  const fmt = calcFmt;
  const [items, setItems] = useState(() => {
    const bestaand = lod.eenmaligItems||[];
    const offertes = (lod.offertes||[]).filter(o=>o.partij||o.bedrag);
    if (!bestaand.length && offertes.length) {
      return offertes.map(o=>({ id:calcUid(), omschrijving:o.partij||'Offerte', bedrag:o.bedrag||'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }));
    }
    return bestaand.length ? bestaand : [{ id:calcUid(), omschrijving:'', bedrag:'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }];
  });
  const [eigRows, setEigRows] = useState(()=>lod.eenmaligEigenaren||[{id:calcUid(),naam:'',teller:''},{id:calcUid(),naam:'',teller:''}]);
  const [vasteNoemer, setVasteNoemer] = useState(lod.eenmaligNoemer||'');
  const [result, setResult] = useState(null);

  const syncOffertes = () => {
    const offertes = (lod.offertes||[]).filter(o=>o.partij||o.bedrag);
    if (!offertes.length) return;
    const synced = offertes.map(o=>{
      const bestaand = items.find(i=>i.omschrijving===o.partij||i.id===o.id);
      return bestaand ? { ...bestaand, omschrijving:o.partij||bestaand.omschrijving, bedrag:o.bedrag||bestaand.bedrag } : { id:calcUid(), omschrijving:o.partij||'', bedrag:o.bedrag||'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' };
    });
    setItems(synced);
    onUpdate({...lod, eenmaligItems:synced});
  };

  const save = (patch) => onUpdate({...lod,...patch});

  const bereken = () => {
    const noemer = parseFloat(vasteNoemer)>0?parseFloat(vasteNoemer):eigRows.reduce((s,r)=>s+(parseFloat(r.teller)||0),0);
    const validRows = eigRows.filter(r=>r.teller!==''&&parseFloat(r.teller)>0);
    if (!validRows.length) return;
    const aantalEig = validRows.length;
    const eigenaren = validRows.map(r=>({ naam:r.naam||'Eigenaar', teller:r.teller, noemer, aandeel:noemer>0?(parseFloat(r.teller)||0)/noemer:0 }));
    const berekend = items.map(item=>{
      const offerte   = parseFloat(item.bedrag)||0;
      const reserve   = parseFloat(item.reserveStand)||0;
      const buffer    = parseFloat(item.buffer)>=0?parseFloat(item.buffer):2500;
      const kortingPE = item.kortingAan?(parseFloat(item.kortingBedrag)||0):0;
      const totaleKorting = kortingPE*aantalEig;
      const nettoOfferte  = Math.max(0,offerte-totaleKorting);
      const beschikbaar   = Math.max(0,reserve-buffer);
      const tekort        = Math.max(0,nettoOfferte-beschikbaar);
      const perEigenaar   = eigenaren.map(e=>({naam:e.naam,aandeel:e.aandeel,korting:kortingPE,bijdrage:tekort>0?e.aandeel*tekort:0}));
      return {omschrijving:item.omschrijving||'Offerte',offerte,nettoOfferte,totaleKorting,reserve,buffer,beschikbaar,tekort,perEigenaar};
    });
    setResult(berekend);
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <p style={{fontSize:12,color:C.tekst2}}>Bereken de eenmalige bijdrage per eigenaar. Offertedata is overgenomen uit het Offertes tabblad.</p>
        <button onClick={syncOffertes} style={{padding:'5px 12px',background:C.wit,border:'1px solid '+C.bordeaux,borderRadius:7,fontSize:11,color:C.bordeaux,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif"}}>
          Offertes syncen
        </button>
      </div>

      <SecTitle>Eigenaren &amp; breukdelen</SecTitle>
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <label style={{fontSize:10,fontWeight:600,color:C.tekst2,display:'flex',alignItems:'center',gap:6}}>
            Noemer: <LodInp type="number" value={vasteNoemer} onChange={e=>{setVasteNoemer(e.target.value);save({eenmaligNoemer:e.target.value})}} placeholder="totaal" style={{width:80,fontSize:12}} />
          </label>
        </div>
        {eigRows.map((r,i)=>(
          <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',gap:8,marginBottom:6,alignItems:'center'}}>
            <LodInp value={r.naam} onChange={e=>{const nr=[...eigRows];nr[i]={...nr[i],naam:e.target.value};setEigRows(nr);save({eenmaligEigenaren:nr})}} placeholder="Naam eigenaar / appartement" style={{fontSize:12}} />
            <LodInp type="number" value={r.teller} onChange={e=>{const nr=[...eigRows];nr[i]={...nr[i],teller:e.target.value};setEigRows(nr);save({eenmaligEigenaren:nr})}} placeholder="Teller" style={{fontSize:12}} />
            <button onClick={()=>{const nr=eigRows.filter((_,j)=>j!==i);setEigRows(nr);save({eenmaligEigenaren:nr})}} style={{background:'none',border:'none',cursor:'pointer',color:C.tekst3,padding:4}}>
              {I.x(16,C.tekst3)}
            </button>
          </div>
        ))}
        <button onClick={()=>{const nr=[...eigRows,{id:calcUid(),naam:'',teller:''}];setEigRows(nr);save({eenmaligEigenaren:nr})}} style={{width:'100%',padding:'7px',background:C.wit,border:'1.5px dashed '+C.lijn,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.tekst2,cursor:'pointer'}}>+ Eigenaar toevoegen</button>
      </div>

      <SecTitle>Offerte(s)</SecTitle>
      <div style={{marginBottom:14}}>
        {items.map((item,i)=>(
          <div key={item.id} style={{background:C.inset,border:'1px solid '+C.lijn,borderRadius:10,padding:'12px 14px',marginBottom:8,position:'relative'}}>
            {items.length>1&&<button onClick={()=>{const ni=items.filter((_,j)=>j!==i);setItems(ni);save({eenmaligItems:ni})}} style={{position:'absolute',top:8,right:10,background:'none',border:'none',cursor:'pointer',color:C.tekst3}}>{I.x(16,C.tekst3)}</button>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 160px',gap:10,marginBottom:8}}>
              <LodField label="Omschrijving / partij">
                <LodInp value={item.omschrijving} onChange={e=>{const ni=[...items];ni[i]={...ni[i],omschrijving:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. Bouwbedrijf Jansen" style={{fontSize:12}} />
              </LodField>
              <LodField label="Offertebedrag (€)">
                <LodInp type="number" value={item.bedrag} onChange={e=>{const ni=[...items];ni[i]={...ni[i],bedrag:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 38000" style={{fontSize:12}} />
              </LodField>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8}}>
              <LodField label="Stand reservefonds (€)">
                <LodInp type="number" value={item.reserveStand} onChange={e=>{const ni=[...items];ni[i]={...ni[i],reserveStand:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 12000" style={{fontSize:12}} />
              </LodField>
              <LodField label="Buffer (€)">
                <LodInp type="number" value={item.buffer} onChange={e=>{const ni=[...items];ni[i]={...ni[i],buffer:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="2500" style={{fontSize:12}} />
              </LodField>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12,fontWeight:600,color:C.ink}}>
              <input type="checkbox" checked={!!item.kortingAan} onChange={e=>{const ni=[...items];ni[i]={...ni[i],kortingAan:e.target.checked};setItems(ni);save({eenmaligItems:ni})}} style={{width:13,height:13,accentColor:C.bordeaux,cursor:'pointer'}} />
              Gemeentelijke korting
            </label>
            {item.kortingAan&&<div style={{marginTop:6}}>
              <LodField label="Korting per eigenaar (€)">
                <LodInp type="number" value={item.kortingBedrag} onChange={e=>{const ni=[...items];ni[i]={...ni[i],kortingBedrag:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 1000" style={{width:160,fontSize:12}} />
              </LodField>
            </div>}
          </div>
        ))}
        <button onClick={()=>{const ni=[...items,{id:calcUid(),omschrijving:'',bedrag:'',reserveStand:'',buffer:'2500',kortingAan:false,kortingBedrag:''}];setItems(ni);save({eenmaligItems:ni})}} style={{width:'100%',padding:'7px',background:C.wit,border:'1.5px dashed '+C.lijn,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.tekst2,cursor:'pointer',marginBottom:10}}>+ Offerte toevoegen</button>
      </div>

      <button onClick={bereken} style={{width:'100%',padding:12,background:C.bordeaux,border:'none',borderRadius:10,fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:600,color:'#fff',cursor:'pointer'}}>
        Bereken eenmalige bijdragen
      </button>

      {result && (
        <>
          <button onClick={()=>lodExportPDF(lod, result)} style={{width:'100%',marginTop:10,padding:'9px',background:C.wit,border:'1.5px solid '+C.bordeaux,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.bordeaux,cursor:'pointer',fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            {I.print(14,C.bordeaux)} PDF rapport exporteren (incl. berekening)
          </button>
          {result.map((item,idx)=>(
            <div key={idx} style={{marginTop:12,background:C.wit,border:'1px solid '+C.lijn,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 14px',background:C.inset,borderBottom:'1px solid '+C.lijn,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontWeight:600,fontSize:13}}>{item.omschrijving}</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:16,fontWeight:700,color:item.tekort>0?C.bordeaux:C.groen,display:'flex',alignItems:'center',gap:4}}>
                  {item.tekort>0?'Tekort: '+fmt(item.tekort):<>{I.chk(14,C.groen)} Volledig gedekt</>}
                </span>
              </div>
              <div style={{padding:'5px 14px',fontSize:11,color:C.tekst2,fontVariantNumeric:'tabular-nums',borderBottom:'1px solid '+C.lijn}}>
                Reserve: {fmt(item.reserve)} — buffer: {fmt(item.buffer)} — beschikbaar: {fmt(item.beschikbaar)}
              </div>
              {item.tekort>0&&(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:C.inset,borderBottom:'1px solid '+C.lijn}}>
                    {['Eigenaar','Aandeel','Korting','Bijdrage'].map((h,i)=>(
                      <th key={i} style={{padding:'6px 12px',textAlign:i>0?'right':'left',fontSize:10,fontWeight:600,color:C.tekst2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{item.perEigenaar.map((e,i)=>(
                    <tr key={i} style={{borderBottom:i<item.perEigenaar.length-1?'1px solid '+C.lijn:'none',background:i%2===0?C.wit:C.inset}}>
                      <td style={{padding:'6px 12px',fontSize:12,fontWeight:500}}>{e.naam}</td>
                      <td style={{padding:'6px 12px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right'}}>{(e.aandeel*100).toFixed(2)}%</td>
                      <td style={{padding:'6px 12px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right',color:e.korting>0?C.groen:C.tekst3}}>{e.korting>0?fmt(e.korting):'—'}</td>
                      <td style={{padding:'6px 12px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right',color:C.bordeaux,fontWeight:600}}>{fmt(e.bijdrage)}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot style={{borderTop:'2px solid '+C.bordeaux}}>
                    <tr style={{background:C.bordeauxTint}}>
                      <td colSpan={3} style={{padding:'7px 12px',fontSize:12,fontWeight:600,color:C.tekst2}}>Totaal tekort</td>
                      <td style={{padding:'7px 12px',fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,color:C.bordeaux,textAlign:'right'}}>{fmt(item.tekort)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── LodKaart ─────────────────────────────────────────────────────
function LodKaart({ lod, onUpdate, onDelete, openId, setOpenId, beheerderList }) {
  const open = openId===lod.id;
  const dagen = lodDagenTot(lod.deadlineAlgemeen);
  const [tabKaart, setTabKaart] = useState('details');

  const update = (changes) => {
    const updated = {...lod,...changes};
    if (!['afgerond','overschreden'].includes(updated.status)||changes.offertes!==undefined) {
      if (changes.offertes!==undefined) {
        updated.status = berekenAutoStatus(updated);
      }
    }
    onUpdate(updated);
  };

  const toggleCheck = (field, tlKey, value) => {
    const tl = {...(lod.tijdlijn||{})};
    if (value&&!tl[tlKey]) tl[tlKey] = lodNow();
    else if (!value) delete tl[tlKey];
    update({[field]:value, tijdlijn:tl});
  };

  const updateOfferte = (idx, changes) => {
    const offertes = [...(lod.offertes||[])];
    offertes[idx] = {...offertes[idx],...changes};
    update({offertes});
  };

  const toggleOfferteCheck = (idx, field, tlKey, value) => {
    const offertes = [...(lod.offertes||[])];
    const tl = {...(offertes[idx].tijdlijn||{})};
    if (value&&!tl[tlKey]) tl[tlKey] = lodNow();
    else if (!value) delete tl[tlKey];
    offertes[idx] = {...offertes[idx],[field]:value,tijdlijn:tl};
    update({offertes});
  };

  const addOfferte  = () => update({offertes:[...(lod.offertes||[]),{id:lodUid(),partij:'',bedrag:'',aangevraagd:false,ontvangen:false,vveVoorlegd:false,vveAkkoord:false,opdracht:false,tijdlijn:{}}]});
  const delOfferte  = (idx) => {const o=[...(lod.offertes||[])];o.splice(idx,1);update({offertes:o});};
  const addOnderdeel= () => update({onderdelen:[...(lod.onderdelen||[]),{id:lodUid(),omschrijving:''}]});
  const delOnderdeel= (idx) => {const o=[...(lod.onderdelen||[])];o.splice(idx,1);update({onderdelen:o});};
  const updOnderdeel= (idx,val) => {const o=[...(lod.onderdelen||[])];o[idx]={...o[idx],omschrijving:val};update({onderdelen:o});};

  const markeerAfgerond = () => {
    const tl = {...(lod.tijdlijn||{}),afgerond:lodNow(),gemeenteBevestigd:lodNow()};
    onUpdate({...lod,status:'afgerond',gemeenteBevestigd:true,tijdlijn:tl});
    setOpenId(null);
  };

  const tijdlijn = buildTijdlijn(lod);
  const cardBorder = lod.status==='afgerond'?C.lijn:open?C.bordeaux:C.lijn;

  // Custom checkbox
  const Chk = ({checked,color=C.blauw}) => (
    <div style={{width:16,height:16,borderRadius:4,background:checked?color:'transparent',border:`1.5px solid ${checked?color:C.tekst3}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
      {checked&&I.chk(10,'#fff')}
    </div>
  );

  return (
    <div style={{background:lod.status==='afgerond'?C.inset:C.wit,border:'1.5px solid '+cardBorder,borderRadius:12,overflow:'hidden',marginBottom:10,boxShadow:open?'0 2px 12px rgba(153,26,33,.08)':'none',transition:'all .2s',opacity:lod.status==='afgerond'?.7:1}}>
      {/* Header */}
      <div onClick={()=>setOpenId(open?null:lod.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',userSelect:'none'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:14,color:C.ink}}>{lod.vveNaam||<span style={{color:C.tekst3,fontStyle:'italic'}}>VvE naam</span>}</span>
            <LodStatusBadge status={lod.status||'nieuw'} />
            {lod.behandelaar&&<span style={{fontSize:10,color:C.tekst2,background:C.lijnZacht,padding:'2px 7px',borderRadius:999}}>{lod.behandelaar}</span>}
            {lod.uitstelAangevraagd&&(
              <span style={{fontSize:10,fontWeight:600,background:lod.uitstelGoedgekeurd?C.groenTint:C.amberTint,color:lod.uitstelGoedgekeurd?C.groen:C.amber,padding:'2px 7px',borderRadius:999,border:'1px solid '+(lod.uitstelGoedgekeurd?C.groenRand:C.amberRand)}}>
                {lod.uitstelGoedgekeurd?'Uitstel goedgekeurd':'Uitstel aangevraagd'}{lod.uitstelTot&&lod.uitstelGoedgekeurd?' t/m '+new Date(lod.uitstelTot).toLocaleDateString('nl-NL'):''}
              </span>
            )}
            {lod.status!=='afgerond'&&dagen!==null&&dagen<0&&!lod.uitstelAangevraagd&&(
              <span style={{fontSize:10,fontWeight:600,background:C.bordeauxTint,color:C.bordeaux,padding:'2px 7px',borderRadius:999}}>Deadline voorbij</span>
            )}
          </div>
          <div style={{display:'flex',gap:12,marginTop:4,flexWrap:'wrap'}}>
            {lod.gemeenteReferentie&&<span style={{fontSize:11,color:C.tekst2}}>Ref: {lod.gemeenteReferentie}</span>}
            {lod.ontvangstdatum&&<span style={{fontSize:11,color:C.tekst2}}>Ontvangen: {new Date(lod.ontvangstdatum).toLocaleDateString('nl-NL')}</span>}
            {lod.deadlineAlgemeen&&(
              <span style={{fontSize:11,...(lod.status==='afgerond'?{color:C.tekst3}:lodDeadlineStijl(dagen))}}>
                Deadline: {new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL')}
                {lod.status==='afgerond'&&lod.tijdlijn?.afgerond&&(
                  <span style={{marginLeft:8,color:C.groen,fontWeight:600}}>
                    Afgerond: {new Date(lod.tijdlijn.afgerond).toLocaleDateString('nl-NL')}
                  </span>
                )}
              </span>
            )}
            {lod.boeteMax&&<span style={{fontSize:11,color:C.bordeaux,fontWeight:600}}>Max. boete: {lodFmt(lod.boeteMax)}</span>}
          </div>
        </div>
        <div onClick={e=>e.stopPropagation()}>
          <LodVoortgangBalk lod={lod} />
        </div>
        <span style={{color:C.tekst3,transform:open?'rotate(180deg)':'none',transition:'transform .2s'}}>{I.chev(16,C.tekst3)}</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{borderTop:'1.5px solid '+C.lijn,background:C.inset}}>
          {/* Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid '+C.lijn,background:C.wit,paddingLeft:16,overflowX:'auto'}}>
            {[['details','Gegevens'],['onderdelen','Onderhoudspunten'],['offertes','Offertes'],['tijdlijn','Tijdlijn'],['eenmalig','Eenmalige bijdrage']].map(([key,lbl])=>(
              <button key={key} onClick={()=>setTabKaart(key)}
                style={{padding:'9px 14px',border:'none',borderBottom:'2px solid '+(tabKaart===key?C.bordeaux:'transparent'),background:'transparent',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:tabKaart===key?600:400,color:tabKaart===key?C.bordeaux:C.tekst2,cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>
                {lbl}
              </button>
            ))}
          </div>

          <div style={{padding:16}}>
            {/* TAB: Gegevens */}
            {tabKaart==='details'&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>
                  {[
                    ['VvE naam','text','vveNaam','bijv. VvE Reinkenstraat 1-24'],
                    ['Gemeente referentie','text','gemeenteReferentie','bijv. LOD-2026-04821'],
                    ['Status','select','status',null],
                    ['Ontvangstdatum LOD','date','ontvangstdatum',null],
                    ['Algehele deadline gemeente','date','deadlineAlgemeen',null],
                    ['Max. boete totaal (€)','number','boeteMax','bijv. 25000'],
                    ['Contactpersoon gemeente','text','contactpersoon','bijv. dhr. J. de Vries'],
                    ['Tel. / e-mail gemeente','text','contactGemeente','bijv. 070-123 4567'],
                  ].map(([label,type,field,placeholder])=>(
                    <LodField key={field} label={label}>
                      {type==='select'?(
                        <select value={lod[field]||'nieuw'} onChange={e=>update({[field]:e.target.value})} style={{...lodInp,fontSize:13,cursor:'pointer'}}>
                          {Object.entries(LOD_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ):(
                        <LodInp type={type} value={lod[field]||''} onChange={e=>update({[field]:e.target.value})} placeholder={placeholder||''} style={{fontSize:13}} />
                      )}
                    </LodField>
                  ))}
                  <LodField label="Behandelend beheerder">
                    <select value={lod.behandelaar||''} onChange={e=>update({behandelaar:e.target.value})} style={{...lodInp,fontSize:13,cursor:'pointer'}}>
                      <option value="">— Selecteer beheerder —</option>
                      {(beheerderList||[]).map(naam=><option key={naam} value={naam}>{naam}</option>)}
                    </select>
                  </LodField>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:600,color:C.tekst2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Voortgang LOD</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                    {[
                      ['vveGenotificeerd','vveGenotificeerd','VvE in kennis gesteld'],
                      ['vergaderingUitgeschreven','vergaderingUitgeschreven','Vergadering uitgeschreven'],
                      ['gemeenteBevestigd','gemeenteBevestigd','Afronding gemeld gemeente'],
                    ].map(([field,tlKey,lbl])=>(
                      <label key={field} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'8px 10px',background:lod[field]?C.blauwTint:C.wit,border:'1.5px solid '+(lod[field]?C.blauw:C.lijn),borderRadius:8,fontSize:11,fontWeight:600,color:lod[field]?C.blauw:C.tekst2,userSelect:'none',transition:'all .15s'}}>
                        <input type="checkbox" checked={!!lod[field]} onChange={e=>toggleCheck(field,tlKey,e.target.checked)} style={{width:13,height:13,accentColor:C.blauw,cursor:'pointer'}} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <LodField label="Interne notitie">
                    <textarea value={lod.notitie||''} onChange={e=>update({notitie:e.target.value})} placeholder="Bijzonderheden, afspraken, opmerkingen..."
                      style={{width:'100%',minHeight:70,padding:'8px 11px',border:'1.5px solid '+C.lijn,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.ink,background:C.wit,outline:'none',resize:'vertical'}} />
                  </LodField>
                </div>

                {/* Uitstel */}
                {lod.status !== 'afgerond' && <div style={{marginBottom:14,padding:'12px 14px',background:lod.uitstelAangevraagd?C.amberTint:C.inset,border:'1.5px solid '+(lod.uitstelAangevraagd?C.amber:C.lijn),borderRadius:10,transition:'all .2s'}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
                    <Chk checked={!!lod.uitstelAangevraagd} color={C.amber} />
                    <input type="checkbox" checked={!!lod.uitstelAangevraagd} onChange={e=>{
                      const tl = {...(lod.tijdlijn||{})};
                      if (e.target.checked && !tl.uitstelAangevraagd) tl.uitstelAangevraagd = lodNow();
                      else if (!e.target.checked) { delete tl.uitstelAangevraagd; delete tl.uitstelGoedgekeurd; }
                      update({uitstelAangevraagd:e.target.checked, uitstelGoedgekeurd: e.target.checked ? lod.uitstelGoedgekeurd : false, tijdlijn:tl});
                    }} style={{display:'none'}} />
                    <span style={{fontSize:13,fontWeight:600,color:lod.uitstelAangevraagd?C.amber:C.ink}}>Uitstel aangevraagd</span>
                    {lod.uitstelAangevraagd&&lod.uitstelTot&&(
                      <span style={{marginLeft:'auto',fontSize:11,fontWeight:600,color:C.amber,fontVariantNumeric:'tabular-nums'}}>
                        t/m {new Date(lod.uitstelTot).toLocaleDateString('nl-NL')}
                      </span>
                    )}
                  </label>
                  {lod.uitstelAangevraagd&&(
                    <div style={{marginTop:10}}>
                      <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:lod.uitstelGoedgekeurd?C.groenTint:C.wit,border:'1.5px solid '+(lod.uitstelGoedgekeurd?C.groen:C.lijn),borderRadius:8,marginBottom:10,userSelect:'none',transition:'all .15s'}}>
                        <Chk checked={!!lod.uitstelGoedgekeurd} color={C.groen} />
                        <input type="checkbox" checked={!!lod.uitstelGoedgekeurd} onChange={e=>{
                          const tl = {...(lod.tijdlijn||{})};
                          if (e.target.checked && !tl.uitstelGoedgekeurd) tl.uitstelGoedgekeurd = lodNow();
                          else if (!e.target.checked) delete tl.uitstelGoedgekeurd;
                          update({uitstelGoedgekeurd:e.target.checked, tijdlijn:tl});
                        }} style={{display:'none'}} />
                        <span style={{fontSize:12,fontWeight:600,color:lod.uitstelGoedgekeurd?C.groen:C.ink}}>Uitstel goedgekeurd door gemeente</span>
                      </label>
                      {lod.uitstelGoedgekeurd&&(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                          <LodField label="Uitstel tot wanneer">
                            <LodInp type="date" value={lod.uitstelTot||''} onChange={e=>update({uitstelTot:e.target.value})} style={{fontSize:13,borderColor:C.groenRand}} />
                          </LodField>
                          <LodField label="Reden uitstel">
                            <LodInp value={lod.uitstelReden||''} onChange={e=>update({uitstelReden:e.target.value})} placeholder="bijv. gemeentelijke goedkeuring ontvangen" style={{fontSize:12,borderColor:C.groenRand}} />
                          </LodField>
                        </div>
                      )}
                    </div>
                  )}
                </div>}

                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:12,borderTop:'1px solid '+C.lijn}}>
                  <button onClick={()=>{if(window.confirm('LOD verwijderen?'))onDelete()}} style={{padding:'7px 14px',background:C.wit,border:'1.5px solid '+C.bordeauxRand,borderRadius:8,fontSize:12,color:C.bordeaux,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',gap:4}}>
                    {I.trash(14,C.bordeaux)} LOD verwijderen
                  </button>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>lodExportPDF(lod,null)} style={{padding:'7px 14px',background:C.wit,border:'1.5px solid '+C.bordeaux,borderRadius:8,fontSize:12,color:C.bordeaux,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
                      {I.print(14,C.bordeaux)} PDF rapport
                    </button>
                    {lod.status!=='afgerond'?(
                      <button onClick={markeerAfgerond} style={{padding:'7px 18px',background:C.groen,border:'none',borderRadius:8,fontSize:12,color:'#fff',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                        {I.chk(14,'#fff')} LOD afgerond
                      </button>
                    ):(
                      <button onClick={()=>{
                        const tl = {...(lod.tijdlijn||{})};
                        delete tl.afgerond;
                        onUpdate({...lod,status:'opdracht_uit',gemeenteBevestigd:false,tijdlijn:tl});
                      }} style={{padding:'7px 18px',background:C.wit,border:'1.5px solid '+C.blauw,borderRadius:8,fontSize:12,color:C.blauw,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
                        LOD heropenen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Onderhoudspunten */}
            {tabKaart==='onderdelen'&&(
              <div>
                <p style={{fontSize:12,color:C.tekst2,marginBottom:12}}>Beschrijf de onderhoudspunten zoals benoemd in de LOD.</p>
                {(lod.onderdelen||[]).length===0&&<div style={{textAlign:'center',padding:'30px',color:C.tekst3,fontSize:13}}>Nog geen onderhoudspunten toegevoegd.</div>}
                {(lod.onderdelen||[]).map((o,i)=>(
                  <div key={o.id||i} style={{display:'grid',gridTemplateColumns:'28px 1fr 36px',gap:8,alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.tekst2,textAlign:'center'}}>{i+1}</span>
                    <LodInp value={o.omschrijving||''} onChange={e=>updOnderdeel(i,e.target.value)} placeholder={`Onderhoudspunt ${i+1} — bijv. Herstel gevelmetselwerk`} style={{fontSize:13}} />
                    <button onClick={()=>delOnderdeel(i)} style={{background:'none',border:'none',cursor:'pointer',color:C.tekst3,padding:'4px 8px'}}>{I.x(16,C.tekst3)}</button>
                  </div>
                ))}
                <button onClick={addOnderdeel} style={{width:'100%',padding:'9px',background:C.wit,border:'1.5px dashed '+C.lijn,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.tekst2,cursor:'pointer',marginTop:4}}>
                  + Onderhoudspunt toevoegen
                </button>
              </div>
            )}

            {/* TAB: Offertes */}
            {tabKaart==='offertes'&&(
              <div>
                <p style={{fontSize:12,color:C.tekst2,marginBottom:12}}>Registreer per partij de offerte. De status van de LOD wordt automatisch bijgewerkt.</p>
                {(lod.offertes||[]).length===0&&<div style={{textAlign:'center',padding:'30px',color:C.tekst3,fontSize:13}}>Nog geen offertes geregistreerd.</div>}
                {(lod.offertes||[]).map((o,i)=>(
                  <div key={o.id||i} style={{background:C.inset,border:'1px solid '+C.lijn,borderRadius:10,padding:14,marginBottom:10}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,marginBottom:10,alignItems:'end'}}>
                      <LodField label="Partij / aannemer">
                        <LodInp value={o.partij||''} onChange={e=>updateOfferte(i,{partij:e.target.value})} placeholder="bijv. Bouwbedrijf Jansen" style={{fontSize:13}} />
                      </LodField>
                      <LodField label="Totaalprijs offerte (€)">
                        <LodInp type="number" value={o.bedrag||''} onChange={e=>updateOfferte(i,{bedrag:e.target.value})} placeholder="bijv. 42000" style={{fontSize:13}} />
                      </LodField>
                      <button onClick={()=>delOfferte(i)} style={{background:'none',border:'none',cursor:'pointer',color:C.tekst3,padding:8}}>{I.x(16,C.tekst3)}</button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                      {[
                        ['aangevraagd','aangevraagd','Offerte aangevraagd'],
                        ['ontvangen','ontvangen','Offerte ontvangen'],
                        ['vveVoorlegd','vveVoorlegd','Aan VvE voorgelegd'],
                        ['vveAkkoord','vveAkkoord','VvE akkoord'],
                        ['opdracht','opdracht','Opdracht verstrekt'],
                        ['opdrachtAfgerond','opdrachtAfgerond','Opdracht afgerond'],
                      ].map(([field,tlKey,lbl])=>(
                        <label key={field} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',padding:'7px 8px',background:o[field]?C.groenTint:C.wit,border:'1.5px solid '+(o[field]?C.groen:C.lijn),borderRadius:7,fontSize:10,fontWeight:600,color:o[field]?C.groen:C.tekst2,userSelect:'none',transition:'all .15s'}}>
                          <input type="checkbox" checked={!!o[field]} onChange={e=>toggleOfferteCheck(i,field,tlKey,e.target.checked)} style={{width:12,height:12,accentColor:C.groen,cursor:'pointer'}} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    {o.ontvangen&&o.bedrag&&<div style={{marginTop:8,padding:'5px 9px',background:C.groenTint,borderRadius:6,fontSize:11,color:C.groen,fontVariantNumeric:'tabular-nums'}}>Offertebedrag: {lodFmt(o.bedrag)}</div>}
                  </div>
                ))}
                <button onClick={addOfferte} style={{width:'100%',padding:'9px',background:C.wit,border:'1.5px dashed '+C.lijn,borderRadius:8,fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.tekst2,cursor:'pointer',marginTop:4}}>
                  + Partij / offerte toevoegen
                </button>
              </div>
            )}

            {/* TAB: Tijdlijn */}
            {tabKaart==='tijdlijn'&&(
              <div>
                {tijdlijn.length===0?(
                  <div style={{textAlign:'center',padding:'30px',color:C.tekst3,fontSize:13}}>Nog geen acties. Vink stappen aan om de tijdlijn op te bouwen.</div>
                ):(
                  <div style={{position:'relative',paddingLeft:24}}>
                    <div style={{position:'absolute',left:7,top:0,bottom:0,width:2,background:C.lijn,borderRadius:2}} />
                    {tijdlijn.map((e,i)=>(
                      <div key={i} style={{position:'relative',marginBottom:16}}>
                        <div style={{position:'absolute',left:-20,top:3,width:10,height:10,borderRadius:'50%',background:e.kleur,border:'2px solid #fff',boxShadow:'0 0 0 2px '+e.kleur}} />
                        <div style={{fontSize:11,color:C.tekst2,marginBottom:2}}>{lodFmtDt(e.ts)}</div>
                        <div style={{fontSize:13,fontWeight:600,color:e.kleur}}>{e.tekst}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Eenmalige bijdrage */}
            {tabKaart==='eenmalig'&&<LodEenmaligTab lod={lod} onUpdate={onUpdate} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kalender view ────────────────────────────────────────────────
function LodKalender({ lods }) {
  const now = new Date();
  const [jaar, setJaar] = useState(now.getFullYear());
  const maandNamen = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
  const events = [];
  lods.filter(l=>l.status!=='afgerond').forEach(l=>{
    if (l.deadlineAlgemeen) {
      const d = new Date(l.deadlineAlgemeen);
      if (d.getFullYear()===jaar) events.push({maand:d.getMonth(),dag:d.getDate(),naam:l.vveNaam||'Naamloos',dagen:lodDagenTot(l.deadlineAlgemeen)});
    }
  });
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={()=>setJaar(j=>j-1)} style={{padding:'6px 14px',border:'1px solid '+C.lijn,borderRadius:7,background:C.wit,cursor:'pointer',fontSize:13,fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',gap:4}}>{I.arrowL(14,C.tekst2)} {jaar-1}</button>
        <span style={{fontSize:16,fontWeight:700,color:C.ink}}>{jaar}</span>
        <button onClick={()=>setJaar(j=>j+1)} style={{padding:'6px 14px',border:'1px solid '+C.lijn,borderRadius:7,background:C.wit,cursor:'pointer',fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>{jaar+1}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        {maandNamen.map((naam,mi)=>{
          const me = events.filter(e=>e.maand===mi);
          const isHuidig = mi===now.getMonth()&&jaar===now.getFullYear();
          return (
            <div key={mi} style={{background:C.wit,border:'1.5px solid '+(isHuidig?C.bordeaux:C.lijn),borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'8px 12px',background:isHuidig?C.bordeauxTint:C.inset,borderBottom:'1px solid '+C.lijn,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:700,color:isHuidig?C.bordeaux:C.ink}}>{naam}</span>
                {me.length>0&&<span style={{fontSize:10,fontWeight:600,background:C.bordeauxTint,color:C.bordeaux,padding:'1px 6px',borderRadius:999}}>{me.length}</span>}
              </div>
              <div style={{padding:'8px 10px',minHeight:60}}>
                {me.length===0?<span style={{fontSize:10,color:C.tekst3}}>Geen deadlines</span>:
                  me.map((e,i)=>(
                    <div key={i} style={{marginBottom:5,padding:'4px 7px',background:e.dagen<0?C.bordeauxTint:e.dagen<=14?C.amberTint:C.blauwTint,borderRadius:6,borderLeft:'3px solid '+(e.dagen<0?C.bordeaux:e.dagen<=14?C.amber:C.blauw)}}>
                      <div style={{fontSize:10,fontWeight:600,color:e.dagen<0?C.bordeaux:e.dagen<=14?C.amber:C.blauw}}>{e.naam}</div>
                      <div style={{fontSize:9,color:C.tekst2}}>{e.dag} {naam.toLowerCase()} · {e.dagen<0?Math.abs(e.dagen)+'d over':e.dagen===0?'vandaag':e.dagen+'d'}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── LodBeheer (hoofd-component) ──────────────────────────────────
export default function LodBeheer({ onTerug, beheerderList }) {
  const [lods, setLods] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [zoek, setZoek] = useState('');
  const [filterStatus, setFilterStatus] = useState('alle');
  const [tabHoofd, setTabHoofd] = useState('lods');
  const [loading, setLoading] = useState(true);
  const [hideAfgerond, setHideAfgerond] = useState(false);
  const [filterMaand, setFilterMaand] = useState(null);

  useEffect(()=>{
    lodSupaLoad().then(data=>{
      if (data && data.length) setLods(data);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const saveAndSet = async (nl) => { setLods(nl); };

  const addLod = async () => {
    const n = {id:lodUid(),vveNaam:'',gemeenteReferentie:'',status:'nieuw',behandelaar:'',
      ontvangstdatum:_today(),deadlineAlgemeen:'',boeteMax:'',
      notitie:'',contactpersoon:'',contactGemeente:'',
      vveGenotificeerd:false,vergaderingUitgeschreven:false,gemeenteBevestigd:false,
      onderdelen:[],offertes:[],tijdlijn:{ontvangen:lodNow()}};
    const updated = [n,...lods];
    setLods(updated);
    await lodSupaSave(n);
    setOpenId(n.id);
    setTabHoofd('lods');
  };

  const updateLod = async (u) => {
    setLods(prev=>prev.map(l=>l.id===u.id?u:l));
    await lodSupaSave(u);
  };

  const deleteLod = async (id) => {
    setLods(prev=>prev.filter(l=>l.id!==id));
    await lodSupaDelete(id);
  };

  // Stats
  const actief       = lods.filter(l=>l.status!=='afgerond');
  const ofwacht      = lods.filter(l=>l.status==='offertes_afwacht');
  const vveAfwacht   = lods.filter(l=>l.status==='vve_afwachting');
  const urgent       = lods.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<=14&&d>=0&&l.status!=='afgerond';});
  const overschreden = lods.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0&&l.status!=='afgerond';});
  const totaalBoete  = actief.reduce((s,l)=>s+(parseFloat(l.boeteMax)||0),0);

  const filterLijstStatussen = Object.entries(LOD_STATUS).filter(([k])=>k!=='in_behandeling'&&k!=='offertes_lopen');
  const uitstelLods = lods.filter(l=>!!l.uitstelAangevraagd);

  let zichtbaar = lods.filter(l=>{
    const mz = !zoek||(l.vveNaam||'').toLowerCase().includes(zoek.toLowerCase())||(l.gemeenteReferentie||'').toLowerCase().includes(zoek.toLowerCase());
    let ms = true;
    if (filterStatus==='actief')         ms=l.status!=='afgerond';
    else if (filterStatus==='urgent')    ms=(()=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<=14&&d>=0&&l.status!=='afgerond';})();
    else if (filterStatus==='overschreden') ms=(()=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0&&l.status!=='afgerond';})();
    else if (filterStatus==='uitstel')   ms=!!l.uitstelAangevraagd;
    else if (filterStatus!=='alle')      ms=l.status===filterStatus;
    if (hideAfgerond && l.status==='afgerond') return false;
    if (filterMaand!==null && l.deadlineAlgemeen) {
      const d = new Date(l.deadlineAlgemeen);
      if (d.getMonth()!==filterMaand) return false;
    } else if (filterMaand!==null && !l.deadlineAlgemeen) return false;
    return mz&&ms;
  });

  if (loading) return (
    <div style={{minHeight:'100vh',background:C.papier,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <style>{CSS_FONT}</style>
      <div style={{textAlign:'center',color:C.tekst2}}>
        {I.clock(28, C.tekst3)}
        <div style={{fontSize:14,marginTop:8}}>LOD data laden...</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:C.papier}}>
      <style>{CSS_FONT}</style>

      {/* ── Topbar ── */}
      <div style={{position:'sticky',top:0,zIndex:50,background:C.wit,borderBottom:'1px solid '+C.lijn,height:56,padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{borderLeft:'3px solid '+C.bordeaux,paddingLeft:10,display:'flex',alignItems:'center',gap:8}}>
            {I.shield(18, C.bordeaux)}
            <span style={{fontSize:14,fontWeight:700,color:C.ink}}>LOD Beheer</span>
            <span style={{fontSize:12,color:C.tekst3}}>Last onder Dwangsom module</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={addLod} style={{fontSize:12,padding:'6px 14px',background:C.bordeaux,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
            {I.plus(14,'#fff')} Nieuwe LOD
          </button>
          <button onClick={()=>exportTotaalLodPDF(lods)} style={{fontSize:12,padding:'6px 14px',background:C.wit,color:C.bordeaux,border:'1.5px solid '+C.bordeaux,borderRadius:8,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
            {I.print(14,C.bordeaux)} Totaaloverzicht PDF
          </button>
          <button onClick={onTerug} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,padding:'6px 12px',background:C.wit,border:'1px solid '+C.lijn,borderRadius:10,color:C.tekst2,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
            {I.arrowL(14,C.tekst2)} Terug naar portaal
          </button>
        </div>
      </div>

      {/* ── KPI Kaarten ── */}
      <div style={{background:C.wit,borderBottom:'1px solid '+C.lijn,padding:'16px 24px'}}>
        <div style={{maxWidth:1200,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(4,1fr) auto',gap:12}}>
          {[
            {label:"Actieve LOD's", val:actief.length,  color:C.blauw,    onClick:()=>setFilterStatus('actief')},
            {label:'Offerte in afwachting', val:ofwacht.length, color:C.amber, onClick:()=>setFilterStatus('offertes_afwacht')},
            {label:'Urgent (≤14d)',  val:urgent.length,   color:C.bordeaux, onClick:()=>setFilterStatus('urgent')},
            {label:'Deadline voorbij', val:overschreden.length, color:C.bordeaux, onClick:()=>setFilterStatus('overschreden')},
          ].map((kpi,i)=>(
            <button key={i} onClick={kpi.onClick} style={{background:C.inset,borderLeft:'3px solid '+kpi.color,border:'1px solid '+C.lijn,borderLeftWidth:3,borderLeftColor:kpi.color,borderRadius:10,padding:'12px 16px',cursor:'pointer',textAlign:'left',fontFamily:"'DM Sans',sans-serif",transition:'all .15s'}}>
              <div style={{fontSize:28,fontWeight:700,color:kpi.color,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{kpi.val}</div>
              <div style={{fontSize:11,color:C.tekst2,fontWeight:600,marginTop:4}}>{kpi.label}</div>
            </button>
          ))}
          {totaalBoete>0&&(
            <div style={{background:C.bordeauxTint,borderLeft:'3px solid '+C.bordeaux,borderRadius:10,padding:'12px 16px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
              <div style={{fontSize:18,fontWeight:700,color:C.bordeaux,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{lodFmt(totaalBoete)}</div>
              <div style={{fontSize:11,color:C.bordeaux,fontWeight:600,marginTop:4}}>Totaal boeterisico</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{background:C.wit,borderBottom:'1px solid '+C.lijn,paddingLeft:20,display:'flex'}}>
        <div style={{maxWidth:1200,margin:'0 auto',display:'flex',width:'100%'}}>
          {[['lods','LOD overzicht',I.file(14)],['kalender','Deadlinekalender',I.cal(14)]].map(([key,lbl,icon])=>(
            <button key={key} onClick={()=>setTabHoofd(key)}
              style={{padding:'10px 18px',border:'none',borderBottom:'2px solid '+(tabHoofd===key?C.bordeaux:'transparent'),background:'transparent',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:tabHoofd===key?600:400,color:tabHoofd===key?C.bordeaux:C.tekst3,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              {icon}{lbl}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1200,margin:'0 auto',padding:'24px 20px 80px'}}>
        {tabHoofd==='kalender'?<LodKalender lods={lods}/>:(
          <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:20}}>
            {/* ── Zijbalk ── */}
            <div>
              {(overschreden.length>0||urgent.length>0||ofwacht.length>0||vveAfwacht.length>0)&&(
                <LodCard>
                  <div style={{padding:'14px 16px'}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:C.bordeaux,marginBottom:10,display:'flex',alignItems:'center',gap:6}}>{I.warn(14,C.bordeaux)} Actie vereist</div>
                    {overschreden.map(l=>(
                      <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:C.bordeauxTint,border:'1px solid '+C.bordeauxRand,borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                        <span style={{fontWeight:600,color:C.bordeaux}}>{l.vveNaam||'Naamloos'}</span>
                        <span style={{color:C.bordeaux,fontVariantNumeric:'tabular-nums'}}>voorbij</span>
                      </div>
                    ))}
                    {urgent.map(l=>(
                      <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:C.amberTint,border:'1px solid '+C.amberRand,borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                        <span style={{fontWeight:600,color:C.amber}}>{l.vveNaam||'Naamloos'}</span>
                        <span style={{color:C.amber,fontVariantNumeric:'tabular-nums'}}>{lodDagenTot(l.deadlineAlgemeen)}d</span>
                      </div>
                    ))}
                    {ofwacht.filter(l=>!overschreden.includes(l)&&!urgent.includes(l)).map(l=>(
                      <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:C.blauwTint,border:'1px solid '+C.blauwRand,borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                        <span style={{fontWeight:600,color:C.blauw}}>{l.vveNaam||'Naamloos'}</span>
                        <span style={{color:C.blauw}}>offerte open</span>
                      </div>
                    ))}
                    {vveAfwacht.filter(l=>!overschreden.includes(l)&&!urgent.includes(l)&&!ofwacht.includes(l)).map(l=>(
                      <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:C.groenTint,border:'1px solid '+C.groenRand,borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                        <span style={{fontWeight:600,color:C.groen}}>{l.vveNaam||'Naamloos'}</span>
                        <span style={{color:C.groen}}>wacht VvE</span>
                      </div>
                    ))}
                  </div>
                </LodCard>
              )}

              {/* Verberg afgerond */}
              <button onClick={()=>setHideAfgerond(p=>!p)}
                style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 12px',background:hideAfgerond?C.groenTint:C.wit,border:'1.5px solid '+(hideAfgerond?C.groen:C.lijn),borderRadius:10,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:10,transition:'all .15s'}}>
                <div style={{width:16,height:16,borderRadius:4,background:hideAfgerond?C.groen:'transparent',border:'1.5px solid '+(hideAfgerond?C.groen:C.tekst3),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {hideAfgerond&&I.chk(10,'#fff')}
                </div>
                <span style={{fontSize:12,fontWeight:600,color:hideAfgerond?C.groen:C.ink}}>Verberg afgerond</span>
                {hideAfgerond&&<span style={{marginLeft:'auto',fontSize:10,color:C.groen,fontWeight:600}}>{lods.filter(l=>l.status==='afgerond').length} verborgen</span>}
              </button>

              <LodCard>
                <div style={{padding:'14px 16px'}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:C.tekst2,marginBottom:10}}>Filter op status</div>
                  {[['alle',"Alle LOD's"],...filterLijstStatussen.map(([k,v])=>[k,v.label]),['uitstel','Uitstel aangevraagd']].map(([key,lbl])=>(
                    <button key={key} onClick={()=>setFilterStatus(key)}
                      style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',borderRadius:7,border:'none',background:filterStatus===key?C.bordeauxTint:'transparent',color:filterStatus===key?C.bordeaux:C.ink,fontSize:12,fontWeight:filterStatus===key?600:400,cursor:'pointer',marginBottom:2,fontFamily:"'DM Sans',sans-serif"}}>
                      {lbl}
                      <span style={{float:'right',fontSize:11,color:C.tekst3,fontVariantNumeric:'tabular-nums'}}>{key==='alle'?lods.length:lods.filter(l=>l.status===key).length}</span>
                    </button>
                  ))}
                </div>
              </LodCard>

              {/* Maandfilter */}
              <LodCard>
                <div style={{padding:'14px 16px'}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:C.tekst2,marginBottom:10}}>Filter op deadline maand</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>
                    {['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'].map((m,mi)=>{
                      const aantalInMaand = lods.filter(l=>{
                        if (!l.deadlineAlgemeen) return false;
                        return new Date(l.deadlineAlgemeen).getMonth()===mi && l.status!=='afgerond';
                      }).length;
                      return (
                        <button key={mi} onClick={()=>setFilterMaand(filterMaand===mi?null:mi)}
                          style={{padding:'5px 4px',borderRadius:6,border:'1.5px solid '+(filterMaand===mi?C.bordeaux:C.lijn),background:filterMaand===mi?C.bordeauxTint:'transparent',color:filterMaand===mi?C.bordeaux:C.ink,fontSize:11,fontWeight:filterMaand===mi?700:400,cursor:'pointer',textAlign:'center',transition:'all .15s',position:'relative',fontFamily:"'DM Sans',sans-serif"}}>
                          {m}
                          {aantalInMaand>0&&<span style={{position:'absolute',top:-4,right:-4,width:14,height:14,borderRadius:'50%',background:C.bordeaux,color:'#fff',fontSize:8,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{aantalInMaand}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {filterMaand!==null&&<button onClick={()=>setFilterMaand(null)} style={{marginTop:8,width:'100%',padding:'5px',background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:C.tekst3,textDecoration:'underline',fontFamily:"'DM Sans',sans-serif"}}>Maandfilter wissen</button>}
                </div>
              </LodCard>
            </div>

            {/* ── Hoofdpanel ── */}
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
                <LodInp value={zoek} onChange={e=>setZoek(e.target.value)} placeholder="Zoek op VvE naam of referentie..." style={{flex:1,fontSize:13}} />
                {zoek&&<button onClick={()=>setZoek('')} style={{padding:'8px 12px',background:C.wit,border:'1px solid '+C.lijn,borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center'}}>{I.x(14,C.tekst2)}</button>}
                {filterStatus!=='alle'&&<button onClick={()=>setFilterStatus('alle')} style={{padding:'6px 12px',background:C.bordeauxTint,border:'1px solid '+C.bordeauxRand,borderRadius:8,cursor:'pointer',fontSize:11,color:C.bordeaux,fontWeight:600,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4,fontFamily:"'DM Sans',sans-serif"}}>{I.x(12,C.bordeaux)} Wis filter</button>}
              </div>
              {zichtbaar.length===0?(
                <div style={{textAlign:'center',padding:'60px 20px',color:C.tekst3}}>
                  <div style={{marginBottom:12}}>{I.clip(32, C.tekst3)}</div>
                  <div style={{fontSize:14,fontWeight:600,color:C.tekst2,marginBottom:4}}>{lods.length===0?"Nog geen LOD's geregistreerd":"Geen resultaten"}</div>
                  <div style={{fontSize:12}}>{lods.length===0?"Klik op + Nieuwe LOD om te beginnen.":"Probeer een andere zoekterm of filter."}</div>
                </div>
              ):zichtbaar.map(lod=>(
                <LodKaart key={lod.id} lod={lod} onUpdate={updateLod} onDelete={()=>deleteLod(lod.id)} openId={openId} setOpenId={setOpenId} beheerderList={beheerderList} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
