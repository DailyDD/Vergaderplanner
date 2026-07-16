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

// Calculator constanten (gedeeld met VveCalculator.jsx)
const CALC_S = {
  bordeaux: '#991A21', bordeauxDark: '#6B1217', bordeauxLight: '#F5E6E7',
  cream: '#FAF7F2', ink: '#1A1614', muted: '#8A7E7B', border: '#E5DEDA',
  green: '#2D6A4F', greenBg: '#EAF4EE', amber: '#92550A', amberBg: '#FEF3E2',
  redBg: '#FDEAEB', blue: '#1A4D7A', blueBg: '#EAF1F8',
}
const calcFmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
let _calcId = 0
const calcUid = () => ++_calcId

// ── LOD Beheer ───────────────────────────────────────────────────

let _lodId = 0;
const lodUid = () => 'lod_' + (++_lodId) + '_' + Date.now();

const LOD_ROOD     = '#991A21';
const LOD_ROOD_BG  = '#FDEAEB';
const LOD_ROOD_DRK = '#7a1419';

const LOD_STATUS = {
  nieuw:            { label: 'Nieuw ontvangen',         color: '#1A4D7A', bg: '#EAF1F8', dot: '#1A4D7A' },
  in_behandeling:   { label: 'In behandeling',           color: LOD_ROOD,  bg: LOD_ROOD_BG, dot: LOD_ROOD },
  offertes_afwacht: { label: 'Offerte in afwachting',    color: '#92400E', bg: '#FEF3E2', dot: '#B45309' },
  offertes_lopen:   { label: 'Offertes lopen',           color: '#5B3FA6', bg: '#F3EFFD', dot: '#7C3AED' },
  vve_afwachting:   { label: 'In afwachting van VvE',    color: '#065F46', bg: '#D1FAE5', dot: '#059669' },
  vve_akkoord:      { label: 'VvE akkoord',              color: '#2D6A4F', bg: '#EAF4EE', dot: '#2D6A4F' },
  opdracht_uit:     { label: 'Opdracht verstrekt',       color: '#1E3A5F', bg: '#DBEAFE', dot: '#1E40AF' },
  afgerond:         { label: 'Afgerond',                 color: '#374151', bg: '#F3F4F6', dot: '#6B7280' },
  overschreden:     { label: 'Deadline overschreden',    color: LOD_ROOD,  bg: LOD_ROOD_BG, dot: LOD_ROOD },
};

// Supabase opslag voor LOD data
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
function lodDeadlineKleur(dagen) {
  if (dagen===null) return '';
  if (dagen<0) return 'text-red-600 font-bold';
  if (dagen<=14) return 'text-red-500 font-semibold';
  if (dagen<=30) return 'text-red-400 font-semibold';
  return 'text-gray-600';
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

// Auto-status op basis van offerte vinkjes
function berekenAutoStatus(lod) {
  const s = lod.status;
  if (s==='afgerond'||s==='overschreden') return s;
  const ofs = lod.offertes||[];
  if (ofs.some(o=>o.opdrachtAfgerond))     return 'opdracht_uit'; // afgerond valt nog onder opdracht_uit status
  if (ofs.some(o=>o.opdracht))             return 'opdracht_uit';
  if (ofs.some(o=>o.vveAkkoord))           return 'vve_akkoord';
  if (ofs.some(o=>o.vveVoorlegd))          return 'vve_afwachting';
  // Offertes lopen: alleen als ALLE aangevraagde offertes ontvangen zijn
  const aangevraagd = ofs.filter(o=>o.aangevraagd);
  const allemaalOntvangen = aangevraagd.length > 0 && aangevraagd.every(o=>o.ontvangen);
  if (allemaalOntvangen)                   return 'offertes_lopen';
  // Offerte in afwachting: minstens 1 aangevraagd maar nog niet allemaal ontvangen
  if (aangevraagd.some(o=>!o.ontvangen))   return 'offertes_afwacht';
  if (aangevraagd.length > 0)              return 'in_behandeling';
  return 'nieuw';
}

function LodStatusBadge({ status }) {
  const s = LOD_STATUS[status]||LOD_STATUS.nieuw;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:20,background:s.bg,color:s.color,fontSize:11,fontWeight:600}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,display:'inline-block'}} />
      {s.label}
    </span>
  );
}

function buildTijdlijn(lod) {
  const events = [];
  const add = (ts,tekst,kleur) => { if(ts) events.push({ts,tekst,kleur}); };
  add(lod.tijdlijn?.vveGenotificeerd,          'VvE in kennis gesteld',                '#1A4D7A');
  add(lod.tijdlijn?.vergaderingUitgeschreven,  'Vergadering uitgeschreven',            LOD_ROOD);
  (lod.offertes||[]).forEach(o=>{
    add(o.tijdlijn?.aangevraagd,`Offerte aangevraagd bij ${o.partij||'onbekend'}`,    '#1A4D7A');
    add(o.tijdlijn?.ontvangen,  `Offerte ontvangen van ${o.partij||'onbekend'}`,      '#5B3FA6');
    add(o.tijdlijn?.vveVoorlegd,`Offerte voorgelegd aan VvE (${o.partij||'onbekend'})`,'#92400E');
    add(o.tijdlijn?.vveAkkoord, `VvE akkoord op offerte ${o.partij||'onbekend'}`,     '#2D6A4F');
    add(o.tijdlijn?.opdracht,         `Opdracht verstrekt aan ${o.partij||'onbekend'}`,  '#1E3A5F');
    add(o.tijdlijn?.opdrachtAfgerond, `Opdracht afgerond door ${o.partij||'onbekend'}`,   '#2D6A4F');
  });
  add(lod.tijdlijn?.uitstelAangevraagd,'Uitstel aangevraagd bij gemeente',             '#92400E');
  add(lod.tijdlijn?.uitstelGoedgekeurd,'Uitstel goedgekeurd door gemeente',             '#2D6A4F');
  add(lod.tijdlijn?.gemeenteBevestigd,'Gemeente bevestigd / gereed gemeld',            '#2D6A4F');
  add(lod.tijdlijn?.afgerond,         'LOD afgerond',                                  '#374151');
  return events.sort((a,b)=>new Date(a.ts)-new Date(b.ts));
}

