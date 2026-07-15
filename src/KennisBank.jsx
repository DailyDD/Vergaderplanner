import React, { useState, useRef, useEffect } from "react";
import { KENNISBANK } from "./kennisbank_data";

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

/* ── Warme huisstijl-ramp ── */
const C = {
  ink: "#2D2D2D", inkSoft: "#3f3d3b", tekst2: "#6B6560", tekst3: "#9B958E",
  bordeaux: "#991A21", bordeauxDonker: "#7A1419", bordeauxTint: "#F6ECEC", bordeauxRand: "#E3C9C9",
  papier: "#F2EFEC", wit: "#FFFFFF", inset: "#FAF8F5",
  lijn: "#E7E2DB", lijnZacht: "#EFEBE4", randHover: "#C9BEB2",
  groen: "#3B7A57", groenTint: "#EAF2EC", groenRand: "#CFE0D5",
  amber: "#B07414", amberTint: "#F7EEDD", amberRand: "#E8D5B0",
  blauw: "#4A6B8A", blauwTint: "#EAEFF4", blauwRand: "#C4D2DE",
  paars: "#6B5B95", paarsTint: "#F0EDF5", paarsRand: "#D5CFE1",
};

/* ── Inline SVG-iconen ── */
const Ico = {
  book: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  search: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  chevron: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6"/></svg>,
  arrowLeft: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  shield: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  users: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  euro: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 8.5a3.5 3.5 0 0 0-5 0M9 12h6M9 15.5a3.5 3.5 0 0 0 5 0"/><circle cx="12" cy="12" r="9"/></svg>,
  doc: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>,
  wrench: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  home: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  gavel: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 13 9 8"/><path d="m6.5 6.5 3-3 5 5-3 3"/><path d="m14 7 3 3-3 3"/><path d="M3 21h18"/><path d="M11 14.5 5.5 20"/></svg>,
  lightbulb: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>,
  pin: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>,
  x: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
};

/* ── Zoeklogica (ongewijzigd) ── */
const STOPWOORDEN = new Set([
  "de","het","een","en","of","maar","want","dus","noch","is","zijn","was","werd",
  "heeft","hebben","had","hadden","kan","kunnen","mag","mogen","moet","moeten",
  "zal","zullen","zou","zouden","wordt","worden","dat","dit","die","deze","er",
  "op","in","aan","bij","van","voor","met","uit","als","naar","om","door","over",
  "onder","boven","na","voor","tot","te","niet","ook","al","wel","geen","nog",
  "al","dan","toch","zo","meer","meer","veel","weinig","hoe","wat","wie","waar",
  "wanneer","waarom","welke","welk","eigen","ik","je","jij","hij","zij","we","ze",
  "u","uw","mijn","jouw","zijn","haar","ons","hun","mij","hem","hen","per",
]);

function normaliseer(tekst) {
  return tekst
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWOORDEN.has(w));
}

function berekenScore(zoekWoorden, item) {
  if (zoekWoorden.length === 0) return 0;
  const vraagWoorden = normaliseer(item.v);
  const antwoordWoorden = normaliseer(item.a);
  let score = 0;
  for (const zw of zoekWoorden) {
    if (vraagWoorden.some(w => w === zw)) score += 3;
    else if (vraagWoorden.some(w => w.includes(zw) || zw.includes(w))) score += 2;
    else if (antwoordWoorden.some(w => w === zw)) score += 1;
    else if (antwoordWoorden.some(w => w.includes(zw) || zw.includes(w))) score += 0.5;
  }
  return score;
}

function zoek(vraag) {
  const woorden = normaliseer(vraag);
  if (woorden.length === 0) return [];
  const gescoord = KENNISBANK.map(item => ({ item, score: berekenScore(woorden, item) })).filter(r => r.score > 0);
  gescoord.sort((a, b) => b.score - a.score);
  return gescoord.slice(0, 12).map(r => r.item);
}

