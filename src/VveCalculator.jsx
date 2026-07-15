import React, { useState } from "react";

// ── VvE Calculator ───────────────────────────────────────────────
const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

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
const calcToday = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
let _calcId = 0
const calcUid = () => ++_calcId

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
    const bg = i % 2 === 0 ? '#ffffff' : '#FAF7F2'
    const deltaStr = (nieuw, huidig) => {
      if (nieuw === null || huidig === null) return '—'
      const diff = nieuw - huidig
      const pct = (diff / huidig * 100)
      const sign = diff > 0.005 ? '+' : ''
      const color = diff < -0.005 ? '#2D6A4F' : diff > 0.005 ? '#C0392B' : '#1A4D7A'
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
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:#1A1614;font-size:10pt;background:#fff;padding:32px 40px}.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid #991A21;margin-bottom:22px}.hdr h1{font-family:"DM Serif Display",serif;font-size:18pt;color:#991A21;font-weight:400}.hdr .meta{font-size:9pt;color:#8A7E7B;margin-top:3px}.intro{background:#FAF7F2;border-left:4px solid #991A21;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:9pt;color:#8A7E7B}.intro strong{color:#1A1614;font-size:10pt}.sec{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8A7E7B;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5DEDA}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.block{border:1px solid #E5DEDA;border-radius:6px;overflow:hidden}.bh{background:#991A21;padding:8px 12px}.bh .tag{font-size:7.5pt;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.05em}.bh .name{font-family:"DM Serif Display",serif;font-size:13pt;color:#fff;font-weight:400}.rr{display:flex;justify-content:space-between;padding:5px 12px;border-bottom:1px solid #E5DEDA;font-size:9pt}.rr:last-child{border:none}.rl{color:#8A7E7B}.rv{font-weight:500}.rv.big{font-family:"DM Serif Display",serif;font-size:15pt;color:#991A21;font-weight:400}.subtotaal{background:#FAF7F2;font-weight:600}table{width:100%;border-collapse:collapse;font-size:9pt}thead tr{background:#991A21;color:#fff}thead th{padding:7px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}thead th:not(:first-child){text-align:right}tbody td{padding:6px 10px;border-bottom:1px solid #E5DEDA}tfoot td{padding:7px 10px;font-weight:600;color:#991A21;border-top:2px solid #991A21;background:#F5E6E7}.note{margin-top:24px;padding:12px 16px;background:#FAF7F2;border-left:4px solid #991A21;font-size:8.5pt;color:#8A7E7B;border-radius:4px}.footer{margin-top:20px;padding-top:8px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:7.5pt;color:#8A7E7B}.print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:#991A21;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:sans-serif}@media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
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
            + (item.tekort > 0 ? '<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Korting</th><th style="text-align:right">Eenmalige bijdrage</th></tr></thead><tbody>' + item.perEigenaar.map((e,i) => '<tr style="background:' + (i%2===0?'#fff':'#FAF7F2') + '"><td>' + e.naam + '</td><td style="text-align:right">' + (e.aandeel*100).toFixed(2) + '%</td><td style="text-align:right;color:#2D6A4F">' + (e.korting > 0 ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.korting) : '—') + '</td><td style="text-align:right;font-weight:600;color:#991A21">' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.bijdrage) + '</td></tr>').join('') + '</tbody><tfoot><tr><td colspan="3"><strong>Totaal tekort</strong></td><td style="text-align:right">' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) + '</td></tr></tfoot></table>' : '')
          ).join('')
      ) : '')
    + (r.alleenEenmalig ? '' : (()=>{
        const fmtRes = (v) => v !== null && v !== undefined ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(v) : '—';
        const col = (label, sub, value, active) =>
          '<div style="padding:20px 24px;flex:1;border-right:1px solid #E5DEDA">'
          + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8A7E7B;margin-bottom:4px">' + label + '</div>'
          + '<div style="font-size:8.5pt;color:#8A7E7B;margin-bottom:12px">' + sub + '</div>'
          + (active ? '<div style="font-family:\'DM Serif Display\',serif;font-size:20pt;color:' + (value>=0?'#2D6A4F':'#C0392B') + ';font-weight:400">' + fmtRes(value) + '</div><div style="font-size:8pt;color:#8A7E7B;margin-top:4px">per jaar</div>' : '<div style="font-size:13pt;color:#8A7E7B">—</div>')
          + '</div>';
        return '<div class="sec">Jaarlijkse reservering voor onderhoud — VvE totaal</div>'
          + '<div style="border:1px solid #E5DEDA;border-radius:6px;overflow:hidden;margin-bottom:14px">'
          + '<div style="padding:12px 16px;border-bottom:1px solid #E5DEDA;display:flex;align-items:center;gap:10px;background:#fff">'
          + '<div style="font-size:13pt">💰</div>'
          + '<div><div style="font-size:10pt;font-weight:600">Reservering = (totale maandelijkse bijdragen × 12) − exploitatiekosten</div>'
          + '<div style="font-size:8.5pt;color:#8A7E7B;margin-top:2px">Wat de VvE per jaar spaart voor onderhoud na aftrek van vaste lasten</div></div></div>'
          + '<div style="display:flex">'
          + col('Huidig', 'Op basis van huidige bijdragen', r.jaarResHuidig, r.jaarResHuidig !== null)
          + col('Op basis van MJOP', 'Nieuwe bijdrage methode 1', r.jaarResMjop, r.hasMjop)
          + '<div style="padding:20px 24px;flex:1">'
          + '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8A7E7B;margin-bottom:4px">Op basis van 0,5%</div>'
          + '<div style="font-size:8.5pt;color:#8A7E7B;margin-bottom:12px">Nieuwe bijdrage methode 2</div>'
          + (r.has05 ? '<div style="font-family:\'DM Serif Display\',serif;font-size:20pt;color:' + (r.jaarRes05>=0?'#2D6A4F':'#C0392B') + ';font-weight:400">' + fmtRes(r.jaarRes05) + '</div><div style="font-size:8pt;color:#8A7E7B;margin-top:4px">per jaar</div>' : '<div style="font-size:13pt;color:#8A7E7B">—</div>')
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
function CInp(props) { return <input {...props} className="calc-inp" />; }
function CField({label, children}) {
  return <div style={{marginBottom:4}}><label style={{display:'block',fontSize:11,fontWeight:600,color:'#8A7E7B',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>{label}</label>{children}</div>;
}
function CCard({header, children}) {
  return <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,overflow:'hidden',marginBottom:14}}>{header}{children}</div>;
}
function CCardHdr({icon, bg, title, sub}) {
  return <div style={{padding:'14px 20px',borderBottom:'1px solid #E5DEDA',display:'flex',alignItems:'center',gap:10}}><div style={{width:30,height:30,borderRadius:7,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>{icon}</div><div><div style={{fontSize:13,fontWeight:600}}>{title}</div><div style={{fontSize:11,color:'#8A7E7B',marginTop:1}}>{sub}</div></div></div>;
}
function CTag({c,t,children}) {
  return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:500,background:c,color:t}}>{children}</span>;
}
function CMethodBlock({tag,name,rows:mrows,total}) {
  return (
    <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'12px 18px 10px',borderBottom:'1px solid #E5DEDA'}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:'#8A7E7B'}}>{tag}</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:15,color:'#1A1614',marginTop:2}}>{name}</div>
      </div>
      {mrows.map(([l,v],i) => (
        <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'7px 18px',borderBottom:'1px solid #E5DEDA',fontSize:13}}>
          <span style={{color:'#8A7E7B'}}>{l}</span><span style={{fontFamily:'monospace',fontWeight:500}}>{v}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'10px 18px',fontSize:13}}>
        <span style={{color:'#8A7E7B'}}>Maandlasten VvE totaal</span>
        <span style={{fontFamily:'Georgia,serif',fontSize:22,color:'#991A21'}}>{total}</span>
      </div>
    </div>
  );
}
function CSecTitle({children, style:st}) {
  return (
    <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#8A7E7B',marginBottom:10,marginTop:26,display:'flex',alignItems:'center',gap:8,...st}}>
      {children}<div style={{flex:1,height:1,background:'#E5DEDA'}} />
    </div>
  );
}

