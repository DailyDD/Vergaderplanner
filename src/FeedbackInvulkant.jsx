import React, { useState, useEffect, useMemo } from "react";
import { logEvent } from './telemetry';

// ── Feedback & Communicatie — invulkant (beheerders) ─────────────
// De kant die gewone beheerders zien:
//   1. FeedbackOverlay  — modal-queue op het dashboard: eerst ongelezen
//      berichten, dan openstaande enquêtes. Blocking of wegklikbaar per enquête.
//   2. Ideeenbox        — eigen scherm: ideeën bekijken, indienen, upvoten.
//
// Schrijfacties lopen via de RPC's submit_enquete / submit_idee en directe
// inserts op bericht_gelezen / idee_stemmen. Autorisatie server-side (RLS).
//
// Deps geïnjecteerd vanuit App.jsx via
// initFeedbackInvulDeps({ sbFetch, showToast, getUid }).

let _sbFetch = null;
let _showToast = null;
let _getUid = null;
export function initFeedbackInvulDeps({ sbFetch, showToast, getUid }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
  _getUid = getUid;
}

// Wegklikbare enquêtes die de gebruiker deze sessie op "later" heeft gezet.
// Blijft binnen de paginasessie bestaan (reset bij reload). Blocking-enquêtes
// komen hier nooit in — die moeten blijven terugkomen tot ze ingevuld zijn.
const sessieGesloten = new Set();

const vandaagISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Valt vandaag binnen de (optionele) looptijd?
function binnenLooptijd(x) {
  const nu = vandaagISO();
  if (x.start_datum && nu < x.start_datum) return false;
  if (x.eind_datum && nu > x.eind_datum) return false;
  return true;
}

// ══ OVERLAY: berichten + enquêtes als queue ══════════════════════
export function FeedbackOverlay({ actief }) {
  const [laden, setLaden] = useState(true);
  const [queue, setQueue] = useState([]); // [{soort:'bericht'|'enquete', data, vragen?}]
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!actief || !_sbFetch) return;
    let afgebroken = false;
    (async () => {
      setLaden(true);
      try {
        const uid = _getUid ? _getUid() : null;
        const [berichten, gelezen, enquetes, responses, ideeUpdates] = await Promise.all([
          _sbFetch("berichten?status=eq.gepubliceerd&select=*&order=created_at.asc"),
          _sbFetch("bericht_gelezen?select=bericht_id"),
          _sbFetch("enquetes?status=eq.gepubliceerd&select=*&order=created_at.asc"),
          _sbFetch("enquete_responses?select=enquete_id"),
          uid ? _sbFetch(`ideeen?ingediend_door=eq.${uid}&status_ongelezen=eq.true&select=*`) : Promise.resolve([]),
        ]);
        const gelezenIds = new Set((gelezen || []).map((g) => g.bericht_id));
        const ingevuldIds = new Set((responses || []).map((r) => r.enquete_id));

        const openBerichten = (berichten || [])
          .filter((b) => !gelezenIds.has(b.id) && binnenLooptijd(b))
          .map((b) => ({ soort: "bericht", data: b }));

        const ideeStatusItems = (ideeUpdates || []).map((i) => ({ soort: "idee_status", data: i }));

        const openEnquetes = (enquetes || []).filter(
          (e) => !ingevuldIds.has(e.id) && binnenLooptijd(e) && !sessieGesloten.has(e.id)
        );

        // Vragen ophalen voor de open enquêtes
        const metVragen = [];
        for (const e of openEnquetes) {
          const vragen = await _sbFetch(`enquete_vragen?enquete_id=eq.${e.id}&select=*&order=volgorde.asc`);
          metVragen.push({ soort: "enquete", data: e, vragen: vragen || [] });
        }

        if (!afgebroken) {
          // Berichten eerst (kort), dan je eigen idee-updates (persoonlijk,
          // ook kort), dan enquêtes (kost tijd — die laatste in de rij).
          setQueue([...openBerichten, ...ideeStatusItems, ...metVragen]);
          setIdx(0);
          setLaden(false);
        }
      } catch (e) {
        console.error("feedback overlay laden", e);
        if (!afgebroken) setLaden(false);
      }
    })();
    return () => { afgebroken = true; };
  }, [actief]);

  if (!actief || laden || queue.length === 0 || idx >= queue.length) return null;

  const huidig = queue[idx];
  const volgende = () => setIdx((i) => i + 1);

  return huidig.soort === "bericht" ? (
    <BerichtModal bericht={huidig.data} onKlaar={volgende} />
  ) : huidig.soort === "idee_status" ? (
    <IdeeStatusModal idee={huidig.data} onKlaar={volgende} />
  ) : (
    <EnqueteModal enquete={huidig.data} vragen={huidig.vragen} onKlaar={volgende} />
  );
}

