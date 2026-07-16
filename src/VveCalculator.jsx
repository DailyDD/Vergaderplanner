import React, { useState } from "react";

// ── VvE Calculator ───────────────────────────────────────────────
const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

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
const calcToday = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
let _calcId = 0
const calcUid = () => ++_calcId

// ── SVG-iconen (fill=none, stroke=currentColor, strokeWidth=1.75) ──
const Icn = {
  calculator: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="12" y2="18"/><line x1="16" y1="18" x2="16" y2="18.01"/></svg>,
  clipboard: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
  leaf: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75"/></svg>,
  building: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M9 22v-4h6v4"/></svg>,
  briefcase: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
  users: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  coins: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="7"/><path d="M15.35 9.35a7 7 0 11-5.7 5.7"/><line x1="9" y1="6" x2="9" y2="12"/><line x1="6" y1="9" x2="12" y2="9"/></svg>,
  hash: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>,
  printer: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  warn: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17.01"/></svg>,
  check: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  piggy: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2"/><path d="M2 9.5a.5.5 0 11 0-1 .5.5 0 010 1z"/></svg>,
  arrowLeft: (sz=16,clr="currentColor") => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
}

function calcBuildExploitatieRows(r) {
  const rows = []
  if (r.verzekering)   rows.push(['Opstalverzekering', calcFmt(r.verzekering)])
  if (r.administratie) rows.push(['Administratie/beheer', calcFmt(r.administratie)])
  if (r.bankkosten)    rows.push(['Bankkosten', calcFmt(r.bankkosten)])
  if (r.overig)        rows.push(['Overig', calcFmt(r.overig)])
  r.extraKosten.forEach(e => { if (e.bedrag) rows.push([e.naam || 'Extra post', calcFmt(e.bedrag)]) })
  return rows
}

function calcExportPDF(r) {
  const eigenRows = r.eigenaren.map((e, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : C.inset
    const deltaStr = (nieuw, huidig) => {
      if (nieuw === null || huidig === null) return '—'
      const diff = nieuw - huidig
      const pct = (diff / huidig * 100)
      const sign = diff > 0.005 ? '+' : ''
      const color = diff < -0.005 ? C.groen : diff > 0.005 ? '#C0392B' : C.blauw
      return '<span style="color:' + color + ';font-weight:600">' + sign + calcFmt(diff) + ' (' + sign + pct.toFixed(1) + '%)</span>'
    }
    return '<tr style="background:' + bg + '"><td>' + e.naam + '</td><td style="text-align:right">' + e.teller + '/' + e.noemer + '</td><td style="text-align:right">' + (e.aandeel * 100).toFixed(2) + '%</td><td style="text-align:right">' + (e.huidig !== null ? calcFmt(e.huidig) : '—') + '</td><td style="text-align:right">' + (e.bijdrMjop !== null ? calcFmt(e.bijdrMjop) : '—') + '</td><td>' + deltaStr(e.bijdrMjop, e.huidig) + '</td><td style="text-align:right">' + (e.bijdr05 !== null ? calcFmt(e.bijdr05) : '—') + '</td><td>' + deltaStr(e.bijdr05, e.huidig) + '</td></tr>'
  }).join('')
  const totMjop = r.hasMjop ? calcFmt(r.eigenaren.reduce((s, e) => s + (e.bijdrMjop || 0), 0)) : '—'
  const tot05 = r.has05 ? calcFmt(r.eigenaren.reduce((s, e) => s + (e.bijdr05 || 0), 0)) : '—'
  const rr = (l, v) => '<div class="rr"><span class="rl">' + l + '</span><span class="rv">' + v + '</span></div>'
  const rrB = (l, v) => '<div class="rr"><span class="rl">' + l + '</span><span class="rv big">' + v + '</span></div>'
  const exploRows = calcBuildExploitatieRows(r)
  const exploHTML = exploRows.map(([l, v]) => rr(l, v)).join('')
  const html = '<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><title>VvE Bijdrage – ' + r.complexNaam + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:' + C.ink + ';font-size:10pt;background:#fff;padding:32px 40px}'
    + '.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid ' + C.bordeaux + ';margin-bottom:22px}'
    + '.hdr h1{font-family:"DM Sans",sans-serif;font-size:18pt;color:' + C.bordeaux + ';font-weight:700}'
    + '.hdr .meta{font-size:9pt;color:' + C.tekst2 + ';margin-top:3px}'
    + '.intro{background:' + C.papier + ';border-left:4px solid ' + C.bordeaux + ';padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:9pt;color:' + C.tekst2 + '}'
    + '.intro strong{color:' + C.ink + ';font-size:10pt}'
    + '.sec{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:' + C.tekst2 + ';margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid ' + C.lijn + '}'
    + '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}'
    + '.block{border:1px solid ' + C.lijn + ';border-radius:6px;overflow:hidden}'
    + '.bh{background:' + C.bordeaux + ';padding:8px 12px}'
    + '.bh .tag{font-size:7.5pt;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.05em}'
    + '.bh .name{font-family:"DM Sans",sans-serif;font-size:13pt;color:#fff;font-weight:600}'
    + '.rr{display:flex;justify-content:space-between;padding:5px 12px;border-bottom:1px solid ' + C.lijn + ';font-size:9pt}'
    + '.rr:last-child{border:none}.rl{color:' + C.tekst2 + '}.rv{font-weight:500}'
    + '.rv.big{font-family:"DM Sans",sans-serif;font-size:15pt;color:' + C.bordeaux + ';font-weight:700}'
    + '.subtotaal{background:' + C.papier + ';font-weight:600}'
    + 'table{width:100%;border-collapse:collapse;font-size:9pt}'
    + 'thead tr{background:' + C.bordeaux + ';color:#fff}'
    + 'thead th{padding:7px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}'
    + 'thead th:not(:first-child){text-align:right}'
    + 'tbody td{padding:6px 10px;border-bottom:1px solid ' + C.lijn + '}'
    + 'tfoot td{padding:7px 10px;font-weight:600;color:' + C.bordeaux + ';border-top:2px solid ' + C.bordeaux + ';background:' + C.bordeauxTint + '}'
    + '.note{margin-top:24px;padding:12px 16px;background:' + C.papier + ';border-left:4px solid ' + C.bordeaux + ';font-size:8.5pt;color:' + C.tekst2 + ';border-radius:4px}'
    + '.footer{margin-top:20px;padding-top:8px;border-top:1px solid ' + C.lijn + ';display:flex;justify-content:space-between;font-size:7.5pt;color:' + C.tekst3 + '}'
    + '.print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:' + C.bordeaux + ';color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:"DM Sans",sans-serif}'
    + '@media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
    + '<button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>'
    + '<div class="hdr"><div><h1>' + (r.alleenEenmalig ? 'Eenmalige Bijdrage Rapport' : 'Reservefonds Bijdrage Rapport') + '</h1><div class="meta">' + r.complexNaam + ' · Opgesteld op ' + calcToday() + '</div></div></div>'
    + '<div class="intro"><strong>' + r.complexNaam + '</strong><br>' + (r.alleenEenmalig ? 'Berekening eenmalige bijdragen per eigenaar — opgesteld ' + calcToday() + '.' : 'Berekening minimale maandelijkse bijdrage reservefonds conform art. 5:126 BW — opgesteld ' + calcToday() + '.') + '</div>'
    + (r.alleenEenmalig ? '' :
        '<div class="sec">Methode 1 — Op basis van MJOP (wettelijke voorkeur)</div>'
      + '<div class="grid2"><div class="block"><div class="bh"><div class="tag">MJOP berekening</div><div class="name">Jaarlijkse dotatie</div></div>'
      + rr('Totale MJOP-kosten', calcFmt(r.mjopTotaal)) + rr('Planperiode', r.planPeriode + ' jaar') + rr('Jaarlijkse MJOP-dotatie', calcFmt(r.dotatie))
      + '</div><div class="block"><div class="bh"><div class="tag">Totale jaarlasten VvE</div><div class="name">Uitgesplitst</div></div>'
      + rr('MJOP-dotatie', calcFmt(r.dotatie)) + exploHTML
      + '<div class="rr subtotaal"><span class="rl">Totale jaarlasten VvE</span><span class="rv">' + calcFmt(r.jaarMjop) + '</span></div>'
      + rrB('Maandlasten VvE totaal', r.hasMjop ? calcFmt(r.mndMjop) : '—') + '</div></div>'
      + '<div class="sec">Methode 2 — 0,5% van herbouwwaarde (wettelijk minimum)</div>'
      + '<div class="grid2"><div class="block"><div class="bh"><div class="tag">Herbouwwaarde</div><div class="name">0,5% reservering</div></div>'
      + rr('Herbouwwaarde', calcFmt(r.herbouwwaarde)) + rr('0,5% jaarlijkse reservering', calcFmt(r.jaar05)) + rr('Van toepassing bij', '<span style="font-style:italic">geen/oud MJOP</span>')
      + '</div><div class="block"><div class="bh"><div class="tag">Totale jaarlasten VvE</div><div class="name">Uitgesplitst</div></div>'
      + rr('0,5% reservering', calcFmt(r.jaar05)) + exploHTML
      + '<div class="rr subtotaal"><span class="rl">Totale jaarlasten VvE</span><span class="rv">' + calcFmt(r.jaar05Totaal) + '</span></div>'
      + rrB('Maandlasten VvE totaal', r.has05 ? calcFmt(r.mnd05) : '—') + '</div></div>'
      + '<div class="sec">Maandelijkse bijdrage per eigenaar</div>'
      + '<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Breukdeel</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Huidig/mnd</th><th style="text-align:right">MJOP/mnd</th><th>Δ MJOP</th><th style="text-align:right">0,5%/mnd</th><th>Δ 0,5%</th></tr></thead>'
      + '<tbody>' + eigenRows + '</tbody>'
      + '<tfoot><tr><td><strong>Totaal VvE</strong></td><td></td><td style="text-align:right">100%</td><td style="text-align:right">' + calcFmt(r.eigenaren.reduce((s,e)=>s+(e.huidig||0),0)) + '</td><td style="text-align:right">' + totMjop + '</td><td></td><td style="text-align:right">' + tot05 + '</td><td></td></tr></tfoot></table>'
    )
    + (r.eenmaligAan && r.eenmaligBerekend && r.eenmaligBerekend.length > 0 ? (
        '<div class="sec">Eenmalige bijdragen per eigenaar</div>'
        + r.eenmaligBerekend.map(item =>
            '<p style="font-size:9pt;font-weight:600;margin:10px 0 2px">' + item.omschrijving + ' — Offerte: ' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.offerte) + (item.totaleKorting > 0 ? ' — Netto: ' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.nettoOfferte) : '') + ' — Tekort: ' + (item.tekort > 0 ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) : '€ 0,00 (volledig gedekt)') + '</p>'
            + (item.tekort > 0 ? '<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Korting</th><th style="text-align:right">Eenmalige bijdrage</th></tr></thead><tbody>' + item.perEigenaar.map((e,i) => '<tr style="background:' + (i%2===0?'#fff':C.inset) + '"><td>' + e.naam + '</td><td style="text-align:right">' + (e.aandeel*100).toFixed(2) + '%</td><td style="text-align:right;color:' + C.groen + '">' + (e.korting > 0 ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.korting) : '—') + '</td><td style="text-align:right;font-weight:600;color:' + C.bordeaux + '">' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.bijdrage) + '</td></tr>').join('') + '</tbody><tfoot><tr><td colspan="3"><strong>Totaal tekort</strong></td><td style="text-align:right">' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) + '</td></tr></tfoot></table>' : '')
          ).join('')
      ) : '')
    + (r.alleenEenmalig ? '' : (()=>{
        const fmtRes = (v) => v !== null && v !== undefined ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(v) : '—';
        const col = (label, sub, value, active) =>
          '<div style="padding:20px 24px;flex:1;border-right:1px solid ' + C.lijn + '">'
          + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:' + C.tekst2 + ';margin-bottom:4px">' + label + '</div>'
          + '<div style="font-size:8.5pt;color:' + C.tekst2 + ';margin-bottom:12px">' + sub + '</div>'
          + (active ? '<div style="font-family:\'DM Sans\',sans-serif;font-size:20pt;color:' + (value>=0?C.groen:'#C0392B') + ';font-weight:700">' + fmtRes(value) + '</div><div style="font-size:8pt;color:' + C.tekst2 + ';margin-top:4px">per jaar</div>' : '<div style="font-size:13pt;color:' + C.tekst3 + '">—</div>')
          + '</div>';
        return '<div class="sec">Jaarlijkse reservering voor onderhoud — VvE totaal</div>'
          + '<div style="border:1px solid ' + C.lijn + ';border-radius:6px;overflow:hidden;margin-bottom:14px">'
          + '<div style="padding:12px 16px;border-bottom:1px solid ' + C.lijn + ';display:flex;align-items:center;gap:10px;background:#fff">'
          + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + C.groen + '" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><path d="M15.35 9.35a7 7 0 11-5.7 5.7"/><line x1="9" y1="6" x2="9" y2="12"/><line x1="6" y1="9" x2="12" y2="9"/></svg>'
          + '<div><div style="font-size:10pt;font-weight:600">Reservering = (totale maandelijkse bijdragen × 12) − exploitatiekosten</div>'
          + '<div style="font-size:8.5pt;color:' + C.tekst2 + ';margin-top:2px">Wat de VvE per jaar spaart voor onderhoud na aftrek van vaste lasten</div></div></div>'
          + '<div style="display:flex">'
          + col('Huidig', 'Op basis van huidige bijdragen', r.jaarResHuidig, r.jaarResHuidig !== null)
          + col('Op basis van MJOP', 'Nieuwe bijdrage methode 1', r.jaarResMjop, r.hasMjop)
          + '<div style="padding:20px 24px;flex:1">'
          + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:' + C.tekst2 + ';margin-bottom:4px">Op basis van 0,5%</div>'
          + '<div style="font-size:8.5pt;color:' + C.tekst2 + ';margin-bottom:12px">Nieuwe bijdrage methode 2</div>'
          + (r.has05 ? '<div style="font-family:\'DM Sans\',sans-serif;font-size:20pt;color:' + (r.jaarRes05>=0?C.groen:'#C0392B') + ';font-weight:700">' + fmtRes(r.jaarRes05) + '</div><div style="font-size:8pt;color:' + C.tekst2 + ';margin-top:4px">per jaar</div>' : '<div style="font-size:13pt;color:' + C.tekst3 + '">—</div>')
          + '</div>'
          + '</div></div>';
      })())
    + (r.alleenEenmalig ? '' : '<div class="note"><strong>Toelichting:</strong> Methode 1 (MJOP) verdient de voorkeur bij een actueel MJOP. Methode 2 (0,5%) is het wettelijk minimum conform art. 5:126 lid 3 BW (v.a. 1 jan 2021).</div>')
    + '<div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>' + calcToday() + '</span></div>'
    + '</body></html>'
  const w = window.open('', '_blank', 'width=1050,height=850')
  if (w) { w.document.write(html); w.document.close() }
  else alert('Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.')
}