export default function VveCalculator({ onTerug }) {
  const S = CALC_S
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
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center"><span className="text-white text-xs">🏠</span></div>
            <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center"><span className="text-white text-xs">📋</span></div>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">VvE Calculator</span>
        </div>
        <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors">
          ← Terug naar portaal
        </button>
      </div>

      {/* Tabblad navigatie */}
      <div style={{ background:'#fff', borderBottom:'1px solid #E5DEDA' }}>
        <div style={{ maxWidth:960, margin:'0 auto', padding:'0 20px', display:'flex', gap:0 }}>
          {[
            { key:'standaard', label:'Standaard bijdrage', icon:'📋' },
            { key:'warmtefonds', label:'Warmtefonds / Lening', icon:'🌿' },
          ].map(t => (
            <button key={t.key} onClick={() => setCalcTab(t.key)}
              style={{ padding:'12px 20px', border:'none', borderBottom: calcTab===t.key ? '2px solid #991A21' : '2px solid transparent', background:'transparent', fontFamily:'inherit', fontSize:13, fontWeight: calcTab===t.key ? 600 : 400, color: calcTab===t.key ? '#991A21' : '#8A7E7B', cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all .15s' }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 80px' }}>

        {/* ── WARMTEFONDS TAB ── */}
        {calcTab === 'warmtefonds' && (
          <div>
            <CCard header={<CCardHdr icon="🌿" bg={S.greenBg} title="Warmtefonds / Leningbijdrage" sub="Maandelijkse bijdrage per eigenaar op basis van annuitaire lening" />}>
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
                    <div style={{ marginTop:12, padding:'9px 13px', background:S.cream, border:'1px solid '+S.border, borderRadius:7, fontFamily:'monospace', fontSize:12, color:S.muted }}>
                      {fmt(P)} — {wfRente}% rente — looptijd {Math.round(n/12*10)/10} jaar = <strong style={{color:S.bordeaux}}>{fmt(M)} / maand</strong> voor de VvE totaal
                    </div>
                  )
                })()}
              </div>
            </CCard>

            <CCard header={<CCardHdr icon="🏢" bg={S.redBg} title="Complexgegevens" sub="Herbouwwaarde voor 0,5% berekening" />}>
              <div style={{ padding:'18px 20px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <CField label="Naam complex"><CInp placeholder="bijv. VvE Reinkenstraat 1-24" value={complexNaam} onChange={e => setComplexNaam(e.target.value)} /></CField>
                  <CField label="Herbouwwaarde (€)"><CInp type="number" placeholder="bijv. 2500000" value={herbouwwaarde} onChange={e => setHerbouwwaarde(e.target.value)} /></CField>
                </div>
              </div>
            </CCard>

            <CCard header={<CCardHdr icon="💼" bg={S.blueBg} title="Vaste lasten (jaarlijks)" sub="Worden meegenomen in de 0,5% bijdrageberekening" />}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 14px' }}>
                <CField label="Opstalverzekering (€/jaar)"><CInp type="number" placeholder="bijv. 3200" value={verzekering} onChange={e => setVerzekering(e.target.value)} /></CField>
                <CField label="Administratie/beheer (€/jaar)"><CInp type="number" placeholder="bijv. 2400" value={administratie} onChange={e => setAdministratie(e.target.value)} /></CField>
                <CField label="Bankkosten (€/jaar)"><CInp type="number" placeholder="bijv. 250" value={bankkosten} onChange={e => setBankkosten(e.target.value)} /></CField>
                <CField label="Overig (€/jaar)"><CInp type="number" placeholder="bijv. 800" value={overig} onChange={e => setOverig(e.target.value)} /></CField>
              </div>
              {extraKosten.length > 0 && (
                <div style={{ padding:'0 20px 8px' }}>
                  <div style={{ fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Extra kostenposten</div>
                  {extraKosten.map(e => (
                    <div key={e.id} style={{ display:'grid', gridTemplateColumns:'1fr 180px 36px', gap:8, marginBottom:8, alignItems:'center' }}>
                      <CInp placeholder="Naam kostenpost (bijv. Liftonderhoud)" value={e.naam} onChange={v => updExtraKost(e.id, 'naam', v.target.value)} />
                      <CInp type="number" placeholder="euro/jaar" value={e.bedrag} onChange={v => updExtraKost(e.id, 'bedrag', v.target.value)} />
                      <button onClick={() => delExtraKost(e.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'6px', borderRadius:4, textAlign:'center' }}>x</button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addExtraKost} style={{ margin:'4px 20px 14px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
                + Extra kostenpost toevoegen
              </button>
            </CCard>

            <div style={{ marginTop:4, padding:'10px 14px', background:'#EAF4EE', border:'1px solid #C6E8D0', borderRadius:8, fontSize:12, color:'#2D6A4F', marginBottom:14 }}>
              Eigenaren en breukdelen worden overgenomen uit de tabel hieronder. Vul die eerst in of importeer via bulk.
            </div>

            <CCard header={<CCardHdr icon="👥" bg={S.greenBg} title="Eigenaren" sub="Naam en breukdeel conform splitsingsakte — gedeeld met standaard calculator" />}>
              <div style={{ padding:'12px 20px 0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <button onClick={() => setBulkOpen(p => !p)} style={{ padding:'8px 16px', background:bulkOpen?S.bordeaux:'#fff', border:'1.5px solid '+S.bordeaux, borderRadius:8, fontFamily:'inherit', fontSize:13, color:bulkOpen?'#fff':S.bordeaux, cursor:'pointer', fontWeight:500 }}>
                    {bulkOpen ? 'x Sluiten' : 'Bulk importeren via tekst'}
                  </button>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <label style={{ fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>Totaal breukdelen (noemer)</label>
                    <input type="number" placeholder="bijv. 5250" value={vasteNoemer} onChange={e => setVasteNoemer(e.target.value)}
                      style={{ width:120, padding:'7px 10px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:S.cream, outline:'none', MozAppearance:'textfield', appearance:'textfield' }} />
                  </div>
                </div>
                {bulkOpen && (
                  <div style={{ background:S.cream, border:'1px solid '+S.border, borderRadius:10, padding:16, marginTop:10, marginBottom:12 }}>
                    <div style={{ fontSize:12, color:S.muted, marginBottom:8 }}>Plak hieronder de presentielijst of eigenaarstekst.</div>
                    <textarea value={bulkTekst} onChange={e => setBulkTekst(e.target.value)} placeholder="Plak hier de presentielijst..."
                      style={{ width:'100%', minHeight:120, padding:'10px 12px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:12, color:S.ink, background:'#fff', outline:'none', resize:'vertical' }} />
                    {bulkFout && <div style={{ color:S.bordeaux, fontSize:12, marginTop:6 }}>&#9888; {bulkFout}</div>}
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
                      <button onClick={parseBulk} style={{ padding:'9px 20px', background:S.bordeaux, border:'none', borderRadius:8, fontFamily:'inherit', fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken</button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ overflowX:'auto', padding:'8px 20px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:S.cream, borderBottom:'1px solid '+S.border }}>
                      <th style={{ padding:'8px 10px', textAlign:'center', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:30 }}>#</th>
                      <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Naam / adres eigenaar</th>
                      <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:150 }}>Breukdeel teller</th>
                      <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:170 }}>Huidige bijdrage (euro/mnd)</th>
                      <th style={{ width:36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid '+S.border : 'none' }}>
                        <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:11, color:S.muted, padding:'7px 8px' }}>{i + 1}</td>
                        <td style={{ padding:'5px 6px' }}><CInp placeholder="bijv. App. 1 De Vries" value={r.naam} onChange={e => updRow(r.id, 'naam', e.target.value)} /></td>
                        <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 45" value={r.teller} onChange={e => updRow(r.id, 'teller', e.target.value)} /></td>
                        <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 125" value={r.huidig} onChange={e => updRow(r.id, 'huidig', e.target.value)} /></td>
                        <td style={{ padding:'5px 6px', textAlign:'center' }}>
                          <button onClick={() => delRow(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'2px 6px', borderRadius:4 }}>x</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {breukCheck && (
                <div style={{ margin:'8px 20px 4px', padding:'6px 10px', borderRadius:6, fontSize:12, fontFamily:'monospace', background:parseFloat(vasteNoemer)>0?S.greenBg:S.amberBg, color:parseFloat(vasteNoemer)>0?S.green:S.amber }}>
                  {parseFloat(vasteNoemer) > 0 ? 'Som tellers: ' + totalTeller + ' noemer vastgesteld op ' + vasteNoemer : 'Som tellers: ' + totalTeller + ' vul het totaal breukdelen in voor de juiste noemer'}
                </div>
              )}
              <button onClick={addRow} style={{ margin:'10px 20px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
                + Eigenaar toevoegen
              </button>
            </CCard>

            {wfError && <div style={{ background:S.redBg, color:S.bordeaux, padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:10 }}>{wfError}</div>}

            <button onClick={berekenWarmtefonds} style={{ width:'100%', padding:14, background:S.bordeaux, border:'none', borderRadius:12, fontFamily:'Georgia,serif', fontSize:17, color:'#fff', cursor:'pointer', marginTop:4 }}>
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
                    <div key={s.label} style={{ background:'#fff', border:'1px solid '+S.border, borderRadius:12, padding:'16px 20px' }}>
                      <div style={{ fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontFamily:'Georgia,serif', fontSize:22, color: s.accent ? S.bordeaux : S.ink }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <CCard header={<CCardHdr icon="&#128290;" bg={S.redBg} title="Bijdrage per eigenaar" sub="Leningbijdrage en huidige bijdrage naast elkaar" />}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:S.cream, borderBottom:'1px solid '+S.border }}>
                          {['Eigenaar','Breukdeel','Aandeel %','Standaard bijdrage (0,5%)/mnd','Leningbijdrage/mnd'].map((h,i) => (
                            <th key={i} style={{ padding:'8px 10px', textAlign:i>1?'right':'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wfResult.eigenaren.map((e, i) => (
                          <tr key={i} style={{ borderBottom: i<wfResult.eigenaren.length-1 ? '1px solid '+S.border : 'none' }}>
                            <td style={{ padding:'8px 10px', fontWeight:500, fontSize:12 }}>{e.naam}</td>
                            <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:12, textAlign:'right' }}>{e.teller}/{e.noemer}</td>
                            <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:12, textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                            <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:12, textAlign:'right', color: e.bijdr05 !== null ? S.ink : S.muted }}>
                              {e.bijdr05 !== null ? fmt(e.bijdr05) : '-'}
                            </td>
                            <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:12, textAlign:'right', fontWeight:600, color:S.bordeaux }}>
                              {fmt(e.lening)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot style={{ borderTop:'2px solid '+S.bordeaux }}>
                        <tr style={{ background:S.cream }}>
                          <td colSpan={2} style={{ padding:'9px 10px', fontSize:13, fontWeight:600, color:S.muted }}>Totaal VvE</td>
                          <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:13, fontWeight:600, textAlign:'right' }}>100%</td>
                          <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:13, fontWeight:600, color:S.bordeaux, textAlign:'right' }}>
                            {wfResult.mnd05 !== null ? fmt(wfResult.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)) : '-'}
                          </td>
                          <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:13, fontWeight:600, color:S.bordeaux, textAlign:'right' }}>
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
                  const tRows = r.eigenaren.map((e,i) => '<tr><td style="padding:7px 12px;font-size:10pt;border-bottom:1px solid #EDE8E3">' + e.naam + '</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid #EDE8E3;font-family:monospace">' + e.teller + '/' + e.noemer + '</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid #EDE8E3;font-family:monospace">' + (e.aandeel*100).toFixed(2) + '%</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid #EDE8E3;font-family:monospace">' + (e.bijdr05!==null?fmt(e.bijdr05):'-') + '</td><td style="padding:7px 12px;font-size:10pt;text-align:right;border-bottom:1px solid #EDE8E3;font-family:monospace;font-weight:700;color:#991A21">' + fmt(e.lening) + '</td></tr>').join('')
                  const tot05 = r.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)
                  const totLening = r.eigenaren.reduce((s,e)=>s+e.lening,0)
                  const today = new Date().toLocaleDateString('nl-NL',{day:'2-digit',month:'long',year:'numeric'})
                  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:10pt;color:#1A1614;background:#fff}
.page{padding:36px 44px 28px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #991A21;margin-bottom:24px}
.logo{width:110px}
.contact{text-align:right;font-size:8.5pt;color:#5A5350;line-height:1.7}
.contact strong{font-size:10pt;color:#2D2D2D;display:block;margin-bottom:2px}
.contact a{color:#991A21;text-decoration:none}
.betreft{background:#F2EFEC;border-left:4px solid #991A21;padding:12px 16px;margin-bottom:20px;border-radius:0 6px 6px 0}
.betreft-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8A7E7B;margin-bottom:3px}
.betreft-val{font-size:11pt;font-weight:700;color:#2D2D2D}
.betreft-sub{font-size:9pt;color:#5A5350;margin-top:2px}
.aanhef{font-size:10pt;color:#2D2D2D;line-height:1.7;margin-bottom:20px}
.sec-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#991A21;margin-bottom:8px;margin-top:22px;display:flex;align-items:center;gap:8px}
.sec-title::after{content:'';flex:1;height:1px;background:#E5DEDA}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.sum-box{background:#F2EFEC;border-radius:7px;padding:10px 13px}
.sum-box label{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8A7E7B;display:block;margin-bottom:3px}
.sum-box span{font-size:13pt;font-weight:700;color:#991A21}
table{width:100%;border-collapse:collapse;margin-top:0}
thead tr{background:#991A21}
thead th{padding:8px 12px;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#fff;text-align:left}
thead th.r{text-align:right}
tbody tr:nth-child(even){background:#FAF7F2}
tfoot tr{background:#F2EFEC}
tfoot td{padding:9px 12px;font-size:10pt;font-weight:700;border-top:2px solid #991A21}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:8pt;color:#8A7E7B}
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
    <td style="text-align:right;color:#991A21">${fmt(totLening)}</td>
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
                }} style={{ width:'100%', padding:'11px 16px', background:'#fff', border:'1.5px solid '+S.bordeaux, borderRadius:10, fontFamily:'inherit', fontSize:14, color:S.bordeaux, cursor:'pointer', fontWeight:500, marginTop:14 }}>
                  Exporteer als PDF / Afdrukken
                </button>
              </div>
            )}
          </div>
        )}

        {/* STANDAARD TAB */}
        {calcTab === 'standaard' && <>
        <CSecTitle>Stap 1 — Algemene gegevens</CSecTitle>
        <CCard header={<CCardHdr icon="🏢" bg={S.redBg} title="Complexgegevens" sub="Naam en herbouwwaarde" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px' }}>
            <CField label="Naam complex"><CInp placeholder="bijv. VvE Reinkenstraat 1–24" value={complexNaam} onChange={e => setComplexNaam(e.target.value)} /></CField>
            <CField label="Herbouwwaarde (€)"><CInp type="number" placeholder="bijv. 2500000" value={herbouwwaarde} onChange={e => setHerbouwwaarde(e.target.value)} /></CField>
          </div>
        </CCard>

        <CSecTitle>Stap 2 — MJOP gegevens</CSecTitle>
        <CCard header={<CCardHdr icon="📋" bg={S.amberBg} title="Meerjarenonderhoudsplan (MJOP)" sub="Totale kosten over de planperiode" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 0' }}>
            <CField label="Totale MJOP-kosten (€)"><CInp type="number" placeholder="bijv. 150000" value={mjopTotaal} onChange={e => setMjopTotaal(e.target.value)} /></CField>
            <CField label="Planperiode (jaren)"><CInp type="number" placeholder="10" value={planPeriode} onChange={e => setPlanPeriode(e.target.value)} /></CField>
          </div>
          <div style={{ margin:'10px 20px 18px', padding:'9px 13px', background:S.cream, border:'1px solid '+S.border, borderRadius:7, fontFamily:'monospace', fontSize:12, color:S.muted }}>{formula}</div>
        </CCard>

        <CSecTitle>Stap 3 — Overige exploitatiekosten (jaarlijks)</CSecTitle>
        <CCard header={<CCardHdr icon="💼" bg={S.blueBg} title="Exploitatiekosten" sub="Buiten het MJOP — worden per post getoond in het rapport" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 14px' }}>
            <CField label="Opstalverzekering (€/jaar)"><CInp type="number" placeholder="bijv. 3200" value={verzekering} onChange={e => setVerzekering(e.target.value)} /></CField>
            <CField label="Administratie/beheer (€/jaar)"><CInp type="number" placeholder="bijv. 2400" value={administratie} onChange={e => setAdministratie(e.target.value)} /></CField>
            <CField label="Bankkosten (€/jaar)"><CInp type="number" placeholder="bijv. 250" value={bankkosten} onChange={e => setBankkosten(e.target.value)} /></CField>
            <CField label="Overig (€/jaar)"><CInp type="number" placeholder="bijv. 800" value={overig} onChange={e => setOverig(e.target.value)} /></CField>
          </div>
          {extraKosten.length > 0 && (
            <div style={{ padding:'0 20px 8px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Extra kostenposten</div>
              {extraKosten.map(e => (
                <div key={e.id} style={{ display:'grid', gridTemplateColumns:'1fr 180px 36px', gap:8, marginBottom:8, alignItems:'center' }}>
                  <CInp placeholder="Naam kostenpost (bijv. Liftonderhoud)" value={e.naam} onChange={v => updExtraKost(e.id, 'naam', v.target.value)} />
                  <CInp type="number" placeholder="€/jaar" value={e.bedrag} onChange={v => updExtraKost(e.id, 'bedrag', v.target.value)} />
                  <button onClick={() => delExtraKost(e.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'6px', borderRadius:4, textAlign:'center' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addExtraKost} style={{ margin:'4px 20px 14px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Extra kostenpost toevoegen
          </button>
        </CCard>

        <CSecTitle>Stap 4 — Eigenaren &amp; breukdelen</CSecTitle>
        <CCard header={<CCardHdr icon="👥" bg={S.greenBg} title="Eigenaren" sub="Naam en breukdeel conform splitsingsakte" />}>
          <div style={{ padding:'12px 20px 0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <button onClick={() => setBulkOpen(p => !p)} style={{ padding:'8px 16px', background:bulkOpen?S.bordeaux:'#fff', border:'1.5px solid '+S.bordeaux, borderRadius:8, fontFamily:'inherit', fontSize:13, color:bulkOpen?'#fff':S.bordeaux, cursor:'pointer', fontWeight:500 }}>
                {bulkOpen ? '× Sluiten' : '↑ Bulk importeren via tekst'}
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <label style={{ fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>Totaal breukdelen (noemer)</label>
                <input type="number" placeholder="bijv. 5250" value={vasteNoemer} onChange={e => setVasteNoemer(e.target.value)}
                  style={{ width:120, padding:'7px 10px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:S.cream, outline:'none' }}
                  
                />
              </div>
            </div>
            {bulkOpen && (
              <div style={{ background:S.cream, border:'1px solid '+S.border, borderRadius:10, padding:16, marginTop:10, marginBottom:12 }}>
                <div style={{ fontSize:12, color:S.muted, marginBottom:8 }}>Plak hieronder de presentielijst of eigenaarstekst. De tool haalt naam, adres en breukdeel er automatisch uit.</div>
                <textarea value={bulkTekst} onChange={e => setBulkTekst(e.target.value)} placeholder="Plak hier de presentielijst of eigenaarstekst..."
                  style={{ width:'100%', minHeight:140, padding:'10px 12px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:12, color:S.ink, background:'#fff', outline:'none', resize:'vertical' }} />
                {bulkFout && <div style={{ color:S.bordeaux, fontSize:12, marginTop:6 }}>⚠ {bulkFout}</div>}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
                  <button onClick={parseBulk} style={{ padding:'9px 20px', background:S.bordeaux, border:'none', borderRadius:8, fontFamily:'inherit', fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken →</button>
                  <span style={{ fontSize:11, color:S.muted }}>Bestaande eigenaren worden vervangen</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:S.cream, borderBottom:'1px solid '+S.border }}>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:36 }}>#</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Naam / appartement</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:150 }}>Breukdeel teller</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:220 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      Huidige bijdrage (€/mnd)
                      <button onClick={() => setBulkBijdrageOpen(p => !p)} style={{ padding:'2px 8px', background:bulkBijdrageOpen?S.bordeaux:'#fff', border:'1px solid '+S.bordeaux, borderRadius:5, fontSize:10, color:bulkBijdrageOpen?'#fff':S.bordeaux, cursor:'pointer', fontWeight:600 }}>
                        {bulkBijdrageOpen ? '× sluiten' : '↑ bulk'}
                      </button>
                    </div>
                  </th>
                  <th style={{ padding:'8px 10px', width:44 }}></th>
                </tr>
              </thead>
              {bulkBijdrageOpen && (
                <tbody>
                  <tr>
                    <td colSpan={5} style={{ padding:'12px 16px', background:S.cream }}>
                      <div style={{ fontSize:12, color:S.muted, marginBottom:8 }}>Plak het overzicht ledenbijdragen. De tool pakt het vaakst voorkomende bedrag per eigenaar.</div>
                      <textarea value={bulkBijdrageTekst} onChange={e => setBulkBijdrageTekst(e.target.value)} placeholder="Plak hier het overzicht ledenbijdragen..."
                        style={{ width:'100%', minHeight:120, padding:'8px 10px', border:'1.5px solid '+S.border, borderRadius:7, fontFamily:'monospace', fontSize:12, color:S.ink, background:'#fff', outline:'none', resize:'vertical' }} />
                      {bulkBijdrageFout && <div style={{ color:S.bordeaux, fontSize:12, marginTop:4 }}>⚠ {bulkBijdrageFout}</div>}
                      <button onClick={parseBulkBijdrage} style={{ marginTop:8, padding:'8px 18px', background:S.bordeaux, border:'none', borderRadius:7, fontFamily:'inherit', fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken →</button>
                    </td>
                  </tr>
                </tbody>
              )}
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid '+S.border : 'none' }}>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:11, color:S.muted, padding:'7px 8px' }}>{i + 1}</td>
                    <td style={{ padding:'5px 6px' }}><CInp placeholder="bijv. App. 1 · De Vries" value={r.naam} onChange={e => updRow(r.id, 'naam', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 45" value={r.teller} onChange={e => updRow(r.id, 'teller', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 125" value={r.huidig} onChange={e => updRow(r.id, 'huidig', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px', textAlign:'center' }}>
                      <button onClick={() => delRow(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'2px 6px', borderRadius:4 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {breukCheck && (
            <div style={{ margin:'8px 20px 4px', padding:'6px 10px', borderRadius:6, fontSize:12, fontFamily:'monospace', background:parseFloat(vasteNoemer)>0?S.greenBg:S.amberBg, color:parseFloat(vasteNoemer)>0?S.green:S.amber }}>
              {parseFloat(vasteNoemer) > 0 ? '✓ Som tellers: ' + totalTeller + ' — noemer vastgesteld op ' + vasteNoemer : '⚠ Som tellers: ' + totalTeller + ' — vul het totaal breukdelen in voor de juiste noemer'}
            </div>
          )}
          <button onClick={addRow} style={{ margin:'10px 20px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Eigenaar toevoegen
          </button>
        </CCard>

        <div style={{ marginTop:4, marginBottom:4 }}>
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'12px 16px', background:'#fff', border:'1px solid '+S.border, borderRadius:12, userSelect:'none' }}>
            <input type="checkbox" checked={eenmaligAan} onChange={e => setEenmaligAan(e.target.checked)} style={{ width:16, height:16, accentColor:S.bordeaux, cursor:'pointer' }} />
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:S.ink }}>Eenmalige bijdrage berekenen</div>
              <div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Verdeel offertebedragen over eigenaren op basis van breukdeel</div>
            </div>
          </label>
          {eenmaligAan && (
            <div style={{ background:'#fff', border:'1px solid '+S.border, borderRadius:12, overflow:'hidden', marginTop:8 }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid '+S.border, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:7, background:S.amberBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>💶</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Eenmalige bijdragen</div>
                  <div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Elke offerte heeft een eigen reservestand, buffer en eventuele gemeentelijke korting</div>
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
                    <div key={item.id} style={{ border:'1px solid '+S.border, borderRadius:10, padding:'14px 16px', marginBottom:12, background:S.cream, position:'relative' }}>
                      {eenmaligItems.length > 1 && (
                        <button onClick={() => setEenmaligItems(p => p.filter(x => x.id !== item.id))} style={{ position:'absolute', top:10, right:10, background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'2px 6px', borderRadius:4 }}>×</button>
                      )}
                      <div style={{ fontSize:11, fontWeight:700, color:S.bordeaux, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Offerte {i + 1}</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 180px', gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Omschrijving</label>
                          <input type="text" placeholder="bijv. Dakvervanging offerte Kees BV" value={item.omschrijving}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, omschrijving: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Offertebedrag (€)</label>
                          <input type="number" placeholder="bijv. 24000" value={item.bedrag}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, bedrag: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Huidige stand reservefonds (€)</label>
                          <input type="number" placeholder="bijv. 18500" value={item.reserveStand}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, reserveStand: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Buffer in reserve (€)</label>
                          <input type="number" placeholder="bijv. 2500" value={item.buffer}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, buffer: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                      </div>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:item.kortingAan?8:0 }}>
                        <input type="checkbox" checked={item.kortingAan}
                          onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, kortingAan: e.target.checked} : x))}
                          style={{ width:14, height:14, accentColor:S.bordeaux, cursor:'pointer' }} />
                        <span style={{ fontSize:12, fontWeight:600, color:S.ink }}>Gemeentelijke korting</span>
                      </label>
                      {item.kortingAan && (
                        <div style={{ marginBottom:8 }}>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Korting per eigenaar (€)</label>
                          <input type="number" placeholder="bijv. 1000" value={item.kortingBedrag}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, kortingBedrag: e.target.value} : x))}
                            style={{ width:200, padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                          {kortingPE > 0 && aantalEig > 0 && (
                            <div style={{ fontSize:12, color:S.muted, marginTop:4, fontFamily:'monospace' }}>Totale korting: {kortingPE} × {aantalEig} eigenaren = {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(totKorting)}</div>
                          )}
                        </div>
                      )}
                      {(reserveVal > 0 || parseFloat(item.bedrag) > 0) && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:tekort>0?S.redBg:S.greenBg, borderRadius:7, fontSize:12, fontFamily:'monospace', color:tekort>0?S.bordeaux:S.green }}>
                          {item.kortingAan && totKorting > 0 && <div>Offerte na korting: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(nettoOfferte)}</div>}
                          <div>Beschikbaar uit reserve: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(beschikbaar)} (na buffer {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(bufferVal)})</div>
                          <div style={{ fontWeight:700, marginTop:2 }}>{tekort > 0 ? '⚠ Tekort: ' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(tekort) : '✓ Volledig gedekt door reserve'}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button onClick={() => setEenmaligItems(p => [...p, { id: uid(), omschrijving:'', bedrag:'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }])}
                  style={{ padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'100%' }}>
                  + Offerte toevoegen
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ background:S.redBg, color:S.bordeaux, padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:10 }}>{error}</div>}

        <button onClick={bereken} style={{ width:'100%', padding:14, background:S.bordeaux, border:'none', borderRadius:12, fontFamily:'Georgia,serif', fontSize:17, color:'#fff', cursor:'pointer', marginTop:4 }}>
          Bereken maandelijkse bijdragen →
        </button>

        {result && (
          <div id="calc-res-anker">
            <CSecTitle style={{ marginTop:36 }}>Resultaat</CSecTitle>
            <button onClick={() => calcExportPDF(result)} style={{ width:'100%', padding:'11px 16px', background:'#fff', border:'1.5px solid '+S.bordeaux, borderRadius:10, fontFamily:'inherit', fontSize:14, color:S.bordeaux, cursor:'pointer', fontWeight:500, marginBottom:14 }}>
              🖨 Exporteer als PDF / Afdrukken
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
                <CCard header={<CCardHdr icon="🔢" bg={S.redBg} title="Maandelijkse bijdrage per eigenaar" sub="Verdeling naar rato breukdeel" />}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:S.cream, borderBottom:'1px solid '+S.border }}>
                          {['Eigenaar','Breukdeel','Aandeel %','Huidig/mnd','MJOP/mnd','Δ MJOP','0,5%/mnd','Δ 0,5%'].map((h,i) => (
                            <th key={i} style={{ padding:'8px 10px', textAlign:i>1?'right':'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
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
                            if (diff===null) return <span style={{color:S.muted}}>—</span>
                            const pos = diff > 0.005; const neg = diff < -0.005
                            const color = neg?S.green:pos?'#C0392B':S.blue
                            const bg    = neg?S.greenBg:pos?'#FDEAEB':S.blueBg
                            const sign  = pos?'+':''
                            return <CTag c={bg} t={color}>{sign}{fmt(diff)} ({sign}{pct.toFixed(1)}%)</CTag>
                          }
                          return (
                            <tr key={i} style={{ borderBottom:i<result.eigenaren.length-1?'1px solid '+S.border:'none' }}>
                              <td style={{ padding:'8px 10px',fontWeight:500,fontSize:12 }}>{e.naam}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.teller}/{e.noemer}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.huidig!==null?fmt(e.huidig):<span style={{color:S.muted}}>—</span>}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.bijdrMjop!==null?fmt(e.bijdrMjop):'—'}</td>
                              <td style={{ padding:'8px 10px' }}>{deltaTag(diffMjop,pctMjop)}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.bijdr05!==null?fmt(e.bijdr05):'—'}</td>
                              <td style={{ padding:'8px 10px' }}>{deltaTag(diff05,pct05)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot style={{ borderTop:'2px solid '+S.bordeaux }}>
                        <tr style={{ background:S.cream }}>
                          <td colSpan={2} style={{ padding:'9px 10px',fontSize:13,fontWeight:600,color:S.muted }}>Totaal VvE</td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,textAlign:'right' }}>100%</td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{fmt(result.eigenaren.reduce((s,e)=>s+(e.huidig||0),0))}</td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{result.hasMjop?fmt(result.eigenaren.reduce((s,e)=>s+(e.bijdrMjop||0),0)):'—'}</td>
                          <td></td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{result.has05?fmt(result.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)):'—'}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CCard>
                <div style={{ marginTop:16 }}>
                  <CSecTitle>Jaarlijkse reservering voor onderhoud — VvE totaal</CSecTitle>
                  <div style={{ background:'#fff', border:'1px solid #E5DEDA', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5DEDA', display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:30, height:30, borderRadius:7, background:'#EAF4EE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>💰</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>Reservering = (totale maandelijkse bijdragen × 12) − exploitatiekosten</div>
                        <div style={{ fontSize:11, color:'#8A7E7B', marginTop:1 }}>Wat de VvE per jaar spaart voor onderhoud na aftrek van vaste lasten</div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
                      {[
                        { label:'Huidig', sub:'Op basis van huidige bijdragen', value:result.jaarResHuidig, active:result.jaarResHuidig!==null },
                        { label:'Op basis van MJOP', sub:'Nieuwe bijdrage methode 1', value:result.jaarResMjop, active:result.hasMjop },
                        { label:'Op basis van 0,5%', sub:'Nieuwe bijdrage methode 2', value:result.jaarRes05, active:result.has05 },
                      ].map((item, i) => (
                        <div key={i} style={{ padding:'20px 24px', borderRight:i<2?'1px solid #E5DEDA':'none' }}>
                          <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8A7E7B', marginBottom:4 }}>{item.label}</div>
                          <div style={{ fontSize:11, color:'#8A7E7B', marginBottom:12 }}>{item.sub}</div>
                          {item.active ? (
                            <div style={{ fontFamily:'Georgia,serif', fontSize:26, color:item.value>=0?'#2D6A4F':'#C0392B', fontWeight:400 }}>
                              {fmt(item.value)}<div style={{ fontSize:11, fontFamily:'DM Sans,sans-serif', color:'#8A7E7B', marginTop:4 }}>per jaar</div>
                            </div>
                          ) : <div style={{ fontSize:14, color:'#8A7E7B' }}>—</div>}
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
                <div style={{ background:'#fff', border:'1px solid '+S.border, borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid '+S.border, display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:7, background:S.amberBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>💶</div>
                    <div><div style={{ fontSize:13, fontWeight:600 }}>Verdeling eenmalige bijdragen</div><div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Elke offerte is onafhankelijk berekend</div></div>
                  </div>
                  {result.eenmaligBerekend.map((item, idx) => (
                    <div key={idx} style={{ borderBottom:idx<result.eenmaligBerekend.length-1?'1px solid '+S.border:'none' }}>
                      <div style={{ padding:'12px 20px', background:S.cream, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                        <div>
                          <span style={{ fontWeight:600, fontSize:13 }}>{item.omschrijving}</span>
                          <span style={{ fontSize:12, color:S.muted, marginLeft:12 }}>Offerte: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.offerte)}</span>
                          {item.totaleKorting > 0 && <span style={{ fontSize:12, color:S.green, marginLeft:8 }}>− {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.totaleKorting)} korting</span>}
                        </div>
                        <span style={{ fontFamily:'Georgia,serif', fontSize:18, color:item.tekort>0?S.bordeaux:S.green }}>
                          {item.tekort > 0 ? 'Tekort: '+new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) : '✓ Volledig gedekt'}
                        </span>
                      </div>
                      <div style={{ padding:'6px 20px', background:'#fff', borderBottom:'1px solid '+S.border, fontSize:11, color:S.muted, fontFamily:'monospace' }}>
                        Reserve: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.reserve)} — buffer: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.buffer)} — beschikbaar: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.beschikbaar)}
                      </div>
                      {item.tekort > 0 && (
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead><tr style={{ background:'#FAF7F2', borderBottom:'1px solid '+S.border }}>
                              {['Eigenaar','Aandeel %','Korting','Eenmalige bijdrage'].map((h,i) => (
                                <th key={i} style={{ padding:'7px 12px', textAlign:i>0?'right':'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {item.perEigenaar.map((e, i) => (
                                <tr key={i} style={{ borderBottom:i<item.perEigenaar.length-1?'1px solid '+S.border:'none', background:i%2===0?'#fff':'#FAF7F2' }}>
                                  <td style={{ padding:'7px 12px',fontSize:13,fontWeight:500 }}>{e.naam}</td>
                                  <td style={{ padding:'7px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                                  <td style={{ padding:'7px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right',color:e.korting>0?S.green:S.muted }}>{e.korting>0?new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.korting):'—'}</td>
                                  <td style={{ padding:'7px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right',color:S.bordeaux,fontWeight:600 }}>{new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.bijdrage)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot style={{ borderTop:'2px solid '+S.bordeaux }}>
                              <tr style={{ background:'#F5E6E7' }}>
                                <td colSpan={3} style={{ padding:'8px 12px',fontSize:13,fontWeight:600,color:S.muted }}>Totaal tekort</td>
                                <td style={{ padding:'8px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ padding:'10px 20px', background:'#FEF3E2', borderTop:'1px solid '+S.border, fontSize:11, color:S.amber }}>
                    ⚠ De buffer blijft altijd in het reservefonds als veiligheidsmarge voor onvoorziene kosten.
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