function BerichtModal({ bericht, onKlaar }) {
  const [bezig, setBezig] = useState(false);
  async function markeerGelezen() {
    setBezig(true);
    try {
      await _sbFetch("bericht_gelezen", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ bericht_id: bericht.id }),
      });
    } catch (e) {
      // Al gelezen (unique) of netwerkfout: hoe dan ook doorgaan, niet blokkeren
      console.error("bericht gelezen", e);
    }
    setBezig(false);
    onKlaar();
  }
  return (
    <Overlay>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl">
        <div className="h-1.5 bg-[#991A21]" />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FBEAEB]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#991A21" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#991A21]">Mededeling</span>
          </div>
          <h2 className="text-[17px] font-bold text-[#2D2D2D] mb-2">{bericht.titel}</h2>
          <p className="text-[13.5px] text-[#5A5550] leading-relaxed whitespace-pre-wrap">{bericht.inhoud}</p>
          <div className="flex justify-end mt-6">
            <button
              onClick={markeerGelezen}
              disabled={bezig}
              className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors disabled:opacity-50"
            >
              {bezig ? "Even geduld…" : "Gelezen"}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function IdeeStatusModal({ idee, onKlaar }) {
  const [bezig, setBezig] = useState(false);
  const st = IDEE_STATUS[idee.status] || IDEE_STATUS.ontvangen;
  async function markeerGezien() {
    setBezig(true);
    try {
      await _sbFetch(`ideeen?id=eq.${idee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status_ongelezen: false }),
      });
    } catch (e) {
      // Netwerkfout: niet blokkeren, komt volgende keer gewoon terug.
      console.error("idee status_ongelezen", e);
    }
    setBezig(false);
    onKlaar();
  }
  return (
    <Overlay>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl">
        <div className="h-1.5 bg-[#991A21]" />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FBEAEB]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#991A21" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#991A21]">Update op je idee</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h2 className="text-[17px] font-bold text-[#2D2D2D]">{idee.titel}</h2>
            <Badge {...st} />
          </div>
          <p className="text-[13.5px] text-[#5A5550] leading-relaxed">
            De status van je idee is gewijzigd naar <strong>{st.label}</strong>.
          </p>
          {idee.status_reden && (
            <p className="text-[12.5px] text-[#5A5550] mt-3 bg-[#FAF8F5] border border-[#F2EFEC] rounded-lg px-3 py-2">
              <span className="font-semibold">Reactie beheer:</span> {idee.status_reden}
            </p>
          )}
          <div className="flex justify-end mt-6">
            <button
              onClick={markeerGezien}
              disabled={bezig}
              className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors disabled:opacity-50"
            >
              {bezig ? "Even geduld…" : "Gezien"}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function EnqueteModal({ enquete, vragen, onKlaar }) {
  const [antwoorden, setAntwoorden] = useState({}); // vraag_id -> waarde
  const [bezig, setBezig] = useState(false);

  const setAntw = (vraagId, waarde) => setAntwoorden((p) => ({ ...p, [vraagId]: waarde }));

  function ontbrekend() {
    for (const v of vragen) {
      if (!v.verplicht) continue;
      const a = antwoorden[v.id];
      if (v.type === "keuze_meer") { if (!a || a.length === 0) return v; }
      else if (a === undefined || a === null || a === "") return v;
    }
    return null;
  }

  function bouwPayload() {
    return vragen.map((v) => {
      const a = antwoorden[v.id];
      const entry = { vraag_id: v.id, tekst: null, getal: null, opties: [] };
      if (v.type === "sterren" || v.type === "schaal10") entry.getal = a ?? null;
      else if (v.type === "keuze_enkel") entry.opties = a ? [a] : [];
      else if (v.type === "keuze_meer") entry.opties = a || [];
      else if (v.type === "janee") entry.tekst = a || null;
      else if (v.type === "open") entry.tekst = a || null;
      return entry;
    });
  }

  async function verstuur() {
    const mis = ontbrekend();
    if (mis) { _showToast && _showToast("Beantwoord eerst alle verplichte vragen.", "fout"); return; }
    setBezig(true);
    try {
      await _sbFetch("rpc/submit_enquete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_enquete_id: enquete.id, p_antwoorden: bouwPayload() }),
      });
      _showToast && _showToast("Bedankt voor je reactie.", "succes");
      onKlaar();
    } catch (e) {
      console.error("enquête versturen", e);
      // "Al ingevuld" kan voorkomen als de gebruiker 'm in een ander tabblad al deed
      const melding = String(e.message || "").includes("Al ingevuld") ? "Je hebt deze al ingevuld." : "Versturen mislukt. Probeer opnieuw.";
      _showToast && _showToast(melding, String(e.message || "").includes("Al ingevuld") ? "succes" : "fout");
      if (String(e.message || "").includes("Al ingevuld")) onKlaar();
    }
    setBezig(false);
  }

  function later() {
    sessieGesloten.add(enquete.id);
    onKlaar();
  }

  return (
    <Overlay>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden shadow-xl">
        <div className="h-1.5 bg-[#991A21] shrink-0" />
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-[#F2EFEC]">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FBEAEB]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#991A21" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#991A21]">
              Enquête{enquete.anoniem ? " · anoniem" : ""}
            </span>
          </div>
          <h2 className="text-[17px] font-bold text-[#2D2D2D]">{enquete.titel}</h2>
          {enquete.omschrijving && <p className="text-[12.5px] text-[#8A847E] mt-1">{enquete.omschrijving}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {vragen.map((v, i) => (
            <VraagInvul key={v.id} index={i} vraag={v} waarde={antwoorden[v.id]} onChange={(w) => setAntw(v.id, w)} />
          ))}
        </div>

        <div className="px-6 py-4 border-t border-[#F2EFEC] shrink-0 flex items-center justify-between gap-3">
          {enquete.blocking ? (
            <span className="text-[11.5px] text-[#A8A29C]">Deze enquête is verplicht.</span>
          ) : (
            <button onClick={later} className="text-[12.5px] font-semibold text-[#8A847E] hover:text-[#2D2D2D] transition-colors">
              Later invullen
            </button>
          )}
          <button
            onClick={verstuur}
            disabled={bezig}
            className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors disabled:opacity-50"
          >
            {bezig ? "Versturen…" : "Versturen"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function VraagInvul({ index, vraag, waarde, onChange }) {
  return (
    <div>
      <p className="text-[13.5px] font-semibold text-[#2D2D2D] mb-2">
        <span className="text-[#A8A29C] mr-1.5">{index + 1}.</span>{vraag.vraag}
        {vraag.verplicht && <span className="text-[#991A21] ml-1">*</span>}
      </p>

      {vraag.type === "sterren" && <Sterren waarde={waarde} onChange={onChange} />}
      {vraag.type === "schaal10" && <Schaal10 waarde={waarde} onChange={onChange} />}
      {vraag.type === "janee" && <JaNee waarde={waarde} onChange={onChange} />}
      {vraag.type === "open" && (
        <textarea
          value={waarde || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Je antwoord…"
          className="w-full rounded-lg border border-[#E0DAD2] px-3 py-2 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] resize-none"
        />
      )}
      {vraag.type === "keuze_enkel" && (
        <div className="space-y-1.5">
          {(vraag.opties || []).map((o) => (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`w-full text-left px-3.5 h-10 rounded-lg border text-[13px] transition-colors flex items-center gap-2.5 ${
                waarde === o ? "border-[#991A21] bg-[#FBEAEB] text-[#991A21] font-semibold" : "border-[#E0DAD2] text-[#5A5550] hover:border-[#B8B2AC]"
              }`}
            >
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${waarde === o ? "border-[#991A21]" : "border-[#C8C2BB]"}`}>
                {waarde === o && <span className="w-2 h-2 rounded-full bg-[#991A21]" />}
              </span>
              {o}
            </button>
          ))}
        </div>
      )}
      {vraag.type === "keuze_meer" && (
        <div className="space-y-1.5">
          {(vraag.opties || []).map((o) => {
            const aan = (waarde || []).includes(o);
            return (
              <button
                key={o}
                onClick={() => onChange(aan ? (waarde || []).filter((x) => x !== o) : [...(waarde || []), o])}
                className={`w-full text-left px-3.5 h-10 rounded-lg border text-[13px] transition-colors flex items-center gap-2.5 ${
                  aan ? "border-[#991A21] bg-[#FBEAEB] text-[#991A21] font-semibold" : "border-[#E0DAD2] text-[#5A5550] hover:border-[#B8B2AC]"
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${aan ? "border-[#991A21] bg-[#991A21]" : "border-[#C8C2BB]"}`}>
                  {aan && <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                {o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sterren({ waarde, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const actief = n <= (hover || waarde || 0);
        return (
          <button key={n} onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} className="transition-transform hover:scale-110">
            <svg viewBox="0 0 24 24" fill={actief ? "#991A21" : "none"} stroke={actief ? "#991A21" : "#C8C2BB"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function Schaal10({ waarde, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-9 h-9 rounded-lg border text-[13px] font-semibold transition-colors ${
            waarde === n ? "border-[#991A21] bg-[#991A21] text-white" : "border-[#E0DAD2] text-[#5A5550] hover:border-[#991A21]"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function JaNee({ waarde, onChange }) {
  return (
    <div className="flex gap-2">
      {[{ k: "ja", l: "Ja" }, { k: "nee", l: "Nee" }].map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={`flex-1 h-10 rounded-lg border text-[13px] font-semibold transition-colors ${
            waarde === o.k ? "border-[#991A21] bg-[#FBEAEB] text-[#991A21]" : "border-[#E0DAD2] text-[#5A5550] hover:border-[#B8B2AC]"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ══ IDEEËNBOX (scherm voor alle beheerders) ══════════════════════
const IDEE_STATUS = {
  ontvangen: { label: "Ontvangen", tekst: "#8A847E", bg: "#F2EFEC" },
  gepland: { label: "Gepland", tekst: "#8A6D1A", bg: "#FBF3E0" },
  live: { label: "Live", tekst: "#2D6A4F", bg: "#EAF4EE" },
  afgewezen: { label: "Afgewezen", tekst: "#991A21", bg: "#FBEAEB" },
};
const MAANDEN_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function fmtDatum(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MAANDEN_NL[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Ideeenbox({ onTerug }) {
  const [ideeen, setIdeeen] = useState([]);
  const [stemMap, setStemMap] = useState({}); // idee_id -> aantal
  const [mijnStemmen, setMijnStemmen] = useState(new Set());
  const [laden, setLaden] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const uid = _getUid ? _getUid() : null;

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const [rows, stemmen] = await Promise.all([
        _sbFetch("ideeen?select=*&order=created_at.desc"),
        _sbFetch("idee_stemmen?select=idee_id,user_id"),
      ]);
      setIdeeen(rows || []);
      const map = {};
      const mijn = new Set();
      (stemmen || []).forEach((s) => {
        map[s.idee_id] = (map[s.idee_id] || 0) + 1;
        if (uid && s.user_id === uid) mijn.add(s.idee_id);
      });
      setStemMap(map);
      setMijnStemmen(mijn);
    } catch (e) {
      console.error("ideeenbox laden", e);
      _showToast && _showToast("Ideeën laden mislukt.", "fout");
    }
    setLaden(false);
  }
  useEffect(() => { laad(); }, []);

  async function toggleStem(ideeId) {
    const had = mijnStemmen.has(ideeId);
    // Optimistisch bijwerken
    setMijnStemmen((p) => { const n = new Set(p); had ? n.delete(ideeId) : n.add(ideeId); return n; });
    setStemMap((p) => ({ ...p, [ideeId]: (p[ideeId] || 0) + (had ? -1 : 1) }));
    try {
      if (had) {
        await _sbFetch(`idee_stemmen?idee_id=eq.${ideeId}&user_id=eq.${uid}`, { method: "DELETE" });
      } else {
        await _sbFetch("idee_stemmen", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ idee_id: ideeId }) });
      }
    } catch (e) {
      console.error("stem", e);
      _showToast && _showToast("Stem opslaan mislukt.", "fout");
      await laad(); // herstel bij fout
    }
  }

  const gesorteerd = useMemo(
    () => [...ideeen].sort((a, b) => (stemMap[b.id] || 0) - (stemMap[a.id] || 0)),
    [ideeen, stemMap]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-[#E7E2DB] px-6 lg:px-8 pt-5 pb-4">
        <button onClick={onTerug} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m15 18-6-6 6-6" /></svg>
          Terug naar dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[#2D2D2D] leading-tight">Ideeënbox</h1>
            <p className="text-[13px] text-[#8A847E] mt-0.5">Deel je idee voor het portaal en stem op ideeën van collega's.</p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
            Nieuw idee
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-8">
        <div className="max-w-3xl">
          {laden ? (
            <p className="text-[13px] text-[#8A847E]">Laden…</p>
          ) : gesorteerd.length === 0 ? (
            <div className="bg-white border border-dashed border-[#D8D2CB] rounded-xl py-12 text-center">
              <p className="text-[13px] text-[#A8A29C]">Nog geen ideeën. Wees de eerste — deel wat het portaal beter maakt.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gesorteerd.map((idee) => {
                const st = IDEE_STATUS[idee.status] || IDEE_STATUS.ontvangen;
                const stemmen = stemMap[idee.id] || 0;
                const gestemd = mijnStemmen.has(idee.id);
                return (
                  <div key={idee.id} className="bg-white border border-[#E7E2DB] rounded-xl p-4 flex items-start gap-3">
                    <button
                      onClick={() => toggleStem(idee.id)}
                      className={`shrink-0 w-12 rounded-lg border flex flex-col items-center justify-center py-2 transition-colors ${
                        gestemd ? "border-[#991A21] bg-[#FBEAEB]" : "border-[#E7E2DB] hover:border-[#991A21]"
                      }`}
                      title={gestemd ? "Stem intrekken" : "Stem op dit idee"
                      }
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke={gestemd ? "#991A21" : "#8A847E"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m18 15-6-6-6 6" /></svg>
                      <span className={`text-[14px] font-bold leading-none mt-1 ${gestemd ? "text-[#991A21]" : "text-[#2D2D2D]"}`}>{stemmen}</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold text-[#2D2D2D]">{idee.titel}</span>
                        <Badge {...st} />
                      </div>
                      {idee.omschrijving && <p className="text-[12.5px] text-[#5A5550] mt-1">{idee.omschrijving}</p>}
                      <p className="text-[11.5px] text-[#A8A29C] mt-1.5">
                        {idee.anoniem ? "Anoniem" : (idee.ingediend_naam || "Onbekend")} · {fmtDatum(idee.created_at)}
                      </p>
                      {idee.status_reden && (
                        <p className="text-[12px] text-[#8A847E] mt-2 bg-[#FAF8F5] border border-[#F2EFEC] rounded-lg px-3 py-1.5">
                          <span className="font-semibold">Reactie beheer:</span> {idee.status_reden}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {formOpen && <IdeeForm onSluit={() => setFormOpen(false)} onIngediend={async () => { setFormOpen(false); await laad(); }} />}
    </div>
  );
}

function IdeeForm({ onSluit, onIngediend }) {
  const [titel, setTitel] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [anoniem, setAnoniem] = useState(false);
  const [bezig, setBezig] = useState(false);

  async function indienen() {
    if (!titel.trim()) { _showToast && _showToast("Geef je idee een titel.", "fout"); return; }
    setBezig(true);
    try {
      await _sbFetch("rpc/submit_idee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_titel: titel.trim(), p_omschrijving: omschrijving.trim() || null, p_anoniem: anoniem }),
      });
      if (!anoniem) logEvent('feedback_submitted', { module: 'ideeenbox' });
      _showToast && _showToast("Bedankt, je idee is ingediend.", "succes");
      onIngediend && (await onIngediend());
    } catch (e) {
      console.error("idee indienen", e);
      _showToast && _showToast("Indienen mislukt. Probeer opnieuw.", "fout");
    }
    setBezig(false);
  }

  return (
    <Overlay onSluit={onSluit}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-[#991A21]" />
        <div className="p-6">
          <h2 className="text-[16px] font-bold text-[#2D2D2D] mb-4">Nieuw idee</h2>
          <label className="block text-[12.5px] font-semibold text-[#5A5550] mb-1">Titel <span className="text-[#991A21]">*</span></label>
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            autoFocus
            placeholder="Kort en krachtig"
            className="w-full rounded-lg border border-[#E0DAD2] px-3 h-10 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] mb-3"
          />
          <label className="block text-[12.5px] font-semibold text-[#5A5550] mb-1">Toelichting</label>
          <textarea
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            rows={4}
            placeholder="Wat zou je willen en waarom helpt het?"
            className="w-full rounded-lg border border-[#E0DAD2] px-3 py-2 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] resize-none mb-3"
          />
          <button onClick={() => setAnoniem((v) => !v)} className="flex items-start gap-2.5 text-left mb-1">
            <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${anoniem ? "bg-[#991A21]" : "bg-[#D8D2CB]"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${anoniem ? "left-[18px]" : "left-0.5"}`} />
            </span>
            <span>
              <span className="block text-[12.5px] font-semibold text-[#2D2D2D] leading-tight">Anoniem indienen</span>
              <span className="block text-[11px] text-[#A8A29C] leading-tight mt-0.5">Je naam wordt niet opgeslagen. Je kunt dit idee daarna niet als 'van jou' terugzien.</span>
            </span>
          </button>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onSluit} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-[#6B6560] hover:text-[#2D2D2D] transition-colors">Annuleren</button>
            <button onClick={indienen} disabled={bezig} className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors disabled:opacity-50">
              {bezig ? "Indienen…" : "Idee indienen"}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ══ Gedeeld ══════════════════════════════════════════════════════
function Overlay({ children, onSluit }) {
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={onSluit}>
      {children}
    </div>
  );
}

function Badge({ label, tekst, bg }) {
  return <span className="inline-flex items-center px-2 h-5 rounded text-[10.5px] font-bold" style={{ color: tekst, background: bg }}>{label}</span>;
}