// ── Calculator sub-componenten (buiten VveCalculator om re-mount te voorkomen) ──
const calcInpStyle = {
  width:'100%', padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:10,
  fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.ink, background:'#fff', outline:'none',
  MozAppearance:'textfield', appearance:'textfield',
}
function CInp(props) { return <input {...props} style={{...calcInpStyle, ...props.style}} />; }
function CField({label, children}) {
  return <div style={{marginBottom:4}}><label style={{display:'block',fontSize:11,fontWeight:600,color:C.tekst2,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>{label}</label>{children}</div>;
}
function CCard({header, children}) {
  return <div style={{background:C.wit,border:'1px solid '+C.lijn,borderRadius:12,overflow:'hidden',marginBottom:14}}>{header}{children}</div>;
}
function CCardHdr({icon, bg, title, sub}) {
  return <div style={{padding:'14px 20px',borderBottom:'1px solid '+C.lijn,display:'flex',alignItems:'center',gap:10}}><div style={{width:30,height:30,borderRadius:7,background:bg,display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</div><div><div style={{fontSize:13,fontWeight:600,color:C.ink}}>{title}</div><div style={{fontSize:11,color:C.tekst2,marginTop:1}}>{sub}</div></div></div>;
}
function CTag({c,t,children}) {
  return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:500,background:c,color:t}}>{children}</span>;
}
function CMethodBlock({tag,name,rows:mrows,total}) {
  return (
    <div style={{background:C.wit,border:'1px solid '+C.lijn,borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'12px 18px 10px',borderBottom:'1px solid '+C.lijn}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:C.tekst2}}>{tag}</div>
        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,color:C.ink,marginTop:2,fontWeight:600}}>{name}</div>
      </div>
      {mrows.map(([l,v],i) => (
        <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'7px 18px',borderBottom:'1px solid '+C.lijn,fontSize:13}}>
          <span style={{color:C.tekst2}}>{l}</span><span style={{fontVariantNumeric:'tabular-nums',fontWeight:500}}>{v}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'10px 18px',fontSize:13}}>
        <span style={{color:C.tekst2}}>Maandlasten VvE totaal</span>
        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:22,color:C.bordeaux,fontWeight:700}}>{total}</span>
      </div>
    </div>
  );
}
function CSecTitle({children, style:st}) {
  return (
    <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:C.tekst2,marginBottom:10,marginTop:26,display:'flex',alignItems:'center',gap:8,...st}}>
      {children}<div style={{flex:1,height:1,background:C.lijn}} />
    </div>
  );
}

