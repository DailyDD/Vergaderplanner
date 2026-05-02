import React, { useState, useEffect } from "react";

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TOKEN_KEY = "vve_access_token";
const VD_TABLE = "verduurzaming_data";
const VD_ROOD = "#991A21";
const VD_ROOD_BG = "#FEF2F2";

// FIX punt 2: alleen Brian en Jeffrey in log
const LOG_BEHEERDERS = ["Brian", "Jeffrey"];

function getAuthHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return { apikey: SUPABASE_ANON, Authorization: `Bearer ${token || SUPABASE_ANON}`, "Content-Type": "application/json" };
}

async function vdFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...getAuthHeaders(), ...(options.headers || {}) } });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function vdLoad() {
  try {
    const rows = await vdFetch(`${VD_TABLE}?select=id,data&order=created_at.desc`);
    if (!rows || !rows.length) return [];
    return rows.map(r => ({ id: r.id, ...r.data }));
  } catch { try { const r = localStorage.getItem("vd_data_v1"); return r ? JSON.parse(r) : []; } catch { return []; } }
}

async function vdSave(record) {
  const backup = () => { try { const all = JSON.parse(localStorage.getItem("vd_data_v1") || "[]"); const idx = all.findIndex(r => r.id === record.id); if (idx >= 0) all[idx] = record; else all.unshift(record); localStorage.setItem("vd_data_v1", JSON.stringify(all)); } catch {} };
  try {
    const existing = await vdFetch(`${VD_TABLE}?id=eq.${record.id}&select=id`);
    if (existing && existing.length) { await vdFetch(`${VD_TABLE}?id=eq.${record.id}`, { method: "PATCH", body: JSON.stringify({ data: record }) }); }
    else { await vdFetch(VD_TABLE, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: record.id, data: record }) }); }
    backup();
  } catch { backup(); }
}

async function vdDelete(id) {
  try { await vdFetch(`${VD_TABLE}?id=eq.${id}`, { method: "DELETE" }); } catch {}
  try { const all = JSON.parse(localStorage.getItem("vd_data_v1") || "[]"); localStorage.setItem("vd_data_v1", JSON.stringify(all.filter(r => r.id !== id))); } catch {}
}

