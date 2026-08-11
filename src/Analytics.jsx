import React, { useState, useEffect } from "react";

// — Gebruiksstatistieken (alleen hoofd_admin) —
// Toont geaggregeerde productanalytics: puls vandaag, moduulgebruik,
// throughput en actieve gebruikers over tijd. Alle data komt uit
// aggregatie-RPC's (stats_*) die zelf hoofd_admin afdwingen (SECURITY
// DEFINER + is_hoofd_admin()-check in de functie). Er komt hier nooit
// een individuele event-rij of user_id in beeld — alleen aggregaten.
//
// Vereist voor gebruik in App.jsx:
// initAnalyticsDeps({ sbFetch }).

let _sbFetch = null;

export function initAnalyticsDeps({ sbFetch }) {
  _sbFetch = sbFetch;
}

const BORDEAUX = "#991A21";
const ANTRACIET = "#2D2D2D";

const MODULE_LABELS = {
  portaal: "Dashboard",
  vergaderingen: "Vergaderplanner",
  calculator: "VvE Calculator",
  verduurzaming: "Verduurzaming",
  lod: "LOD Beheer",
  notulen: "Notulen Assistent",
  kennisbank: "Kennisbank",
  mail: "E-mail Configurator",
  mjop: "Levend MJOP",
  offertes: "Offertegenerator",
  aannemers: "Aannemers",
  overdrachten: "Overdrachten",
  feedback: "Feedback & Communicatie",
  ideeenbox: "Ideeënbox",
  actiepunten: "Actiepunten",
  admin: "Admin Dashboard",
};

const EVENT_LABELS = {
  offerte_generated: "Offertes gegenereerd",
  overdracht_created: "Overdrachten aangemaakt",
  mjop_import: "MJOP-imports",
  feedback_submitted: "Feedback ingediend",
};