export default function VveCalculator({ onTerug }) {
  const S = C
  const fmt = calcFmt
  const uid = calcUid
  const [complexNaam,   setComplexNaam]   = useState('')
  const [herbouwwaarde, setHerbouwwaarde] = useState('')
  const [mjopTotaal,    setMjopTotaal]    = useState('')
  const [planPeriode,   setPlanPeriode]   = useState('10')
  const [verzekering,   setVerzekering]   = useState('')
  const [administratie, setAdministratie] = useState('')
  const [bankkosten,    setBankkosten]    = useState('')
  const [overig,        setOverig]        = useState('')
  const [extraKosten,   setExtraKosten]   = useState([])
  const [bulkTekst,         setBulkTekst]         = useState('')
  const [bulkOpen,          setBulkOpen]          = useState(false)
  const [bulkFout,          setBulkFout]          = useState('')
  const [bulkBijdrageTekst, setBulkBijdrageTekst] = useState('')
  const [bulkBijdrageOpen,  setBulkBijdrageOpen]  = useState(false)
  const [bulkBijdrageFout,  setBulkBijdrageFout]  = useState('')
  const [vasteNoemer,   setVasteNoemer]   = useState('')
  const [eenmaligAan,   setEenmaligAan]   = useState(false)
  const [eenmaligItems, setEenmaligItems] = useState([{ id: uid(), omschrijving: '', bedrag: '', reserveStand: '', buffer: '2500', kortingAan: false, kortingBedrag: '' }])
  const [rows, setRows] = useState([
    { id: uid(), naam: '', teller: '', huidig: '' },
    { id: uid(), naam: '', teller: '', huidig: '' },
    { id: uid(), naam: '', teller: '', huidig: '' },
  ])
  const [result, setResult] = useState(null)
  const [error,  setError]  = useState('')

  // Tabblad
  const [calcTab, setCalcTab] = useState('standaard') // 'standaard' | 'warmtefonds'

  // Warmtefonds state
  const [wfBedrag,    setWfBedrag]    = useState('')
  const [wfLooptijd,  setWfLooptijd]  = useState('120')
  const [wfRente,     setWfRente]     = useState('')
  const [wfResult,    setWfResult]    = useState(null)
  const [wfError,     setWfError]     = useState('')

  // Annuitaire maandlast berekening
  const berekenWarmtefonds = () => {
    setWfError('')
    setWfResult(null)
    const bedrag   = parseFloat(wfBedrag)
    const looptijd = parseInt(wfLooptijd)
    const rente    = parseFloat(wfRente)
    if (!bedrag || bedrag <= 0)     { setWfError('Vul een geldig geleend bedrag in.'); return }
    if (!looptijd || looptijd <= 0) { setWfError('Vul een geldige looptijd in.'); return }
    if (!rente || rente <= 0)       { setWfError('Vul een geldig rentepercentage in.'); return }
    const validRows = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0)
    if (!validRows.length)          { setWfError('Voer eerst eigenaren en breukdelen in (gedeelde tabel onderaan).'); return }
    if (!parseFloat(vasteNoemer))   { setWfError('Vul het totaal breukdelen (noemer) in bij de eigenarentabel.'); return }
    const noemer = parseFloat(vasteNoemer)
    const rMnd   = (rente / 100) / 12
    const n      = looptijd
    const maandlast = rMnd === 0
      ? bedrag / n
      : bedrag * rMnd * Math.pow(1 + rMnd, n) / (Math.pow(1 + rMnd, n) - 1)
    // 0,5% van herbouwwaarde berekening
    const hv       = parseFloat(herbouwwaarde) || 0
    const jaarExpl = (parseFloat(verzekering)||0) + (parseFloat(administratie)||0) + (parseFloat(bankkosten)||0) + (parseFloat(overig)||0) + extraKosten.reduce((s,e)=>s+(parseFloat(e.bedrag)||0),0)
    const jaar05   = hv > 0 ? hv * 0.005 : null
    const jaar05Totaal = jaar05 !== null ? jaar05 + jaarExpl : null
    const mnd05    = jaar05Totaal !== null ? jaar05Totaal / 12 : null

    const eigenaren = validRows.map(row => {
      const teller  = parseFloat(row.teller)
      const aandeel = teller / noemer
      const lening  = aandeel * maandlast
      const bijdr05 = mnd05 !== null ? aandeel * mnd05 : null
      return { naam: row.naam || ('App. ' + row.id), teller, noemer, aandeel, lening, bijdr05 }
    })
    setWfResult({ bedrag, looptijd, rente, maandlast, eigenaren, complexNaam, hv, mnd05 })
  }

  const addExtraKost = () => setExtraKosten(p => [...p, { id: uid(), naam: '', bedrag: '' }])
  const delExtraKost = (id) => setExtraKosten(p => p.filter(e => e.id !== id))
  const updExtraKost = (id, f, v) => setExtraKosten(p => p.map(e => e.id === id ? { ...e, [f]: v } : e))

  const formula = (() => {
    const t = parseFloat(mjopTotaal) || 0
    const p = parseFloat(planPeriode) || 10
    if (!t) return 'Jaarlijkse dotatie = Totale MJOP-kosten ÷ Planperiode'
    return fmt(t) + ' ÷ ' + p + ' jaar = ' + fmt(t / p) + ' jaarlijkse dotatie'
  })()

  const totalTeller = rows.reduce((s, r) => s + (parseFloat(r.teller) || 0), 0)
  const breukCheck = (() => {
    const filled = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0)
    if (!filled.length || totalTeller === 0) return null
    return { ok: true, totaal: totalTeller }
  })()

  const addRow = () => setRows(p => [...p, { id: uid(), naam: '', teller: '', huidig: '' }])
  const delRow = (id) => setRows(p => p.filter(r => r.id !== id))
  const updRow = (id, f, v) => setRows(p => p.map(r => r.id === id ? { ...r, [f]: v } : r))

  const parseBulk = () => {
    setBulkFout('')
    const skipPatterns = [
      /^Presentielijst/i, /^Locatie\s*:/i, /^Datum en tijd/i,
      /^Eigenaar\s+Adres/i, /^Powered by/i,
      /^Totaal VvE/i, /^Bezoekadres/i, /^Postadres/i,
      /^Volmerlaan/i, /^Postbus/i, /^info@totaal/i, /^KvK/i,
    ]
    const isPostcode = (s) => /^\d{4}\s*[A-Z]{2}/.test(s)
    const regels = bulkTekst.trim().split('\n').map(r => r.trim()).filter(r => r && !skipPatterns.some(p => p.test(r)))

    // Haal straat + huisnummer op — strip naam die er eventueel voor staat
    const SUFFIXEN = 'straat|laan|weg|plein|kade|dijk|gracht|singel|dreef|pad|steeg|hoek|markt|hof|allee|boulevard|park|ring'
    const extractAdres = (r) => {
      const s = r.replace(/,\s*$/, '').trim()
      const m = s.match(new RegExp(`([A-Z][a-zA-Z\\u00C0-\\u024F]*(?:${SUFFIXEN}))\\s+(\\d+[A-Za-z]?)$`, 'i'))
      if (m) return m[1] + ' ' + m[2]
      const fb = s.match(/([A-Z][a-zA-Z\u00C0-\u024F]+)\s+(\d+[A-Za-z]?)$/)
      return fb ? fb[1] + ' ' + fb[2] : null
    }

    // Breukdeel staat altijd NA het emailadres op de contactregel
    const extractBreukdeel = (rk) => {
      if (/@/.test(rk)) {
        const naEmail = rk.replace(/^.*@\S+\s*/, '')
        const getallen = [...naEmail.matchAll(/\b(\d{1,3})\b/g)].map(m => parseInt(m[1]))
        if (getallen.length >= 2) return getallen[getallen.length - 2]
        if (getallen.length === 1) return getallen[0]
      }
      if (/^\d{1,3}$/.test(rk.trim())) return parseInt(rk.trim())
      return null
    }

    const gevonden = []
    const seen = new Set()

    for (let i = 0; i < regels.length; i++) {
      if (!isPostcode(regels[i])) continue
      const adres = extractAdres(i > 0 ? regels[i - 1] : '')
      if (!adres || seen.has(adres)) continue
      seen.add(adres)

      let breukdeel = null
      for (let k = i + 1; k < Math.min(i + 10, regels.length); k++) {
        if (isPostcode(regels[k])) break
        breukdeel = extractBreukdeel(regels[k].trim())
        if (breukdeel) break
      }
      if (!breukdeel) continue

      const hnrNum = parseInt(adres.match(/(\d+)/)?.[1] || '0')
      const hnrLetter = (adres.match(/\d+([A-Za-z])/) || [])[1]?.toUpperCase() || ''
      gevonden.push({ naam: adres, breukdeel, hnrNum, hnrLetter })
    }

    if (!gevonden.length) { setBulkFout('Geen eigenaren herkend. Zorg dat je de volledige presentielijst plakt inclusief postcodes.'); return }
    gevonden.sort((a, b) => a.hnrNum - b.hnrNum || a.hnrLetter.localeCompare(b.hnrLetter))
    setRows(gevonden.map(e => ({ id: uid(), naam: e.naam, teller: String(e.breukdeel), huidig: '' })))
    setBulkOpen(false)
    setBulkTekst('')
  }

  const parseBulkBijdrage = () => {
    setBulkBijdrageFout('')
    const maanden = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
    const regels = bulkBijdrageTekst.trim().split('\n')
    const bijdragenMap = {}
    let huidigAdres = null
    let huidigBedragen = []
    const slaOp = () => {
      if (huidigAdres && huidigBedragen.length) {
        const nietNul = huidigBedragen.filter(b => b > 0)
        if (nietNul.length) {
          const teller = {}
          nietNul.forEach(b => { teller[b] = (teller[b] || 0) + 1 })
          const modus = Object.entries(teller).sort((a,b) => b[1]-a[1])[0][0]
          bijdragenMap[huidigAdres.toLowerCase()] = parseFloat(modus)
        }
      }
    }
    for (const regel of regels) {
      const eigenaarMatch = regel.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
      if (eigenaarMatch && !maanden.some(m => regel.toLowerCase().startsWith(m)) && !regel.startsWith('Maand') && !regel.startsWith('Te goed') && !regel.startsWith('Achterstand') && !regel.startsWith('Totalen') && !regel.startsWith('Extra')) {
        slaOp()
        huidigAdres = eigenaarMatch[2].trim()
        huidigBedragen = []
        continue
      }
      const maandMatch = regel.match(/^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+€\s+([\d\.]+,[\d]{2})/i)
      if (maandMatch) {
        const bedrag = parseFloat(maandMatch[2].replace(/\./g,'').replace(',','.'))
        if (bedrag > 0) huidigBedragen.push(bedrag)
      }
    }
    slaOp()
    if (!Object.keys(bijdragenMap).length) { setBulkBijdrageFout('Geen bijdragen herkend. Controleer het formaat.'); return }
    let gekoppeld = 0
    setRows(prev => prev.map(r => {
      const naamLower = r.naam.toLowerCase()
      for (const [adres, bedrag] of Object.entries(bijdragenMap)) {
        if (naamLower.includes(adres.toLowerCase())) { gekoppeld++; return { ...r, huidig: String(bedrag.toFixed(2)) } }
      }
      return r
    }))
    setRows(prev => prev.filter(r => { const h = parseFloat(r.huidig); return !isNaN(h) && h > 0 }))
    setBulkBijdrageOpen(false)
    setBulkBijdrageTekst('')
    if (gekoppeld === 0) setBulkBijdrageFout('Geen eigenaren gekoppeld. Importeer eerst eigenaren via bulk import.')
  }

  const bereken = () => {
    setError('')
    const hv = parseFloat(herbouwwaarde) || 0
    const mt = parseFloat(mjopTotaal) || 0
    const pp = parseFloat(planPeriode) || 10
    const vz = parseFloat(verzekering) || 0
    const ad = parseFloat(administratie) || 0
    const bk = parseFloat(bankkosten) || 0
    const ov = parseFloat(overig) || 0
    const extraTotaal = extraKosten.reduce((s, e) => s + (parseFloat(e.bedrag) || 0), 0)
    const validRows = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0)
    if (!validRows.length) { setError('Voeg eerst eigenaren toe met breukdelen.'); return }
    const alleenEenmalig = eenmaligAan && !hv && !mt
    if (!alleenEenmalig && !hv && !mt) { setError('Vul minimaal de herbouwwaarde of MJOP-kosten in.'); return }
    const dotatie   = mt > 0 ? mt / pp : 0
    const exploit   = vz + ad + bk + ov + extraTotaal
    const jaarMjop  = dotatie + exploit
    const mndMjop   = jaarMjop / 12
    const jaar05    = hv * 0.005
    const jaarTot05 = jaar05 + exploit
    const mnd05     = jaarTot05 / 12
    const noemer    = parseFloat(vasteNoemer) > 0 ? parseFloat(vasteNoemer) : validRows.reduce((s, r) => s + (parseFloat(r.teller) || 0), 0)
    const eigenaren = validRows.map(r => {
      const teller = parseFloat(r.teller) || 0
      const aandeel = noemer > 0 ? teller / noemer : 0
      const huidig = parseFloat(r.huidig) || null
      return { naam: r.naam || ('App. ' + r.id), teller: r.teller, noemer, aandeel, huidig, bijdrMjop: mt > 0 ? aandeel * mndMjop : null, bijdr05: hv > 0 ? aandeel * mnd05 : null }
    })
    const somHuidig = validRows.reduce((s, r) => s + (parseFloat(r.huidig) || 0), 0)
    const jaarResHuidig = somHuidig > 0 ? (somHuidig * 12) - exploit : null
    const jaarResMjop   = mt > 0 ? (mndMjop * 12) - exploit : null
    const jaarRes05     = hv > 0 ? (mnd05   * 12) - exploit : null
    const aantalEigenaren = eigenaren.length
    const eenmaligBerekend = eenmaligAan ? eenmaligItems.map(item => {
      const offerte = parseFloat(item.bedrag) || 0
      const reserve = parseFloat(item.reserveStand) || 0
      const buffer = parseFloat(item.buffer) >= 0 ? parseFloat(item.buffer) : 2500
      const kortingPerEigenaar = item.kortingAan ? (parseFloat(item.kortingBedrag) || 0) : 0
      const totaleKorting = kortingPerEigenaar * aantalEigenaren
      const nettoOfferte = Math.max(0, offerte - totaleKorting)
      const beschikbaar = Math.max(0, reserve - buffer)
      const tekort = Math.max(0, nettoOfferte - beschikbaar)
      const perEigenaar = noemer > 0 ? eigenaren.map(e => ({ naam: e.naam, aandeel: e.aandeel, korting: kortingPerEigenaar, bijdrage: tekort > 0 ? e.aandeel * tekort : 0 })) : []
      return { omschrijving: item.omschrijving || 'Eenmalige bijdrage', offerte, nettoOfferte, totaleKorting, kortingPerEigenaar, reserve, buffer, beschikbaar, tekort, perEigenaar }
    }) : []
    setResult({
      complexNaam: complexNaam || 'Complex', mjopTotaal: mt, planPeriode: pp, dotatie,
      verzekering: vz, administratie: ad, bankkosten: bk, overig: ov,
      extraKosten: extraKosten.map(e => ({ naam: e.naam, bedrag: parseFloat(e.bedrag) || 0 })),
      exploitatie: exploit, jaarMjop, mndMjop, hasMjop: mt > 0,
      herbouwwaarde: hv, jaar05, jaar05Totaal: jaarTot05, mnd05, has05: hv > 0, eigenaren,
      jaarResHuidig, jaarResMjop, jaarRes05, eenmaligAan, alleenEenmalig, eenmaligBerekend
    })
    setTimeout(() => document.getElementById('calc-res-anker')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }



  return (
    <div style={{ minHeight:'100vh', background:C.papier }}>
      <style>{CSS_FONT}</style>
      {/* ── Topbar ── */}
      <div style={{ position:'sticky', top:0, zIndex:50, background:C.wit, borderBottom:'1px solid '+C.lijn, height:56, padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ borderLeft:'3px solid '+C.bordeaux, paddingLeft:10, display:'flex', alignItems:'center', gap:8 }}>
            {Icn.calculator(18, C.bordeaux)}
            <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>VvE Calculator</span>
          </div>
        </div>
        <button onClick={onTerug} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, padding:'6px 12px', background:C.wit, border:'1px solid '+C.lijn, borderRadius:10, color:C.tekst2, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all .15s' }}>
          {Icn.arrowLeft(14, C.tekst2)} Terug naar portaal
        </button>
      </div>

      {/* Tabblad navigatie */}
      <div style={{ background:C.wit, borderBottom:'1px solid '+C.lijn }}>
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 20px', display:'flex', gap:0 }}>
          {[
            { key:'standaard', label:'Standaard bijdrage', icon: Icn.clipboard(14) },
            { key:'warmtefonds', label:'Warmtefonds / Lening', icon: Icn.leaf(14) },
          ].map(t => (
            <button key={t.key} onClick={() => setCalcTab(t.key)}
              style={{ padding:'12px 20px', border:'none', borderBottom: calcTab===t.key ? '2px solid '+C.bordeaux : '2px solid transparent', background:'transparent', fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight: calcTab===t.key ? 600 : 400, color: calcTab===t.key ? C.bordeaux : C.tekst3, cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all .15s' }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 80px' }}>

        {/* ── WARMTEFONDS TAB ── */}
        {calcTab === 'warmtefonds' && (
          <div>
            <CCard header={<CCardHdr icon={Icn.leaf(16, C.groen)} bg={C.groenTint} title="Warmtefonds / Leningbijdrage" sub="Maandelijkse bijdrage per eigenaar op basis van annuitaire lening" />}>
              <div style={{ padding:'18px 20px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                  <CField label="Geleend bedrag (€)">
                    <CInp type="number" placeholder="bijv. 120000" value={wfBedrag} onChange={e => setWfBedrag(e.target.value)} />
                  </CField>
                  <CField label="Looptijd (maanden)">
                    <CInp type="number" placeholder="bijv. 120" value={wfLooptijd} onChange={e => setWfLooptijd(e.target.value)} />
                  </CField>
                  <CField label="Rentepercentage (%)">
                    <CInp type="number" placeholder="bijv. 3.5" value={wfRente} onChange={e => setWfRente(e.target.value)} />
                  </CField>
                </div>
                {wfBedrag && wfLooptijd && wfRente && (() => {
                  const rMnd = (parseFloat(wfRente) / 100) / 12
                  const n    = parseInt(wfLooptijd)
                  const P    = parseFloat(wfBedrag)
                  if (!P || !n || !rMnd) return null
                  const M = P * rMnd * Math.pow(1+rMnd,n) / (Math.pow(1+rMnd,n)-1)
                  return (
                    <div style={{ marginTop:12, padding:'9px 13px', background:C.inset, border:'1px solid '+C.lijn, borderRadius:7, fontVariantNumeric:'tabular-nums', fontSize:12, color:C.tekst2 }}>
                      {fmt(P)} — {wfRente}% rente — looptijd {Math.round(n/12*10)/10} jaar = <strong style={{color:C.bordeaux}}>{fmt(M)} / maand</strong> voor de VvE totaal
                    </div>
                  )
                })()}
              </div>
            </CCard>

            <CCard header={<CCardHdr icon={Icn.building(16, C.bordeaux)} bg={C.bordeauxTint} title="Complexgegevens" sub="Herbouwwaarde voor 0,5% berekening" />}>
              <div style={{ padding:'18px 20px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <CField label="Naam complex"><CInp placeholder="bijv. VvE Reinkenstraat 1-24" value={complexNaam} onChange={e => setComplexNaam(e.target.value)} /></CField>
                  <CField label="Herbouwwaarde (€)"><CInp type="number" placeholder="bijv. 2500000" value={herbouwwaarde} onChange={e => setHerbouwwaarde(e.target.value)} /></CField>
                </div>
              </div>
            </CCard>

            <CCard header={<CCardHdr icon={Icn.briefcase(16, C.blauw)} bg={C.blauwTint} title="Vaste lasten (jaarlijks)" sub="Worden meegenomen in de 0,5% bijdrageberekening" />}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 14px' }}>
                <CField label="Opstalverzekering (€/jaar)"><CInp type="number" placeholder="bijv. 3200" value={verzekering} onChange={e => setVerzekering(e.target.value)} /></CField>
                <CField label="Administratie/beheer (€/jaar)"><CInp type="number" placeholder="bijv. 2400" value={administratie} onChange={e => setAdministratie(e.target.value)} /></CField>
                <CField label="Bankkosten (€/jaar)"><CInp type="number" placeholder="bijv. 250" value={bankkosten} onChange={e => setBankkosten(e.target.value)} /></CField>
                <CField label="Overig (€/jaar)"><CInp type="number" placeholder="bijv. 800" value={overig} onChange={e => setOverig(e.target.value)} /></CField>
              </div>
              {extraKosten.length > 0 && (
                <div style={{ padding:'0 20px 8px' }}>
                  <div style={{ fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Extra kostenposten</div>
                  {extraKosten.map(e => (
                    <div key={e.id} style={{ display:'grid', gridTemplateColumns:'1fr 180px 36px', gap:8, marginBottom:8, alignItems:'center' }}>
                      <CInp placeholder="Naam kostenpost (bijv. Liftonderhoud)" value={e.naam} onChange={v => updExtraKost(e.id, 'naam', v.target.value)} />
                      <CInp type="number" placeholder="euro/jaar" value={e.bedrag} onChange={v => updExtraKost(e.id, 'bedrag', v.target.value)} />
                      <button onClick={() => delExtraKost(e.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:C.tekst3, padding:'6px', borderRadius:4, textAlign:'center' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addExtraKost} style={{ margin:'4px 20px 14px', padding:'8px 14px', background:C.wit, border:'1.5px dashed '+C.lijn, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.tekst2, cursor:'pointer', width:'calc(100% - 40px)' }}>
                + Extra kostenpost toevoegen
              </button>
            </CCard>

            <div style={{ marginTop:4, padding:'10px 14px', background:C.groenTint, border:'1px solid '+C.groenRand, borderRadius:8, fontSize:12, color:C.groen, marginBottom:14 }}>
              Eigenaren en breukdelen worden overgenomen uit de tabel hieronder. Vul die eerst in of importeer via bulk.
            </div>

            <CCard header={<CCardHdr icon={Icn.users(16, C.groen)} bg={C.groenTint} title="Eigenaren" sub="Naam en breukdeel conform splitsingsakte — gedeeld met standaard calculator" />}>
              <div style={{ padding:'12px 20px 0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <button onClick={() => setBulkOpen(p => !p)} style={{ padding:'8px 16px', background:bulkOpen?C.bordeaux:C.wit, border:'1.5px solid '+C.bordeaux, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:bulkOpen?'#fff':C.bordeaux, cursor:'pointer', fontWeight:500 }}>
                    {bulkOpen ? 'x Sluiten' : 'Bulk importeren via tekst'}
                  </button>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <label style={{ fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>Totaal breukdelen (noemer)</label>
                    <input type="number" placeholder="bijv. 5250" value={vasteNoemer} onChange={e => setVasteNoemer(e.target.value)}
                      style={{ width:120, padding:'7px 10px', border:'1.5px solid '+C.lijn, borderRadius:8, fontVariantNumeric:'tabular-nums', fontSize:13, color:C.ink, background:C.inset, outline:'none', MozAppearance:'textfield', appearance:'textfield' }} />
                  </div>
                </div>
                {bulkOpen && (
                  <div style={{ background:C.inset, border:'1px solid '+C.lijn, borderRadius:10, padding:16, marginTop:10, marginBottom:12 }}>
                    <div style={{ fontSize:12, color:C.tekst2, marginBottom:8 }}>Plak hieronder de presentielijst of eigenaarstekst.</div>
                    <textarea value={bulkTekst} onChange={e => setBulkTekst(e.target.value)} placeholder="Plak hier de presentielijst..."
                      style={{ width:'100%', minHeight:120, padding:'10px 12px', border:'1.5px solid '+C.lijn, borderRadius:8, fontFamily:'monospace', fontSize:12, color:C.ink, background:C.wit, outline:'none', resize:'vertical' }} />
                    {bulkFout && <div style={{ color:C.bordeaux, fontSize:12, marginTop:6, display:'flex', alignItems:'center', gap:4 }}>{Icn.warn(14, C.bordeaux)} {bulkFout}</div>}
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
                      <button onClick={parseBulk} style={{ padding:'9px 20px', background:C.bordeaux, border:'none', borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken</button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ overflowX:'auto', padding:'8px 20px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:C.inset, borderBottom:'1px solid '+C.lijn }}>
                      <th style={{ padding:'8px 10px', textAlign:'center', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', width:30 }}>#</th>
                      <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Naam / adres eigenaar</th>
                      <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', width:150 }}>Breukdeel teller</th>
                      <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', width:170 }}>Huidige bijdrage (euro/mnd)</th>
                      <th style={{ width:36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid '+C.lijn : 'none' }}>
                        <td style={{ textAlign:'center', fontVariantNumeric:'tabular-nums', fontSize:11, color:C.tekst3, padding:'7px 8px' }}>{i + 1}</td>
                        <td style={{ padding:'5px 6px' }}><CInp placeholder="bijv. App. 1 De Vries" value={r.naam} onChange={e => updRow(r.id, 'naam', e.target.value)} /></td>
                        <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 45" value={r.teller} onChange={e => updRow(r.id, 'teller', e.target.value)} /></td>
                        <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 125" value={r.huidig} onChange={e => updRow(r.id, 'huidig', e.target.value)} /></td>
                        <td style={{ padding:'5px 6px', textAlign:'center' }}>
                          <button onClick={() => delRow(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:C.tekst3, padding:'2px 6px', borderRadius:4 }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {breukCheck && (
                <div style={{ margin:'8px 20px 4px', padding:'6px 10px', borderRadius:6, fontSize:12, fontVariantNumeric:'tabular-nums', background:parseFloat(vasteNoemer)>0?C.groenTint:C.amberTint, color:parseFloat(vasteNoemer)>0?C.groen:C.amber }}>
                  {parseFloat(vasteNoemer) > 0 ? 'Som tellers: ' + totalTeller + ' noemer vastgesteld op ' + vasteNoemer : 'Som tellers: ' + totalTeller + ' vul het totaal breukdelen in voor de juiste noemer'}
                </div>
              )}
              <button onClick={addRow} style={{ margin:'10px 20px', padding:'8px 14px', background:C.wit, border:'1.5px dashed '+C.lijn, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.tekst2, cursor:'pointer', width:'calc(100% - 40px)' }}>
                + Eigenaar toevoegen
              </button>
            </CCard>

            {wfError && <div style={{ background:C.bordeauxTint, color:C.bordeaux, padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:10 }}>{wfError}</div>}

            <button onClick={berekenWarmtefonds} style={{ width:'100%', padding:14, background:C.bordeaux, border:'none', borderRadius:12, fontFamily:"'DM Sans',sans-serif", fontSize:17, fontWeight:600, color:'#fff', cursor:'pointer', marginTop:4 }}>
              Bereken leningbijdrage per eigenaar
            </button>

            {wfResult && (
              <div style={{ marginTop:28 }}>
                <CSecTitle>Resultaat - Leningbijdrage Warmtefonds</CSecTitle>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:14, marginBottom:14 }}>
                  {[
                    { label:'Geleend bedrag', val: fmt(wfResult.bedrag) },
                    { label:'Looptijd', val: wfResult.looptijd + ' mnd (' + Math.round(wfResult.looptijd/12*10)/10 + ' jr)' },
                    { label:'Leningmaandlast VvE', val: fmt(wfResult.maandlast), accent: true },
                    { label:'0,5% maandlast VvE', val: wfResult.mnd05 !== null ? fmt(wfResult.mnd05) : '—', accent: true },
                  ].map(s => (
                    <div key={s.label} style={{ background:C.wit, border:'1px solid '+C.lijn, borderRadius:12, padding:'16px 20px' }}>
                      <div style={{ fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:22, fontWeight:700, color: s.accent ? C.bordeaux : C.ink }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <CCard header={<CCardHdr icon={Icn.hash(16, C.bordeaux)} bg={C.bordeauxTint} title="Bijdrage per eigenaar" sub="Leningbijdrage en huidige bijdrage naast elkaar" />}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:C.inset, borderBottom:'1px solid '+C.lijn }}>
                          {['Eigenaar','Breukdeel','Aandeel %','Standaard bijdrage (0,5%)/mnd','Leningbijdrage/mnd'].map((h,i) => (
                            <th key={i} style={{ padding:'8px 10px', textAlign:i>1?'right':'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wfResult.eigenaren.map((e, i) => (
                          <tr key={i} style={{ borderBottom: i<wfResult.eigenaren.length-1 ? '1px solid '+C.lijn : 'none' }}>
                            <td style={{ padding:'8px 10px', fontWeight:500, fontSize:12 }}>{e.naam}</td>
                            <td style={{ padding:'8px 10px', fontVariantNumeric:'tabular-nums', fontSize:12, textAlign:'right' }}>{e.teller}/{e.noemer}</td>
                            <td style={{ padding:'8px 10px', fontVariantNumeric:'tabular-nums', fontSize:12, textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                            <td style={{ padding:'8px 10px', fontVariantNumeric:'tabular-nums', fontSize:12, textAlign:'right', color: e.bijdr05 !== null ? C.ink : C.tekst3 }}>
                              {e.bijdr05 !== null ? fmt(e.bijdr05) : '-'}
                            </td>
                            <td style={{ padding:'8px 10px', fontVariantNumeric:'tabular-nums', fontSize:12, textAlign:'right', fontWeight:600, color:C.bordeaux }}>
                              {fmt(e.lening)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot style={{ borderTop:'2px solid '+C.bordeaux }}>
                        <tr style={{ background:C.inset }}>
                          <td colSpan={2} style={{ padding:'9px 10px', fontSize:13, fontWeight:600, color:C.tekst2 }}>Totaal VvE</td>
                          <td style={{ padding:'9px 10px', fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:600, textAlign:'right' }}>100%</td>
                          <td style={{ padding:'9px 10px', fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:600, color:C.bordeaux, textAlign:'right' }}>
                            {wfResult.mnd05 !== null ? fmt(wfResult.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)) : '-'}
                          </td>
                          <td style={{ padding:'9px 10px', fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:600, color:C.bordeaux, textAlign:'right' }}>
                            {fmt(wfResult.eigenaren.reduce((s,e)=>s+e.lening,0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CCard>
                <button onClick={() => {
                  const r = wfResult
                  const LOGO = 'data:image/png;base64,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'
                  const tRows = r.eigenaren.map((e,i) => '<tr><td style="padding:7px 12px;font-size:10pt;border-bottom:1px solid '+C.lijn+'">' + e.naam + '</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid '+C.lijn+';font-variant-numeric:tabular-nums">' + e.teller + '/' + e.noemer + '</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid '+C.lijn+';font-variant-numeric:tabular-nums">' + (e.aandeel*100).toFixed(2) + '%</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid '+C.lijn+';font-variant-numeric:tabular-nums">' + (e.bijdr05!==null?fmt(e.bijdr05):'-') + '</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid '+C.lijn+';font-variant-numeric:tabular-nums;font-weight:700;color:'+C.bordeaux+'">' + fmt(e.lening) + '</td></tr>').join('')
                  const tot05 = r.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)
                  const totLening = r.eigenaren.reduce((s,e)=>s+e.lening,0)
                  const today = new Date().toLocaleDateString('nl-NL',{day:'2-digit',month:'long',year:'numeric'})
                  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"DM Sans",Arial,sans-serif;font-size:10pt;color:${C.ink};background:#fff}
.page{padding:36px 44px 28px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid ${C.bordeaux};margin-bottom:24px}
.logo{width:110px}
.contact{text-align:right;font-size:8.5pt;color:${C.tekst2};line-height:1.7}
.contact strong{font-size:10pt;color:${C.ink};display:block;margin-bottom:2px}
.contact a{color:${C.bordeaux};text-decoration:none}
.betreft{background:${C.papier};border-left:4px solid ${C.bordeaux};padding:12px 16px;margin-bottom:20px;border-radius:0 6px 6px 0}
.betreft-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${C.tekst2};margin-bottom:3px}
.betreft-val{font-size:11pt;font-weight:700;color:${C.ink}}
.betreft-sub{font-size:9pt;color:${C.tekst2};margin-top:2px}
.aanhef{font-size:10pt;color:${C.ink};line-height:1.7;margin-bottom:20px}
.sec-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${C.bordeaux};margin-bottom:8px;margin-top:22px;display:flex;align-items:center;gap:8px}
.sec-title::after{content:'';flex:1;height:1px;background:${C.lijn}}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.sum-box{background:${C.papier};border-radius:7px;padding:10px 13px}
.sum-box label{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.tekst2};display:block;margin-bottom:3px}
.sum-box span{font-size:13pt;font-weight:700;color:${C.bordeaux}}
table{width:100%;border-collapse:collapse;margin-top:0}
thead tr{background:${C.bordeaux}}
thead th{padding:8px 12px;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#fff;text-align:left}
thead th.r{text-align:right}
tbody tr:nth-child(even){background:${C.inset}}
tfoot tr{background:${C.papier}}
tfoot td{padding:9px 12px;font-size:10pt;font-weight:700;border-top:2px solid ${C.bordeaux}}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid ${C.lijn};display:flex;justify-content:space-between;font-size:8pt;color:${C.tekst3}}
@media print{@page{margin:1.2cm;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="page">
<div class="header">
  <img src="${LOGO}" class="logo" alt="Totaal VvE Beheer" />
  <div class="contact">
    <strong>Totaal VvE Beheer Den Haag e.o.</strong>
    Volmerlaan 5, 2288 GC Rijswijk<br>
    Postbus 89, 2280 AB Rijswijk ZH<br>
    T: <a href="tel:+31703603443">070 - 360 34 43</a><br>
    E: <a href="mailto:info@totaalvve.nl">info@totaalvve.nl</a>
  </div>
</div>
<div class="betreft">
  <div class="betreft-label">Betreft</div>
  <div class="betreft-val">Overzicht maandelijkse leningbijdragen Warmtefonds${r.complexNaam ? ' — ' + r.complexNaam : ''}</div>
  <div class="betreft-sub">Opgesteld op ${today}</div>
</div>
<div class="aanhef">
  Hierbij ontvangt u het overzicht van de maandelijkse leningbijdragen per eigenaar, berekend op basis van het geleende bedrag via het Warmtefonds. De verdeling is gebaseerd op de breukdelen conform de splitsingsakte.
</div>
<div class="sec-title">Leninggegevens</div>
<div class="summary-grid">
  <div class="sum-box"><label>Geleend bedrag</label><span>${fmt(r.bedrag)}</span></div>
  <div class="sum-box"><label>Looptijd</label><span>${r.looptijd} mnd</span></div>
  <div class="sum-box"><label>Rentepercentage</label><span>${r.rente}%</span></div>
  <div class="sum-box"><label>Maandlast VvE totaal</label><span>${fmt(r.maandlast)}</span></div>
</div>
${r.mnd05 !== null ? '<div class="summary-grid" style="grid-template-columns:repeat(2,1fr);max-width:340px"><div class="sum-box"><label>0,5% bijdrage (jaarlijks)</label><span>' + fmt((r.mnd05||0)*12) + '</span></div><div class="sum-box"><label>0,5% bijdrage per maand</label><span>' + fmt(r.mnd05) + '</span></div></div>' : ''}
<div class="sec-title">Bijdrage per eigenaar</div>
<table>
  <thead><tr>
    <th>Eigenaar</th>
    <th class="r">Breukdeel</th>
    <th class="r">Aandeel</th>
    <th class="r">Standaard bijdrage (0,5%)/mnd</th>
    <th class="r">Leningbijdrage/mnd</th>
  </tr></thead>
  <tbody>${tRows}</tbody>
  <tfoot><tr>
    <td colspan="2">Totaal VvE</td>
    <td style="text-align:right">100%</td>
    <td style="text-align:right">${r.mnd05!==null?fmt(tot05):'-'}</td>
    <td style="text-align:right;color:${C.bordeaux}">${fmt(totLening)}</td>
  </tr></tfoot>
</table>
<div class="footer">
  <span>Totaal VvE Beheer Den Haag e.o.</span>
  <span>Gegenereerd op ${today}</span>
</div>
</div></body></html>`
                  const w = window.open('', '_blank')
                  if (!w) { alert('Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.'); return }
                  w.document.write(html)
                  w.document.close()
                  setTimeout(() => w.print(), 400)
                }} style={{ width:'100%', padding:'11px 16px', background:C.wit, border:'1.5px solid '+C.bordeaux, borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:14, color:C.bordeaux, cursor:'pointer', fontWeight:500, marginTop:14 }}>
                  Exporteer als PDF / Afdrukken
                </button>
              </div>
            )}
          </div>
        )}

        {/* STANDAARD TAB */}
        {calcTab === 'standaard' && <>
        <CSecTitle>Stap 1 — Algemene gegevens</CSecTitle>
        <CCard header={<CCardHdr icon={Icn.building(16, C.bordeaux)} bg={C.bordeauxTint} title="Complexgegevens" sub="Naam en herbouwwaarde" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px' }}>
            <CField label="Naam complex"><CInp placeholder="bijv. VvE Reinkenstraat 1–24" value={complexNaam} onChange={e => setComplexNaam(e.target.value)} /></CField>
            <CField label="Herbouwwaarde (€)"><CInp type="number" placeholder="bijv. 2500000" value={herbouwwaarde} onChange={e => setHerbouwwaarde(e.target.value)} /></CField>
          </div>
        </CCard>

        <CSecTitle>Stap 2 — MJOP gegevens</CSecTitle>
        <CCard header={<CCardHdr icon={Icn.clipboard(16, C.amber)} bg={C.amberTint} title="Meerjarenonderhoudsplan (MJOP)" sub="Totale kosten over de planperiode" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 0' }}>
            <CField label="Totale MJOP-kosten (€)"><CInp type="number" placeholder="bijv. 150000" value={mjopTotaal} onChange={e => setMjopTotaal(e.target.value)} /></CField>
            <CField label="Planperiode (jaren)"><CInp type="number" placeholder="10" value={planPeriode} onChange={e => setPlanPeriode(e.target.value)} /></CField>
          </div>
          <div style={{ margin:'10px 20px 18px', padding:'9px 13px', background:C.inset, border:'1px solid '+C.lijn, borderRadius:7, fontVariantNumeric:'tabular-nums', fontSize:12, color:C.tekst2 }}>{formula}</div>
        </CCard>

        <CSecTitle>Stap 3 — Overige exploitatiekosten (jaarlijks)</CSecTitle>
        <CCard header={<CCardHdr icon={Icn.briefcase(16, C.blauw)} bg={C.blauwTint} title="Exploitatiekosten" sub="Buiten het MJOP — worden per post getoond in het rapport" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 14px' }}>
            <CField label="Opstalverzekering (€/jaar)"><CInp type="number" placeholder="bijv. 3200" value={verzekering} onChange={e => setVerzekering(e.target.value)} /></CField>
            <CField label="Administratie/beheer (€/jaar)"><CInp type="number" placeholder="bijv. 2400" value={administratie} onChange={e => setAdministratie(e.target.value)} /></CField>
            <CField label="Bankkosten (€/jaar)"><CInp type="number" placeholder="bijv. 250" value={bankkosten} onChange={e => setBankkosten(e.target.value)} /></CField>
            <CField label="Overig (€/jaar)"><CInp type="number" placeholder="bijv. 800" value={overig} onChange={e => setOverig(e.target.value)} /></CField>
          </div>
          {extraKosten.length > 0 && (
            <div style={{ padding:'0 20px 8px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Extra kostenposten</div>
              {extraKosten.map(e => (
                <div key={e.id} style={{ display:'grid', gridTemplateColumns:'1fr 180px 36px', gap:8, marginBottom:8, alignItems:'center' }}>
                  <CInp placeholder="Naam kostenpost (bijv. Liftonderhoud)" value={e.naam} onChange={v => updExtraKost(e.id, 'naam', v.target.value)} />
                  <CInp type="number" placeholder="€/jaar" value={e.bedrag} onChange={v => updExtraKost(e.id, 'bedrag', v.target.value)} />
                  <button onClick={() => delExtraKost(e.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:C.tekst3, padding:'6px', borderRadius:4, textAlign:'center' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addExtraKost} style={{ margin:'4px 20px 14px', padding:'8px 14px', background:C.wit, border:'1.5px dashed '+C.lijn, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.tekst2, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Extra kostenpost toevoegen
          </button>
        </CCard>

        <CSecTitle>Stap 4 — Eigenaren &amp; breukdelen</CSecTitle>
        <CCard header={<CCardHdr icon={Icn.users(16, C.groen)} bg={C.groenTint} title="Eigenaren" sub="Naam en breukdeel conform splitsingsakte" />}>
          <div style={{ padding:'12px 20px 0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <button onClick={() => setBulkOpen(p => !p)} style={{ padding:'8px 16px', background:bulkOpen?C.bordeaux:C.wit, border:'1.5px solid '+C.bordeaux, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:bulkOpen?'#fff':C.bordeaux, cursor:'pointer', fontWeight:500 }}>
                {bulkOpen ? '× Sluiten' : 'Bulk importeren via tekst'}
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>Totaal breukdelen (noemer)</label>
                <input type="number" placeholder="bijv. 5250" value={vasteNoemer} onChange={e => setVasteNoemer(e.target.value)}
                  style={{ width:120, padding:'7px 10px', border:'1.5px solid '+C.lijn, borderRadius:8, fontVariantNumeric:'tabular-nums', fontSize:13, color:C.ink, background:C.inset, outline:'none' }}
                  
                />
              </div>
            </div>
            {bulkOpen && (
              <div style={{ background:C.inset, border:'1px solid '+C.lijn, borderRadius:10, padding:16, marginTop:10, marginBottom:12 }}>
                <div style={{ fontSize:12, color:C.tekst2, marginBottom:8 }}>Plak hieronder de presentielijst of eigenaarstekst. De tool haalt naam, adres en breukdeel er automatisch uit.</div>
                <textarea value={bulkTekst} onChange={e => setBulkTekst(e.target.value)} placeholder="Plak hier de presentielijst of eigenaarstekst..."
                  style={{ width:'100%', minHeight:140, padding:'10px 12px', border:'1.5px solid '+C.lijn, borderRadius:8, fontFamily:'monospace', fontSize:12, color:C.ink, background:C.wit, outline:'none', resize:'vertical' }} />
                {bulkFout && <div style={{ color:C.bordeaux, fontSize:12, marginTop:6, display:'flex', alignItems:'center', gap:4 }}>{Icn.warn(14, C.bordeaux)} {bulkFout}</div>}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
                  <button onClick={parseBulk} style={{ padding:'9px 20px', background:C.bordeaux, border:'none', borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken</button>
                  <span style={{ fontSize:11, color:C.tekst3 }}>Bestaande eigenaren worden vervangen</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:C.inset, borderBottom:'1px solid '+C.lijn }}>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', width:36 }}>#</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Naam / appartement</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', width:150 }}>Breukdeel teller</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', width:220 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      Huidige bijdrage (€/mnd)
                      <button onClick={() => setBulkBijdrageOpen(p => !p)} style={{ padding:'2px 8px', background:bulkBijdrageOpen?C.bordeaux:C.wit, border:'1px solid '+C.bordeaux, borderRadius:5, fontSize:10, color:bulkBijdrageOpen?'#fff':C.bordeaux, cursor:'pointer', fontWeight:600 }}>
                        {bulkBijdrageOpen ? '× sluiten' : 'bulk'}
                      </button>
                    </div>
                  </th>
                  <th style={{ padding:'8px 10px', width:44 }}></th>
                </tr>
              </thead>
              {bulkBijdrageOpen && (
                <tbody>
                  <tr>
                    <td colSpan={5} style={{ padding:'12px 16px', background:C.inset }}>
                      <div style={{ fontSize:12, color:C.tekst2, marginBottom:8 }}>Plak het overzicht ledenbijdragen. De tool pakt het vaakst voorkomende bedrag per eigenaar.</div>
                      <textarea value={bulkBijdrageTekst} onChange={e => setBulkBijdrageTekst(e.target.value)} placeholder="Plak hier het overzicht ledenbijdragen..."
                        style={{ width:'100%', minHeight:120, padding:'8px 10px', border:'1.5px solid '+C.lijn, borderRadius:7, fontFamily:'monospace', fontSize:12, color:C.ink, background:C.wit, outline:'none', resize:'vertical' }} />
                      {bulkBijdrageFout && <div style={{ color:C.bordeaux, fontSize:12, marginTop:4, display:'flex', alignItems:'center', gap:4 }}>{Icn.warn(14, C.bordeaux)} {bulkBijdrageFout}</div>}
                      <button onClick={parseBulkBijdrage} style={{ marginTop:8, padding:'8px 18px', background:C.bordeaux, border:'none', borderRadius:7, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken</button>
                    </td>
                  </tr>
                </tbody>
              )}
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid '+C.lijn : 'none' }}>
                    <td style={{ textAlign:'center', fontVariantNumeric:'tabular-nums', fontSize:11, color:C.tekst3, padding:'7px 8px' }}>{i + 1}</td>
                    <td style={{ padding:'5px 6px' }}><CInp placeholder="bijv. App. 1 · De Vries" value={r.naam} onChange={e => updRow(r.id, 'naam', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 45" value={r.teller} onChange={e => updRow(r.id, 'teller', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 125" value={r.huidig} onChange={e => updRow(r.id, 'huidig', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px', textAlign:'center' }}>
                      <button onClick={() => delRow(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:C.tekst3, padding:'2px 6px', borderRadius:4 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {breukCheck && (
            <div style={{ margin:'8px 20px 4px', padding:'6px 10px', borderRadius:6, fontSize:12, fontVariantNumeric:'tabular-nums', background:parseFloat(vasteNoemer)>0?C.groenTint:C.amberTint, color:parseFloat(vasteNoemer)>0?C.groen:C.amber, display:'flex', alignItems:'center', gap:4 }}>
              {parseFloat(vasteNoemer) > 0 ? <>{Icn.check(14, C.groen)} Som tellers: {totalTeller} — noemer vastgesteld op {vasteNoemer}</> : <>{Icn.warn(14, C.amber)} Som tellers: {totalTeller} — vul het totaal breukdelen in voor de juiste noemer</>}
            </div>
          )}
          <button onClick={addRow} style={{ margin:'10px 20px', padding:'8px 14px', background:C.wit, border:'1.5px dashed '+C.lijn, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.tekst2, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Eigenaar toevoegen
          </button>
        </CCard>

        <div style={{ marginTop:4, marginBottom:4 }}>
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'12px 16px', background:C.wit, border:'1px solid '+C.lijn, borderRadius:12, userSelect:'none' }}>
            <input type="checkbox" checked={eenmaligAan} onChange={e => setEenmaligAan(e.target.checked)} style={{ width:16, height:16, accentColor:C.bordeaux, cursor:'pointer' }} />
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>Eenmalige bijdrage berekenen</div>
              <div style={{ fontSize:11, color:C.tekst2, marginTop:1 }}>Verdeel offertebedragen over eigenaren op basis van breukdeel</div>
            </div>
          </label>
          {eenmaligAan && (
            <div style={{ background:C.wit, border:'1px solid '+C.lijn, borderRadius:12, overflow:'hidden', marginTop:8 }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid '+C.lijn, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:7, background:C.amberTint, display:'flex', alignItems:'center', justifyContent:'center' }}>{Icn.coins(16, C.amber)}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Eenmalige bijdragen</div>
                  <div style={{ fontSize:11, color:C.tekst2, marginTop:1 }}>Elke offerte heeft een eigen reservestand, buffer en eventuele gemeentelijke korting</div>
                </div>
              </div>
              <div style={{ padding:'16px 20px' }}>
                {eenmaligItems.map((item, i) => {
                  const reserveVal = parseFloat(item.reserveStand) || 0
                  const bufferVal = parseFloat(item.buffer) >= 0 ? parseFloat(item.buffer) : 2500
                  const beschikbaar = Math.max(0, reserveVal - bufferVal)
                  const kortingPE = item.kortingAan ? (parseFloat(item.kortingBedrag) || 0) : 0
                  const aantalEig = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0).length
                  const totKorting = kortingPE * aantalEig
                  const nettoOfferte = Math.max(0, (parseFloat(item.bedrag) || 0) - totKorting)
                  const tekort = Math.max(0, nettoOfferte - beschikbaar)
                  return (
                    <div key={item.id} style={{ border:'1px solid '+C.lijn, borderRadius:10, padding:'14px 16px', marginBottom:12, background:C.inset, position:'relative' }}>
                      {eenmaligItems.length > 1 && (
                        <button onClick={() => setEenmaligItems(p => p.filter(x => x.id !== item.id))} style={{ position:'absolute', top:10, right:10, background:'none', border:'none', cursor:'pointer', fontSize:16, color:C.tekst3, padding:'2px 6px', borderRadius:4 }}>×</button>
                      )}
                      <div style={{ fontSize:11, fontWeight:700, color:C.bordeaux, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Offerte {i + 1}</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 180px', gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Omschrijving</label>
                          <input type="text" placeholder="bijv. Dakvervanging offerte Kees BV" value={item.omschrijving}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, omschrijving: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.ink, background:C.wit, outline:'none' }}
                             />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Offertebedrag (€)</label>
                          <input type="number" placeholder="bijv. 24000" value={item.bedrag}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, bedrag: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:8, fontVariantNumeric:'tabular-nums', fontSize:13, color:C.ink, background:C.wit, outline:'none' }}
                             />
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Huidige stand reservefonds (€)</label>
                          <input type="number" placeholder="bijv. 18500" value={item.reserveStand}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, reserveStand: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:8, fontVariantNumeric:'tabular-nums', fontSize:13, color:C.ink, background:C.wit, outline:'none' }}
                             />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Buffer in reserve (€)</label>
                          <input type="number" placeholder="bijv. 2500" value={item.buffer}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, buffer: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:8, fontVariantNumeric:'tabular-nums', fontSize:13, color:C.ink, background:C.wit, outline:'none' }}
                             />
                        </div>
                      </div>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:item.kortingAan?8:0 }}>
                        <input type="checkbox" checked={item.kortingAan}
                          onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, kortingAan: e.target.checked} : x))}
                          style={{ width:14, height:14, accentColor:C.bordeaux, cursor:'pointer' }} />
                        <span style={{ fontSize:12, fontWeight:600, color:C.ink }}>Gemeentelijke korting</span>
                      </label>
                      {item.kortingAan && (
                        <div style={{ marginBottom:8 }}>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Korting per eigenaar (€)</label>
                          <input type="number" placeholder="bijv. 1000" value={item.kortingBedrag}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, kortingBedrag: e.target.value} : x))}
                            style={{ width:200, padding:'8px 11px', border:'1.5px solid '+C.lijn, borderRadius:8, fontVariantNumeric:'tabular-nums', fontSize:13, color:C.ink, background:C.wit, outline:'none' }}
                             />
                          {kortingPE > 0 && aantalEig > 0 && (
                            <div style={{ fontSize:12, color:C.tekst2, marginTop:4, fontVariantNumeric:'tabular-nums' }}>Totale korting: {kortingPE} × {aantalEig} eigenaren = {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(totKorting)}</div>
                          )}
                        </div>
                      )}
                      {(reserveVal > 0 || parseFloat(item.bedrag) > 0) && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:tekort>0?C.bordeauxTint:C.groenTint, borderRadius:7, fontSize:12, fontVariantNumeric:'tabular-nums', color:tekort>0?C.bordeaux:C.groen }}>
                          {item.kortingAan && totKorting > 0 && <div>Offerte na korting: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(nettoOfferte)}</div>}
                          <div>Beschikbaar uit reserve: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(beschikbaar)} (na buffer {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(bufferVal)})</div>
                          <div style={{ fontWeight:700, marginTop:2, display:'flex', alignItems:'center', gap:4 }}>{tekort > 0 ? <>{Icn.warn(14, C.bordeaux)} Tekort: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(tekort)}</> : <>{Icn.check(14, C.groen)} Volledig gedekt door reserve</>}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button onClick={() => setEenmaligItems(p => [...p, { id: uid(), omschrijving:'', bedrag:'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }])}
                  style={{ padding:'8px 14px', background:C.wit, border:'1.5px dashed '+C.lijn, borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.tekst2, cursor:'pointer', width:'100%' }}>
                  + Offerte toevoegen
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ background:C.bordeauxTint, color:C.bordeaux, padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:10 }}>{error}</div>}

        <button onClick={bereken} style={{ width:'100%', padding:14, background:C.bordeaux, border:'none', borderRadius:12, fontFamily:"'DM Sans',sans-serif", fontSize:17, fontWeight:600, color:'#fff', cursor:'pointer', marginTop:4 }}>
          Bereken maandelijkse bijdragen
        </button>

        {result && (
          <div id="calc-res-anker">
            <CSecTitle style={{ marginTop:36 }}>Resultaat</CSecTitle>
            <button onClick={() => calcExportPDF(result)} style={{ width:'100%', padding:'11px 16px', background:C.wit, border:'1.5px solid '+C.bordeaux, borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:14, color:C.bordeaux, cursor:'pointer', fontWeight:500, marginBottom:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {Icn.printer(16, C.bordeaux)} Exporteer als PDF / Afdrukken
            </button>
            {!result.alleenEenmalig && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                  <CMethodBlock tag="Methode 1 — Wettelijke voorkeur" name="Op basis van MJOP"
                    rows={[['Totale MJOP-kosten',fmt(result.mjopTotaal)],['Planperiode',result.planPeriode+' jaar'],['Jaarlijkse MJOP-dotatie',fmt(result.dotatie)],...calcBuildExploitatieRows(result),['Totale jaarlasten VvE',fmt(result.jaarMjop)]]}
                    total={result.hasMjop ? fmt(result.mndMjop) : '—'} />
                  <CMethodBlock tag="Methode 2 — Wettelijk minimum" name="0,5% van herbouwwaarde"
                    rows={[['Herbouwwaarde',fmt(result.herbouwwaarde)],['0,5% jaarlijkse reservering',fmt(result.jaar05)],...calcBuildExploitatieRows(result),['Totale jaarlasten VvE',fmt(result.jaar05Totaal)],['Toelichting','Minimumeis bij geen/oud MJOP']]}
                    total={result.has05 ? fmt(result.mnd05) : '—'} />
                </div>
                <CCard header={<CCardHdr icon={Icn.hash(16, C.bordeaux)} bg={C.bordeauxTint} title="Maandelijkse bijdrage per eigenaar" sub="Verdeling naar rato breukdeel" />}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:C.inset, borderBottom:'1px solid '+C.lijn }}>
                          {['Eigenaar','Breukdeel','Aandeel %','Huidig/mnd','MJOP/mnd','Δ MJOP','0,5%/mnd','Δ 0,5%'].map((h,i) => (
                            <th key={i} style={{ padding:'8px 10px', textAlign:i>1?'right':'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.eigenaren.map((e, i) => {
                          const diffMjop = e.huidig!==null&&e.bijdrMjop!==null?e.bijdrMjop-e.huidig:null
                          const diff05   = e.huidig!==null&&e.bijdr05!==null?e.bijdr05-e.huidig:null
                          const pctMjop  = e.huidig&&diffMjop!==null?(diffMjop/e.huidig*100):null
                          const pct05    = e.huidig&&diff05!==null?(diff05/e.huidig*100):null
                          const deltaTag = (diff, pct) => {
                            if (diff===null) return <span style={{color:C.tekst3}}>—</span>
                            const pos = diff > 0.005; const neg = diff < -0.005
                            const color = neg?C.groen:pos?'#C0392B':C.blauw
                            const bg    = neg?C.groenTint:pos?C.bordeauxTint:C.blauwTint
                            const sign  = pos?'+':''
                            return <CTag c={bg} t={color}>{sign}{fmt(diff)} ({sign}{pct.toFixed(1)}%)</CTag>
                          }
                          return (
                            <tr key={i} style={{ borderBottom:i<result.eigenaren.length-1?'1px solid '+C.lijn:'none' }}>
                              <td style={{ padding:'8px 10px',fontWeight:500,fontSize:12 }}>{e.naam}</td>
                              <td style={{ padding:'8px 10px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right' }}>{e.teller}/{e.noemer}</td>
                              <td style={{ padding:'8px 10px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                              <td style={{ padding:'8px 10px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right' }}>{e.huidig!==null?fmt(e.huidig):<span style={{color:C.tekst3}}>—</span>}</td>
                              <td style={{ padding:'8px 10px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right' }}>{e.bijdrMjop!==null?fmt(e.bijdrMjop):'—'}</td>
                              <td style={{ padding:'8px 10px' }}>{deltaTag(diffMjop,pctMjop)}</td>
                              <td style={{ padding:'8px 10px',fontVariantNumeric:'tabular-nums',fontSize:12,textAlign:'right' }}>{e.bijdr05!==null?fmt(e.bijdr05):'—'}</td>
                              <td style={{ padding:'8px 10px' }}>{deltaTag(diff05,pct05)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot style={{ borderTop:'2px solid '+C.bordeaux }}>
                        <tr style={{ background:C.inset }}>
                          <td colSpan={2} style={{ padding:'9px 10px',fontSize:13,fontWeight:600,color:C.tekst2 }}>Totaal VvE</td>
                          <td style={{ padding:'9px 10px',fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,textAlign:'right' }}>100%</td>
                          <td style={{ padding:'9px 10px',fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,color:C.bordeaux,textAlign:'right' }}>{fmt(result.eigenaren.reduce((s,e)=>s+(e.huidig||0),0))}</td>
                          <td style={{ padding:'9px 10px',fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,color:C.bordeaux,textAlign:'right' }}>{result.hasMjop?fmt(result.eigenaren.reduce((s,e)=>s+(e.bijdrMjop||0),0)):'—'}</td>
                          <td></td>
                          <td style={{ padding:'9px 10px',fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,color:C.bordeaux,textAlign:'right' }}>{result.has05?fmt(result.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)):'—'}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CCard>
                <div style={{ marginTop:16 }}>
                  <CSecTitle>Jaarlijkse reservering voor onderhoud — VvE totaal</CSecTitle>
                  <div style={{ background:C.wit, border:'1px solid '+C.lijn, borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid '+C.lijn, display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:30, height:30, borderRadius:7, background:C.groenTint, display:'flex', alignItems:'center', justifyContent:'center' }}>{Icn.coins(16, C.groen)}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>Reservering = (totale maandelijkse bijdragen × 12) − exploitatiekosten</div>
                        <div style={{ fontSize:11, color:C.tekst2, marginTop:1 }}>Wat de VvE per jaar spaart voor onderhoud na aftrek van vaste lasten</div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
                      {[
                        { label:'Huidig', sub:'Op basis van huidige bijdragen', value:result.jaarResHuidig, active:result.jaarResHuidig!==null },
                        { label:'Op basis van MJOP', sub:'Nieuwe bijdrage methode 1', value:result.jaarResMjop, active:result.hasMjop },
                        { label:'Op basis van 0,5%', sub:'Nieuwe bijdrage methode 2', value:result.jaarRes05, active:result.has05 },
                      ].map((item, i) => (
                        <div key={i} style={{ padding:'20px 24px', borderRight:i<2?'1px solid '+C.lijn:'none' }}>
                          <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:C.tekst2, marginBottom:4 }}>{item.label}</div>
                          <div style={{ fontSize:11, color:C.tekst2, marginBottom:12 }}>{item.sub}</div>
                          {item.active ? (
                            <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:26, color:item.value>=0?C.groen:'#C0392B', fontWeight:700 }}>
                              {fmt(item.value)}<div style={{ fontSize:11, fontFamily:"'DM Sans',sans-serif", color:C.tekst2, marginTop:4 }}>per jaar</div>
                            </div>
                          ) : <div style={{ fontSize:14, color:C.tekst3 }}>—</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {result.eenmaligAan && result.eenmaligBerekend && result.eenmaligBerekend.length > 0 && (
              <div style={{ marginTop:16 }}>
                <CSecTitle>Eenmalige bijdragen per eigenaar</CSecTitle>
                <div style={{ background:C.wit, border:'1px solid '+C.lijn, borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid '+C.lijn, display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:7, background:C.amberTint, display:'flex', alignItems:'center', justifyContent:'center' }}>{Icn.coins(16, C.amber)}</div>
                    <div><div style={{ fontSize:13, fontWeight:600 }}>Verdeling eenmalige bijdragen</div><div style={{ fontSize:11, color:C.tekst2, marginTop:1 }}>Elke offerte is onafhankelijk berekend</div></div>
                  </div>
                  {result.eenmaligBerekend.map((item, idx) => (
                    <div key={idx} style={{ borderBottom:idx<result.eenmaligBerekend.length-1?'1px solid '+C.lijn:'none' }}>
                      <div style={{ padding:'12px 20px', background:C.inset, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                        <div>
                          <span style={{ fontWeight:600, fontSize:13 }}>{item.omschrijving}</span>
                          <span style={{ fontSize:12, color:C.tekst2, marginLeft:12 }}>Offerte: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.offerte)}</span>
                          {item.totaleKorting > 0 && <span style={{ fontSize:12, color:C.groen, marginLeft:8 }}>− {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.totaleKorting)} korting</span>}
                        </div>
                        <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:18, fontWeight:600, color:item.tekort>0?C.bordeaux:C.groen, display:'flex', alignItems:'center', gap:4 }}>
                          {item.tekort > 0 ? <>Tekort: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort)}</> : <>{Icn.check(14, C.groen)} Volledig gedekt</>}
                        </span>
                      </div>
                      <div style={{ padding:'6px 20px', background:C.wit, borderBottom:'1px solid '+C.lijn, fontSize:11, color:C.tekst2, fontVariantNumeric:'tabular-nums' }}>
                        Reserve: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.reserve)} — buffer: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.buffer)} — beschikbaar: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.beschikbaar)}
                      </div>
                      {item.tekort > 0 && (
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead><tr style={{ background:C.inset, borderBottom:'1px solid '+C.lijn }}>
                              {['Eigenaar','Aandeel %','Korting','Eenmalige bijdrage'].map((h,i) => (
                                <th key={i} style={{ padding:'7px 12px', textAlign:i>0?'right':'left', fontSize:10, fontWeight:600, color:C.tekst2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {item.perEigenaar.map((e, i) => (
                                <tr key={i} style={{ borderBottom:i<item.perEigenaar.length-1?'1px solid '+C.lijn:'none', background:i%2===0?C.wit:C.inset }}>
                                  <td style={{ padding:'7px 12px',fontSize:13,fontWeight:500 }}>{e.naam}</td>
                                  <td style={{ padding:'7px 12px',fontVariantNumeric:'tabular-nums',fontSize:13,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                                  <td style={{ padding:'7px 12px',fontVariantNumeric:'tabular-nums',fontSize:13,textAlign:'right',color:e.korting>0?C.groen:C.tekst3 }}>{e.korting>0?new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.korting):'—'}</td>
                                  <td style={{ padding:'7px 12px',fontVariantNumeric:'tabular-nums',fontSize:13,textAlign:'right',color:C.bordeaux,fontWeight:600 }}>{new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.bijdrage)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot style={{ borderTop:'2px solid '+C.bordeaux }}>
                              <tr style={{ background:C.bordeauxTint }}>
                                <td colSpan={3} style={{ padding:'8px 12px',fontSize:13,fontWeight:600,color:C.tekst2 }}>Totaal tekort</td>
                                <td style={{ padding:'8px 12px',fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,color:C.bordeaux,textAlign:'right' }}>{new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ padding:'10px 20px', background:C.amberTint, borderTop:'1px solid '+C.lijn, fontSize:11, color:C.amber, display:'flex', alignItems:'center', gap:6 }}>
                    {Icn.warn(14, C.amber)} De buffer blijft altijd in het reservefonds als veiligheidsmarge voor onvoorziene kosten.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </>}
      </div>
    </div>
  )
}
