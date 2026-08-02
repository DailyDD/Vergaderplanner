import React, { useState, useEffect, useMemo } from "react";

// ── Aannemers ──────────────────────────────────────────────────
// Gedeelde database van aannemers/vakmensen. Alle beheerders kunnen zoeken
// op werkzaamheid en de teller ophogen bij gebruik; alleen admin/hoofd_admin
// mag aannemers toevoegen, bewerken of verwijderen (afgedwongen via RLS +
// kan_aannemers_beheren(), UI-knoppen zijn hier alleen een spiegel daarvan).
//
// Vereist voor gebruik in App.jsx:
// initAannemersDeps({ sbFetch, showToast }).

let _sbFetch = null;
let _showToast = null;
export function initAannemersDeps({ sbFetch, showToast }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
}

export const SPECIALISMEN = [
  "Loodgieter/sanitair", "Elektra", "Dakdekker", "Lift", "Schilder", "Timmerman",
  "Metselaar/gevel", "Schoonmaak", "Tuin/groen", "Slotenmaker", "Glaszetter",
  "Stukadoor", "Vloeren", "Brandveiligheid", "Riolering/ontstopping",
  "CV/verwarming", "Ventilatie", "Isolatie", "Verhuizer/ontruiming",
  "Schoorsteenveger", "Beveiliging", "Overig",
];

function legeAannemer() {
  return {
    naam: "", contactpersoon: "", telefoon: "", email: "",
    werkgebied: "", specialismen: [], notities: "", status: "actief",
  };
}