// Voortgangsstappen voor de voortgangsbalk
function lodVoortgang(lod) {
  const ofs = lod.offertes||[];
  const aangevraagd = ofs.filter(o=>o.aangevraagd);
  const allemaalOntvangen = aangevraagd.length > 0 && aangevraagd.every(o=>o.ontvangen);
  const allemaalAfgerond = ofs.length > 0 && ofs.filter(o=>o.opdracht).every(o=>o.opdrachtAfgerond);
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
        <span style={{fontSize:10,fontWeight:600,color:'#8A7E7B',textTransform:'uppercase',letterSpacing:'0.05em'}}>Voortgang</span>
        <span style={{fontSize:11,fontWeight:700,color:pct===100?'#2D6A4F':LOD_ROOD}}>{pct}%</span>
      </div>
      <div style={{height:6,background:'#F3F4F6',borderRadius:3,overflow:'hidden',marginBottom:5}}>
        <div style={{height:'100%',width:pct+'%',background:pct===100?'#2D6A4F':LOD_ROOD,borderRadius:3,transition:'width .3s'}} />
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {stappen.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:9,color:s.ok?'#2D6A4F':'#9CA3AF'}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:s.ok?'#2D6A4F':'#E5DEDA',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:7,color:'#fff',flexShrink:0}}>{s.ok?'✓':''}</span>
            {s.lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

// PDF export voor LOD + eenmalige bijdrage resultaat
function lodExportPDF(lod, eenmaligResult) {
  const tijdlijn  = buildTijdlijn(lod);
  const dagen     = lodDagenTot(lod.deadlineAlgemeen);
  const statusLbl = (LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).label;
  const stappen   = lodVoortgang(lod);
  const gedaan    = stappen.filter(s=>s.ok).length;

  const offerteRijen = (lod.offertes||[]).map((o,i)=>`
    <tr style="background:${i%2===0?'#fff':'#FAF7F2'}">
      <td>${o.partij||'-'}</td><td style="text-align:right">${lodFmt(o.bedrag)}</td>
      <td style="text-align:center">${o.aangevraagd?'✓':''}</td>
      <td style="text-align:center">${o.ontvangen?'✓':''}</td>
      <td style="text-align:center">${o.vveVoorlegd?'✓':''}</td>
      <td style="text-align:center">${o.vveAkkoord?'✓':''}</td>
      <td style="text-align:center">${o.opdracht?'✓':''}</td>
    </tr>`).join('');

  const puntenRijen = (lod.onderdelen||[]).map((o,i)=>`
    <tr style="background:${i%2===0?'#fff':'#FAF7F2'}"><td>${i+1}</td><td>${o.omschrijving||'-'}</td></tr>`).join('');

  const tijdlijnRijen = tijdlijn.map(e=>`
    <tr><td style="white-space:nowrap;color:#8A7E7B">${lodFmtDt(e.ts)}</td><td style="color:${e.kleur};font-weight:500">${e.tekst}</td></tr>`).join('');

  const voortgangRijen = stappen.map(s=>`
    <tr><td style="color:${s.ok?'#2D6A4F':'#9CA3AF'}">${s.ok?'✓':'○'} ${s.lbl}</td></tr>`).join('');

  let eenmaligHTML = '';
  if (eenmaligResult && eenmaligResult.length) {
    eenmaligHTML = '<div class="sec">Eenmalige bijdragen per eigenaar</div>';
    eenmaligResult.forEach(item => {
      eenmaligHTML += `<p style="font-size:9pt;font-weight:600;margin:10px 0 4px">${item.omschrijving} — Offerte: ${lodFmt(item.offerte)}${item.totaleKorting>0?' — Netto: '+lodFmt(item.nettoOfferte):''} — ${item.tekort>0?'Tekort: '+lodFmt(item.tekort):'Volledig gedekt'}</p>`;
      eenmaligHTML += `<p style="font-size:8pt;color:#8A7E7B;margin-bottom:6px">Reserve: ${lodFmt(item.reserve)} — buffer: ${lodFmt(item.buffer)} — beschikbaar: ${lodFmt(item.beschikbaar)}</p>`;
      if (item.tekort>0 && item.perEigenaar.length) {
        eenmaligHTML += `<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Korting</th><th style="text-align:right">Bijdrage</th></tr></thead><tbody>`;
        item.perEigenaar.forEach((e,i)=>{
          eenmaligHTML += `<tr style="background:${i%2===0?'#fff':'#FAF7F2'}"><td>${e.naam}</td><td style="text-align:right">${(e.aandeel*100).toFixed(2)}%</td><td style="text-align:right;color:#2D6A4F">${e.korting>0?lodFmt(e.korting):'—'}</td><td style="text-align:right;font-weight:600;color:#991A21">${lodFmt(e.bijdrage)}</td></tr>`;
        });
        eenmaligHTML += `</tbody><tfoot><tr><td colspan="3"><strong>Totaal tekort</strong></td><td style="text-align:right">${lodFmt(item.tekort)}</td></tr></tfoot></table>`;
      }
    });
  }

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
    <title>LOD Dossier - ${lod.vveNaam||'onbekend'}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:#1A1614;font-size:10pt;background:#fff;padding:32px 40px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid #991A21;margin-bottom:22px}
    .hdr h1{font-family:"DM Serif Display",serif;font-size:18pt;color:#991A21;font-weight:400}.hdr .meta{font-size:9pt;color:#8A7E7B;margin-top:3px}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:9pt;font-weight:600;background:#FDEAEB;color:#991A21}
    .sec{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8A7E7B;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5DEDA}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px}
    .info-block{background:#FAF7F2;border-left:3px solid #991A21;padding:10px 14px;border-radius:4px}
    .info-label{font-size:8pt;color:#8A7E7B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
    .info-val{font-size:10pt;font-weight:600;color:#1A1614}
    table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:14px}
    thead tr{background:#991A21;color:#fff}thead th{padding:7px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    tbody td{padding:6px 10px;border-bottom:1px solid #E5DEDA}
    tfoot td{padding:7px 10px;font-weight:600;color:#991A21;border-top:2px solid #991A21;background:#FDEAEB}
    .voortgang-ok{color:#2D6A4F}.voortgang-nok{color:#9CA3AF}
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:7.5pt;color:#8A7E7B}
    .print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:#991A21;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer}
    @media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>
    <div class="hdr">
      <div><h1>LOD Dossier</h1><div class="meta">${lod.vveNaam||'onbekend'} · Ref: ${lod.gemeenteReferentie||'-'} · Opgesteld op ${new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'})}</div></div>
      <div style="text-align:right"><span class="badge">${statusLbl}</span><div style="font-size:9pt;color:#8A7E7B;margin-top:4px">Voortgang: ${gedaan}/${stappen.length} stappen</div></div>
    </div>
    <div class="grid2">
      <div class="info-block"><div class="info-label">VvE</div><div class="info-val">${lod.vveNaam||'-'}</div></div>
      <div class="info-block"><div class="info-label">Behandelend beheerder</div><div class="info-val">${lod.behandelaar||'-'}</div></div>
      <div class="info-block"><div class="info-label">Gemeente referentie</div><div class="info-val">${lod.gemeenteReferentie||'-'}</div></div>
      <div class="info-block"><div class="info-label">Contactpersoon gemeente</div><div class="info-val">${lod.contactpersoon||'-'} ${lod.contactGemeente?'· '+lod.contactGemeente:''}</div></div>
      <div class="info-block"><div class="info-label">Ontvangstdatum</div><div class="info-val">${lod.ontvangstdatum?new Date(lod.ontvangstdatum).toLocaleDateString('nl-NL'):'-'}</div></div>
      <div class="info-block"><div class="info-label">Algehele deadline</div><div class="info-val" style="color:${dagen!==null&&dagen<0?'#991A21':'inherit'}">${lod.deadlineAlgemeen?new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL'):'-'}${dagen!==null?' ('+Math.abs(dagen)+(dagen<0?' dagen over':' dagen')+')':''}</div></div>
      <div class="info-block"><div class="info-label">Max. boete totaal</div><div class="info-val">${lodFmt(lod.boeteMax)}</div></div>
    </div>
    ${lod.notitie?`<div style="margin-bottom:10px;padding:10px 14px;background:#FAF7F2;border-radius:6px;font-size:9pt"><strong>Notitie:</strong> ${lod.notitie}</div>`:''}
    ${lod.uitstelAangevraagd?`<div style="margin-bottom:16px;padding:10px 14px;background:#FEF3E2;border-left:3px solid #B45309;border-radius:6px;font-size:9pt"><strong style="color:#92400E">Uitstel aangevraagd${lod.uitstelTot?' t/m '+new Date(lod.uitstelTot).toLocaleDateString('nl-NL'):''}</strong>${lod.uitstelReden?' — '+lod.uitstelReden:''}</div>`:''}
    <div class="sec">Voortgang</div>
    <table style="width:auto"><tbody>${voortgangRijen}</tbody></table>
    <div class="sec">Onderhoudspunten</div>
    <table><thead><tr><th>#</th><th>Omschrijving</th></tr></thead><tbody>${puntenRijen||'<tr><td colspan=2 style="color:#8A7E7B">Geen onderhoudspunten</td></tr>'}</tbody></table>
    <div class="sec">Offertes</div>
    <table><thead><tr><th>Partij</th><th style="text-align:right">Bedrag</th><th style="text-align:center">Aangevraagd</th><th style="text-align:center">Ontvangen</th><th style="text-align:center">VvE voorgelegd</th><th style="text-align:center">VvE akkoord</th><th style="text-align:center">Opdracht</th></tr></thead><tbody>${offerteRijen||'<tr><td colspan=7 style="color:#8A7E7B">Geen offertes</td></tr>'}</tbody></table>
    ${eenmaligHTML}
    <div class="sec">Tijdlijn dossier</div>
    <table><thead><tr><th>Datum en tijd</th><th>Actie</th></tr></thead><tbody>${tijdlijnRijen||'<tr><td colspan=2 style="color:#8A7E7B">Geen tijdlijn</td></tr>'}</tbody></table>
    <div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>Last onder Dwangsom module</span></div>
    </body></html>`;

  const w = window.open('','_blank','width=1050,height=850');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Pop-up geblokkeerd.');
}

// ── Eenmalige bijdrage tab ────────────────────────────────────────
function LodEenmaligTab({ lod, onUpdate }) {
  const S   = CALC_S;
  const fmt = calcFmt;

  // Offertedata overnemen uit het Offertes tabblad
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

  // Sync offertes als ze veranderen
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
        <p style={{fontSize:12,color:CALC_S.muted}}>Bereken de eenmalige bijdrage per eigenaar. Offertedata is overgenomen uit het Offertes tabblad.</p>
        <button onClick={syncOffertes} style={{padding:'5px 12px',background:'#fff',border:`1px solid ${LOD_ROOD}`,borderRadius:7,fontSize:11,color:LOD_ROOD,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
          Offertes syncen
        </button>
      </div>

      {/* Eigenaren */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#2D2D2D',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
          Eigenaren &amp; breukdelen
          <div style={{flex:1,height:1,background:'#E5DEDA'}} />
          <label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,display:'flex',alignItems:'center',gap:6}}>
            Noemer: <input type="number" value={vasteNoemer} onChange={e=>{setVasteNoemer(e.target.value);save({eenmaligNoemer:e.target.value})}} placeholder="totaal" className="calc-inp" style={{width:80,fontSize:12}} />
          </label>
        </div>
        {eigRows.map((r,i)=>(
          <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',gap:8,marginBottom:6,alignItems:'center'}}>
            <input value={r.naam} onChange={e=>{const nr=[...eigRows];nr[i]={...nr[i],naam:e.target.value};setEigRows(nr);save({eenmaligEigenaren:nr})}} placeholder="Naam eigenaar / appartement" className="calc-inp" style={{fontSize:12}} />
            <input type="number" value={r.teller} onChange={e=>{const nr=[...eigRows];nr[i]={...nr[i],teller:e.target.value};setEigRows(nr);save({eenmaligEigenaren:nr})}} placeholder="Teller" className="calc-inp" style={{fontSize:12}} />
            <button onClick={()=>{const nr=eigRows.filter((_,j)=>j!==i);setEigRows(nr);save({eenmaligEigenaren:nr})}} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:CALC_S.muted}}>×</button>
          </div>
        ))}
        <button onClick={()=>{const nr=[...eigRows,{id:calcUid(),naam:'',teller:''}];setEigRows(nr);save({eenmaligEigenaren:nr})}} style={{width:'100%',padding:'7px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:12,color:CALC_S.muted,cursor:'pointer'}}>+ Eigenaar toevoegen</button>
      </div>

      {/* Offertes */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#2D2D2D',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
          Offerte(s) <div style={{flex:1,height:1,background:'#E5DEDA'}} />
        </div>
        {items.map((item,i)=>(
          <div key={item.id} style={{background:'#FAF7F2',border:'1px solid #E5DEDA',borderRadius:10,padding:'12px 14px',marginBottom:8,position:'relative'}}>
            {items.length>1&&<button onClick={()=>{const ni=items.filter((_,j)=>j!==i);setItems(ni);save({eenmaligItems:ni})}} style={{position:'absolute',top:8,right:10,background:'none',border:'none',cursor:'pointer',fontSize:16,color:CALC_S.muted}}>×</button>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 160px',gap:10,marginBottom:8}}>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Omschrijving / partij</label>
                <input value={item.omschrijving} onChange={e=>{const ni=[...items];ni[i]={...ni[i],omschrijving:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. Bouwbedrijf Jansen" className="calc-inp" style={{fontSize:12}} /></div>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Offertebedrag (€)</label>
                <input type="number" value={item.bedrag} onChange={e=>{const ni=[...items];ni[i]={...ni[i],bedrag:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 38000" className="calc-inp" style={{fontSize:12}} /></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8}}>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Stand reservefonds (€)</label>
                <input type="number" value={item.reserveStand} onChange={e=>{const ni=[...items];ni[i]={...ni[i],reserveStand:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 12000" className="calc-inp" style={{fontSize:12}} /></div>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Buffer (€)</label>
                <input type="number" value={item.buffer} onChange={e=>{const ni=[...items];ni[i]={...ni[i],buffer:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="2500" className="calc-inp" style={{fontSize:12}} /></div>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12,fontWeight:600,color:CALC_S.ink}}>
              <input type="checkbox" checked={!!item.kortingAan} onChange={e=>{const ni=[...items];ni[i]={...ni[i],kortingAan:e.target.checked};setItems(ni);save({eenmaligItems:ni})}} style={{width:13,height:13,accentColor:LOD_ROOD,cursor:'pointer'}} />
              Gemeentelijke korting
            </label>
            {item.kortingAan&&<div style={{marginTop:6}}><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Korting per eigenaar (€)</label>
              <input type="number" value={item.kortingBedrag} onChange={e=>{const ni=[...items];ni[i]={...ni[i],kortingBedrag:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 1000" className="calc-inp" style={{width:160,fontSize:12}} /></div>}
          </div>
        ))}
        <button onClick={()=>{const ni=[...items,{id:calcUid(),omschrijving:'',bedrag:'',reserveStand:'',buffer:'2500',kortingAan:false,kortingBedrag:''}];setItems(ni);save({eenmaligItems:ni})}} style={{width:'100%',padding:'7px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:12,color:CALC_S.muted,cursor:'pointer',marginBottom:10}}>+ Offerte toevoegen</button>
      </div>

      <button onClick={bereken} style={{width:'100%',padding:12,background:LOD_ROOD,border:'none',borderRadius:10,fontFamily:'Georgia,serif',fontSize:15,color:'#fff',cursor:'pointer'}}>
        Bereken eenmalige bijdragen →
      </button>

      {result && (
        <>
          <button onClick={()=>lodExportPDF(lod, result)} style={{width:'100%',marginTop:10,padding:'9px',background:'#fff',border:`1.5px solid ${LOD_ROOD}`,borderRadius:8,fontFamily:'inherit',fontSize:13,color:LOD_ROOD,cursor:'pointer',fontWeight:500}}>
            PDF rapport exporteren (incl. berekening)
          </button>
          {result.map((item,idx)=>(
            <div key={idx} style={{marginTop:12,background:'#fff',border:'1px solid #E5DEDA',borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 14px',background:'#FAF7F2',borderBottom:'1px solid #E5DEDA',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontWeight:600,fontSize:13}}>{item.omschrijving}</span>
                <span style={{fontFamily:'Georgia,serif',fontSize:16,color:item.tekort>0?LOD_ROOD:'#2D6A4F'}}>{item.tekort>0?'Tekort: '+fmt(item.tekort):'Volledig gedekt'}</span>
              </div>
              <div style={{padding:'5px 14px',fontSize:11,color:CALC_S.muted,fontFamily:'monospace',borderBottom:'1px solid #E5DEDA'}}>
                Reserve: {fmt(item.reserve)} — buffer: {fmt(item.buffer)} — beschikbaar: {fmt(item.beschikbaar)}
              </div>
              {item.tekort>0&&(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#FAF7F2',borderBottom:'1px solid #E5DEDA'}}>
                    {['Eigenaar','Aandeel','Korting','Bijdrage'].map((h,i)=>(
                      <th key={i} style={{padding:'6px 12px',textAlign:i>0?'right':'left',fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{item.perEigenaar.map((e,i)=>(
                    <tr key={i} style={{borderBottom:i<item.perEigenaar.length-1?'1px solid #E5DEDA':'none',background:i%2===0?'#fff':'#FAF7F2'}}>
                      <td style={{padding:'6px 12px',fontSize:12,fontWeight:500}}>{e.naam}</td>
                      <td style={{padding:'6px 12px',fontFamily:'monospace',fontSize:12,textAlign:'right'}}>{(e.aandeel*100).toFixed(2)}%</td>
                      <td style={{padding:'6px 12px',fontFamily:'monospace',fontSize:12,textAlign:'right',color:e.korting>0?'#2D6A4F':CALC_S.muted}}>{e.korting>0?fmt(e.korting):'—'}</td>
                      <td style={{padding:'6px 12px',fontFamily:'monospace',fontSize:12,textAlign:'right',color:LOD_ROOD,fontWeight:600}}>{fmt(e.bijdrage)}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot style={{borderTop:`2px solid ${LOD_ROOD}`}}>
                    <tr style={{background:LOD_ROOD_BG}}>
                      <td colSpan={3} style={{padding:'7px 12px',fontSize:12,fontWeight:600,color:CALC_S.muted}}>Totaal tekort</td>
                      <td style={{padding:'7px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:LOD_ROOD,textAlign:'right'}}>{fmt(item.tekort)}</td>
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
  const S = CALC_S;
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
  const cardBorder = lod.status==='afgerond'?'#D1D5DB':open?LOD_ROOD:'#E5E0DB';

  return (
    <div style={{background:lod.status==='afgerond'?'#FAFAFA':'#fff',border:`1.5px solid ${cardBorder}`,borderRadius:12,overflow:'hidden',marginBottom:10,boxShadow:open?`0 2px 12px rgba(153,26,33,.08)`:'none',transition:'all .2s',opacity:lod.status==='afgerond'?.7:1}}>
      {/* Header */}
      <div onClick={()=>setOpenId(open?null:lod.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',userSelect:'none'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:14,color:'#2D2D2D'}}>{lod.vveNaam||<span style={{color:'#aaa',fontStyle:'italic'}}>VvE naam</span>}</span>
            <LodStatusBadge status={lod.status||'nieuw'} />
            {lod.behandelaar&&<span style={{fontSize:10,color:'#8A7E7B',background:'#F3F4F6',padding:'2px 7px',borderRadius:8}}>{lod.behandelaar}</span>}

            {lod.uitstelAangevraagd&&(
              <span style={{fontSize:10,fontWeight:600,background:lod.uitstelGoedgekeurd?'#EAF4EE':'#FEF3E2',color:lod.uitstelGoedgekeurd?'#2D6A4F':'#92400E',padding:'2px 7px',borderRadius:10,border:`1px solid ${lod.uitstelGoedgekeurd?'#6EE7B7':'#FDE68A'}`}}>
                {lod.uitstelGoedgekeurd?'Uitstel goedgekeurd':'Uitstel aangevraagd'}{lod.uitstelTot&&lod.uitstelGoedgekeurd?' t/m '+new Date(lod.uitstelTot).toLocaleDateString('nl-NL'):''}
              </span>
            )}
            {lod.status!=='afgerond'&&dagen!==null&&dagen<0&&!lod.uitstelAangevraagd&&(
              <span style={{fontSize:10,fontWeight:600,background:LOD_ROOD_BG,color:LOD_ROOD,padding:'2px 7px',borderRadius:10}}>Deadline voorbij</span>
            )}
          </div>
          <div style={{display:'flex',gap:12,marginTop:4,flexWrap:'wrap'}}>
            {lod.gemeenteReferentie&&<span style={{fontSize:11,color:'#8A7E7B'}}>Ref: {lod.gemeenteReferentie}</span>}
            {lod.ontvangstdatum&&<span style={{fontSize:11,color:'#8A7E7B'}}>Ontvangen: {new Date(lod.ontvangstdatum).toLocaleDateString('nl-NL')}</span>}
            {lod.deadlineAlgemeen&&(
              <span style={{fontSize:11}} className={lod.status==='afgerond'?'text-gray-400':lodDeadlineKleur(dagen)}>
                Deadline: {new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL')}
                {lod.status==='afgerond'&&lod.tijdlijn?.afgerond&&(
                  <span style={{marginLeft:8,color:'#2D6A4F',fontWeight:600}}>
                    Afgerond: {new Date(lod.tijdlijn.afgerond).toLocaleDateString('nl-NL')}
                  </span>
                )}
              </span>
            )}
            {lod.boeteMax&&<span style={{fontSize:11,color:LOD_ROOD,fontWeight:600}}>Max. boete: {lodFmt(lod.boeteMax)}</span>}
          </div>
        </div>
        {/* Voortgangsbalk rechts */}
        <div onClick={e=>e.stopPropagation()}>
          <LodVoortgangBalk lod={lod} />
        </div>
        <span style={{fontSize:14,color:'#8A7E7B',transform:open?'rotate(180deg)':'none',transition:'transform .2s'}}>▾</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{borderTop:'1.5px solid #E5E0DB',background:'#FDFCFB'}}>
          {/* Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid #E5DEDA',background:'#fff',paddingLeft:16,overflowX:'auto'}}>
            {[['details','Gegevens'],['onderdelen','Onderhoudspunten'],['offertes','Offertes'],['tijdlijn','Tijdlijn'],['eenmalig','Eenmalige bijdrage']].map(([key,lbl])=>(
              <button key={key} onClick={()=>setTabKaart(key)}
                style={{padding:'9px 14px',border:'none',borderBottom:`2px solid ${tabKaart===key?LOD_ROOD:'transparent'}`,background:'transparent',fontSize:12,fontWeight:tabKaart===key?600:400,color:tabKaart===key?LOD_ROOD:'#6B7280',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>
                {lbl}
              </button>
            ))}
          </div>

          <div style={{padding:'16px'}}>
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
                    <div key={field}>
                      <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>{label}</label>
                      {type==='select'?(
                        <select value={lod[field]||'nieuw'} onChange={e=>update({[field]:e.target.value})} className="calc-inp" style={{fontSize:13,cursor:'pointer'}}>
                          {Object.entries(LOD_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ):(
                        <input type={type} value={lod[field]||''} onChange={e=>update({[field]:e.target.value})} placeholder={placeholder||''} className="calc-inp" style={{fontSize:13}} />
                      )}
                    </div>
                  ))}
                  <div>
                    <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Behandelend beheerder</label>
                    <select value={lod.behandelaar||''} onChange={e=>update({behandelaar:e.target.value})} className="calc-inp" style={{fontSize:13,cursor:'pointer'}}>
                      <option value="">— Selecteer beheerder —</option>
                      {(beheerderList||[]).map(naam=><option key={naam} value={naam}>{naam}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Voortgang LOD</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                    {[
                      ['vveGenotificeerd','vveGenotificeerd','VvE in kennis gesteld'],
                      ['vergaderingUitgeschreven','vergaderingUitgeschreven','Vergadering uitgeschreven'],
                      ['gemeenteBevestigd','gemeenteBevestigd','Afronding gemeld gemeente'],
                    ].map(([field,tlKey,lbl])=>(
                      <label key={field} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'8px 10px',background:lod[field]?'#EAF1F8':'#fff',border:`1.5px solid ${lod[field]?'#1A4D7A':'#E5DEDA'}`,borderRadius:8,fontSize:11,fontWeight:600,color:lod[field]?'#1A4D7A':'#8A7E7B',userSelect:'none',transition:'all .15s'}}>
                        <input type="checkbox" checked={!!lod[field]} onChange={e=>toggleCheck(field,tlKey,e.target.checked)} style={{width:13,height:13,accentColor:'#1A4D7A',cursor:'pointer'}} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Interne notitie</label>
                  <textarea value={lod.notitie||''} onChange={e=>update({notitie:e.target.value})} placeholder="Bijzonderheden, afspraken, opmerkingen..."
                    style={{width:'100%',minHeight:70,padding:'8px 11px',border:'1.5px solid #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:12,color:'#1A1614',background:'#FAF7F2',outline:'none',resize:'vertical'}} />
                </div>

                {/* Uitstel aangevraagd — verborgen als afgerond */}
                {lod.status !== 'afgerond' && <div style={{marginBottom:14,padding:'12px 14px',background:lod.uitstelAangevraagd?'#FEF3E2':'#FAF7F2',border:`1.5px solid ${lod.uitstelAangevraagd?'#B45309':'#E5DEDA'}`,borderRadius:10,transition:'all .2s'}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
                    <div style={{width:18,height:18,borderRadius:5,background:lod.uitstelAangevraagd?'#B45309':'transparent',border:`2px solid ${lod.uitstelAangevraagd?'#B45309':'#9CA3AF'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                      {lod.uitstelAangevraagd&&<span style={{color:'#fff',fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                    </div>
                    <input type="checkbox" checked={!!lod.uitstelAangevraagd} onChange={e=>{
                      const tl = {...(lod.tijdlijn||{})};
                      if (e.target.checked && !tl.uitstelAangevraagd) tl.uitstelAangevraagd = lodNow();
                      else if (!e.target.checked) { delete tl.uitstelAangevraagd; delete tl.uitstelGoedgekeurd; }
                      update({uitstelAangevraagd:e.target.checked, uitstelGoedgekeurd: e.target.checked ? lod.uitstelGoedgekeurd : false, tijdlijn:tl});
                    }} style={{display:'none'}} />
                    <span style={{fontSize:13,fontWeight:600,color:lod.uitstelAangevraagd?'#92400E':'#374151'}}>Uitstel aangevraagd</span>
                    {lod.uitstelAangevraagd&&lod.uitstelTot&&(
                      <span style={{marginLeft:'auto',fontSize:11,fontWeight:600,color:'#92400E',fontFamily:'monospace'}}>
                        t/m {new Date(lod.uitstelTot).toLocaleDateString('nl-NL')}
                      </span>
                    )}
                  </label>
                  {lod.uitstelAangevraagd&&(
                    <div style={{marginTop:10}}>
                      {/* Uitstel goedgekeurd vinkje */}
                      <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:lod.uitstelGoedgekeurd?'#EAF4EE':'#fff',border:`1.5px solid ${lod.uitstelGoedgekeurd?'#2D6A4F':'#E5DEDA'}`,borderRadius:8,marginBottom:10,userSelect:'none',transition:'all .15s'}}>
                        <div style={{width:16,height:16,borderRadius:4,background:lod.uitstelGoedgekeurd?'#2D6A4F':'transparent',border:`2px solid ${lod.uitstelGoedgekeurd?'#2D6A4F':'#9CA3AF'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {lod.uitstelGoedgekeurd&&<span style={{color:'#fff',fontSize:10,fontWeight:700,lineHeight:1}}>✓</span>}
                        </div>
                        <input type="checkbox" checked={!!lod.uitstelGoedgekeurd} onChange={e=>{
                          const tl = {...(lod.tijdlijn||{})};
                          if (e.target.checked && !tl.uitstelGoedgekeurd) tl.uitstelGoedgekeurd = lodNow();
                          else if (!e.target.checked) delete tl.uitstelGoedgekeurd;
                          update({uitstelGoedgekeurd:e.target.checked, tijdlijn:tl});
                        }} style={{display:'none'}} />
                        <span style={{fontSize:12,fontWeight:600,color:lod.uitstelGoedgekeurd?'#2D6A4F':'#374151'}}>Uitstel goedgekeurd door gemeente</span>
                      </label>
                      {/* Datum + reden alleen tonen als goedgekeurd */}
                      {lod.uitstelGoedgekeurd&&(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                          <div>
                            <label style={{fontSize:10,fontWeight:600,color:'#2D6A4F',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Uitstel tot wanneer</label>
                            <input type="date" value={lod.uitstelTot||''} onChange={e=>update({uitstelTot:e.target.value})}
                              className="calc-inp" style={{fontSize:13,borderColor:'#6EE7B7'}} />
                          </div>
                          <div>
                            <label style={{fontSize:10,fontWeight:600,color:'#2D6A4F',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Reden uitstel</label>
                            <input value={lod.uitstelReden||''} onChange={e=>update({uitstelReden:e.target.value})}
                              placeholder="bijv. gemeentelijke goedkeuring ontvangen"
                              className="calc-inp" style={{fontSize:12,borderColor:'#6EE7B7'}} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>}

                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:12,borderTop:'1px solid #E5DEDA'}}>
                  <button onClick={()=>{if(window.confirm('LOD verwijderen?'))onDelete()}} style={{padding:'7px 14px',background:'#fff',border:'1.5px solid #fca5a5',borderRadius:8,fontSize:12,color:LOD_ROOD,cursor:'pointer',fontFamily:'inherit'}}>
                    LOD verwijderen
                  </button>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>lodExportPDF(lod,null)} style={{padding:'7px 14px',background:'#fff',border:`1.5px solid ${LOD_ROOD}`,borderRadius:8,fontSize:12,color:LOD_ROOD,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>
                      PDF rapport
                    </button>
                    {lod.status!=='afgerond'?(
                      <button onClick={markeerAfgerond} style={{padding:'7px 18px',background:'#2D6A4F',border:'none',borderRadius:8,fontSize:12,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                        LOD afgerond
                      </button>
                    ):(
                      <button onClick={()=>{
                        const tl = {...(lod.tijdlijn||{})};
                        delete tl.afgerond;
                        onUpdate({...lod,status:'opdracht_uit',gemeenteBevestigd:false,tijdlijn:tl});
                      }} style={{padding:'7px 18px',background:'#fff',border:'1.5px solid #1A4D7A',borderRadius:8,fontSize:12,color:'#1A4D7A',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
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
                <p style={{fontSize:12,color:S.muted,marginBottom:12}}>Beschrijf de onderhoudspunten zoals benoemd in de LOD.</p>
                {(lod.onderdelen||[]).length===0&&<div style={{textAlign:'center',padding:'30px',color:'#9CA3AF',fontSize:13}}>Nog geen onderhoudspunten toegevoegd.</div>}
                {(lod.onderdelen||[]).map((o,i)=>(
                  <div key={o.id||i} style={{display:'grid',gridTemplateColumns:'28px 1fr 36px',gap:8,alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:S.muted,textAlign:'center'}}>{i+1}</span>
                    <input value={o.omschrijving||''} onChange={e=>updOnderdeel(i,e.target.value)} placeholder={`Onderhoudspunt ${i+1} — bijv. Herstel gevelmetselwerk`} className="calc-inp" style={{fontSize:13}} />
                    <button onClick={()=>delOnderdeel(i)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:S.muted,padding:'4px 8px'}}>×</button>
                  </div>
                ))}
                <button onClick={addOnderdeel} style={{width:'100%',padding:'9px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:13,color:'#8A7E7B',cursor:'pointer',marginTop:4}}>
                  + Onderhoudspunt toevoegen
                </button>
              </div>
            )}

            {/* TAB: Offertes */}
            {tabKaart==='offertes'&&(
              <div>
                <p style={{fontSize:12,color:S.muted,marginBottom:12}}>Registreer per partij de offerte. De status van de LOD wordt automatisch bijgewerkt.</p>
                {(lod.offertes||[]).length===0&&<div style={{textAlign:'center',padding:'30px',color:'#9CA3AF',fontSize:13}}>Nog geen offertes geregistreerd.</div>}
                {(lod.offertes||[]).map((o,i)=>(
                  <div key={o.id||i} style={{background:'#FAF7F2',border:'1px solid #E5DEDA',borderRadius:10,padding:'14px',marginBottom:10}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,marginBottom:10,alignItems:'end'}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Partij / aannemer</label>
                        <input value={o.partij||''} onChange={e=>updateOfferte(i,{partij:e.target.value})} placeholder="bijv. Bouwbedrijf Jansen" className="calc-inp" style={{fontSize:13}} />
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Totaalprijs offerte (€)</label>
                        <input type="number" value={o.bedrag||''} onChange={e=>updateOfferte(i,{bedrag:e.target.value})} placeholder="bijv. 42000" className="calc-inp" style={{fontSize:13}} />
                      </div>
                      <button onClick={()=>delOfferte(i)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:S.muted,padding:'8px'}}>×</button>
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
                        <label key={field} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',padding:'7px 8px',background:o[field]?'#EAF4EE':'#fff',border:`1.5px solid ${o[field]?'#2D6A4F':'#E5DEDA'}`,borderRadius:7,fontSize:10,fontWeight:600,color:o[field]?'#2D6A4F':'#8A7E7B',userSelect:'none',transition:'all .15s'}}>
                          <input type="checkbox" checked={!!o[field]} onChange={e=>toggleOfferteCheck(i,field,tlKey,e.target.checked)} style={{width:12,height:12,accentColor:'#2D6A4F',cursor:'pointer'}} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    {o.ontvangen&&o.bedrag&&<div style={{marginTop:8,padding:'5px 9px',background:'#EAF4EE',borderRadius:6,fontSize:11,color:'#2D6A4F',fontFamily:'monospace'}}>Offertebedrag: {lodFmt(o.bedrag)}</div>}
                  </div>
                ))}
                <button onClick={addOfferte} style={{width:'100%',padding:'9px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:13,color:'#8A7E7B',cursor:'pointer',marginTop:4}}>
                  + Partij / offerte toevoegen
                </button>
              </div>
            )}

            {/* TAB: Tijdlijn */}
            {tabKaart==='tijdlijn'&&(
              <div>
                {tijdlijn.length===0?(
                  <div style={{textAlign:'center',padding:'30px',color:'#9CA3AF',fontSize:13}}>Nog geen acties. Vink stappen aan om de tijdlijn op te bouwen.</div>
                ):(
                  <div style={{position:'relative',paddingLeft:24}}>
                    <div style={{position:'absolute',left:7,top:0,bottom:0,width:2,background:'#E5DEDA',borderRadius:2}} />
                    {tijdlijn.map((e,i)=>(
                      <div key={i} style={{position:'relative',marginBottom:16}}>
                        <div style={{position:'absolute',left:-20,top:3,width:10,height:10,borderRadius:'50%',background:e.kleur,border:'2px solid #fff',boxShadow:`0 0 0 2px ${e.kleur}`}} />
                        <div style={{fontSize:11,color:'#8A7E7B',marginBottom:2}}>{lodFmtDt(e.ts)}</div>
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
        <button onClick={()=>setJaar(j=>j-1)} style={{padding:'6px 14px',border:'1px solid #E5DEDA',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:13}}>← {jaar-1}</button>
        <span style={{fontSize:16,fontWeight:700,color:'#2D2D2D'}}>{jaar}</span>
        <button onClick={()=>setJaar(j=>j+1)} style={{padding:'6px 14px',border:'1px solid #E5DEDA',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:13}}>{jaar+1} →</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        {maandNamen.map((naam,mi)=>{
          const me = events.filter(e=>e.maand===mi);
          const isHuidig = mi===now.getMonth()&&jaar===now.getFullYear();
          return (
            <div key={mi} style={{background:'#fff',border:`1.5px solid ${isHuidig?LOD_ROOD:'#E5DEDA'}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'8px 12px',background:isHuidig?LOD_ROOD_BG:'#FAF7F2',borderBottom:'1px solid #E5DEDA',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:700,color:isHuidig?LOD_ROOD:'#374151'}}>{naam}</span>
                {me.length>0&&<span style={{fontSize:10,fontWeight:600,background:LOD_ROOD_BG,color:LOD_ROOD,padding:'1px 6px',borderRadius:8}}>{me.length}</span>}
              </div>
              <div style={{padding:'8px 10px',minHeight:60}}>
                {me.length===0?<span style={{fontSize:10,color:'#D1D5DB'}}>Geen deadlines</span>:
                  me.map((e,i)=>(
                    <div key={i} style={{marginBottom:5,padding:'4px 7px',background:e.dagen<0?LOD_ROOD_BG:e.dagen<=14?'#FEF3E2':'#EAF1F8',borderRadius:6,borderLeft:`3px solid ${e.dagen<0?LOD_ROOD:e.dagen<=14?'#B45309':'#1A4D7A'}`}}>
                      <div style={{fontSize:10,fontWeight:600,color:e.dagen<0?LOD_ROOD:e.dagen<=14?'#92400E':'#1A4D7A'}}>{e.naam}</div>
                      <div style={{fontSize:9,color:'#8A7E7B'}}>{e.dag} {naam.toLowerCase()} · {e.dagen<0?Math.abs(e.dagen)+'d over':e.dagen===0?'vandaag':e.dagen+'d'}</div>
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
    const deadlineKleur = dagen===null?'#374151':dagen<0?'#991A21':dagen<=14?'#D97706':'#374151';
    return `<tr style="background:${i%2===0?'#fff':'#FAF7F2'}">
      <td style="font-weight:600">${lod.vveNaam||'-'}</td>
      <td>${lod.gemeenteReferentie||'-'}</td>
      <td>${lod.behandelaar||'-'}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:8pt;font-weight:600;background:${(LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).bg};color:${(LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).color}">${status}</span></td>
      <td style="text-align:center;color:${deadlineKleur};font-weight:${dagen!==null&&dagen<=14?'600':'400'}">${lod.deadlineAlgemeen?new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL'):'-'}${dagen!==null?' ('+Math.abs(dagen)+(dagen<0?'d over':' d')+')':''}</td>
      <td style="text-align:right;color:#991A21;font-weight:600">${lodFmt(lod.boeteMax)}</td>
      <td style="text-align:center">${aantalOf}</td>
      <td style="text-align:center">
        <div style="display:flex;align-items:center;gap:6px;justify-content:center">
          <div style="width:60px;height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct===100?'#2D6A4F':'#991A21'};border-radius:3px"></div>
          </div>
          <span style="font-size:8pt;font-weight:600;color:${pct===100?'#2D6A4F':'#991A21'}">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const totaalBoete = actief.reduce((s,l)=>s+(parseFloat(l.boeteMax)||0),0);
  const overschreden = actief.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0;}).length;
  const urgent = actief.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d>=0&&d<=14;}).length;

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
    <title>LOD Totaaloverzicht - ${nu}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:#1A1614;font-size:10pt;background:#fff;padding:32px 40px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid #991A21;margin-bottom:22px}
    .hdr h1{font-family:"DM Serif Display",serif;font-size:18pt;color:#991A21;font-weight:400}.hdr .meta{font-size:9pt;color:#8A7E7B;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
    .stat{background:#FAF7F2;border-left:3px solid #991A21;padding:10px 14px;border-radius:4px}
    .stat-num{font-family:"DM Serif Display",serif;font-size:22pt;color:#991A21;font-weight:400}
    .stat-lbl{font-size:8pt;color:#8A7E7B;text-transform:uppercase;letter-spacing:.05em}
    table{width:100%;border-collapse:collapse;font-size:9pt}
    thead tr{background:#991A21;color:#fff}thead th{padding:8px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    tbody td{padding:7px 10px;border-bottom:1px solid #E5DEDA}
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:7.5pt;color:#8A7E7B}
    .print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:#991A21;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer}
    @media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>
    <div class="hdr"><div><h1>LOD Totaaloverzicht</h1><div class="meta">Alle actieve LOD dossiers · Opgesteld op ${nu}</div></div></div>
    <div class="stats">
      <div class="stat"><div class="stat-num">${actief.length}</div><div class="stat-lbl">Actieve LODs</div></div>
      <div class="stat"><div class="stat-num" style="color:#D97706">${urgent}</div><div class="stat-lbl">Urgent (≤14 dagen)</div></div>
      <div class="stat"><div class="stat-num">${overschreden}</div><div class="stat-lbl">Deadline voorbij</div></div>
      <div class="stat"><div class="stat-num" style="font-size:16pt">${lodFmt(totaalBoete)}</div><div class="stat-lbl">Totaal boeterisico</div></div>
    </div>
    <table><thead><tr>
      <th>VvE</th><th>Ref. gemeente</th><th>Behandelaar</th><th>Status</th>
      <th>Deadline</th><th style="text-align:right">Max. boete</th>
      <th style="text-align:center">Offertes</th><th style="text-align:center">Voortgang</th>
    </tr></thead>
    <tbody>${rijen||'<tr><td colspan=8 style="color:#8A7E7B;text-align:center;padding:20px">Geen actieve LODs</td></tr>'}</tbody></table>
    <div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>Last onder Dwangsom module</span></div>
    </body></html>`;

  const w = window.open('','_blank','width=1200,height=850');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Pop-up geblokkeerd.');
}

// ── LodBeheer ─────────────────────────────────────────────────────
export default function LodBeheer({ onTerug, beheerderList }) {
  const [lods, setLods] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [zoek, setZoek] = useState('');
  const [filterStatus, setFilterStatus] = useState('alle');
  const [tabHoofd, setTabHoofd] = useState('lods');
  const [loading, setLoading] = useState(true);
  const [hideAfgerond, setHideAfgerond] = useState(false);
  const [filterMaand, setFilterMaand] = useState(null); // 0-11 of null

  // Laad uit Supabase bij mount
  useEffect(()=>{
    lodSupaLoad().then(data=>{
      if (data && data.length) setLods(data);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const saveAndSet = async (nl) => {
    setLods(nl);
    // Sla alleen de gewijzigde LOD op
  };

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

  const statFilters = [
    {key:'alle',           label:"Alle LOD's",            val:lods.length,           tc:'#2D2D2D',dc:'#2D2D2D'},
    {key:'actief',         label:'Actief',                val:actief.length,          tc:'#1A4D7A',dc:'#1A4D7A'},
    {key:'offertes_afwacht',label:'Offerte in afwachting',val:ofwacht.length,         tc:'#92400E',dc:'#B45309'},
    {key:'vve_afwachting', label:'In afwachting van VvE', val:vveAfwacht.length,      tc:'#065F46',dc:'#059669'},
    {key:'urgent',         label:'Urgent',                val:urgent.length,          tc:LOD_ROOD, dc:LOD_ROOD},
    {key:'overschreden',   label:'Overschreden',          val:overschreden.length,    tc:LOD_ROOD, dc:LOD_ROOD},
  ];

  // Filterlijst zijbalk: exclusief 'in_behandeling' en 'offertes_lopen'
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
    // Verberg afgerond
    if (hideAfgerond && l.status==='afgerond') return false;
    // Maandfilter op deadline
    if (filterMaand!==null && l.deadlineAlgemeen) {
      const d = new Date(l.deadlineAlgemeen);
      if (d.getMonth()!==filterMaand) return false;
    } else if (filterMaand!==null && !l.deadlineAlgemeen) return false;
    return mz&&ms;
  });

  if (loading) return (
    <div className="min-h-screen bg-[#F2EFEC] flex items-center justify-center">
      <style>{CSS_FONT}</style>
      <div style={{textAlign:'center',color:'#8A7E7B'}}>
        <div style={{fontSize:24,marginBottom:8}}>⏳</div>
        <div style={{fontSize:14}}>LOD data laden...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>
      {/* Topbar */}
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div style={{width:28,height:28,background:LOD_ROOD,borderRadius:6}} />
            <div style={{width:28,height:28,background:'#2D2D2D',borderRadius:6}} />
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">LOD Beheer</span>
          <span className="text-xs text-gray-400">Last onder Dwangsom module</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addLod} style={{fontSize:12,padding:'6px 14px',background:LOD_ROOD,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
            + Nieuwe LOD
          </button>
          <button onClick={()=>exportTotaalLodPDF(lods)} style={{fontSize:12,padding:'6px 14px',background:'#fff',color:LOD_ROOD,border:`1.5px solid ${LOD_ROOD}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>
            Totaaloverzicht PDF
          </button>
          <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 transition-colors">
            ← Terug naar portaal
          </button>
        </div>
      </div>

      {/* Stats balk — klikbaar, breed, cijfer links */}
      <div style={{background:'#fff',borderBottom:'1px solid #E5DEDA',display:'flex',flexWrap:'wrap'}}>
        {statFilters.map(sf=>(
          <button key={sf.key} onClick={()=>setFilterStatus(sf.key)}
            style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',border:'none',borderBottom:`2px solid ${filterStatus===sf.key?sf.tc:'transparent'}`,background:filterStatus===sf.key?'#FAF7F2':'transparent',cursor:'pointer',transition:'all .15s',borderRight:'1px solid #F3F4F6',minWidth:140}}>
            <span style={{fontSize:28,fontWeight:700,color:sf.tc,fontFamily:'DM Sans,sans-serif',lineHeight:1}}>{sf.val}</span>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:11,color:sf.tc,fontWeight:600,lineHeight:1.2}}>{sf.label}</div>
              {filterStatus===sf.key&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:2}}>actief filter</div>}
            </div>
          </button>
        ))}
        {totaalBoete>0&&(
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderRight:'1px solid #F3F4F6',minWidth:160}}>
            <span style={{fontSize:22,fontWeight:700,color:LOD_ROOD,fontFamily:'monospace',lineHeight:1}}>{lodFmt(totaalBoete)}</span>
            <div style={{fontSize:11,color:LOD_ROOD,fontWeight:600,lineHeight:1.2}}>Totaal<br/>boeterisico</div>
          </div>
        )}
      </div>

      {/* Tabs hoofd */}
      <div style={{background:'#fff',borderBottom:'1px solid #E5DEDA',paddingLeft:20,display:'flex'}}>
        {[['lods','LOD overzicht'],['kalender','Deadlinekalender']].map(([key,lbl])=>(
          <button key={key} onClick={()=>setTabHoofd(key)}
            style={{padding:'10px 18px',border:'none',borderBottom:`2px solid ${tabHoofd===key?LOD_ROOD:'transparent'}`,background:'transparent',fontSize:13,fontWeight:tabHoofd===key?600:400,color:tabHoofd===key?LOD_ROOD:'#6B7280',cursor:'pointer'}}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{maxWidth:1200,margin:'0 auto',padding:'24px 20px 80px'}}>
        {tabHoofd==='kalender'?<LodKalender lods={lods}/>:(
          <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:20}}>
            {/* Zijbalk */}
            <div>
              {(overschreden.length>0||urgent.length>0||ofwacht.length>0||vveAfwacht.length>0)&&(
                <div style={{background:'#fff',border:'1.5px solid #E5DEDA',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:LOD_ROOD,marginBottom:10}}>Actie vereist</div>
                  {overschreden.map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:LOD_ROOD_BG,border:`1px solid #fca5a5`,borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:LOD_ROOD}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:LOD_ROOD}}>voorbij</span>
                    </div>
                  ))}
                  {urgent.map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:'#FEF3E2',border:'1px solid #FDE68A',borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:'#92400E'}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:'#92400E'}}>{lodDagenTot(l.deadlineAlgemeen)}d</span>
                    </div>
                  ))}
                  {ofwacht.filter(l=>!overschreden.includes(l)&&!urgent.includes(l)).map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:'#F3EFFD',border:'1px solid #C4B5FD',borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:'#5B3FA6'}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:'#5B3FA6'}}>offerte open</span>
                    </div>
                  ))}
                  {vveAfwacht.filter(l=>!overschreden.includes(l)&&!urgent.includes(l)&&!ofwacht.includes(l)).map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:'#D1FAE5',border:'1px solid #6EE7B7',borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:'#065F46'}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:'#065F46'}}>wacht VvE</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Verberg afgerond knop */}
              <button onClick={()=>setHideAfgerond(p=>!p)}
                style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 12px',background:hideAfgerond?'#EAF4EE':'#fff',border:`1.5px solid ${hideAfgerond?'#2D6A4F':'#E5DEDA'}`,borderRadius:10,cursor:'pointer',fontFamily:'inherit',marginBottom:10,transition:'all .15s'}}>
                <div style={{width:16,height:16,borderRadius:4,background:hideAfgerond?'#2D6A4F':'transparent',border:`1.5px solid ${hideAfgerond?'#2D6A4F':'#9CA3AF'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {hideAfgerond&&<span style={{color:'#fff',fontSize:10,fontWeight:700,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:12,fontWeight:600,color:hideAfgerond?'#2D6A4F':'#374151'}}>Verberg afgerond</span>
                {hideAfgerond&&<span style={{marginLeft:'auto',fontSize:10,color:'#2D6A4F',fontWeight:600}}>{lods.filter(l=>l.status==='afgerond').length} verborgen</span>}
              </button>

              <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,padding:'14px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#8A7E7B',marginBottom:10}}>Filter op status</div>
                {[['alle',"Alle LOD's"],...filterLijstStatussen.map(([k,v])=>[k,v.label]),['uitstel','Uitstel aangevraagd']].map(([key,lbl])=>(
                  <button key={key} onClick={()=>setFilterStatus(key)}
                    style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',borderRadius:7,border:'none',background:filterStatus===key?LOD_ROOD_BG:'transparent',color:filterStatus===key?LOD_ROOD:'#374151',fontSize:12,fontWeight:filterStatus===key?600:400,cursor:'pointer',marginBottom:2}}>
                    {lbl}
                    <span style={{float:'right',fontSize:11,color:'#9CA3AF'}}>{key==='alle'?lods.length:lods.filter(l=>l.status===key).length}</span>
                  </button>
                ))}
              </div>

              {/* Maandfilter op deadline */}
              <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,padding:'14px 16px',marginTop:10}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#8A7E7B',marginBottom:10}}>Filter op deadline maand</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>
                  {['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'].map((m,mi)=>{
                    const aantalInMaand = lods.filter(l=>{
                      if (!l.deadlineAlgemeen) return false;
                      return new Date(l.deadlineAlgemeen).getMonth()===mi && l.status!=='afgerond';
                    }).length;
                    return (
                      <button key={mi} onClick={()=>setFilterMaand(filterMaand===mi?null:mi)}
                        style={{padding:'5px 4px',borderRadius:6,border:`1.5px solid ${filterMaand===mi?LOD_ROOD:'#E5DEDA'}`,background:filterMaand===mi?LOD_ROOD_BG:'transparent',color:filterMaand===mi?LOD_ROOD:'#374151',fontSize:11,fontWeight:filterMaand===mi?700:400,cursor:'pointer',textAlign:'center',transition:'all .15s',position:'relative'}}>
                        {m}
                        {aantalInMaand>0&&<span style={{position:'absolute',top:-4,right:-4,width:14,height:14,borderRadius:'50%',background:LOD_ROOD,color:'#fff',fontSize:8,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{aantalInMaand}</span>}
                      </button>
                    );
                  })}
                </div>
                {filterMaand!==null&&<button onClick={()=>setFilterMaand(null)} style={{marginTop:8,width:'100%',padding:'5px',background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:'#9CA3AF',textDecoration:'underline'}}>Maandfilter wissen</button>}
              </div>
            </div>

            {/* Hoofdpanel */}
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
                <input value={zoek} onChange={e=>setZoek(e.target.value)} placeholder="Zoek op VvE naam of referentie..."
                  className="calc-inp" style={{flex:1,fontSize:13}} />
                {zoek&&<button onClick={()=>setZoek('')} style={{padding:'8px 12px',background:'#fff',border:'1px solid #E5DEDA',borderRadius:8,cursor:'pointer',fontSize:12,color:'#8A7E7B'}}>✕</button>}
                {filterStatus!=='alle'&&<button onClick={()=>setFilterStatus('alle')} style={{padding:'6px 12px',background:LOD_ROOD_BG,border:`1px solid #fca5a5`,borderRadius:8,cursor:'pointer',fontSize:11,color:LOD_ROOD,fontWeight:600,whiteSpace:'nowrap'}}>✕ Wis filter</button>}
              </div>
              {zichtbaar.length===0?(
                <div style={{textAlign:'center',padding:'60px 20px',color:'#9CA3AF'}}>
                  <div style={{fontSize:32,marginBottom:12}}>📋</div>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{lods.length===0?"Nog geen LOD's geregistreerd":"Geen resultaten"}</div>
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
