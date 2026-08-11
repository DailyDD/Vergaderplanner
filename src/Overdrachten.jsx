import React, { useState, useEffect } from "react";
import { downloadFactuur, downloadOverzicht } from "./overdrachtPdf";
import { logEvent } from './telemetry';

// ── Overdrachten (Notarisoverdracht) ─────────────────────────────
// Module voor notarisoverdrachten: facturen + overzicht genereren,
// notarissen als contactpersoon beheren, en binnengekomen verzoeken
// met deadlines volgen.
// Toegang: user_roles.modules bevat 'overdrachten' (of hoofd_admin/admin).
//
// Supabase-afhankelijkheden worden geïnjecteerd vanuit App.jsx via
// initOverdrachtenDeps({ sbFetch, showToast }).

let _sbFetch = null;
let _showToast = null;
export function initOverdrachtenDeps({ sbFetch, showToast }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
}

// ── Portaalwidget: open verzoeken + deadlines ────────────────────
// Haalt de openstaande overdrachtverzoeken op voor de dashboardkaart.
// Zelfde bron als het "Verzoeken & deadlines"-tabblad (overdracht_verzoeken).
// Retourneert de ruwe rijen; overdrachtenDashboardStats() rekent ze uit.
export async function overdrachtenSupaLoad() {
  if (!_sbFetch) return [];
  try {
    const rows = await _sbFetch("overdracht_verzoeken?select=*&order=deadline.asc");
    return rows || [];
  } catch (e) {
    console.error("overdrachten dashboard laden", e);
    return [];
  }
}

// Pure functie (geen fetch, geen state): vat de verzoekenlijst samen voor
// de portaalkaart. Open = status !== "afgerond", identiek aan VerzoekenBeheer.
export function overdrachtenDashboardStats(rijen) {
  const lijst = Array.isArray(rijen) ? rijen : [];
  const open = lijst.filter((v) => v.status !== "afgerond");
  const teLaat = open.filter((v) => { const n = dagenTot(v.deadline); return n != null && n < 0; }).length;
  const dezeWeek = open.filter((v) => { const n = dagenTot(v.deadline); return n != null && n >= 0 && n <= 7; }).length;
  const zonderDeadline = open.filter((v) => dagenTot(v.deadline) == null).length;
  // Eerstvolgende open verzoeken mét deadline, oplopend op datum.
  const komend = open
    .filter((v) => dagenTot(v.deadline) != null)
    .map((v) => ({
      id: v.id,
      adres: v.adres || "—",
      notaris: v.notaris_naam || "",
      behandelaar: v.behandelaar || "",
      deadline: v.deadline,
      dagen: dagenTot(v.deadline),
    }))
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));
  return { totaalOpen: open.length, teLaat, dezeWeek, zonderDeadline, komend };
}