async function callRpc(naam, params = {}) {
  const rows = await _sbFetch(`rpc/${naam}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return rows || [];
}

export default function Analytics({ onTerug }) {
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");
  const [puls, setPuls] = useState(null);
  const [moduulgebruik, setModuulgebruik] = useState([]);
  const [throughput, setThroughput] = useState([]);
  const [dau, setDau] = useState([]);
  const [periode, setPeriode] = useState(30);

  useEffect(() => {
    laadAlles(periode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  async function laadAlles(dagen) {
    if (!_sbFetch) return;
    setLaden(true);
    setFout("");
    try {
      const [pulsRows, moduleRows, throughputRows, dauRows] = await Promise.all([
        callRpc("stats_puls_vandaag"),
        callRpc("stats_module_usage", { dagen }),
        callRpc("stats_throughput", { dagen }),
        callRpc("stats_dau", { dagen }),
      ]);
      setPuls(pulsRows[0] || { actieve_users: 0, acties_vandaag: 0, laatste_activiteit: null });
      setModuulgebruik(moduleRows);
      setThroughput(throughputRows);
      setDau(dauRows);
    } catch (e) {
      console.error("analytics laden", e);
      setFout("Kon de statistieken niet laden. Probeer het opnieuw.");
    } finally {
      setLaden(false);
    }
  }

  const maxModule = Math.max(1, ...moduulgebruik.map((m) => Number(m.aantal) || 0));
  const maxDau = Math.max(1, ...dau.map((d) => Number(d.actieve_users) || 0));

  return (
    <div className="min-h-screen bg-[#F2EFEC] flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-[#E7E2DB]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <button
              onClick={onTerug}
              className="text-[13px] text-[#8A847E] hover:text-[#991A21] transition-colors"
            >
              ← Terug naar portaal
            </button>
            <h1 className="text-[20px] font-bold text-[#2D2D2D] mt-1">Gebruiksstatistieken</h1>
            <p className="text-[12.5px] text-[#8A847E] mt-0.5">
              Alleen zichtbaar voor hoofdbeheerders — geaggregeerd, geen individuele gegevens.
            </p>
          </div>
          <select
            value={periode}
            onChange={(e) => setPeriode(Number(e.target.value))}
            className="h-10 px-3 text-[13px] border border-[#E7E2DB] rounded-lg text-[#2D2D2D] focus:outline-none focus:border-[#991A21]"
          >
            <option value={7}>Laatste 7 dagen</option>
            <option value={30}>Laatste 30 dagen</option>
            <option value={90}>Laatste 90 dagen</option>
          </select>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-6 py-8 flex-1">
        {laden ? (
          <p className="text-[13px] text-[#8A847E]">Laden…</p>
        ) : fout ? (
          <div className="bg-white border border-[#E7E2DB] rounded-xl px-6 py-8 text-center">
            <p className="text-[14px] text-[#991A21]">{fout}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* — Puls vandaag — */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiKaart label="Actieve gebruikers vandaag" waarde={puls?.actieve_users ?? 0} />
              <KpiKaart label="Acties vandaag" waarde={puls?.acties_vandaag ?? 0} />
              <KpiKaart
                label="Laatste activiteit"
                waarde={
                  puls?.laatste_activiteit
                    ? new Date(puls.laatste_activiteit).toLocaleString("nl-NL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"
                }
                klein
              />
            </div>

            {/* — Moduulgebruik — */}
            <Paneel titel="Moduulgebruik" subtitel={`Aantal keer geopend, laatste ${periode} dagen`}>
              {moduulgebruik.length === 0 ? (
                <LegeStaat />
              ) : (
                <div className="space-y-2.5">
                  {moduulgebruik.map((m) => (
                    <BalkRij
                      key={m.module}
                      label={MODULE_LABELS[m.module] || m.module}
                      waarde={Number(m.aantal)}
                      max={maxModule}
                      subtekst={`${m.unieke_users} gebruiker${Number(m.unieke_users) === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
              )}
            </Paneel>

            {/* — Throughput — */}
            <Paneel titel="Throughput" subtitel={`Voltooide acties, laatste ${periode} dagen`}>
              {throughput.length === 0 ? (
                <LegeStaat />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {throughput.map((t) => (
                    <div
                      key={t.event_type}
                      className="border border-[#E7E2DB] rounded-lg px-4 py-3"
                    >
                      <p className="text-[22px] font-bold text-[#2D2D2D]">{t.aantal}</p>
                      <p className="text-[12px] text-[#8A847E] mt-0.5">
                        {EVENT_LABELS[t.event_type] || t.event_type}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Paneel>

            {/* — Actieve gebruikers over tijd — */}
            <Paneel titel="Actieve gebruikers per dag" subtitel={`Laatste ${periode} dagen`}>
              {dau.length === 0 ? (
                <LegeStaat />
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {dau.map((d) => (
                    <div key={d.dag} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full rounded-t bg-[#991A21] transition-all"
                        style={{
                          height: `${Math.max(4, (Number(d.actieve_users) / maxDau) * 100)}px`,
                        }}
                        title={`${d.dag}: ${d.actieve_users} actieve gebruiker(s)`}
                      />
                    </div>
                  ))}
                </div>
              )}
              {dau.length > 0 && (
                <div className="flex justify-between text-[10.5px] text-[#8A847E] mt-2">
                  <span>{formatDag(dau[0].dag)}</span>
                  <span>{formatDag(dau[dau.length - 1].dag)}</span>
                </div>
              )}
            </Paneel>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiKaart({ label, waarde, klein }) {
  return (
    <div className="bg-white border border-[#E7E2DB] rounded-xl px-5 py-4">
      <p className={klein ? "text-[15px] font-semibold text-[#2D2D2D]" : "text-[26px] font-bold text-[#2D2D2D]"}>
        {waarde}
      </p>
      <p className="text-[12px] text-[#8A847E] mt-0.5">{label}</p>
    </div>
  );
}

function Paneel({ titel, subtitel, children }) {
  return (
    <div className="bg-white border border-[#E7E2DB] rounded-xl px-6 py-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-[#2D2D2D]">{titel}</h2>
        {subtitel && <p className="text-[12px] text-[#8A847E] mt-0.5">{subtitel}</p>}
      </div>
      {children}
    </div>
  );
}

function BalkRij({ label, waarde, max, subtekst }) {
  const pct = Math.max(4, (waarde / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] mb-1">
        <span className="text-[#2D2D2D] font-medium">{label}</span>
        <span className="text-[#8A847E]">
          {waarde} {subtekst && <span className="text-[#B5AFA8]">· {subtekst}</span>}
        </span>
      </div>
      <div className="h-2 bg-[#F2EFEC] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#991A21] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LegeStaat() {
  return <p className="text-[12.5px] text-[#8A847E]">Nog geen data in deze periode.</p>;
}

function formatDag(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" });
}