function fmtDatumKort(iso) {
  if (!iso) return "nooit";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default function Aannemers({ onTerug, magBewerken }) {
  const [lijst, setLijst] = useState([]);
  const [laden, setLaden] = useState(true);
  const [zoek, setZoek] = useState("");
  const [werkgebiedFilter, setWerkgebiedFilter] = useState("");
  const [toonInactief, setToonInactief] = useState(false);
  const [form, setForm] = useState(null);
  const [teVerwijderen, setTeVerwijderen] = useState(null);

  useEffect(() => { laad(); }, []);

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const rows = await _sbFetch("aannemers?select=*&order=naam.asc");
      setLijst(rows || []);
    } catch (e) {
      console.error("aannemers laden", e);
      _showToast && _showToast("Aannemers laden mislukt.", "fout");
    }
    setLaden(false);
  }

  async function opslaan(a) {
    const payload = {
      naam: (a.naam || "").trim(),
      contactpersoon: (a.contactpersoon || "").trim() || null,
      telefoon: (a.telefoon || "").trim() || null,
      email: (a.email || "").trim() || null,
      werkgebied: (a.werkgebied || "").trim() || null,
      specialismen: a.specialismen || [],
      notities: (a.notities || "").trim() || null,
      status: a.status || "actief",
    };
    try {
      if (a.id) {
        await _sbFetch(`aannemers?id=eq.${a.id}`, {
          method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
        });
        _showToast && _showToast("Aannemer bijgewerkt.", "succes");
      } else {
        await _sbFetch("aannemers", {
          method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
        });
        _showToast && _showToast("Aannemer toegevoegd.", "succes");
      }
      setForm(null);
      await laad();
    } catch (e) {
      console.error("aannemer opslaan", e);
      _showToast && _showToast("Opslaan mislukt. Check of je bewerkrechten hebt.", "fout");
    }
  }

  async function verwijder(id) {
    try {
      await _sbFetch(`aannemers?id=eq.${id}`, { method: "DELETE" });
      _showToast && _showToast("Aannemer verwijderd.", "succes");
      setTeVerwijderen(null);
      await laad();
    } catch (e) {
      console.error("aannemer verwijderen", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  // Gebruik registreren: elke ingelogde beheerder mag dit, los van magBewerken.
  // Loopt via de smalle RPC-functie, niet via een directe PATCH.
  async function registreerGebruik(a) {
    try {
      await _sbFetch("rpc/aannemer_registreer_gebruik", {
        method: "POST", body: JSON.stringify({ p_id: a.id }),
      });
      setLijst((prev) => prev.map((x) => x.id === a.id
        ? { ...x, teller: (x.teller || 0) + 1, laatst_gebruikt: new Date().toISOString() }
        : x));
      _showToast && _showToast(`Gebruik van ${a.naam} geregistreerd.`, "succes");
    } catch (e) {
      console.error("gebruik registreren", e);
      _showToast && _showToast("Registreren mislukt.", "fout");
    }
  }

  const werkgebieden = useMemo(() => {
    const set = new Set(lijst.map((a) => (a.werkgebied || "").trim()).filter(Boolean));
    return [...set].sort();
  }, [lijst]);

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return lijst
      .filter((a) => toonInactief || a.status !== "inactief")
      .filter((a) => !werkgebiedFilter || a.werkgebied === werkgebiedFilter)
      .filter((a) => {
        if (!q) return true;
        const inSpecialismen = (a.specialismen || []).some((s) => s.toLowerCase().includes(q));
        const inNaam = (a.naam || "").toLowerCase().includes(q);
        const inNotities = (a.notities || "").toLowerCase().includes(q);
        return inSpecialismen || inNaam || inNotities;
      })
      .sort((a, b) => (b.teller || 0) - (a.teller || 0) || a.naam.localeCompare(b.naam));
  }, [lijst, zoek, werkgebiedFilter, toonInactief]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Standaard topbar */}
      <div className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 bg-white border-b border-[#E7E2DB]">
        <div className="flex items-center gap-[11px]">
          <div className="w-[3px] h-[22px] bg-[#991A21] rounded-[2px]" />
          <span className="text-[#991A21] flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px]">
              <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2z" />
            </svg>
          </span>
          <span className="text-[14px] font-bold text-[#2D2D2D]">Aannemers</span>
        </div>
        <button
          onClick={onTerug}
          className="inline-flex items-center gap-1.5 text-[12.5px] px-[13px] py-[7px] bg-white border border-[#E7E2DB] rounded-[9px] text-[#6B6560] hover:border-[#991A21] hover:text-[#991A21] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Terug naar portaal
        </button>
      </div>

      {/* Zoek- en filterbalk */}
      <div className="bg-white border-b border-[#E7E2DB] px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px] absolute left-3 top-1/2 -translate-y-1/2 text-[#9B958E]">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Typ een werkzaamheid, bijv. 'lekkage' of 'dak'…"
              className="w-full h-10 pl-9 pr-3 text-[13.5px] border border-[#E7E2DB] rounded-lg focus:outline-none focus:border-[#991A21] transition-colors"
            />
          </div>

          <select
            value={werkgebiedFilter}
            onChange={(e) => setWerkgebiedFilter(e.target.value)}
            className="h-10 px-3 text-[13px] border border-[#E7E2DB] rounded-lg text-[#2D2D2D] focus:outline-none focus:border-[#991A21]"
          >
            <option value="">Alle werkgebieden</option>
            {werkgebieden.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>

          <label className="flex items-center gap-2 text-[12.5px] text-[#6B6560] select-none cursor-pointer">
            <input type="checkbox" checked={toonInactief} onChange={(e) => setToonInactief(e.target.checked)} className="accent-[#991A21]" />
            Toon inactieve aannemers
          </label>

          {magBewerken && (
            <button
              onClick={() => setForm(legeAannemer())}
              className="sm:ml-auto inline-flex items-center gap-1.5 h-10 px-4 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13px] font-semibold rounded-lg transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
              Aannemer toevoegen
            </button>
          )}
        </div>

        {/* Specialisme-snelfilters */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SPECIALISMEN.slice(0, 10).map((s) => (
            <button
              key={s}
              onClick={() => setZoek(zoek === s ? "" : s)}
              className={`px-2.5 py-1 text-[11.5px] font-medium rounded-full border transition-colors ${
                zoek === s
                  ? "bg-[#991A21] border-[#991A21] text-white"
                  : "bg-white border-[#E7E2DB] text-[#6B6560] hover:border-[#991A21] hover:text-[#991A21]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Resultaten */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        {laden ? (
          <p className="text-[13px] text-[#9B958E]">Aannemers laden…</p>
        ) : gefilterd.length === 0 ? (
          <div className="bg-white border border-[#E7E2DB] rounded-xl px-8 py-10 text-center">
            <p className="text-[14px] font-semibold text-[#2D2D2D]">Geen aannemers gevonden</p>
            <p className="text-[13px] text-[#8A847E] mt-1">
              {zoek || werkgebiedFilter ? "Pas je zoekterm of filter aan." : "Nog geen aannemers geregistreerd."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {gefilterd.map((a) => (
              <AannemerKaart
                key={a.id}
                a={a}
                magBewerken={magBewerken}
                onGebruik={() => registreerGebruik(a)}
                onBewerk={() => setForm(a)}
                onVerwijder={() => setTeVerwijderen(a)}
              />
            ))}
          </div>
        )}
      </div>

      {form && (
        <AannemerFormulier
          aannemer={form}
          onOpslaan={opslaan}
          onSluiten={() => setForm(null)}
        />
      )}

      {teVerwijderen && (
        <BevestigVerwijderen
          titel={`Aannemer "${teVerwijderen.naam}" verwijderen?`}
          onBevestig={() => verwijder(teVerwijderen.id)}
          onAnnuleer={() => setTeVerwijderen(null)}
        />
      )}
    </div>
  );
}

function AannemerKaart({ a, magBewerken, onGebruik, onBewerk, onVerwijder }) {
  const inactief = a.status === "inactief";
  return (
    <div className={`bg-white border rounded-xl p-4 ${inactief ? "border-[#E7E2DB] opacity-60" : "border-[#E7E2DB]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14.5px] font-bold text-[#2D2D2D] truncate">{a.naam}</p>
            {inactief && <span className="shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-[#F2EFEC] text-[#8A847E]">inactief</span>}
          </div>
          {a.contactpersoon && <p className="text-[12.5px] text-[#8A847E] mt-0.5">{a.contactpersoon}</p>}
        </div>
        {(a.teller || 0) > 0 && (
          <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-[#EAF4EE] text-[#2D6A4F]">
            {a.teller}× gebruikt
          </span>
        )}
      </div>

      {(a.specialismen || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {a.specialismen.map((s) => (
            <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F2EFEC] text-[#6B6560]">{s}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12.5px] text-[#6B6560]">
        {a.telefoon && <span>{a.telefoon}</span>}
        {a.email && <span className="truncate">{a.email}</span>}
        {a.werkgebied && <span>{a.werkgebied}</span>}
      </div>

      {a.notities && <p className="text-[12.5px] text-[#8A847E] mt-2 leading-snug">{a.notities}</p>}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#EFEBE4]">
        <span className="text-[11.5px] text-[#9B958E]">Laatst gebruikt: {fmtDatumKort(a.laatst_gebruikt)}</span>
        <div className="flex items-center gap-1.5">
          {magBewerken && (
            <>
              <button onClick={onBewerk} className="p-1.5 text-[#8A847E] hover:text-[#991A21] transition-colors" title="Bewerken">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              </button>
              <button onClick={onVerwijder} className="p-1.5 text-[#8A847E] hover:text-[#991A21] transition-colors" title="Verwijderen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></svg>
              </button>
            </>
          )}
          <button
            onClick={onGebruik}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#F2EFEC] text-[#2D2D2D] hover:bg-[#991A21] hover:text-white transition-colors"
          >
            Gebruik registreren
          </button>
        </div>
      </div>
    </div>
  );
}

function AannemerFormulier({ aannemer, onOpslaan, onSluiten }) {
  const [a, setA] = useState(aannemer);
  const set = (veld) => (e) => setA((prev) => ({ ...prev, [veld]: e.target.value }));
  const toggleSpecialisme = (s) => {
    setA((prev) => {
      const huidig = prev.specialismen || [];
      return { ...prev, specialismen: huidig.includes(s) ? huidig.filter((x) => x !== s) : [...huidig, s] };
    });
  };
  const geldig = (a.naam || "").trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={onSluiten}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-bold text-[#2D2D2D] mb-4">{a.id ? "Aannemer bewerken" : "Nieuwe aannemer"}</h2>

        <div className="space-y-3">
          <Veld label="Naam" value={a.naam} onChange={set("naam")} verplicht />
          <Veld label="Contactpersoon" value={a.contactpersoon} onChange={set("contactpersoon")} />
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Telefoon" value={a.telefoon} onChange={set("telefoon")} />
            <Veld label="E-mail" value={a.email} onChange={set("email")} />
          </div>
          <Veld label="Werkgebied" value={a.werkgebied} onChange={set("werkgebied")} placeholder="bijv. Den Haag e.o." />

          <div>
            <label className="text-[12.5px] font-semibold text-[#6B6560] block mb-1.5">Specialismen</label>
            <div className="flex flex-wrap gap-1.5">
              {SPECIALISMEN.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSpecialisme(s)}
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-full border transition-colors ${
                    (a.specialismen || []).includes(s)
                      ? "bg-[#991A21] border-[#991A21] text-white"
                      : "bg-white border-[#E7E2DB] text-[#6B6560] hover:border-[#991A21]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12.5px] font-semibold text-[#6B6560] block mb-1.5">Notities / ervaring</label>
            <textarea
              value={a.notities || ""}
              onChange={set("notities")}
              rows={3}
              placeholder="bijv. snel, netjes, iets duurder…"
              className="w-full px-3 py-2 text-[13px] border border-[#E7E2DB] rounded-lg focus:outline-none focus:border-[#991A21] resize-none"
            />
          </div>

          <div>
            <label className="text-[12.5px] font-semibold text-[#6B6560] block mb-1.5">Status</label>
            <select
              value={a.status}
              onChange={set("status")}
              className="w-full h-10 px-3 text-[13px] border border-[#E7E2DB] rounded-lg focus:outline-none focus:border-[#991A21]"
            >
              <option value="actief">Actief</option>
              <option value="inactief">Inactief</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-6">
          <button
            disabled={!geldig}
            onClick={() => onOpslaan(a)}
            className="flex-1 h-10 bg-[#991A21] hover:bg-[#7A1419] disabled:bg-[#C9BEB2] disabled:cursor-not-allowed text-white text-[13.5px] font-semibold rounded-lg transition-colors"
          >
            Opslaan
          </button>
          <button onClick={onSluiten} className="h-10 px-4 text-[13.5px] font-semibold text-[#6B6560] hover:text-[#2D2D2D] transition-colors">
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}

function Veld({ label, value, onChange, verplicht, placeholder }) {
  return (
    <div>
      <label className="text-[12.5px] font-semibold text-[#6B6560] block mb-1.5">
        {label}{verplicht && <span className="text-[#991A21]"> *</span>}
      </label>
      <input
        type="text"
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-10 px-3 text-[13px] border border-[#E7E2DB] rounded-lg focus:outline-none focus:border-[#991A21] transition-colors"
      />
    </div>
  );
}

function BevestigVerwijderen({ titel, onBevestig, onAnnuleer }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={onAnnuleer}>
      <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-[14.5px] font-semibold text-[#2D2D2D] mb-1.5">{titel}</p>
        <p className="text-[13px] text-[#8A847E] mb-5">Dit kan niet ongedaan worden gemaakt.</p>
        <div className="flex items-center gap-2.5">
          <button onClick={onBevestig} className="flex-1 h-10 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13.5px] font-semibold rounded-lg transition-colors">
            Verwijderen
          </button>
          <button onClick={onAnnuleer} className="h-10 px-4 text-[13.5px] font-semibold text-[#6B6560] hover:text-[#2D2D2D] transition-colors">
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