const MAANDEN_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const pad2 = (n) => String(n).padStart(2, "0");
function vandaagISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function datumNL(d = new Date()) { return `${d.getDate()} ${MAANDEN_NL[d.getMonth()]} ${d.getFullYear()}`; }
function fmtDatumISO(iso) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${d.getDate()} ${MAANDEN_NL[d.getMonth()]} ${d.getFullYear()}`;
}
function dagenTot(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const nu = new Date(); nu.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - nu.getTime()) / 86400000);
}
function deadlineInfo(iso) {
  const n = dagenTot(iso);
  if (n == null) return { label: "—", tekst: "#8A847E", bg: "#F2EFEC" };
  if (n < 0) return { label: `${-n} ${-n === 1 ? "dag" : "dagen"} te laat`, tekst: "#991A21", bg: "#FDEAEB" };
  if (n === 0) return { label: "vandaag", tekst: "#991A21", bg: "#FDEAEB" };
  if (n <= 7) return { label: `over ${n} ${n === 1 ? "dag" : "dagen"}`, tekst: "#B07414", bg: "#FBF3E4" };
  return { label: `over ${n} dagen`, tekst: "#2D6A4F", bg: "#EAF4EE" };
}

const TABS = [
  { key: "nieuw",      label: "Nieuwe overdracht" },
  { key: "notarissen", label: "Notarissen" },
  { key: "verzoeken",  label: "Verzoeken & deadlines" },
];

function legeOverdracht() {
  return {
    vve: "",
    notaris_id: "",
    notaris_naam: "",
    notaris_adres: "",
    notaris_postcode_plaats: "",
    plaats_datum: `Rijswijk, ${datumNL()}`,
    betreft: "",
    aanhef: "Geachte heer/mevrouw,",
    factuurdatum: vandaagISO(),
    maandbijdrage: "",
    naam_verkoper: "",
    verrekenen_verkoper: "",
    factuurnr_verkoper: "",
    omschrijving_verkoper: "",
    naam_koper: "",
    verrekenen_koper: "",
    factuurnr_koper: "",
    omschrijving_koper: "",
    aandeel_reservefonds: "",
    rekeningnummer: "",
    tnv: "",
    _koperHandmatig: false,
  };
}

export default function Overdrachten({ onTerug, beheerder }) {
  const [tab, setTab] = useState("nieuw");
  const [notarissen, setNotarissen] = useState([]);
  const [ladenNotarissen, setLadenNotarissen] = useState(true);
  const [overdracht, setOverdracht] = useState(() => legeOverdracht());
  const [vveNamen, setVveNamen] = useState([]);

  useEffect(() => { laadNotarissen(); laadVveNamen(); }, []);

  async function laadNotarissen() {
    if (!_sbFetch) return;
    setLadenNotarissen(true);
    try {
      const rows = await _sbFetch("notarissen?select=*&order=naam.asc");
      setNotarissen(rows || []);
    } catch (e) {
      console.error("notarissen laden", e);
      _showToast && _showToast("Notarissen laden mislukt.", "fout");
    }
    setLadenNotarissen(false);
  }

  // ── VvE-namenlijst: autocomplete-bron voor het VvE-veld bij Algemeen ──
  async function laadVveNamen() {
    if (!_sbFetch) return;
    try {
      const rows = await _sbFetch("vve_namen?select=*&order=naam.asc");
      setVveNamen(rows || []);
    } catch (e) {
      console.error("vve_namen laden", e);
      _showToast && _showToast("VvE-lijst laden mislukt.", "fout");
    }
  }

  async function voegVveNaamToe(naam) {
    if (!_sbFetch) return;
    try {
      await _sbFetch("vve_namen", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ naam }),
      });
      await laadVveNamen();
      _showToast && _showToast("VvE toegevoegd aan de lijst.", "succes");
    } catch (e) {
      console.error("vve_naam toevoegen", e);
      _showToast && _showToast("VvE toevoegen mislukt.", "fout");
    }
  }

  async function verwijderVveNaam(id) {
    if (!_sbFetch) return;
    try {
      await _sbFetch(`vve_namen?id=eq.${id}`, { method: "DELETE" });
      await laadVveNamen();
      _showToast && _showToast("VvE verwijderd uit de lijst.", "succes");
    } catch (e) {
      console.error("vve_naam verwijderen", e);
      _showToast && _showToast("VvE verwijderen mislukt.", "fout");
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-[#E7E2DB] px-6 lg:px-8 pt-5">
        <button
          onClick={onTerug}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Terug naar dashboard
        </button>

        <h1 className="text-[22px] font-bold text-[#2D2D2D] leading-tight">Overdrachten</h1>
        <p className="text-[13px] text-[#8A847E] mt-0.5 mb-4">
          Facturen en overzicht genereren, notarissen beheren en overdrachten volgen.
        </p>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => {
            const actief = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 h-10 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
                  actief
                    ? "border-[#991A21] text-[#991A21]"
                    : "border-transparent text-[#8A847E] hover:text-[#2D2D2D]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-8">
        {tab === "nieuw" && (
          <NieuweOverdracht
            notarissen={notarissen}
            overdracht={overdracht}
            setOverdracht={setOverdracht}
            onReset={() => setOverdracht(legeOverdracht())}
            vveNamen={vveNamen}
            onVveNaamToevoegen={voegVveNaamToe}
            onVveNaamVerwijderen={verwijderVveNaam}
          />
        )}
        {tab === "notarissen" && (
          <NotarissenBeheer
            notarissen={notarissen}
            laden={ladenNotarissen}
            onWijzig={laadNotarissen}
          />
        )}
        {tab === "verzoeken" && (
          <VerzoekenBeheer notarissen={notarissen} beheerder={beheerder} />
        )}
      </div>
    </div>
  );
}

// ══ Nieuwe overdracht: invoerformulier ═══════════════════════════
function NieuweOverdracht({ notarissen, overdracht, setOverdracht, onReset, vveNamen, onVveNaamToevoegen, onVveNaamVerwijderen }) {
  const o = overdracht;
  const set = (veld) => (waarde) => setOverdracht((prev) => ({ ...prev, [veld]: waarde }));

  function kiesNotaris(id) {
    const n = notarissen.find((x) => x.id === id);
    setOverdracht((prev) => ({
      ...prev,
      notaris_id: id,
      notaris_naam: n ? n.naam : prev.notaris_naam,
      notaris_adres: n ? (n.adres || "") : prev.notaris_adres,
      notaris_postcode_plaats: n ? (n.postcode_plaats || "") : prev.notaris_postcode_plaats,
    }));
  }

  function setMaandbijdrage(v) {
    setOverdracht((prev) => {
      const next = { ...prev, maandbijdrage: v };
      if (!prev._koperHandmatig) {
        const mb = parseFloat(String(v).replace(",", "."));
        next.verrekenen_koper = isNaN(mb) ? "" : String(mb * 2);
      }
      return next;
    });
  }
  function setVerrekenenKoper(v) {
    setOverdracht((prev) => ({ ...prev, verrekenen_koper: v, _koperHandmatig: true }));
  }

  function download(fn) {
    try {
      fn();
      _showToast && _showToast("PDF aangemaakt.", "succes");
    } catch (e) {
      console.error("pdf", e);
      _showToast && _showToast("PDF maken mislukt.", "fout");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-bold text-[#2D2D2D]">Nieuwe overdracht</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">
            Vul de gegevens in. Straks download je hier de twee facturen en het overzicht als PDF.
          </p>
        </div>
        <button
          onClick={onReset}
          className="shrink-0 text-[12.5px] font-medium text-[#8A847E] hover:text-[#991A21] transition-colors mt-1"
        >
          Formulier wissen
        </button>
      </div>

      <Sectie titel="Algemeen">
        <VveAutocomplete
          value={o.vve}
          onChange={set("vve")}
          vveNamen={vveNamen}
          onNaamToevoegen={onVveNaamToevoegen}
          onNaamVerwijderen={onVveNaamVerwijderen}
        />
        <Veld
          label="Betreft"
          value={o.betreft}
          onChange={set("betreft")}
          placeholder="... te Rijswijk"
          hint='In de export komt hier automatisch "Betreft: Transport" voor'
        />
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Plaats + datum (brief)" value={o.plaats_datum} onChange={set("plaats_datum")} />
          <Veld label="Factuurdatum" type="date" value={o.factuurdatum} onChange={set("factuurdatum")} />
        </div>
        <Veld label="Aanhef" value={o.aanhef} onChange={set("aanhef")} />
      </Sectie>

      <Sectie titel="Notaris">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Notaris kiezen</span>
          <select
            value={o.notaris_id}
            onChange={(e) => kiesNotaris(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors"
          >
            <option value="">— Kies een notaris —</option>
            {notarissen.map((n) => (
              <option key={n.id} value={n.id}>{n.naam}</option>
            ))}
          </select>
          {notarissen.length === 0 && (
            <span className="block text-[12px] text-[#B07414] mt-1">
              Nog geen notarissen. Voeg ze toe in de tab Notarissen.
            </span>
          )}
        </label>
        <Veld label="Naam notaris" value={o.notaris_naam} onChange={set("notaris_naam")} />
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Adres notaris" value={o.notaris_adres} onChange={set("notaris_adres")} />
          <Veld label="Postcode + plaats" value={o.notaris_postcode_plaats} onChange={set("notaris_postcode_plaats")} />
        </div>
      </Sectie>

      <Sectie titel="Bedragen">
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Maandbijdrage (€)" value={o.maandbijdrage} onChange={setMaandbijdrage} inputMode="decimal" placeholder="100" />
          <Veld label="Aandeel reservefonds (€)" value={o.aandeel_reservefonds} onChange={set("aandeel_reservefonds")} inputMode="decimal" placeholder="8192.53" />
        </div>
      </Sectie>

      <Sectie titel="Factuur verkoper">
        <Veld label="Naam verkoper" value={o.naam_verkoper} onChange={set("naam_verkoper")} placeholder="Dhr. ... en Mevr. ..." />
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Te verrekenen verkoper (€)" value={o.verrekenen_verkoper} onChange={set("verrekenen_verkoper")} inputMode="decimal" placeholder="100" />
          <Veld label="Factuurnummer verkoper" value={o.factuurnr_verkoper} onChange={set("factuurnr_verkoper")} placeholder="VVEVK..." />
        </div>
        <Veld
          label="Omschrijving factuur verkoper"
          value={o.omschrijving_verkoper}
          onChange={set("omschrijving_verkoper")}
          placeholder="... 2026"
          hint='In de export komt hier automatisch "Bijdrage tot en met:" voor'
        />
      </Sectie>

      <Sectie titel="Factuur koper">
        <Veld label="Naam koper" value={o.naam_koper} onChange={set("naam_koper")} placeholder="Mevr. ..." />
        <div className="grid grid-cols-2 gap-3">
          <Veld
            label="Te verrekenen koper (€)"
            value={o.verrekenen_koper}
            onChange={setVerrekenenKoper}
            inputMode="decimal"
            placeholder="200"
            hint={o._koperHandmatig ? "Handmatig aangepast" : "Standaard = maandbijdrage × 2"}
          />
          <Veld label="Factuurnummer koper" value={o.factuurnr_koper} onChange={set("factuurnr_koper")} placeholder="VVEAK..." />
        </div>
        <Veld
          label="Omschrijving factuur koper"
          value={o.omschrijving_koper}
          onChange={set("omschrijving_koper")}
          placeholder="... en ... 2026"
          hint='In de export komt hier automatisch "Bijdrage maand:" voor'
        />
      </Sectie>

      <Sectie titel="Betaalgegevens">
        <Veld
          label="Rekeningnummer"
          value={o.rekeningnummer}
          onChange={set("rekeningnummer")}
          placeholder="NL.. ABNA .."
          hint='In de export komt hier automatisch "Rekeningnummer:" voor'
        />
        <Veld
          label="t.n.v."
          value={o.tnv}
          onChange={set("tnv")}
          placeholder="..."
          hint='In de export komt hier automatisch "t.n.v. VvE" voor'
        />
      </Sectie>

      {/* Downloadknoppen */}
      <div className="pt-2">
        <div className="flex flex-wrap gap-2">
          <DownloadKnop label="Factuur verkoper (PDF)" onClick={() => download(() => downloadFactuur(o, "verkoper"))} />
          <DownloadKnop label="Factuur koper (PDF)" onClick={() => download(() => downloadFactuur(o, "koper"))} />
          <DownloadKnop label="Overdrachtoverzicht (PDF)" onClick={() => download(() => downloadOverzicht(o))} />
        </div>
        <p className="text-[12px] text-[#9B958E] mt-2">PDF's worden lokaal in je browser aangemaakt — er wordt niets opgeslagen.</p>
      </div>
    </div>
  );
}

function DownloadKnop({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#991A21] hover:bg-[#7d151b] text-white text-[13.5px] font-semibold transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      {label}
    </button>
  );
}

function Sectie({ titel, children }) {
  return (
    <div className="rounded-xl border border-[#E7E2DB] bg-white p-5">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#991A21] mb-4">{titel}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ══ Notarissen: gedeelde contactenlijst ══════════════════════════
const LEGE_NOTARIS = {
  naam: "", adres: "", postcode_plaats: "",
  contactpersoon: "", email: "", telefoon: "",
};

function NotarissenBeheer({ notarissen, laden, onWijzig }) {
  const [form, setForm] = useState(null);
  const [teVerwijderen, setTeVerwijderen] = useState(null);

  async function opslaan(n) {
    const payload = {
      naam: (n.naam || "").trim(),
      adres: (n.adres || "").trim() || null,
      postcode_plaats: (n.postcode_plaats || "").trim() || null,
      contactpersoon: (n.contactpersoon || "").trim() || null,
      email: (n.email || "").trim() || null,
      telefoon: (n.telefoon || "").trim() || null,
    };
    try {
      if (n.id) {
        await _sbFetch(`notarissen?id=eq.${n.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        _showToast && _showToast("Notaris bijgewerkt.", "succes");
      } else {
        await _sbFetch("notarissen", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        _showToast && _showToast("Notaris toegevoegd.", "succes");
      }
      setForm(null);
      onWijzig && (await onWijzig());
    } catch (e) {
      console.error("notaris opslaan", e);
      _showToast && _showToast("Opslaan mislukt.", "fout");
    }
  }

  async function verwijder(id) {
    try {
      await _sbFetch(`notarissen?id=eq.${id}`, { method: "DELETE" });
      _showToast && _showToast("Notaris verwijderd.", "succes");
      setTeVerwijderen(null);
      onWijzig && (await onWijzig());
    } catch (e) {
      console.error("notaris verwijderen", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[17px] font-bold text-[#2D2D2D]">Notarissen</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">
            Gedeelde contactenlijst. Kies een notaris bij een overdracht uit de dropdown.
          </p>
        </div>
        <button
          onClick={() => setForm({ ...LEGE_NOTARIS })}
          className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#991A21] hover:bg-[#7d151b] text-white text-[13.5px] font-semibold transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Notaris toevoegen
        </button>
      </div>

      {laden ? (
        <div className="text-[13.5px] text-[#8A847E] py-8">Laden…</div>
      ) : notarissen.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DDD5CE] bg-white/50 px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-[#2D2D2D]">Nog geen notarissen</p>
          <p className="text-[13px] text-[#8A847E] mt-1">Voeg de eerste toe met de knop rechtsboven.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notarissen.map((n) => (
            <div key={n.id} className="group flex items-start gap-3 rounded-xl border border-[#E7E2DB] bg-white px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[14.5px] font-bold text-[#2D2D2D]">{n.naam}</span>
                  {n.contactpersoon && (
                    <span className="text-[12.5px] text-[#8A847E]">· {n.contactpersoon}</span>
                  )}
                </div>
                {(n.adres || n.postcode_plaats) && (
                  <p className="text-[12.5px] text-[#6B6560] mt-0.5">
                    {[n.adres, n.postcode_plaats].filter(Boolean).join(", ")}
                  </p>
                )}
                {(n.email || n.telefoon) && (
                  <p className="text-[12px] text-[#9B958E] mt-0.5">
                    {[n.email, n.telefoon].filter(Boolean).join("  ·  ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setForm({ ...n })}
                  title="Bewerken"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#F2EFEC] hover:text-[#991A21] transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  onClick={() => setTeVerwijderen(n)}
                  title="Verwijderen"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#FDEAEB] hover:text-[#991A21] transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <NotarisForm initieel={form} onSluit={() => setForm(null)} onOpslaan={opslaan} />
      )}
      {teVerwijderen && (
        <BevestigVerwijderen
          naam={teVerwijderen.naam}
          titel="Notaris verwijderen?"
          onSluit={() => setTeVerwijderen(null)}
          onBevestig={() => verwijder(teVerwijderen.id)}
        />
      )}
    </div>
  );
}

// ── Formulier (toevoegen / bewerken notaris) ──
function NotarisForm({ initieel, onSluit, onOpslaan }) {
  const [n, setN] = useState(initieel);
  const [bezig, setBezig] = useState(false);
  const set = (veld) => (waarde) => setN((prev) => ({ ...prev, [veld]: waarde }));
  const geldig = (n.naam || "").trim().length > 0;

  async function bewaar() {
    if (!geldig || bezig) return;
    setBezig(true);
    await onOpslaan(n);
    setBezig(false);
  }

  return (
    <Modal onSluit={onSluit}>
      <h3 className="text-[17px] font-bold text-[#2D2D2D] mb-4">
        {n.id ? "Notaris bewerken" : "Nieuwe notaris"}
      </h3>
      <div className="space-y-3">
        <Veld label="Naam notaris" value={n.naam} onChange={set("naam")} verplicht autoFocus placeholder="KRAGD Notarissen" />
        <Veld label="Contactpersoon" value={n.contactpersoon} onChange={set("contactpersoon")} placeholder="Optioneel" />
        <Veld label="Adres" value={n.adres} onChange={set("adres")} placeholder="Prinses Margrietsplantsoen 51-A" />
        <Veld label="Postcode + plaats" value={n.postcode_plaats} onChange={set("postcode_plaats")} placeholder="2595 BR 's-Gravenhage" />
        <div className="grid grid-cols-2 gap-3">
          <Veld label="E-mail" type="email" value={n.email} onChange={set("email")} placeholder="Optioneel" />
          <Veld label="Telefoon" value={n.telefoon} onChange={set("telefoon")} placeholder="Optioneel" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-6">
        <button onClick={onSluit} className="h-10 px-4 rounded-xl text-[13.5px] font-semibold text-[#6B6560] hover:bg-[#F2EFEC] transition-colors">
          Annuleren
        </button>
        <button
          onClick={bewaar}
          disabled={!geldig || bezig}
          className="h-10 px-5 rounded-xl bg-[#991A21] hover:bg-[#7d151b] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13.5px] font-semibold transition-colors"
        >
          {bezig ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </Modal>
  );
}

// ── Verwijder-bevestiging ──
function BevestigVerwijderen({ naam, titel = "Verwijderen?", onSluit, onBevestig }) {
  const [bezig, setBezig] = useState(false);
  return (
    <Modal onSluit={onSluit} smal>
      <h3 className="text-[16px] font-bold text-[#2D2D2D] mb-1">{titel}</h3>
      <p className="text-[13.5px] text-[#6B6560] leading-relaxed">
        <span className="font-semibold text-[#2D2D2D]">{naam}</span> wordt definitief verwijderd.
      </p>
      <div className="flex items-center justify-end gap-2 mt-6">
        <button onClick={onSluit} className="h-10 px-4 rounded-xl text-[13.5px] font-semibold text-[#6B6560] hover:bg-[#F2EFEC] transition-colors">
          Annuleren
        </button>
        <button
          onClick={async () => { setBezig(true); await onBevestig(); setBezig(false); }}
          disabled={bezig}
          className="h-10 px-5 rounded-xl bg-[#991A21] hover:bg-[#7d151b] disabled:opacity-40 text-white text-[13.5px] font-semibold transition-colors"
        >
          {bezig ? "Verwijderen…" : "Verwijderen"}
        </button>
      </div>
    </Modal>
  );
}

// ── Herbruikbare UI-bouwstenen ──
function Modal({ children, onSluit, smal }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onSluit}>
      <div className="absolute inset-0 bg-[#2D2D2D]/40" />
      <div
        className={`relative bg-white rounded-2xl shadow-xl w-full ${smal ? "max-w-sm" : "max-w-md"} p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Veld({ label, value, onChange, type = "text", placeholder, verplicht, autoFocus, inputMode, hint }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">
        {label}
        {verplicht && <span className="text-[#991A21]"> *</span>}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full h-10 px-3 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors"
      />
      {hint && <span className="block text-[11.5px] text-[#9B958E] mt-1">{hint}</span>}
    </label>
  );
}

// ══ VvE-autocomplete (veld Algemeen › VvE) ═══════════════════════
// Filtert de meegegeven vveNamen-lijst tijdens typen. Bij geen exacte
// match (op blur) wordt gevraagd of de VvE toegevoegd moet worden aan
// public.vve_namen. Het "✕"-knopje verschijnt alleen bij namen met
// aangemaakt_door (dus niet bij de geïmporteerde basislijst) — zo kan
// een beheerder eigen typefouten opruimen zonder de officiële lijst
// per ongeluk te kunnen wissen.
function VveAutocomplete({ value, onChange, vveNamen, onNaamToevoegen, onNaamVerwijderen }) {
  const [open, setOpen] = useState(false);
  const [vraagToevoegen, setVraagToevoegen] = useState(false);
  const [bezig, setBezig] = useState(false);

  const norm = (s) => String(s || "").trim().toLowerCase();
  const lijst = Array.isArray(vveNamen) ? vveNamen : [];
  const treffers = value
    ? lijst.filter((n) => norm(n.naam).includes(norm(value))).slice(0, 8)
    : [];
  const exacteMatch = lijst.some((n) => norm(n.naam) === norm(value));

  function kies(naam) {
    onChange(naam);
    setOpen(false);
    setVraagToevoegen(false);
  }

  function afsluiten() {
    setOpen(false);
    setVraagToevoegen(Boolean(value && value.trim() && !exacteMatch));
  }

  async function toevoegen() {
    if (!onNaamToevoegen) return;
    setBezig(true);
    try {
      await onNaamToevoegen(value.trim());
    } finally {
      setBezig(false);
      setVraagToevoegen(false);
    }
  }

  async function verwijderen(e, item) {
    e.preventDefault();
    if (!onNaamVerwijderen) return;
    if (!window.confirm(`"${item.naam}" verwijderen uit de VvE-lijst?`)) return;
    await onNaamVerwijderen(item.id);
  }

  return (
    <label className="block relative">
      <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">VvE</span>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setVraagToevoegen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(afsluiten, 150)}
        placeholder="Typ om te zoeken..."
        className="w-full h-10 px-3 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors"
      />
      {open && treffers.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-[#E0D9D3] bg-white shadow-lg">
          {treffers.map((n) => (
            <div
              key={n.id}
              onMouseDown={() => kies(n.naam)}
              className="flex items-center justify-between gap-2 px-3 h-9 text-[13.5px] text-[#2D2D2D] hover:bg-[#FAF7F2] cursor-pointer"
            >
              <span className="truncate">{n.naam}</span>
              {n.aangemaakt_door && (
                <button
                  onMouseDown={(e) => verwijderen(e, n)}
                  className="shrink-0 text-[11px] text-[#8A847E] hover:text-[#991A21] px-1"
                  title="Verwijderen uit de lijst"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {vraagToevoegen && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#B07414] bg-[#FBF3E4] rounded-lg px-3 py-2">
          <span>VvE &quot;{value}&quot; komt niet voor in het systeem. Toevoegen?</span>
          <button onClick={toevoegen} disabled={bezig} className="font-semibold text-[#991A21] hover:underline shrink-0 disabled:opacity-60">
            {bezig ? "Bezig..." : "Ja, toevoegen"}
          </button>
          <button onClick={() => setVraagToevoegen(false)} className="text-[#8A847E] hover:underline shrink-0">
            Nee
          </button>
        </div>
      )}
    </label>
  );
}

// ══ Verzoeken & deadlines ════════════════════════════════════════
function legeVerzoek(beheerder) {
  return {
    adres: "", vve: "", notaris_naam: "",
    ontvangen_op: vandaagISO(), deadline: "",
    status: "open", behandelaar: beheerder || "", notities: "",
  };
}

function VerzoekenBeheer({ notarissen, beheerder }) {
  const [lijst, setLijst] = useState([]);
  const [laden, setLaden] = useState(true);
  const [form, setForm] = useState(null);
  const [teVerwijderen, setTeVerwijderen] = useState(null);
  const [toonAfgerond, setToonAfgerond] = useState(false);

  useEffect(() => { laad(); }, []);

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const rows = await _sbFetch("overdracht_verzoeken?select=*&order=deadline.asc");
      setLijst(rows || []);
    } catch (e) {
      console.error("verzoeken laden", e);
      _showToast && _showToast("Verzoeken laden mislukt.", "fout");
    }
    setLaden(false);
  }

  async function opslaan(v) {
    const payload = {
      adres: (v.adres || "").trim(),
      vve: (v.vve || "").trim() || null,
      notaris_naam: (v.notaris_naam || "").trim() || null,
      ontvangen_op: v.ontvangen_op || vandaagISO(),
      deadline: v.deadline,
      status: v.status || "open",
      behandelaar: (v.behandelaar || "").trim() || null,
      notities: (v.notities || "").trim() || null,
    };
    try {
      if (v.id) {
        await _sbFetch(`overdracht_verzoeken?id=eq.${v.id}`, {
          method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
        });
        _showToast && _showToast("Verzoek bijgewerkt.", "succes");
      } else {
        await _sbFetch("overdracht_verzoeken", {
          method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
        });
        _showToast && _showToast("Verzoek toegevoegd.", "succes");
        logEvent('overdracht_created', { module: 'overdrachten' });
      }
      setForm(null);
      await laad();
    } catch (e) {
      console.error("verzoek opslaan", e);
      _showToast && _showToast("Opslaan mislukt.", "fout");
    }
  }

  async function zetStatus(v, status) {
    try {
      await _sbFetch(`overdracht_verzoeken?id=eq.${v.id}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status }),
      });
      await laad();
    } catch (e) {
      console.error("status", e);
      _showToast && _showToast("Bijwerken mislukt.", "fout");
    }
  }

  async function verwijder(id) {
    try {
      await _sbFetch(`overdracht_verzoeken?id=eq.${id}`, { method: "DELETE" });
      _showToast && _showToast("Verzoek verwijderd.", "succes");
      setTeVerwijderen(null);
      await laad();
    } catch (e) {
      console.error("verzoek verwijderen", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  const open = lijst.filter((v) => v.status !== "afgerond");
  const afgerond = lijst.filter((v) => v.status === "afgerond");
  const teLaat = open.filter((v) => { const n = dagenTot(v.deadline); return n != null && n < 0; }).length;
  const dezeWeek = open.filter((v) => { const n = dagenTot(v.deadline); return n != null && n >= 0 && n <= 7; }).length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[17px] font-bold text-[#2D2D2D]">Verzoeken & deadlines</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">Binnengekomen overdrachten, gesorteerd op deadline.</p>
        </div>
        <button
          onClick={() => setForm(legeVerzoek(beheerder))}
          className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#991A21] hover:bg-[#7d151b] text-white text-[13.5px] font-semibold transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
          Verzoek toevoegen
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <StatChip label="Te laat" waarde={teLaat} tekst="#991A21" bg="#FDEAEB" />
        <StatChip label="Deze week" waarde={dezeWeek} tekst="#B07414" bg="#FBF3E4" />
        <StatChip label="Open" waarde={open.length} tekst="#2D2D2D" bg="#F2EFEC" />
      </div>

      {laden ? (
        <div className="text-[13.5px] text-[#8A847E] py-8">Laden…</div>
      ) : open.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DDD5CE] bg-white/50 px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-[#2D2D2D]">Geen openstaande verzoeken</p>
          <p className="text-[13px] text-[#8A847E] mt-1">Voeg een binnengekomen overdracht toe met de knop rechtsboven.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {open.map((v) => (
            <VerzoekRij key={v.id} v={v} onBewerk={() => setForm({ ...v })} onAfronden={() => zetStatus(v, "afgerond")} onVerwijder={() => setTeVerwijderen(v)} />
          ))}
        </div>
      )}

      {afgerond.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setToonAfgerond((s) => !s)} className="text-[12.5px] font-semibold text-[#8A847E] hover:text-[#2D2D2D] transition-colors">
            {toonAfgerond ? "Verberg" : "Toon"} afgerond ({afgerond.length})
          </button>
          {toonAfgerond && (
            <div className="space-y-2 mt-3">
              {afgerond.map((v) => (
                <VerzoekRij key={v.id} v={v} afgerond onHeropen={() => zetStatus(v, "open")} onVerwijder={() => setTeVerwijderen(v)} />
              ))}
            </div>
          )}
        </div>
      )}

      {form && <VerzoekForm initieel={form} notarissen={notarissen} onSluit={() => setForm(null)} onOpslaan={opslaan} />}
      {teVerwijderen && (
        <BevestigVerwijderen naam={teVerwijderen.adres} titel="Verzoek verwijderen?" onSluit={() => setTeVerwijderen(null)} onBevestig={() => verwijder(teVerwijderen.id)} />
      )}
    </div>
  );
}

function StatChip({ label, waarde, tekst, bg }) {
  return (
    <div className="rounded-xl px-4 py-2.5 min-w-[92px]" style={{ backgroundColor: bg }}>
      <div className="text-[20px] font-bold leading-none" style={{ color: tekst }}>{waarde}</div>
      <div className="text-[11.5px] font-medium mt-1" style={{ color: tekst }}>{label}</div>
    </div>
  );
}

function VerzoekRij({ v, afgerond, onBewerk, onAfronden, onHeropen, onVerwijder }) {
  const info = deadlineInfo(v.deadline);
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${afgerond ? "border-[#EAE5DF] bg-[#FAF8F5]" : "border-[#E7E2DB] bg-white"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-[14.5px] font-bold ${afgerond ? "text-[#9B958E] line-through" : "text-[#2D2D2D]"}`}>{v.adres}</span>
          {v.vve && <span className="text-[12.5px] text-[#8A847E]">· {v.vve}</span>}
        </div>
        <p className="text-[12px] text-[#9B958E] mt-0.5">
          {[v.notaris_naam, `binnen: ${fmtDatumISO(v.ontvangen_op)}`, `deadline: ${fmtDatumISO(v.deadline)}`, v.behandelaar].filter(Boolean).join("  ·  ")}
        </p>
        {v.notities && <p className="text-[12px] text-[#8A847E] mt-1">{v.notities}</p>}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {!afgerond ? (
          <span className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: info.tekst, backgroundColor: info.bg }}>
            {info.label}
          </span>
        ) : (
          <span className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-[#2D6A4F] bg-[#EAF4EE]">afgerond</span>
        )}
        <div className="flex items-center gap-1">
          {!afgerond && (
            <button onClick={onAfronden} title="Markeer als afgerond" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#EAF4EE] hover:text-[#2D6A4F] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
          )}
          {afgerond && (
            <button onClick={onHeropen} title="Heropenen" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#F2EFEC] hover:text-[#991A21] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v5h5" /></svg>
            </button>
          )}
          {onBewerk && (
            <button onClick={onBewerk} title="Bewerken" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#F2EFEC] hover:text-[#991A21] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
          )}
          <button onClick={onVerwijder} title="Verwijderen" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#FDEAEB] hover:text-[#991A21] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function VerzoekForm({ initieel, notarissen, onSluit, onOpslaan }) {
  const [v, setV] = useState(initieel);
  const [bezig, setBezig] = useState(false);
  const set = (veld) => (waarde) => setV((prev) => ({ ...prev, [veld]: waarde }));
  const geldig = (v.adres || "").trim().length > 0 && !!v.deadline;
  const inputCls = "w-full h-10 px-3 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors";

  async function bewaar() {
    if (!geldig || bezig) return;
    setBezig(true);
    await onOpslaan(v);
    setBezig(false);
  }

  return (
    <Modal onSluit={onSluit}>
      <h3 className="text-[17px] font-bold text-[#2D2D2D] mb-4">{v.id ? "Verzoek bewerken" : "Nieuw verzoek"}</h3>
      <div className="space-y-3">
        <Veld label="Adres / pand" value={v.adres} onChange={set("adres")} verplicht autoFocus placeholder="van Sevenbergestraat 39 te Voorburg" />
        <Veld label="VvE" value={v.vve} onChange={set("vve")} placeholder="Optioneel" />
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Notaris</span>
          <select value={v.notaris_naam || ""} onChange={(e) => set("notaris_naam")(e.target.value)} className={inputCls}>
            <option value="">— Onbekend / n.v.t. —</option>
            {notarissen.map((n) => (<option key={n.id} value={n.naam}>{n.naam}</option>))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Ontvangen op" type="date" value={v.ontvangen_op} onChange={set("ontvangen_op")} />
          <Veld label="Deadline" type="date" value={v.deadline} onChange={set("deadline")} verplicht />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Behandelaar" value={v.behandelaar} onChange={set("behandelaar")} placeholder="Optioneel" />
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Status</span>
            <select value={v.status || "open"} onChange={(e) => set("status")(e.target.value)} className={inputCls}>
              <option value="open">Open</option>
              <option value="afgerond">Afgerond</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Notities</span>
          <textarea
            value={v.notities || ""}
            onChange={(e) => set("notities")(e.target.value)}
            rows={2}
            placeholder="Optioneel"
            className="w-full px-3 py-2 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors resize-none"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 mt-6">
        <button onClick={onSluit} className="h-10 px-4 rounded-xl text-[13.5px] font-semibold text-[#6B6560] hover:bg-[#F2EFEC] transition-colors">Annuleren</button>
        <button onClick={bewaar} disabled={!geldig || bezig} className="h-10 px-5 rounded-xl bg-[#991A21] hover:bg-[#7d151b] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13.5px] font-semibold transition-colors">
          {bezig ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </Modal>
  );
}

function Placeholder({ titel, tekst }) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-[#B07414]" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#B07414]">Wordt gebouwd</span>
      </div>
      <h2 className="text-[17px] font-bold text-[#2D2D2D] mb-2">{titel}</h2>
      <p className="text-[13.5px] leading-relaxed text-[#6B6560]">{tekst}</p>
    </div>
  );
}