/* ── Highlight (ongewijzigd) ── */
function Highlight({ tekst, zoekWoorden }) {
  if (!zoekWoorden || zoekWoorden.length === 0) return <span>{tekst}</span>;
  const regex = new RegExp(`(${zoekWoorden.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const delen = tekst.split(regex);
  return (
    <span>
      {delen.map((deel, i) =>
        regex.test(deel)
          ? <mark key={i} style={{ background: C.amberTint, color: C.amber, borderRadius: 3, padding: "0 3px", fontWeight: 600 }}>{deel}</mark>
          : <span key={i}>{deel}</span>
      )}
    </span>
  );
}

/* ── Categorieën met trefwoorden voor client-side filtering ── */
const CATEGORIEEN = [
  { key: "verzekeringen", label: "Verzekeringen", icoon: Ico.shield, kleur: C.bordeaux, bg: C.bordeauxTint, rand: C.bordeauxRand, woorden: ["verzekering","polis","schade","claim","dekking","premie","opstal","glas","inbraak","brand","waterschade","storm","aansprakelijk"] },
  { key: "vergadering", label: "Vergadering & ALV", icoon: Ico.users, kleur: C.blauw, bg: C.blauwTint, rand: C.blauwRand, woorden: ["vergadering","alv","stemming","volmacht","quorum","notulen","agenda","besluit","meerderheid","stemrecht"] },
  { key: "financien", label: "Financiën", icoon: Ico.euro, kleur: C.groen, bg: C.groenTint, rand: C.groenRand, woorden: ["bijdrage","servicekosten","begroting","jaarrekening","reservefonds","schuld","betaling","incasso","factuur","kosten","kas","bankrekening"] },
  { key: "splitsing", label: "Splitsingsakte", icoon: Ico.doc, kleur: C.paars, bg: C.paarsTint, rand: C.paarsRand, woorden: ["splitsingsakte","reglement","wijziging","breukdeel","aandeel","modelreglement","notaris"] },
  { key: "onderhoud", label: "Onderhoud & MJOP", icoon: Ico.wrench, kleur: C.amber, bg: C.amberTint, rand: C.amberRand, woorden: ["onderhoud","mjop","reparatie","dak","lift","gevel","schilderwerk","kozijn","installatie","renovatie","storing"] },
  { key: "eigendom", label: "Eigendom & verkoop", icoon: Ico.home, kleur: C.blauw, bg: C.blauwTint, rand: C.blauwRand, woorden: ["eigenaar","verhuur","verkoop","overdracht","notaris","kadaster","koper","huurder","appartement","privé"] },
  { key: "bestuur", label: "Bestuur & beheer", icoon: Ico.gavel, kleur: C.tekst2, bg: "#EFECE8", rand: C.lijn, woorden: ["bestuurder","voorzitter","secretaris","penningmeester","kascommissie","beheerder","administrateur","commissaris"] },
];

function categoriseerVraag(item) {
  const tekst = (item.v + " " + item.a).toLowerCase();
  for (const cat of CATEGORIEEN) {
    if (cat.woorden.some(w => tekst.includes(w))) return cat.key;
  }
  return null;
}

/* ── Resultaatkaart ── */
function ResultaatKaart({ item, index, zoekWoorden, open, onToggle }) {
  return (
    <div style={{ background: C.wit, border: `1px solid ${open ? C.bordeaux : C.lijn}`, borderRadius: 12, marginBottom: 8, overflow: "hidden", transition: "border-color .15s, box-shadow .15s", boxShadow: open ? "0 3px 14px rgba(153,26,33,.07)" : "0 1px 2px rgba(0,0,0,.03)" }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: open ? C.bordeaux : C.papier, color: open ? "#fff" : C.tekst3, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, transition: "all .15s", border: `1px solid ${open ? C.bordeaux : C.lijn}` }}>{index + 1}</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.55 }}>
          <Highlight tekst={item.v} zoekWoorden={zoekWoorden} />
        </span>
        <span style={{ flexShrink: 0, color: open ? C.bordeaux : C.tekst3, marginTop: 2, transition: "transform .2s", transform: open ? "rotate(180deg)" : "none", display: "flex" }}><Ico.chevron width={17} height={17} /></span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px 54px", borderTop: `1px solid ${C.lijnZacht}`, paddingTop: 14 }}>
          <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.7 }}>
            <Highlight tekst={item.a} zoekWoorden={zoekWoorden} />
          </p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   HOOFDCOMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function KennisBank({ onTerug }) {
  const [invoer, setInvoer] = useState("");
  const [resultaten, setResultaten] = useState([]);
  const [gezochtNaar, setGezochtNaar] = useState("");
  const [gezocht, setGezocht] = useState(false);
  const [openIndex, setOpenIndex] = useState(null);
  const [actieveCat, setActieveCat] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const voerZoekUit = () => {
    if (!invoer.trim()) return;
    const res = zoek(invoer.trim());
    setResultaten(res);
    setGezochtNaar(invoer.trim());
    setGezocht(true);
    setOpenIndex(null);
    setActieveCat(null);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") voerZoekUit(); };

  const reset = () => {
    setInvoer("");
    setResultaten([]);
    setGezocht(false);
    setGezochtNaar("");
    setOpenIndex(null);
    setActieveCat(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const kiesCat = (key) => {
    if (actieveCat === key) { setActieveCat(null); setResultaten([]); setGezocht(false); setGezochtNaar(""); setOpenIndex(null); return; }
    setActieveCat(key);
    const cat = CATEGORIEEN.find(c => c.key === key);
    const gefilterd = KENNISBANK.filter(item => categoriseerVraag(item) === key);
    setResultaten(gefilterd.slice(0, 20));
    setGezochtNaar("");
    setGezocht(true);
    setOpenIndex(null);
    setInvoer("");
  };

  const zoekWoorden = normaliseer(gezochtNaar);
  const geenResultaten = gezocht && resultaten.length === 0;
  const actieveCatObj = CATEGORIEEN.find(c => c.key === actieveCat);

  return (
    <div style={{ minHeight: "100vh", background: C.papier }}>
      <style>{CSS_FONT}</style>

      {/* Topbar */}
      <div style={{ borderBottom: `1px solid ${C.lijn}`, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.wit, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 3, height: 22, background: C.bordeaux, borderRadius: 2 }} />
          <span style={{ color: C.bordeaux, display: "flex" }}><Ico.book width={19} height={19} /></span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Kennisbank VvE Beheer</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: C.papier, color: C.tekst3, border: `1px solid ${C.lijn}` }}>{KENNISBANK.length} vragen</span>
        </div>
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "7px 13px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 9, color: C.tekst2, cursor: "pointer", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.bordeaux; e.currentTarget.style.color = C.bordeaux; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.tekst2; }}><Ico.arrowLeft width={15} height={15} /> Terug naar portaal</button>
      </div>

      {/* Hoofdinhoud — breed */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Zoekkaart */}
        <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 14, padding: "28px 28px 24px", boxShadow: "0 2px 10px rgba(0,0,0,.04)", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{ width: 42, height: 42, background: C.bordeaux, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Ico.lightbulb width={22} height={22} /></div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>Hoi, wat is je vraag?</h1>
              <p style={{ fontSize: 12.5, color: C.tekst3, margin: "3px 0 0" }}>Typ een of meer woorden — ik zoek de best passende vragen en antwoorden.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.tekst3, display: "flex" }}><Ico.search width={16} height={16} /></span>
              <input ref={inputRef} type="text" value={invoer} onChange={e => setInvoer(e.target.value)} onKeyDown={handleKeyDown} placeholder="bijv. opstalverzekering, ALV vergadering, splitsingsakte…" style={{ width: "100%", padding: "12px 16px 12px 38px", border: `1px solid ${C.lijn}`, borderRadius: 10, fontSize: 14, color: C.ink, background: C.inset, outline: "none", transition: "border-color .15s" }} onFocus={e => (e.target.style.borderColor = C.bordeaux)} onBlur={e => (e.target.style.borderColor = C.lijn)} />
            </div>
            <button onClick={voerZoekUit} disabled={!invoer.trim()} style={{ padding: "12px 24px", background: invoer.trim() ? C.bordeaux : C.lijn, color: invoer.trim() ? "#fff" : C.tekst3, border: "none", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: invoer.trim() ? "pointer" : "not-allowed", transition: "all .15s", whiteSpace: "nowrap" }} onMouseEnter={e => { if (invoer.trim()) e.currentTarget.style.background = C.bordeauxDonker; }} onMouseLeave={e => { if (invoer.trim()) e.currentTarget.style.background = C.bordeaux; }}>Zoeken</button>
          </div>

          {/* Status: gezocht of tip */}
          {!gezocht && !actieveCat && (
            <p style={{ fontSize: 11.5, color: C.tekst3, marginTop: 12, marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}><Ico.lightbulb width={13} height={13} /> Begin met een woord, voeg daarna meer toe om te verfijnen.</p>
          )}
          {(gezocht || actieveCat) && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {gezochtNaar && <span style={{ fontSize: 12, color: C.tekst3 }}>Gezocht op: <strong style={{ color: C.ink }}>"{gezochtNaar}"</strong></span>}
              {actieveCatObj && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: actieveCatObj.bg, color: actieveCatObj.kleur, border: `1px solid ${actieveCatObj.rand}` }}>{actieveCatObj.label}</span>}
              <button onClick={reset} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 10px", background: C.papier, border: `1px solid ${C.lijn}`, borderRadius: 7, color: C.tekst2, cursor: "pointer", fontWeight: 500 }}><Ico.x width={11} height={11} /> Wissen</button>
            </div>
          )}
        </div>

        {/* Categorieën als horizontale chips */}
        {!gezocht && !actieveCat && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 10 }}>Of blader per categorie</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIEEN.map(cat => {
                const IcoonComp = cat.icoon;
                return (
                  <button key={cat.key} onClick={() => kiesCat(cat.key)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 11, cursor: "pointer", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = cat.kleur; e.currentTarget.style.color = cat.kleur; e.currentTarget.style.background = cat.bg; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.ink; e.currentTarget.style.background = C.wit; }}>
                    <span style={{ display: "flex", color: "inherit" }}><IcoonComp width={17} height={17} /></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "inherit" }}>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actieve categorie chips — toon ook tijdens resultaten zodat je kunt wisselen */}
        {(gezocht || actieveCat) && (
          <div style={{ marginBottom: 18, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIEEN.map(cat => {
              const actief = actieveCat === cat.key;
              const IcoonComp = cat.icoon;
              return (
                <button key={cat.key} onClick={() => kiesCat(cat.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: actief ? cat.bg : C.wit, border: `1px solid ${actief ? cat.rand : C.lijn}`, borderRadius: 999, cursor: "pointer", transition: "all .15s", color: actief ? cat.kleur : C.tekst2 }} onMouseEnter={e => { if (!actief) { e.currentTarget.style.borderColor = cat.kleur; e.currentTarget.style.color = cat.kleur; } }} onMouseLeave={e => { if (!actief) { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.tekst2; } }}>
                  <span style={{ display: "flex" }}><IcoonComp width={14} height={14} /></span>
                  <span style={{ fontSize: 11.5, fontWeight: 600 }}>{cat.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Resultaten */}
        {gezocht && resultaten.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.tekst3, margin: 0 }}>{resultaten.length} resultaten gevonden</p>
              <p style={{ fontSize: 11, color: C.tekst3, margin: 0 }}>Klik op een vraag om het antwoord te zien</p>
            </div>
            {resultaten.map((item, i) => (
              <ResultaatKaart key={i} item={item} index={i} zoekWoorden={zoekWoorden} open={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? null : i)} />
            ))}
          </div>
        )}

        {/* Geen resultaten */}
        {geenResultaten && (
          <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 14, padding: "48px 28px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
            <div style={{ display: "inline-flex", width: 48, height: 48, borderRadius: "50%", background: C.amberTint, color: C.amber, alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Ico.search width={24} height={24} /></div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Geen resultaat gevonden</h2>
            <p style={{ fontSize: 13, color: C.tekst2, lineHeight: 1.65, maxWidth: 440, margin: "0 auto 20px" }}>
              We hebben geen passend antwoord gevonden{gezochtNaar ? <> op <strong>"{gezochtNaar}"</strong></> : null}.
              Geef het door aan de beheerder, dan wordt dit antwoord uitgewerkt en toegevoegd aan de kennisbank.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: C.amberTint, border: `1px solid ${C.amberRand}`, borderRadius: 10, fontSize: 12.5, color: C.amber, fontWeight: 600 }}>
              <Ico.pin width={14} height={14} />
              Vraag wordt uitgewerkt en toegevoegd aan de kennisbank
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={reset} style={{ fontSize: 12.5, padding: "9px 18px", background: C.papier, border: `1px solid ${C.lijn}`, borderRadius: 9, color: C.tekst2, cursor: "pointer", fontWeight: 500 }}>Andere vraag stellen</button>
            </div>
          </div>
        )}

        {/* Lege staat — statistiek strip */}
        {!gezocht && !actieveCat && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 8 }}>
            {[
              { label: "Totaal vragen", waarde: KENNISBANK.length, kleur: C.ink },
              { label: "Categorieen", waarde: CATEGORIEEN.length, kleur: C.bordeaux },
              { label: "Gem. antwoordlengte", waarde: Math.round(KENNISBANK.reduce((a, i) => a + i.a.length, 0) / KENNISBANK.length) + " tekens", kleur: C.tekst2 },
            ].map(s => (
              <div key={s.label} style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
                <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: s.kleur, fontVariantNumeric: "tabular-nums" }}>{s.waarde}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
