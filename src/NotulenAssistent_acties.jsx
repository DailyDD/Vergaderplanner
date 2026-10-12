import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Inp, Txa, Sel, Veld, SUPABASE_URL, SUPABASE_ANON } from "./NotulenAssistent_deel1";

// Actie- en besluitenregister. Data staat in Supabase (tabellen vve_acties en
// vve_actie_log, met RLS: elke beheerder ziet en wijzigt alleen eigen rijen).
// Het inlogtoken komt uit dezelfde sessionStorage-sleutel als App.jsx.

const STATUSSEN = [
  ["open", "Open"],
  ["in_uitvoering", "In uitvoering"],
  ["afgerond", "Afgerond"],
  ["vervallen", "Vervallen"],
];
const STATUS_LABEL = Object.fromEntries(STATUSSEN);
const STATUS_KLEUR = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  in_uitvoering: "bg-blue-50 text-blue-700 border-blue-200",
  afgerond: "bg-emerald-50 text-emerald-700 border-emerald-200",
  vervallen: "bg-gray-100 text-gray-500 border-gray-200",
};

function token() {
  try { return sessionStorage.getItem("vve_access_token"); } catch { return null; }
}

async function rest(pad, opties = {}) {
  const t = token();
  if (!t) throw new Error("Niet ingelogd — log opnieuw in.");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
    ...opties,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opties.headers || {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Sessie verlopen — log opnieuw in.");
    let melding = "";
    try { melding = (await res.json()).message || ""; } catch { /* geen json */ }
    throw new Error(melding || `Fout ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function vandaag() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function datumNL(iso) {
  if (!iso) return "—";
  const [j, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}-${m}-${j}`;
}

function isActief(r) { return r.status === "open" || r.status === "in_uitvoering"; }
function isTeLaat(r) { return isActief(r) && r.termijn && r.termijn < vandaag(); }

// Voorkomt dat Excel een cel als formule uitvoert (CSV-injectie).
function csvCel(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv(rijen, vveNaam) {
  if (!rijen.length) return;
  const kop = ["VvE", "Soort", "Omschrijving", "Verantwoordelijke", "Termijn", "Status", "Vergaderdatum", "Toelichting"];
  const regels = rijen.map((r) => [
    r.vve_naam, r.soort === "besluit" ? "Besluit" : "Actie", r.omschrijving, r.verantwoordelijke || "",
    datumNL(r.termijn) === "—" ? "" : datumNL(r.termijn), STATUS_LABEL[r.status] || r.status,
    datumNL(r.vergaderdatum) === "—" ? "" : datumNL(r.vergaderdatum), r.toelichting || "",
  ].map(csvCel).join(";"));
  const csv = "﻿" + [kop.map(csvCel).join(";"), ...regels].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const naam = (vveNaam || "alle_vves").replace(/[^\w\-]+/g, "_").slice(0, 60);
  a.href = url;
  a.download = `Actieregister_${naam}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LEEG = { soort: "actie", omschrijving: "", verantwoordelijke: "", termijn: "", vergaderdatum: "", toelichting: "" };

export default function Acties({ vergaderingNaam = "" }) {
  const [rijen, setRijen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");
  const [vve, setVve] = useState(vergaderingNaam || "");
  const [toonAfgerond, setToonAfgerond] = useState(false);
  const [nieuw, setNieuw] = useState(LEEG);
  const [bezig, setBezig] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [logs, setLogs] = useState({});
  const [verwijderId, setVerwijderId] = useState(null);

  const laad = useCallback(async () => {
    setLaden(true);
    setFout("");
    try {
      setRijen(await rest("vve_acties?select=*&order=created_at.desc&limit=2000"));
    } catch (e) {
      setFout(e.message);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { laad(); }, [laad]);

  const vveNamen = useMemo(
    () => [...new Set(rijen.map((r) => r.vve_naam).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl")),
    [rijen]
  );

  const zichtbaar = useMemo(() => {
    const f = vve.trim().toLowerCase();
    const lijst = rijen.filter((r) =>
      (!f || r.vve_naam.trim().toLowerCase() === f) && (toonAfgerond || isActief(r))
    );
    return lijst.sort((a, b) => {
      const A = isActief(a) ? 0 : 1, B = isActief(b) ? 0 : 1;
      if (A !== B) return A - B;
      if (a.termijn && b.termijn) return a.termijn.localeCompare(b.termijn);
      if (a.termijn) return -1;
      if (b.termijn) return 1;
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [rijen, vve, toonAfgerond]);

  const aantalTeLaat = zichtbaar.filter(isTeLaat).length;
  const aantalOpen = zichtbaar.filter(isActief).length;

  const voegToe = async () => {
    if (!vve.trim() || !nieuw.omschrijving.trim()) return;
    setBezig(true);
    setFout("");
    try {
      const body = {
        vve_naam: vve.trim(),
        soort: nieuw.soort,
        omschrijving: nieuw.omschrijving.trim(),
        verantwoordelijke: nieuw.verantwoordelijke.trim() || null,
        termijn: nieuw.termijn || null,
        vergaderdatum: nieuw.vergaderdatum || null,
        toelichting: nieuw.toelichting.trim() || null,
      };
      const [rij] = await rest("vve_acties", { method: "POST", body: JSON.stringify(body) });
      setRijen((r) => [rij, ...r]);
      setNieuw(LEEG);
    } catch (e) {
      setFout(e.message);
    } finally {
      setBezig(false);
    }
  };

  const laadLog = async (id) => {
    try {
      const data = await rest(`vve_actie_log?select=*&actie_id=eq.${id}&order=created_at.desc`);
      setLogs((l) => ({ ...l, [id]: data }));
    } catch (e) {
      setFout(e.message);
    }
  };

  const wijzigStatus = async (r, status) => {
    if (status === r.status) return;
    setFout("");
    try {
      const [rij] = await rest(`vve_acties?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setRijen((lijst) => lijst.map((x) => (x.id === r.id ? rij : x)));
      if (openId === r.id) laadLog(r.id);
    } catch (e) {
      setFout(e.message);
    }
  };

  const verwijder = async (id) => {
    setFout("");
    try {
      await rest(`vve_acties?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      setRijen((lijst) => lijst.filter((x) => x.id !== id));
      setVerwijderId(null);
    } catch (e) {
      setFout(e.message);
    }
  };

  const toggleHistorie = (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    laadLog(id);
  };

  const kanToevoegen = vve.trim() && nieuw.omschrijving.trim() && !bezig;

  return (
    <div className="space-y-4">
      {/* Filter / selectie */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Actie- en besluitenregister</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={toonAfgerond} onChange={(e) => setToonAfgerond(e.target.checked)} />
              Toon afgerond/vervallen
            </label>
            <button onClick={() => exportCsv(zichtbaar, vve.trim())} disabled={!zichtbaar.length}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] hover:border-[#991A21] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              ↓ Excel (.csv)
            </button>
          </div>
        </div>
        <Veld label="VvE" required hint="Kies een bestaande naam of typ een nieuwe. Gebruik overal exact dezelfde schrijfwijze: 'Zonnehof' en 'VvE Zonnehof' worden twee aparte registers. Leeg laten toont alle VvE's.">
          <input list="acties-vve-namen" value={vve} onChange={(e) => setVve(e.target.value)} placeholder="Naam VvE (leeg = alle VvE's)"
            className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors" />
          <datalist id="acties-vve-namen">{vveNamen.map((n) => <option key={n} value={n} />)}</datalist>
        </Veld>
        <div className="flex gap-4 text-xs text-gray-500">
          <span><strong className="text-[#2D2D2D]">{aantalOpen}</strong> openstaand</span>
          <span className={aantalTeLaat ? "text-[#991A21] font-semibold" : ""}><strong>{aantalTeLaat}</strong> over termijn</span>
        </div>
      </div>

      {fout && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-[#991A21] font-medium flex items-center justify-between gap-3">
          <span>{fout}</span>
          <button onClick={laad} className="underline shrink-0">Opnieuw laden</button>
        </div>
      )}

      {/* Nieuw item */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Nieuwe actie of besluit</p>
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <Veld label="Soort"><Sel value={nieuw.soort} onChange={(v) => setNieuw((n) => ({ ...n, soort: v }))}>
            <option value="actie">Actie</option><option value="besluit">Besluit</option>
          </Sel></Veld>
          <Veld label="Omschrijving" required><Inp value={nieuw.omschrijving} onChange={(v) => setNieuw((n) => ({ ...n, omschrijving: v }))} placeholder="Wat moet er gebeuren of is besloten?" /></Veld>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Veld label="Verantwoordelijke"><Inp value={nieuw.verantwoordelijke} onChange={(v) => setNieuw((n) => ({ ...n, verantwoordelijke: v }))} placeholder="bijv. beheerder, bestuur" /></Veld>
          <Veld label="Termijn"><Inp type="date" value={nieuw.termijn} onChange={(v) => setNieuw((n) => ({ ...n, termijn: v }))} /></Veld>
          <Veld label="Vergaderdatum" hint="Optioneel: de vergadering waarin dit is besloten of afgesproken."><Inp type="date" value={nieuw.vergaderdatum} onChange={(v) => setNieuw((n) => ({ ...n, vergaderdatum: v }))} /></Veld>
        </div>
        <Veld label="Toelichting"><Txa value={nieuw.toelichting} onChange={(v) => setNieuw((n) => ({ ...n, toelichting: v }))} rows={2} placeholder="Optioneel" /></Veld>
        <button onClick={voegToe} disabled={!kanToevoegen}
          className="text-xs px-4 py-2 bg-[#991A21] hover:bg-[#7a1419] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors">
          {bezig ? "Opslaan…" : "+ Toevoegen"}
        </button>
        {!vve.trim() && <p className="text-[11px] text-gray-400">Vul bovenaan eerst de VvE in.</p>}
      </div>

      {/* Lijst */}
      <div className="space-y-2">
        {laden && <p className="text-xs text-gray-400 italic">Laden…</p>}
        {!laden && zichtbaar.length === 0 && !fout && (
          <p className="text-xs text-gray-400 italic">Geen {toonAfgerond ? "" : "openstaande "}items{vve.trim() ? ` voor ${vve.trim()}` : ""}.</p>
        )}
        {zichtbaar.map((r) => {
          const teLaat = isTeLaat(r);
          return (
            <div key={r.id} className={`bg-white border rounded-xl px-4 py-3 shadow-sm space-y-2 ${teLaat ? "border-[#991A21]" : "border-gray-200"}`}>
              <div className="flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border shrink-0 mt-0.5 ${r.soort === "besluit" ? "bg-[#991A21] text-white border-[#991A21]" : "bg-white text-gray-600 border-gray-300"}`}>
                  {r.soort === "besluit" ? "Besluit" : "Actie"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-[#2D2D2D] ${r.status === "vervallen" ? "line-through text-gray-400" : ""}`}>{r.omschrijving}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {!vve.trim() && <><strong>{r.vve_naam}</strong> · </>}
                    {r.verantwoordelijke ? `${r.verantwoordelijke} · ` : ""}
                    <span className={teLaat ? "text-[#991A21] font-semibold" : ""}>Termijn {datumNL(r.termijn)}{teLaat ? " (over termijn)" : ""}</span>
                    {r.vergaderdatum ? ` · Vergadering ${datumNL(r.vergaderdatum)}` : ""}
                  </p>
                  {r.toelichting && <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap">{r.toelichting}</p>}
                </div>
                <select value={r.status} onChange={(e) => wijzigStatus(r, e.target.value)}
                  className={`text-xs rounded-lg border px-2 py-1.5 font-medium focus:outline-none shrink-0 ${STATUS_KLEUR[r.status]}`}>
                  {STATUSSEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <button onClick={() => toggleHistorie(r.id)} className="text-gray-500 hover:text-[#991A21]">
                  {openId === r.id ? "Verberg historie" : "Historie"}
                </button>
                {verwijderId === r.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[#991A21]">Definitief verwijderen?</span>
                    <button onClick={() => verwijder(r.id)} className="text-[#991A21] font-semibold underline">Ja, verwijder</button>
                    <button onClick={() => setVerwijderId(null)} className="text-gray-500">Annuleer</button>
                  </span>
                ) : (
                  <button onClick={() => setVerwijderId(r.id)} className="text-gray-400 hover:text-[#991A21]">Verwijderen</button>
                )}
              </div>
              {openId === r.id && (
                <div className="bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-600 space-y-1">
                  <p>Aangemaakt {datumNL(r.created_at)}{r.afgerond_op ? ` · afgerond ${datumNL(r.afgerond_op)}` : ""}</p>
                  {(logs[r.id] || []).length === 0
                    ? <p className="text-gray-400 italic">Nog geen statuswijzigingen.</p>
                    : (logs[r.id] || []).map((l) => (
                      <p key={l.id}>{datumNL(l.created_at)}: {STATUS_LABEL[l.van_status] || l.van_status} → <strong>{STATUS_LABEL[l.naar_status] || l.naar_status}</strong></p>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