function vdLocalLoad() { try { const r = localStorage.getItem("vd_data_v1"); return r ? JSON.parse(r) : []; } catch { return []; } }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nu() { return new Date().toISOString(); }
function datumNL(iso) { if (!iso) return "—"; return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function datumTijdNL(iso) { if (!iso) return "—"; return new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function dagenTot(iso) { if (!iso) return null; return Math.round((new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000); }
// FIX punt 6: dagen actief berekenen vanaf aanmaakdatum
function dagenActief(iso) { if (!iso) return null; return Math.round((new Date().setHours(0,0,0,0) - new Date(iso).setHours(0,0,0,0)) / 86400000); }
function euro(n) { return `€ ${(n||0).toLocaleString("nl-NL", { minimumFractionDigits: 0 })}`; }

const DOSSIER_STATUS = {
  nieuw:           { label: "Nieuw",                   color: "#1A4D7A", bg: "#EAF1F8" },
  in_behandeling:  { label: "In behandeling",           color: VD_ROOD,  bg: VD_ROOD_BG },
  wacht_vve:       { label: "Wacht op VvE",             color: "#065F46", bg: "#D1FAE5" },
  wacht_offertes:  { label: "In afwachting offertes",   color: "#0E7490", bg: "#ECFEFF" },
  wacht_gemeente:  { label: "Wacht op gemeente",        color: "#92400E", bg: "#FEF3E2" },
  wacht_subsidie:  { label: "Wacht op subsidie",        color: "#5B3FA6", bg: "#F3EFFD" },
  afgerond:        { label: "Afgerond",                 color: "#374151", bg: "#F3F4F6" },
};
const TRAJECTEN = { procesbegeleiding: "Procesbegeleiding leningaanvragen", subsidie: "Subsidieaanvragen", isolatie: "Gemeentelijke isolatieactie Den Haag" };
const TYPE_EIGENDOM = { volledig_bewoond: "Volledig eigenaar bewoond", gedeeltelijk_verhuurd: "Gedeeltelijk verhuurd", volledig_verhuurd: "Volledig verhuurd" };
const FONDS_OPTIES = [{ value: "warmtefonds", label: "Warmtefonds" }, { value: "duurzaamheidsfonds", label: "Duurzaamheidsfonds" }, { value: "onbekend", label: "Nog niet bekend" }];
const KANAAL_OPTIES = ["mail", "telefoon", "vergadering", "app", "anders"];
const ACTIETYPE_LABELS = { opvolgen: "Opvolgen dossier", offerte_aanvragen: "Offerte aanvragen", offerte_doorsturen: "Offerte doorsturen naar gemeente", akkoord_ophalen: "Akkoord ophalen bij VvE", document_opvragen: "Document opvragen", factuur_versturen: "Factuur versturen", inkooporder_opvolgen: "Inkooporder opvolgen", traject_afronden: "Traject afronden" };

function leegVve() { return { id: uid(), naam: "", adres: "", beheerder: "", typeEigendom: "volledig_bewoond", alvBesluit: false, alvDatum: "", status: "nieuw", aangemaakt: nu(), opvolgenOp: "", trajecten: [], offertes: [], communicatielog: [], audittrail: [], tijdlijn: {} }; }
function leegTraject(type) {
  const base = { id: uid(), type, aangemaakt: nu() };
  if (type === "procesbegeleiding") return { ...base, fonds: "onbekend", bedrag: "", overeenkomstGetekend: false, overeenkomstDatum: "", status: "lopend", gefactureerd: false };
  if (type === "subsidie") return { ...base, begindatum: "", einddatum: "", voortgang: 0, status: "lopend", teFactureren: "", gefactureerd: false, factuurdatum: "", ontbrekendeDocs: "", instantie: "", opmerkingen: "" };
  return { ...base, aannemers: [{ id: uid(), naam: "", contactpersoon: "" }], werkzaamheden: "", vveAkkoord: false, vveAkkoordDatum: "", doorgestuurdGemeente: false, doorgestuurdDatum: "", inkooporderOntvangen: false, begeleidingsvergoeding: "", mailNodig: false, actiepunten: "" };
}
function leegOfferte() { return { id: uid(), partij: "", bedrag: "", aangevraagd: false, ontvangen: false, vveVoorlegd: false, vveAkkoord: false, opdracht: false, opdrachtAfgerond: false, tijdlijn: {} }; }
function leegLog() { return { id: uid(), datum: new Date().toISOString().slice(0, 10), beheerder: "", partij: "", kanaal: "mail", omschrijving: "" }; }

function berekenVoortgang(vve) {
  const ofs = vve.offertes || [];
  const allOntvangen = ofs.filter(o => o.aangevraagd).length > 0 && ofs.filter(o => o.aangevraagd).every(o => o.ontvangen);
  return [
    { lbl: "Dossier aangemaakt",       ok: true },
    { lbl: "ALV-besluit genomen",      ok: !!vve.alvBesluit },
    { lbl: "Offertes aangevraagd",     ok: ofs.some(o => o.aangevraagd) },
    { lbl: "Offertes ontvangen",       ok: allOntvangen },
    { lbl: "Voorgelegd vergadering",   ok: ofs.some(o => o.vveVoorlegd) },
    { lbl: "VvE akkoord",              ok: ofs.some(o => o.vveAkkoord) },
    { lbl: "Opdracht verstrekt",       ok: ofs.some(o => o.opdracht) },
    { lbl: "Opdracht afgerond",        ok: ofs.some(o => o.opdrachtAfgerond) },
    { lbl: "Dossier afgerond",         ok: vve.status === "afgerond" },
  ];
}

function buildTijdlijn(vve) {
  const ev = [];
  const add = (ts, tekst, kleur) => { if (ts) ev.push({ ts, tekst, kleur }); };
  add(vve.aangemaakt, "Dossier aangemaakt", "#1A4D7A");
  add(vve.tijdlijn?.alvBesluit, "ALV-besluit genomen", "#065F46");
  (vve.offertes || []).forEach(o => {
    add(o.tijdlijn?.aangevraagd, `Offerte aangevraagd — ${o.partij || "onbekend"}`, "#1A4D7A");
    add(o.tijdlijn?.ontvangen, `Offerte ontvangen — ${o.partij || "onbekend"}`, "#5B3FA6");
    add(o.tijdlijn?.vveVoorlegd, `Voorgelegd aan VvE — ${o.partij || "onbekend"}`, "#92400E");
    add(o.tijdlijn?.vveAkkoord, `VvE akkoord — ${o.partij || "onbekend"}`, "#065F46");
    add(o.tijdlijn?.opdracht, `Opdracht verstrekt — ${o.partij || "onbekend"}`, "#1E3A5F");
    add(o.tijdlijn?.opdrachtAfgerond, `Opdracht afgerond — ${o.partij || "onbekend"}`, "#2D6A4F");
  });
  (vve.trajecten || []).forEach(t => {
    if (t.type === "subsidie" && t.begindatum) add(t.begindatum + "T00:00:00Z", `Subsidieaanvraag gestart (${t.instantie || "?"})`, "#5B3FA6");
    if (t.type === "procesbegeleiding" && t.overeenkomstDatum) add(t.overeenkomstDatum + "T00:00:00Z", "Overeenkomst procesbegeleiding getekend", "#065F46");
    if (t.type === "isolatie" && t.doorgestuurdDatum) add(t.doorgestuurdDatum + "T00:00:00Z", "Offerte doorgestuurd gemeente", "#92400E");
    if (t.type === "isolatie" && t.vveAkkoordDatum) add(t.vveAkkoordDatum + "T00:00:00Z", "VvE akkoord (isolatietraject)", "#065F46");
  });
  (vve.communicatielog || []).forEach(l => { if (l.datum) add(l.datum + "T00:00:00Z", `${l.kanaal} met ${l.partij || "?"} — ${(l.omschrijving || "").slice(0, 55)}`, "#6B7280"); });
  add(vve.tijdlijn?.afgerond, "Dossier afgerond", "#374151");
  return ev.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

// UI bouwstenen
function SB({ status }) { const s = DOSSIER_STATUS[status] || DOSSIER_STATUS.nieuw; return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color }}>{s.label}</span>; }
function Bdg({ kleur, label }) { const m = { rood: "bg-red-50 text-[#991A21] border-red-100", groen: "bg-emerald-50 text-emerald-700 border-emerald-200", blauw: "bg-blue-50 text-blue-700 border-blue-200", oranje: "bg-amber-50 text-amber-700 border-amber-100", grijs: "bg-gray-100 text-gray-600 border-gray-200" }; return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${m[kleur] || m.grijs}`}>{label}</span>; }
function Veld({ label, children }) { return <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</label>{children}</div>; }
function Inp({ value, onChange, placeholder = "", type = "text" }) { return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors" />; }
function Sel({ value, onChange, children }) { return <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors">{children}</select>; }
function Txa({ value, onChange, placeholder = "", rows = 3 }) { return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors resize-none" />; }
function Chk({ checked, onChange, label }) { return <label className="flex items-center gap-2 cursor-pointer select-none"><div onClick={() => onChange(!checked)} className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${checked ? "bg-[#991A21] border-[#991A21]" : "bg-white border-gray-300"}`}>{checked && <span className="text-white text-[10px] font-bold">✓</span>}</div><span className="text-sm text-[#2D2D2D]">{label}</span></label>; }
// FIX punt 5: DlBdg alleen voor subsidie-einddatums, niet ALV
function DlBdg({ iso }) { const d = dagenTot(iso); if (d === null) return null; if (d < 0) return <Bdg kleur="rood" label={`${Math.abs(d)}d over`} />; if (d <= 7) return <Bdg kleur="rood" label={`${d}d`} />; if (d <= 21) return <Bdg kleur="oranje" label={`${d}d`} />; return <Bdg kleur="groen" label={`${d}d`} />; }

// Punt 1: Rondetaart voortgangsgrafiek
function RondeVoortgang({ totaal, afgerond }) {
  const pct = totaal > 0 ? Math.round((afgerond / totaal) * 100) : 0;
  const r = 28;
  const omtrek = 2 * Math.PI * r;
  const gevuld = (pct / 100) * omtrek;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#F3F4F6" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={pct === 100 ? "#2D6A4F" : VD_ROOD}
          strokeWidth="7"
          strokeDasharray={`${gevuld} ${omtrek - gevuld}`}
          strokeDashoffset={omtrek / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray .4s" }}
        />
        <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill={pct === 100 ? "#2D6A4F" : VD_ROOD}>{pct}%</text>
      </svg>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#2D2D2D" }}>{afgerond} / {totaal}</p>
        <p style={{ fontSize: 9, color: "#8A7E7B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Afgerond</p>
      </div>
    </div>
  );
}

// Punt 1: Zwevend statistiekenpaneel
function StatSidebar({ vves }) {
  const totaal = vves.length;
  const afgerond = vves.filter(v => v.status === "afgerond").length;
  const actief = vves.filter(v => v.status !== "afgerond").length;
  const aantalTrajecten = vves.reduce((acc, v) => acc + (v.trajecten || []).length, 0);
  const aantalLog = vves.reduce((acc, v) => acc + (v.communicatielog || []).length, 0);
  const aantalDl = vves.filter(v => (v.trajecten || []).some(t => t.type === "subsidie" && t.einddatum && (() => { const g = dagenTot(t.einddatum); return g !== null && g <= 14 && g >= 0; })())).length;
  const aantalOfferteAfwachting = vves.filter(v => v.status === "wacht_offertes").length;
  const openActies = vves.reduce((acc, v) => {
    let n = 0;
    (v.trajecten || []).forEach(t => {
      if (t.type === "isolatie") {
        if (!(v.offertes || []).some(o => o.aangevraagd)) n++;
        if ((v.offertes || []).some(o => o.aangevraagd) && !t.doorgestuurdGemeente) n++;
        if (!(v.offertes || []).some(o => o.vveAkkoord) && (v.offertes || []).some(o => o.ontvangen)) n++;
        if (!t.inkooporderOntvangen && t.doorgestuurdGemeente) n++;
      }
      if (t.type === "subsidie") {
        if (t.ontbrekendeDocs?.trim()) n++;
        if (!t.gefactureerd && t.status === "afgerond") n++;
      }
      if (t.type === "procesbegeleiding" && !t.gefactureerd && t.status === "afgerond") n++;
    });
    return acc + n;
  }, 0);

  // Per traject type
  const perType = { procesbegeleiding: 0, subsidie: 0, isolatie: 0 };
  vves.forEach(v => (v.trajecten || []).forEach(t => { if (perType[t.type] !== undefined) perType[t.type]++; }));

  return (
    <div style={{
      position: "sticky", top: 80, width: 200, flexShrink: 0,
      background: "#fff", border: "1.5px solid #E5E0DB", borderRadius: 14,
      padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,.06)", display: "flex", flexDirection: "column", gap: 16
    }}>
      {/* Rondetaart */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
        <RondeVoortgang totaal={totaal} afgerond={afgerond} />
      </div>

      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "Totaal VvE's", val: totaal, k: "#2D2D2D" },
          { label: "Actief", val: actief, k: VD_ROOD },
          { label: "Afgerond", val: afgerond, k: "#2D6A4F" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#8A7E7B" }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.k }}>{s.val}</span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: "#8A7E7B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Trajecten</p>
        {[
          { label: "Lening", val: perType.procesbegeleiding, k: "#1A4D7A", bg: "#EAF1F8" },
          { label: "Subsidie", val: perType.subsidie, k: "#065F46", bg: "#D1FAE5" },
          { label: "Isolatie", val: perType.isolatie, k: "#92400E", bg: "#FEF3E2" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 8, background: s.bg, color: s.k }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: s.k }}>{s.val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
          <span style={{ fontSize: 11, color: "#8A7E7B" }}>Totaal</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#2D2D2D" }}>{aantalTrajecten}</span>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#8A7E7B" }}>Openstaande acties</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: openActies > 0 ? "#92400E" : "#2D6A4F" }}>{openActies}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#8A7E7B" }}>Offertes in afwachting</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: aantalOfferteAfwachting > 0 ? "#0E7490" : "#2D6A4F" }}>{aantalOfferteAfwachting}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#8A7E7B" }}>Deadlines &lt; 14d</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: aantalDl > 0 ? VD_ROOD : "#2D6A4F" }}>{aantalDl}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#8A7E7B" }}>Logitems totaal</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#2D2D2D" }}>{aantalLog}</span>
        </div>
      </div>
    </div>
  );
}

function VoortgangsBalk({ vve }) {
  const st = berekenVoortgang(vve);
  const ok = st.filter(s => s.ok).length;
  const pct = Math.round(ok / st.length * 100);
  return (
    <div style={{ minWidth: 160, maxWidth: 200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#8A7E7B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Voortgang</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? "#2D6A4F" : VD_ROOD }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
        <div style={{ height: "100%", width: pct + "%", background: pct === 100 ? "#2D6A4F" : VD_ROOD, borderRadius: 3, transition: "width .3s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {st.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: s.ok ? "#2D6A4F" : "#9CA3AF" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.ok ? "#2D6A4F" : "#E5DEDA", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", flexShrink: 0 }}>{s.ok ? "✓" : ""}</span>
            {s.lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function OffertesTab({ vve, onUpdate }) {
  const togChk = (idx, field, value) => {
    const ofs = [...(vve.offertes || [])];
    const tl = { ...(ofs[idx].tijdlijn || {}) };
    if (value && !tl[field]) tl[field] = nu(); else if (!value) delete tl[field];
    ofs[idx] = { ...ofs[idx], [field]: value, tijdlijn: tl };
    onUpdate({ ...vve, offertes: ofs });
  };
  const updV = (idx, field, val) => { const ofs = [...(vve.offertes || [])]; ofs[idx] = { ...ofs[idx], [field]: val }; onUpdate({ ...vve, offertes: ofs }); };
  const add = () => onUpdate({ ...vve, offertes: [...(vve.offertes || []), leegOfferte()] });
  const del = (idx) => { if (!confirm("Offerte verwijderen?")) return; const ofs = [...(vve.offertes || [])]; ofs.splice(idx, 1); onUpdate({ ...vve, offertes: ofs }); };
  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">Registreer per partij de offertestatus. De voortgangsbalk wordt automatisch bijgewerkt.</p>
      {(vve.offertes || []).length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Nog geen offertes geregistreerd.</div>}
      {(vve.offertes || []).map((o, i) => (
        <div key={o.id || i} className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4 mb-3">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 mb-4 items-end">
            <Veld label="Partij / aannemer"><Inp value={o.partij || ""} onChange={v => updV(i, "partij", v)} placeholder="bijv. Bouwbedrijf Jansen" /></Veld>
            <Veld label="Offertebedrag (€)"><Inp type="number" value={o.bedrag || ""} onChange={v => updV(i, "bedrag", v)} placeholder="bijv. 18500" /></Veld>
            <button onClick={() => del(i)} className="text-gray-400 hover:text-red-500 text-xl pb-1">×</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[["aangevraagd","Offerte aangevraagd"],["ontvangen","Offerte ontvangen"],["vveVoorlegd","Aan VvE voorgelegd"],["vveAkkoord","VvE akkoord"],["opdracht","Opdracht verstrekt"],["opdrachtAfgerond","Opdracht afgerond"]].map(([field, lbl]) => (
              <label key={field} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "7px 8px", background: o[field] ? "#EAF4EE" : "#fff", border: `1.5px solid ${o[field] ? "#2D6A4F" : "#E5DEDA"}`, borderRadius: 7, fontSize: 10, fontWeight: 600, color: o[field] ? "#2D6A4F" : "#8A7E7B", userSelect: "none", transition: "all .15s" }}>
                <input type="checkbox" checked={!!o[field]} onChange={e => togChk(i, field, e.target.checked)} style={{ width: 12, height: 12, accentColor: "#2D6A4F", cursor: "pointer" }} />
                {lbl}
              </label>
            ))}
          </div>
          {Object.keys(o.tijdlijn || {}).length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap gap-x-4">
              {Object.entries(o.tijdlijn).map(([k, ts]) => <span key={k} className="text-[10px] text-gray-400">{k}: {datumTijdNL(ts)}</span>)}
            </div>
          )}
          {o.ontvangen && o.bedrag && <div className="mt-2 px-3 py-1.5 bg-emerald-50 rounded-lg text-xs font-semibold text-emerald-700 font-mono">Offertebedrag: {euro(parseFloat(o.bedrag))}</div>}
        </div>
      ))}
      <button onClick={add} className="w-full py-2.5 bg-white border-2 border-dashed border-gray-200 hover:border-[#991A21] hover:text-[#991A21] text-gray-500 text-sm rounded-xl transition-colors">+ Partij / offerte toevoegen</button>
    </div>
  );
}

function TijdlijnTab({ vve }) {
  const tl = buildTijdlijn(vve);
  if (!tl.length) return <div className="text-center py-8 text-gray-400 text-sm">Nog geen gebeurtenissen. Vul gegevens in en vink stappen aan.</div>;
  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: "#E5DEDA", borderRadius: 2 }} />
      {tl.map((e, i) => (
        <div key={i} style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ position: "absolute", left: -20, top: 3, width: 10, height: 10, borderRadius: "50%", background: e.kleur, border: "2px solid #fff", boxShadow: `0 0 0 2px ${e.kleur}` }} />
          <div style={{ fontSize: 11, color: "#8A7E7B", marginBottom: 2 }}>{datumTijdNL(e.ts)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: e.kleur }}>{e.tekst}</div>
        </div>
      ))}
    </div>
  );
}

