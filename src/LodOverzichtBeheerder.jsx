import React, { useState, useEffect } from "react";
import { lodSupaLoad, lodDagenTot, lodFmtDt, LodStatusBadge, buildTijdlijn, C } from "./LodBeheer";

// ── LOD Overzicht — Beheerder (read-only) ───────────────────────
// Toont alleen de LOD-dossiers waar de ingelogde beheerder als
// behandelaar staat. De RLS-policy `lod_toegang_beheerder_eigen` op
// lod_data zorgt dat lodSupaLoad() al gefilterd terugkomt — hier wordt
// niet nóg eens client-side gefilterd, want dat zou de indruk wekken
// dat de beveiliging in de frontend zit. Die zit in de database.
//
// Geen enkele actie hier schrijft iets: geen PATCH, geen POST, geen
// DELETE. Puur inzage in status, deadline en laatste update.

const CSS_FONT = `* { font-family: 'Geist Variable', sans-serif !important; }`;

export default function LodOverzichtBeheerder({ onTerug, eigenNaam }) {
  const [lods, setLods] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(false);

  useEffect(() => {
    let afgebroken = false;
    setLaden(true);
    lodSupaLoad()
      .then(data => { if (!afgebroken) { setLods(data); setLaden(false); } })
      .catch(() => { if (!afgebroken) { setFout(true); setLaden(false); } });
    return () => { afgebroken = true; };
  }, []);

  const actief = lods.filter(l => l.status !== "afgerond");
  const afgerond = lods.filter(l => l.status === "afgerond");

  const laatsteUpdate = (lod) => {
    const events = buildTijdlijn(lod);
    if (!events.length) return null;
    return events[events.length - 1];
  };

  const Rij = ({ lod }) => {
    const dagen = lodDagenTot(lod.deadlineAlgemeen);
    const overschreden = dagen !== null && dagen < 0 && lod.status !== "afgerond";
    const laatste = laatsteUpdate(lod);
    return (
      <div style={{
        background: C.wit, border: "1px solid " + (overschreden ? C.bordeauxRand : C.lijn),
        borderRadius: 12, padding: "14px 18px", marginBottom: 10, boxShadow: C.schaduw,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
              {lod.vveNaam || "Naamloos"}
            </div>
            <LodStatusBadge status={lod.status} />
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.tekst2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Deadline gemeente
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: overschreden ? C.bordeaux : C.ink }}>
              {lod.deadlineAlgemeen ? new Date(lod.deadlineAlgemeen).toLocaleDateString("nl-NL") : "—"}
              {dagen !== null && lod.status !== "afgerond" && (
                <span style={{ marginLeft: 6, fontWeight: 500, color: overschreden ? C.bordeaux : C.tekst2 }}>
                  ({Math.abs(dagen)} {overschreden ? "dagen over" : "dagen"})
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + C.lijnZacht, fontSize: 12, color: C.tekst2 }}>
          {laatste
            ? <>Laatste update: <span style={{ color: C.ink, fontWeight: 500 }}>{laatste.tekst}</span> — {lodFmtDt(laatste.ts)}{laatste.door ? ` (${laatste.door})` : ""}</>
            : "Nog geen updates geregistreerd."}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: C.papier, padding: "28px 24px" }}>
      <style>{CSS_FONT}</style>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <button onClick={onTerug} style={{
          display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
          cursor: "pointer", fontSize: 12.5, color: C.tekst2, marginBottom: 16, padding: 0,
          fontFamily: "'DM Sans',sans-serif",
        }}>
          ← Terug naar portaal
        </button>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 4 }}>LOD Overzicht</h1>
        <p style={{ fontSize: 13, color: C.tekst2, marginBottom: 24 }}>
          {eigenNaam ? `Dossiers waar jij als behandelaar staat, ${eigenNaam}.` : "Jouw LOD-dossiers."} Alleen ter inzage — wijzigingen lopen via de hoofdbeheerder.
        </p>

        {laden && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.tekst3, fontSize: 13 }}>
            LOD-dossiers laden…
          </div>
        )}

        {!laden && fout && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.bordeaux, fontSize: 13 }}>
            Laden van LOD-dossiers is mislukt. Probeer de pagina te vernieuwen.
          </div>
        )}

        {!laden && !fout && lods.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.tekst3 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.tekst2, marginBottom: 4 }}>
              Geen LOD-dossiers op jouw naam
            </div>
            <div style={{ fontSize: 12 }}>Er loopt momenteel geen LOD-traject waar jij behandelaar van bent.</div>
          </div>
        )}

        {!laden && !fout && actief.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.tekst2, marginBottom: 10 }}>
              Actief ({actief.length})
            </div>
            {actief.map(lod => <Rij key={lod.id} lod={lod} />)}
          </>
        )}

        {!laden && !fout && afgerond.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.tekst2, marginTop: 24, marginBottom: 10 }}>
              Afgerond ({afgerond.length})
            </div>
            {afgerond.map(lod => <Rij key={lod.id} lod={lod} />)}
          </>
        )}
      </div>
    </div>
  );
}