function TrajectProcesbegeleiding({ t, onChange }) {
  const u = (k, v) => onChange({ ...t, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Fonds"><Sel value={t.fonds} onChange={v => u("fonds", v)}>{FONDS_OPTIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</Sel></Veld>
        <Veld label="Bedrag procesbegeleiding (€)"><Inp value={t.bedrag} onChange={v => u("bedrag", v)} placeholder="bijv. 1500" /></Veld>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Status"><Sel value={t.status} onChange={v => u("status", v)}><option value="lopend">Lopend</option><option value="afgerond">Afgerond</option></Sel></Veld>
        <Veld label="Datum overeenkomst getekend"><Inp type="date" value={t.overeenkomstDatum} onChange={v => u("overeenkomstDatum", v)} /></Veld>
      </div>
      <div className="flex gap-6 flex-wrap">
        <Chk checked={t.overeenkomstGetekend} onChange={v => u("overeenkomstGetekend", v)} label="Overeenkomst getekend door VvE" />
        <Chk checked={t.gefactureerd} onChange={v => u("gefactureerd", v)} label="Gefactureerd" />
      </div>
    </div>
  );
}

function TrajectSubsidie({ t, onChange }) {
  const u = (k, v) => onChange({ ...t, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Veld label="Begindatum"><Inp type="date" value={t.begindatum} onChange={v => u("begindatum", v)} /></Veld>
        <Veld label="Einddatum / deadline"><div className="flex items-center gap-2"><Inp type="date" value={t.einddatum} onChange={v => u("einddatum", v)} />{t.einddatum && <DlBdg iso={t.einddatum} />}</div></Veld>
        <Veld label="Instantie"><Inp value={t.instantie} onChange={v => u("instantie", v)} placeholder="RVO, gemeente..." /></Veld>
      </div>
      <Veld label={`Voortgang: ${t.voortgang}%`}>
        <input type="range" min="0" max="100" step="5" value={t.voortgang} onChange={e => u("voortgang", parseInt(e.target.value))} className="w-full accent-[#991A21]" />
        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-[#991A21] h-1.5 rounded-full" style={{ width: `${t.voortgang}%` }} /></div>
      </Veld>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Status"><Sel value={t.status} onChange={v => u("status", v)}><option value="lopend">Lopend</option><option value="afgerond">Afgerond</option></Sel></Veld>
        <Veld label="Te factureren (€)"><Inp value={t.teFactureren} onChange={v => u("teFactureren", v)} placeholder="bijv. 2500" /></Veld>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Factuurdatum"><Inp type="date" value={t.factuurdatum} onChange={v => u("factuurdatum", v)} /></Veld>
        <div className="flex items-end pb-1"><Chk checked={t.gefactureerd} onChange={v => u("gefactureerd", v)} label="Gefactureerd" /></div>
      </div>
      <Veld label="Ontbrekende documenten"><Txa value={t.ontbrekendeDocs} onChange={v => u("ontbrekendeDocs", v)} placeholder="bijv. staatsteunverklaring, verklaring verhuurder…" /></Veld>
      <Veld label="Opmerkingen"><Txa value={t.opmerkingen} onChange={v => u("opmerkingen", v)} placeholder="Overige acties en notities…" /></Veld>
    </div>
  );
}

function TrajectIsolatie({ t, onChange }) {
  const u = (k, v) => onChange({ ...t, [k]: v });
  const updA = (idx, veld, val) => { const arr = [...(t.aannemers || [])]; arr[idx] = { ...arr[idx], [veld]: val }; u("aannemers", arr); };
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Aannemers</label><button onClick={() => u("aannemers", [...(t.aannemers || []), { id: uid(), naam: "", contactpersoon: "" }])} className="text-[10px] text-[#991A21] hover:underline font-semibold">+ Aannemer</button></div>
        {(t.aannemers || []).map((a, idx) => (
          <div key={a.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center mb-2">
            <Inp value={a.naam} onChange={v => updA(idx, "naam", v)} placeholder="Naam aannemer" />
            <Inp value={a.contactpersoon} onChange={v => updA(idx, "contactpersoon", v)} placeholder="Contactpersoon" />
            {(t.aannemers || []).length > 1 && <button onClick={() => u("aannemers", (t.aannemers || []).filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 text-sm">✕</button>}
          </div>
        ))}
      </div>
      <Veld label="Werkzaamheden"><Txa value={t.werkzaamheden} onChange={v => u("werkzaamheden", v)} placeholder="Omschrijving van de uit te voeren werkzaamheden…" /></Veld>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Datum VvE akkoord"><Inp type="date" value={t.vveAkkoordDatum} onChange={v => u("vveAkkoordDatum", v)} /></Veld>
        <Veld label="Datum doorgestuurd gemeente"><Inp type="date" value={t.doorgestuurdDatum} onChange={v => u("doorgestuurdDatum", v)} /></Veld>
      </div>
      <div className="flex gap-6 flex-wrap">
        <Chk checked={t.vveAkkoord} onChange={v => u("vveAkkoord", v)} label="VvE akkoord" />
        <Chk checked={t.doorgestuurdGemeente} onChange={v => u("doorgestuurdGemeente", v)} label="Doorgestuurd gemeente" />
        <Chk checked={t.inkooporderOntvangen} onChange={v => u("inkooporderOntvangen", v)} label="Inkooporder ontvangen" />
        <Chk checked={t.mailNodig} onChange={v => u("mailNodig", v)} label="Mail nog te sturen" />
      </div>
      <Veld label="Begeleidingsvergoeding (€)"><Inp value={t.begeleidingsvergoeding} onChange={v => u("begeleidingsvergoeding", v)} placeholder="bijv. 500" /></Veld>
      <Veld label="Actiepunten"><Txa value={t.actiepunten} onChange={v => u("actiepunten", v)} placeholder="Lopende acties en openstaande punten…" rows={4} /></Veld>
    </div>
  );
}
// ── DEEL 2 — plak direct onder deel 1, vervang de sluitende } van TrajectIsolatie niet ──

function VveKaart({ vve, onUpdate, onDelete, openId, setOpenId, beheerderList }) {
  const open = openId === vve.id;
  const [tab, setTab] = useState("info");
  const [nieuweLog, setNieuweLog] = useState(leegLog());
  const [logForm, setLogForm] = useState(false);
  // FIX punt 3: staat voor bewerken log
  const [bewerkLogId, setBewerkLogId] = useState(null);
  const [bewerkLogData, setBewerkLogData] = useState(null);

  const u = (k, v) => {
    const entry = { tijdstip: nu(), veld: k, oud: vve[k], nieuw: v };
    const bij = { ...vve, [k]: v, audittrail: [...(vve.audittrail || []), entry] };
    if (k === "alvBesluit" && v && !vve.tijdlijn?.alvBesluit) bij.tijdlijn = { ...(vve.tijdlijn || {}), alvBesluit: nu() };
    onUpdate(bij);
  };

  const updTraj = t => onUpdate({ ...vve, trajecten: (vve.trajecten || []).map(x => x.id === t.id ? t : x) });
  const addTraj = type => onUpdate({ ...vve, trajecten: [...(vve.trajecten || []), leegTraject(type)] });
  const delTraj = tid => { if (confirm("Traject verwijderen?")) onUpdate({ ...vve, trajecten: (vve.trajecten || []).filter(t => t.id !== tid) }); };

  const slaLogOp = () => {
    if (!nieuweLog.omschrijving.trim()) return;
    onUpdate({ ...vve, communicatielog: [...(vve.communicatielog || []), { ...nieuweLog, id: uid() }] });
    setNieuweLog(leegLog()); setLogForm(false);
  };

  // FIX punt 3: log bewerken opslaan
  const slaLogBewerkingOp = () => {
    if (!bewerkLogData?.omschrijving?.trim()) return;
    const bijgewerkt = (vve.communicatielog || []).map(l => l.id === bewerkLogId ? { ...bewerkLogData } : l);
    onUpdate({ ...vve, communicatielog: bijgewerkt });
    setBewerkLogId(null);
    setBewerkLogData(null);
  };

  // FIX punt 3: log verwijderen
  const verwijderLog = (lid) => {
    if (!confirm("Logitem verwijderen?")) return;
    onUpdate({ ...vve, communicatielog: (vve.communicatielog || []).filter(l => l.id !== lid) });
  };

  const afgerond = () => { onUpdate({ ...vve, status: "afgerond", tijdlijn: { ...(vve.tijdlijn || {}), afgerond: nu() } }); setOpenId(null); };

  // FIX punt 5: ALV uit deadlines gehaald — alleen subsidie einddatums
  const deadlines = [];
  (vve.trajecten || []).forEach(t => { if (t.type === "subsidie" && t.einddatum) deadlines.push({ label: "Subsidie deadline", datum: t.einddatum }); });
  const urgDl = deadlines.some(d => { const g = dagenTot(d.datum); return g !== null && g <= 14 && g >= 0; });
  const ovrDl = deadlines.some(d => { const g = dagenTot(d.datum); return g !== null && g < 0; });

  // opvolgen datum check
  const opvolgenVervallen = vve.opvolgenOp && dagenTot(vve.opvolgenOp) !== null && dagenTot(vve.opvolgenOp) < 0;
  const opvolgenVandaag = vve.opvolgenOp && dagenTot(vve.opvolgenOp) !== null && dagenTot(vve.opvolgenOp) === 0;

  // FIX punt 6: actief-dagen
  const actDagen = dagenActief(vve.aangemaakt);

  return (
    <div style={{ background: vve.status === "afgerond" ? "#FAFAFA" : "#fff", border: `1.5px solid ${open ? VD_ROOD : ovrDl ? "#FCA5A5" : urgDl ? "#FCD34D" : "#E5E0DB"}`, borderRadius: 12, overflow: "hidden", marginBottom: 10, boxShadow: open ? "0 2px 12px rgba(153,26,33,.08)" : "none", transition: "all .2s", opacity: vve.status === "afgerond" ? 0.75 : 1 }}>
      <div onClick={() => setOpenId(open ? null : vve.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* FIX punt 6: naam maar 1x, geen "Deadline voorbij" voor ALV */}
            <span style={{ fontWeight: 700, fontSize: 14, color: "#2D2D2D" }}>{vve.naam || <span style={{ color: "#aaa", fontStyle: "italic" }}>Naamloos</span>}</span>
            <SB status={vve.status} />
            {vve.beheerder && <span style={{ fontSize: 10, color: "#8A7E7B", background: "#F3F4F6", padding: "2px 7px", borderRadius: 8 }}>{vve.beheerder}</span>}
            {/* FIX punt 5: alleen subsidie deadline badges, niet ALV */}
            {ovrDl && <span style={{ fontSize: 10, fontWeight: 600, background: VD_ROOD_BG, color: VD_ROOD, padding: "1px 6px", borderRadius: 8 }}>Deadline voorbij</span>}
            {urgDl && !ovrDl && <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3E2", color: "#92400E", padding: "1px 6px", borderRadius: 8 }}>Deadline nadert</span>}
            {(opvolgenVervallen || opvolgenVandaag) && <span style={{ fontSize: 10, fontWeight: 600, background: "#F3EFFD", color: "#5B3FA6", padding: "1px 6px", borderRadius: 8 }}>⏰ Opvolgen{opvolgenVandaag ? " vandaag" : ""}</span>}
          </div>
          {/* FIX punt 6: tweede rij toont actief-dagen ipv naam herhaling */}
          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            {vve.adres && <span style={{ fontSize: 11, color: "#8A7E7B" }}>{vve.adres}</span>}
            {actDagen !== null && (
              <span style={{ fontSize: 10, color: "#8A7E7B" }}>
                Actief: <strong style={{ color: "#2D2D2D" }}>{actDagen} dag{actDagen !== 1 ? "en" : ""}</strong>
              </span>
            )}
            {(vve.trajecten || []).map(t => <span key={t.id} style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: t.type === "isolatie" ? "#FEF3E2" : t.type === "subsidie" ? "#D1FAE5" : "#EAF1F8", color: t.type === "isolatie" ? "#92400E" : t.type === "subsidie" ? "#065F46" : "#1A4D7A" }}>{t.type === "procesbegeleiding" ? "Lening" : t.type === "subsidie" ? "Subsidie" : "Isolatie"}</span>)}
          </div>
        </div>
        <div onClick={e => e.stopPropagation()}><VoortgangsBalk vve={vve} /></div>
        <span style={{ fontSize: 14, color: "#8A7E7B", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </div>

      {open && (
        <div style={{ borderTop: "1.5px solid #E5E0DB", background: "#FDFCFB" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #E5DEDA", background: "#fff", paddingLeft: 16, overflowX: "auto" }}>
            {[["info","Dossier"],["trajecten",`Trajecten (${(vve.trajecten||[]).length})`],["offertes",`Offertes (${(vve.offertes||[]).length})`],["log",`Log (${(vve.communicatielog||[]).length})`],["tijdlijn","Tijdlijn"],["audit","Audittrail"]].map(([k,l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "9px 14px", border: "none", borderBottom: `2px solid ${tab === k ? VD_ROOD : "transparent"}`, background: "transparent", fontSize: 12, fontWeight: tab === k ? 600 : 400, color: tab === k ? VD_ROOD : "#6B7280", cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
            ))}
          </div>
          <div style={{ padding: 16 }}>

            {tab === "info" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Veld label="VvE naam"><Inp value={vve.naam} onChange={v => u("naam", v)} placeholder="Naam van de VvE" /></Veld>
                  <Veld label="Adres"><Inp value={vve.adres} onChange={v => u("adres", v)} placeholder="Straat + nummer, plaats" /></Veld>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Veld label="Beheerder"><Sel value={vve.beheerder} onChange={v => u("beheerder", v)}><option value="">— Kies beheerder —</option>{(beheerderList || []).map(n => <option key={n} value={n}>{n}</option>)}</Sel></Veld>
                  <Veld label="Type eigendom"><Sel value={vve.typeEigendom} onChange={v => u("typeEigendom", v)}>{Object.entries(TYPE_EIGENDOM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></Veld>
                  <Veld label="Dossier status"><Sel value={vve.status} onChange={v => u("status", v)}>{Object.entries(DOSSIER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Sel></Veld>
                </div>
                <div className="flex items-center gap-6">
                  <Chk checked={vve.alvBesluit} onChange={v => u("alvBesluit", v)} label="ALV-besluit genomen" />
                  {vve.alvBesluit && <Veld label="Datum ALV-besluit"><Inp type="date" value={vve.alvDatum} onChange={v => u("alvDatum", v)} /></Veld>}
                </div>
                {/* Opvolgen herinnering */}
                <div className="bg-[#F8F5FF] border border-purple-100 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 16 }}>⏰</span>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide mb-1">Opvolgen op</p>
                      <Inp type="date" value={vve.opvolgenOp || ""} onChange={v => u("opvolgenOp", v)} />
                    </div>
                    {vve.opvolgenOp && (
                      <div className="text-right">
                        {dagenTot(vve.opvolgenOp) < 0
                          ? <span className="text-xs font-bold text-[#991A21]">{Math.abs(dagenTot(vve.opvolgenOp))}d vervallen</span>
                          : dagenTot(vve.opvolgenOp) === 0
                          ? <span className="text-xs font-bold text-purple-700">Vandaag</span>
                          : <span className="text-xs font-semibold text-gray-500">Over {dagenTot(vve.opvolgenOp)}d</span>
                        }
                        <button onClick={() => u("opvolgenOp", "")} className="block text-[10px] text-gray-400 hover:text-red-500 mt-0.5">wissen</button>
                      </div>
                    )}
                  </div>
                </div>
                {/* FIX punt 5: deadlines blok toont ALLEEN subsidie-einddatums */}
                {deadlines.length > 0 && (
                  <div className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Deadlines</p>
                    {deadlines.map((d, i) => <div key={i} className="flex items-center justify-between text-xs mb-1"><span className="text-gray-600">{d.label}</span><div className="flex items-center gap-2"><span className="text-gray-500">{datumNL(d.datum)}</span><DlBdg iso={d.datum} /></div></div>)}
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <button onClick={() => { if (confirm(`"${vve.naam || "naamloos"}" verwijderen?`)) onDelete(vve.id); }} className="text-xs text-red-400 hover:text-red-600">VvE verwijderen</button>
                  {vve.status !== "afgerond" ? <button onClick={afgerond} className="text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold">Dossier afronden ✓</button> : <button onClick={() => u("status", "in_behandeling")} className="text-xs px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg font-semibold">Dossier heropenen</button>}
                </div>
              </div>
            )}

            {tab === "trajecten" && (
              <div className="space-y-4">
                {(vve.trajecten || []).length === 0 && <p className="text-xs text-gray-400 italic">Nog geen trajecten toegevoegd.</p>}
                {(vve.trajecten || []).map(t => (
                  <div key={t.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <span className="text-sm font-bold text-[#2D2D2D]">{TRAJECTEN[t.type]}</span>
                      <div className="flex items-center gap-2">{t.status === "afgerond" ? <Bdg kleur="groen" label="Afgerond" /> : <Bdg kleur="blauw" label="Lopend" />}<button onClick={() => delTraj(t.id)} className="text-xs text-gray-400 hover:text-red-500">✕ verwijderen</button></div>
                    </div>
                    <div className="p-4">
                      {t.type === "procesbegeleiding" && <TrajectProcesbegeleiding t={t} onChange={updTraj} />}
                      {t.type === "subsidie" && <TrajectSubsidie t={t} onChange={updTraj} />}
                      {t.type === "isolatie" && <TrajectIsolatie t={t} onChange={updTraj} />}
                    </div>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Traject toevoegen</p>
                  <div className="flex gap-2 flex-wrap">{Object.entries(TRAJECTEN).map(([key, label]) => <button key={key} onClick={() => addTraj(key)} className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-medium transition-colors">+ {label}</button>)}</div>
                </div>
              </div>
            )}

            {tab === "offertes" && <OffertesTab vve={vve} onUpdate={onUpdate} />}

            {tab === "log" && (
              <div className="space-y-4">
                {/* Nieuw logitem formulier */}
                {logForm ? (
                  <div className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-[#2D2D2D]">Nieuw logitem</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Veld label="Datum"><Inp type="date" value={nieuweLog.datum} onChange={v => setNieuweLog({ ...nieuweLog, datum: v })} /></Veld>
                      {/* FIX punt 2: alleen Brian en Jeffrey */}
                      <Veld label="Beheerder">
                        <Sel value={nieuweLog.beheerder} onChange={v => setNieuweLog({ ...nieuweLog, beheerder: v })}>
                          <option value="">— kies —</option>
                          {LOG_BEHEERDERS.map(n => <option key={n} value={n}>{n}</option>)}
                        </Sel>
                      </Veld>
                      <Veld label="Partij"><Inp value={nieuweLog.partij} onChange={v => setNieuweLog({ ...nieuweLog, partij: v })} placeholder="eigenaar, aannemer, gemeente…" /></Veld>
                      <Veld label="Kanaal"><Sel value={nieuweLog.kanaal} onChange={v => setNieuweLog({ ...nieuweLog, kanaal: v })}>{KANAAL_OPTIES.map(k => <option key={k} value={k}>{k}</option>)}</Sel></Veld>
                    </div>
                    <Veld label="Omschrijving"><Txa value={nieuweLog.omschrijving} onChange={v => setNieuweLog({ ...nieuweLog, omschrijving: v })} placeholder="Wat is er besproken of afgesproken?" /></Veld>
                    <div className="flex gap-2">
                      <button onClick={slaLogOp} className="text-xs px-4 py-2 bg-[#991A21] text-white rounded-lg font-semibold hover:bg-[#7a1419]">Opslaan</button>
                      <button onClick={() => setLogForm(false)} className="text-xs px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold">Annuleren</button>
                    </div>
                  </div>
                ) : <button onClick={() => setLogForm(true)} className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-medium">+ Logitem toevoegen</button>}

                {(vve.communicatielog || []).length === 0 && !logForm && <p className="text-xs text-gray-400 italic">Nog geen communicatie geregistreerd.</p>}

                {/* Log overzicht */}
                <div className="space-y-2">
                  {[...(vve.communicatielog || [])].reverse().map(l => (
                    <div key={l.id}>
                      {/* FIX punt 3: bewerkmodus per logitem */}
                      {bewerkLogId === l.id ? (
                        <div className="bg-[#FAF7F2] border border-[#991A21] border-opacity-30 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-bold text-[#2D2D2D]">Logitem bewerken</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Veld label="Datum"><Inp type="date" value={bewerkLogData.datum} onChange={v => setBewerkLogData({ ...bewerkLogData, datum: v })} /></Veld>
                            <Veld label="Beheerder">
                              <Sel value={bewerkLogData.beheerder} onChange={v => setBewerkLogData({ ...bewerkLogData, beheerder: v })}>
                                <option value="">— kies —</option>
                                {LOG_BEHEERDERS.map(n => <option key={n} value={n}>{n}</option>)}
                              </Sel>
                            </Veld>
                            <Veld label="Partij"><Inp value={bewerkLogData.partij} onChange={v => setBewerkLogData({ ...bewerkLogData, partij: v })} placeholder="eigenaar, aannemer, gemeente…" /></Veld>
                            <Veld label="Kanaal"><Sel value={bewerkLogData.kanaal} onChange={v => setBewerkLogData({ ...bewerkLogData, kanaal: v })}>{KANAAL_OPTIES.map(k => <option key={k} value={k}>{k}</option>)}</Sel></Veld>
                          </div>
                          <Veld label="Omschrijving"><Txa value={bewerkLogData.omschrijving} onChange={v => setBewerkLogData({ ...bewerkLogData, omschrijving: v })} /></Veld>
                          <div className="flex gap-2">
                            <button onClick={slaLogBewerkingOp} className="text-xs px-4 py-2 bg-[#991A21] text-white rounded-lg font-semibold hover:bg-[#7a1419]">Opslaan</button>
                            <button onClick={() => { setBewerkLogId(null); setBewerkLogData(null); }} className="text-xs px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold">Annuleren</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3 text-xs border-l-2 border-gray-200 pl-3 py-1 group">
                          <div className="flex-shrink-0 text-gray-400 w-20">{datumNL(l.datum)}</div>
                          <div className="flex-1">
                            <span className="font-semibold text-[#2D2D2D]">{l.beheerder}</span>{" · "}
                            <span className="text-gray-500">{l.partij}</span>{" · "}
                            <span className="italic text-gray-400">{l.kanaal}</span>
                            <p className="text-gray-600 mt-0.5">{l.omschrijving}</p>
                          </div>
                          {/* Bewerk + verwijder knoppen */}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => { setBewerkLogId(l.id); setBewerkLogData({ ...l }); }}
                              className="text-[10px] px-2 py-1 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-md font-medium text-gray-500 transition-colors"
                            >✎</button>
                            <button
                              onClick={() => verwijderLog(l.id)}
                              className="text-[10px] px-2 py-1 bg-white border border-gray-200 hover:border-red-300 hover:text-red-500 rounded-md font-medium text-gray-400 transition-colors"
                            >✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "tijdlijn" && <TijdlijnTab vve={vve} />}

            {tab === "audit" && (
              <div className="space-y-1">
                {(vve.audittrail || []).length === 0 && <p className="text-xs text-gray-400 italic">Nog geen wijzigingen vastgelegd.</p>}
                {[...(vve.audittrail || [])].reverse().map((a, i) => (
                  <div key={i} className="flex gap-3 text-xs border-l-2 border-gray-100 pl-3 py-1">
                    <span className="text-gray-400 flex-shrink-0 w-36">{datumTijdNL(a.tijdstip)}</span>
                    <span className="text-gray-500">{a.veld}: <span className="line-through text-red-400">{String(a.oud ?? "—").slice(0, 40)}</span> → <span className="text-emerald-600">{String(a.nieuw ?? "—").slice(0, 40)}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function exportActiesCSV(acties) {
  const header = ["VvE", "Beheerder", "Traject", "Actie", "Detail"];
  const rows = acties.map(a => [
    a.vve || "", a.beh || "", a.traj || "",
    ACTIETYPE_LABELS[a.type] || a.type,
    a.detail || ""
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "actielijst.csv"; a.click();
  URL.revokeObjectURL(url);
}

function ActielijstTab({ acties }) {
  const [fBeh, setFBeh] = useState("alle");
  const zichtbaar = fBeh === "alle" ? acties : acties.filter(a => a.beh === fBeh);
  const uniekeBeheerders = [...new Set(acties.map(a => a.beh).filter(Boolean))];

  return (
    <div className="space-y-3">
      {/* Toolbar: filter + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Beheerder</span>
          <select
            value={fBeh}
            onChange={e => setFBeh(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#991A21]"
          >
            <option value="alle">Alle ({acties.length})</option>
            {uniekeBeheerders.map(n => (
              <option key={n} value={n}>{n} ({acties.filter(a => a.beh === n).length})</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => exportActiesCSV(zichtbaar)}
          disabled={zichtbaar.length === 0}
          className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-semibold text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <span>↓</span> Exporteren als CSV
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {zichtbaar.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-sm font-semibold text-[#2D2D2D]">{acties.length === 0 ? "Geen openstaande acties" : "Geen acties voor deze beheerder"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["VvE", "Beheerder", "Traject", "Actie"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((a, i) => (
                <tr key={i} className={`border-b border-gray-50 hover:bg-[#FAF7F2] ${a.prioriteit === "hoog" ? "bg-purple-50/40" : ""}`}>
                  <td className="px-5 py-3 font-semibold text-[#2D2D2D]">{a.vve || "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{a.beh || "—"}</td>
                  <td className="px-5 py-3">
                    <Bdg kleur={a.traj === "Isolatie" ? "oranje" : a.traj === "Subsidie" ? "groen" : a.traj === "Dossier" ? "grijs" : "blauw"} label={a.traj} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-start gap-2">
                      {a.prioriteit === "hoog" && <span style={{ fontSize: 13 }}>⏰</span>}
                      <div>
                        <span className="font-medium text-[#2D2D2D]">{ACTIETYPE_LABELS[a.type] || a.type}</span>
                        {a.detail && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{a.detail}</p>}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function VerduurzamingBeheer({ onTerug, beheerder, beheerderList }) {
  const [vves, setVves] = useState(() => vdLocalLoad());
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoek, setZoek] = useState("");
  const [fTraj, setFTraj] = useState("alle");
  const [fBeh, setFBeh] = useState("alle");
  const [fStat, setFStat] = useState("alle");
  const [hoofdTab, setHoofdTab] = useState("vves");

  useEffect(() => { vdLoad().then(d => { if (d && d.length) setVves(d); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const addVve = async () => { const n = leegVve(); setVves([n, ...vves]); await vdSave(n); setOpenId(n.id); setHoofdTab("vves"); };
  const updVve = async v => { setVves(p => p.map(x => x.id === v.id ? v : x)); await vdSave(v); };
  const delVve = async id => { setVves(p => p.filter(x => x.id !== id)); await vdDelete(id); if (openId === id) setOpenId(null); };

  const zichtbaar = vves.filter(v => {
    const mz = !zoek || (v.naam || "").toLowerCase().includes(zoek.toLowerCase()) || (v.adres || "").toLowerCase().includes(zoek.toLowerCase());
    const mt = fTraj === "alle" || (v.trajecten || []).some(t => t.type === fTraj);
    const mb = fBeh === "alle" || v.beheerder === fBeh;
    const ms = fStat === "alle" || v.status === fStat;
    return mz && mt && mb && ms;
  });

  const aantalActief = vves.filter(v => v.status !== "afgerond").length;
  // FIX punt 5: aantalDl telt alleen subsidie-einddatums
  const aantalDl = vves.filter(v => (v.trajecten || []).some(t => t.type === "subsidie" && t.einddatum && (() => { const g = dagenTot(t.einddatum); return g !== null && g <= 14 && g >= 0; })())).length;

  const acties = [];
  vves.forEach(v => {
    // Opvolgen herinnering — datum vervallen of vandaag
    if (v.opvolgenOp && dagenTot(v.opvolgenOp) !== null && dagenTot(v.opvolgenOp) <= 0 && v.status !== "afgerond") {
      acties.push({ vve: v.naam, beh: v.beheerder, type: "opvolgen", traj: "Dossier", detail: `Opvolgen gepland op ${datumNL(v.opvolgenOp)}`, prioriteit: "hoog" });
    }
    (v.trajecten || []).forEach(t => {
      if (t.type === "isolatie") {
        if (!(v.offertes || []).some(o => o.aangevraagd)) acties.push({ vve: v.naam, beh: v.beheerder, type: "offerte_aanvragen", traj: "Isolatie" });
        if ((v.offertes || []).some(o => o.aangevraagd) && !t.doorgestuurdGemeente) acties.push({ vve: v.naam, beh: v.beheerder, type: "offerte_doorsturen", traj: "Isolatie" });
        if (!(v.offertes || []).some(o => o.vveAkkoord) && (v.offertes || []).some(o => o.ontvangen)) acties.push({ vve: v.naam, beh: v.beheerder, type: "akkoord_ophalen", traj: "Isolatie" });
        if (!t.inkooporderOntvangen && t.doorgestuurdGemeente) acties.push({ vve: v.naam, beh: v.beheerder, type: "inkooporder_opvolgen", traj: "Isolatie" });
      }
      if (t.type === "subsidie") {
        if (t.ontbrekendeDocs?.trim()) acties.push({ vve: v.naam, beh: v.beheerder, type: "document_opvragen", traj: "Subsidie", detail: t.ontbrekendeDocs });
        if (!t.gefactureerd && t.status === "afgerond") acties.push({ vve: v.naam, beh: v.beheerder, type: "factuur_versturen", traj: "Subsidie" });
      }
      if (t.type === "procesbegeleiding" && !t.gefactureerd && t.status === "afgerond") acties.push({ vve: v.naam, beh: v.beheerder, type: "factuur_versturen", traj: "Procesbegeleiding" });
    });
  });

  const fin = { totaal: 0, gefactureerd: 0, open: 0, per: {} };
  vves.forEach(v => {
    (v.trajecten || []).forEach(t => {
      const b = (parseFloat(t.bedrag || t.teFactureren || 0) || 0) + (parseFloat(t.begeleidingsvergoeding || 0) || 0);
      fin.totaal += b; if (t.gefactureerd) fin.gefactureerd += b; else fin.open += b;
      if (!fin.per[t.type]) fin.per[t.type] = { totaal: 0, gefactureerd: 0, open: 0 };
      fin.per[t.type].totaal += b; if (t.gefactureerd) fin.per[t.type].gefactureerd += b; else fin.per[t.type].open += b;
    });
  });

  if (loading) return <div className="min-h-screen bg-[#F2EFEC] flex items-center justify-center"><style>{CSS_FONT}</style><div className="text-center"><div className="w-8 h-8 border-4 border-[#991A21] border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-gray-500">Gegevens laden…</p></div></div>;

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1"><div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center"><span className="text-white text-xs">🌿</span></div><div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center"><span className="text-white text-xs">📋</span></div></div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">Verduurzaming & Subsidies</span>
          {aantalDl > 0 && <span className="text-[10px] bg-red-50 text-[#991A21] border border-red-100 px-2 py-0.5 rounded-full font-bold">{aantalDl} deadline{aantalDl > 1 ? "s" : ""} nadert</span>}
        </div>
        <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors">← Terug naar portaal</button>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[{label:"VvE's totaal",val:vves.length,k:"#2D2D2D"},{label:"Actief",val:aantalActief,k:VD_ROOD},{label:"Openstaande acties",val:acties.length,k:"#92400E"},{label:"Deadlines < 14d",val:aantalDl,k:aantalDl>0?VD_ROOD:"#2D6A4F"}].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p><p className="text-3xl font-bold" style={{color:s.k}}>{s.val}</p></div>
          ))}
        </div>

        <div className="flex gap-0 border-b border-gray-200 mb-6">
          {[{key:"vves",label:`VvE's (${vves.length})`},{key:"acties",label:`Actielijst (${acties.length})`},{key:"financieel",label:"Financieel"}].map(t => (
            <button key={t.key} onClick={() => setHoofdTab(t.key)} className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${hoofdTab===t.key?"border-[#991A21] text-[#991A21]":"border-transparent text-gray-500 hover:text-[#2D2D2D]"}`}>{t.label}</button>
          ))}
        </div>

        {hoofdTab === "vves" && (
          <>
            <div className="flex gap-3 mb-4 flex-wrap">
              <input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoek op naam of adres…" className="flex-1 min-w-40 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21]" />
              <select value={fStat} onChange={e => setFStat(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21]"><option value="alle">Alle statussen</option>{Object.entries(DOSSIER_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select>
              <select value={fTraj} onChange={e => setFTraj(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21]"><option value="alle">Alle trajecten</option>{Object.entries(TRAJECTEN).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select value={fBeh} onChange={e => setFBeh(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21]"><option value="alle">Alle beheerders</option>{(beheerderList||[]).map(n => <option key={n} value={n}>{n}</option>)}</select>
              <button onClick={addVve} className="px-4 py-2 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">+ VvE toevoegen</button>
            </div>

            {/* Punt 1: sidebar + lijst layout */}
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <StatSidebar vves={vves} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {zichtbaar.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm"><p className="text-4xl mb-3">🌿</p><p className="text-sm font-semibold text-[#2D2D2D] mb-1">{vves.length === 0 ? "Nog geen VvE's toegevoegd" : "Geen resultaten gevonden"}</p><p className="text-xs text-gray-500">{vves.length === 0 ? "Klik op '+ VvE toevoegen' om te beginnen." : "Pas de filters aan."}</p></div>
                ) : (
                  <div>{zichtbaar.map(v => <VveKaart key={v.id} vve={v} onUpdate={updVve} onDelete={delVve} openId={openId} setOpenId={setOpenId} beheerderList={beheerderList} />)}</div>
                )}
              </div>
            </div>
          </>
        )}

        {hoofdTab === "acties" && (
          <ActielijstTab acties={acties} />
        )}

        {hoofdTab === "financieel" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[{label:"Totale omzet",val:fin.totaal,k:"#2D2D2D"},{label:"Al gefactureerd",val:fin.gefactureerd,k:"#065F46"},{label:"Nog te factureren",val:fin.open,k:VD_ROOD}].map(s => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p><p className="text-2xl font-bold" style={{color:s.k}}>{euro(s.val)}</p></div>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Per traject</p></div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">{["Traject","Totaal","Gefactureerd","Open"].map((h,i) => <th key={h} className={`px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide ${i>0?"text-right":"text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(fin.per).map(([type, f]) => <tr key={type} className="border-b border-gray-50"><td className="px-5 py-3 font-medium text-[#2D2D2D]">{TRAJECTEN[type]||type}</td><td className="px-5 py-3 text-right text-gray-600">{euro(f.totaal)}</td><td className="px-5 py-3 text-right text-emerald-600 font-medium">{euro(f.gefactureerd)}</td><td className="px-5 py-3 text-right font-medium" style={{color:VD_ROOD}}>{euro(f.open)}</td></tr>)}
                  {Object.keys(fin.per).length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-xs text-gray-400 italic">Nog geen financiële data.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
