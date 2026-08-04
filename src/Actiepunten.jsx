import React, { useState, useEffect } from "react";

// ── Actiepunten (VvE-vergadering) ────────────────────────────────
// Module voor het bijhouden van actiepunten die voortvloeien uit een
// VvE-vergadering. Elke beheerder maakt eigen dossiers aan per VvE
// (vve_dossiers) met daaronder losse actiepunten (actiepunten),
// elk met optionele deadline, verantwoordelijke, status en notitie.
//
// Toegang: tijdens de bouwfase alleen zichtbaar voor hoofd_admin,
// via IN_AANBOUW in App.jsx. Zichtbaarheid/rechten per beheerder
// worden geregeld via RLS (beheerder ziet alleen eigen dossiers).
//
// Supabase-afhankelijkheden worden geïnjecteerd vanuit App.jsx via
// initActiepuntenDeps({ sbFetch, showToast }).

let _sbFetch = null;
let _showToast = null;
export function initActiepuntenDeps({ sbFetch, showToast }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
}

// ── Portaalwidget: naderende deadlines ───────────────────────────
// Haalt alle actiepunten op (RLS beperkt dit al tot eigen dossiers)
// voor gebruik in een toekomstige dashboardkaart.
export async function actiepuntenSupaLoad() {
  if (!_sbFetch) return [];
  try {
    const rows = await _sbFetch("actiepunten?select=*,vve_dossiers(vve_naam)&order=deadline.asc.nullslast");
    return rows || [];
  } catch (e) {
    console.error("actiepunten dashboard laden", e);
    return [];
  }
}

// Pure functie (geen fetch, geen state): vat de actiepuntenlijst samen
// voor de portaalkaart. Open = status !== "afgerond".
export function actiepuntenDashboardStats(rijen) {
  const lijst = Array.isArray(rijen) ? rijen : [];
  const open = lijst.filter((a) => a.status !== "afgerond");
  const teLaat = open.filter((a) => { const n = dagenTot(a.deadline); return n != null && n < 0; }).length;
  const dezeWeek = open.filter((a) => { const n = dagenTot(a.deadline); return n != null && n >= 0 && n <= 7; }).length;
  const zonderDeadline = open.filter((a) => dagenTot(a.deadline) == null).length;
  const komend = open
    .filter((a) => dagenTot(a.deadline) != null)
    .map((a) => ({
      id: a.id,
      omschrijving: a.omschrijving,
      vve: a.vve_dossiers?.vve_naam || "—",
      verantwoordelijke: a.verantwoordelijke || "",
      deadline: a.deadline,
      dagen: dagenTot(a.deadline),
    }))
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));
  return { totaalOpen: open.length, teLaat, dezeWeek, zonderDeadline, komend };
}

const MAANDEN_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
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
function dagenSindsUpdate(timestamptz) {
  if (!timestamptz) return null;
  const d = new Date(timestamptz);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
const STIL_DREMPEL_DAGEN = 14;
function deadlineInfo(iso) {
  const n = dagenTot(iso);
  if (n == null) return { label: "geen deadline", tekst: "#8A847E", bg: "#F2EFEC" };
  if (n < 0) return { label: `${-n} ${-n === 1 ? "dag" : "dagen"} te laat`, tekst: "#991A21", bg: "#FDEAEB" };
  if (n === 0) return { label: "vandaag", tekst: "#991A21", bg: "#FDEAEB" };
  if (n <= 7) return { label: `over ${n} ${n === 1 ? "dag" : "dagen"}`, tekst: "#B07414", bg: "#FBF3E4" };
  return { label: `over ${n} dagen`, tekst: "#2D6A4F", bg: "#EAF4EE" };
}

const STATUS_META = {
  open:          { label: "Open",          tekst: "#B07414", bg: "#FBF3E4" },
  in_uitvoering: { label: "In uitvoering", tekst: "#2563A6", bg: "#E7F0FA" },
  afgerond:      { label: "Afgerond",      tekst: "#2D6A4F", bg: "#EAF4EE" },
};

function legeDossier() {
  return { vve_naam: "", vergaderdatum: "" };
}
function legeActiepunt() {
  return { omschrijving: "", verantwoordelijke: "", deadline: "", status: "open", notitie: "" };
}

export default function Actiepunten({ onTerug, beheerder }) {
  const [dossiers, setDossiers] = useState([]);
  const [actiepunten, setActiepunten] = useState([]);
  const [laden, setLaden] = useState(true);
  const [actiefDossierId, setActiefDossierId] = useState(null);

  const [dossierForm, setDossierForm] = useState(null);
  const [teVerwijderenDossier, setTeVerwijderenDossier] = useState(null);
  const [actiepuntForm, setActiepuntForm] = useState(null);
  const [teVerwijderenActiepunt, setTeVerwijderenActiepunt] = useState(null);
  const [filterStatus, setFilterStatus] = useState("alle");

  const [actiefActiepuntId, setActiefActiepuntId] = useState(null);
  const [acties, setActies] = useState([]);
  const [ladenActies, setLadenActies] = useState(false);

  async function laadActies(actiepuntId) {
    if (!_sbFetch) return;
    setLadenActies(true);
    try {
      const rows = await _sbFetch(`actiepunt_acties?actiepunt_id=eq.${actiepuntId}&select=*&order=datum.desc,created_at.desc`);
      setActies(rows || []);
    } catch (e) {
      console.error("acties laden", e);
      _showToast && _showToast("Acties laden mislukt.", "fout");
    }
    setLadenActies(false);
  }

  function openDetail(actiepuntId) {
    setActiefActiepuntId(actiepuntId);
    laadActies(actiepuntId);
  }

  async function nieuweActie(actiepuntId, { tekst, datum, statusNa, vervolgDeadline }) {
    try {
      await _sbFetch("actiepunt_acties", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          actiepunt_id: actiepuntId,
          tekst: (tekst || "").trim(),
          datum: datum || new Date().toISOString().slice(0, 10),
          status_na: statusNa || null,
          vervolg_deadline: vervolgDeadline || null,
        }),
      });
      // Altijd updated_at aanraken: dit is de basis voor de "geen update
      // sinds X dagen"-marker in de lijst, ook als alleen een voortgangsnotitie
      // is gelogd zonder status- of deadlinewijziging.
      const patch = { updated_at: new Date().toISOString() };
      if (statusNa) patch.status = statusNa;
      if (vervolgDeadline) patch.deadline = vervolgDeadline;
      await _sbFetch(`actiepunten?id=eq.${actiepuntId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      _showToast && _showToast("Actie toegevoegd.", "succes");
      await laadActies(actiepuntId);
      await laad();
    } catch (e) {
      console.error("actie toevoegen", e);
      _showToast && _showToast("Actie toevoegen mislukt.", "fout");
    }
  }

  useEffect(() => { laad(); }, []);

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const [dRows, aRows] = await Promise.all([
        _sbFetch("vve_dossiers?select=*&order=created_at.desc"),
        _sbFetch("actiepunten?select=*&order=deadline.asc.nullslast"),
      ]);
      setDossiers(dRows || []);
      setActiepunten(aRows || []);
    } catch (e) {
      console.error("actiepunten laden", e);
      _showToast && _showToast("Laden mislukt.", "fout");
    }
    setLaden(false);
  }

  function statsVoorDossier(dossierId) {
    const lijst = actiepunten.filter((a) => a.dossier_id === dossierId);
    const open = lijst.filter((a) => a.status !== "afgerond");
    const eerstvolgende = open
      .filter((a) => dagenTot(a.deadline) != null)
      .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""))[0];
    return { totaal: lijst.length, open: open.length, eerstvolgende };
  }

  async function opslaanDossier(d) {
    const payload = {
      vve_naam: (d.vve_naam || "").trim(),
      vergaderdatum: d.vergaderdatum || null,
    };
    try {
      if (d.id) {
        await _sbFetch(`vve_dossiers?id=eq.${d.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        _showToast && _showToast("Dossier bijgewerkt.", "succes");
      } else {
        await _sbFetch("vve_dossiers", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        _showToast && _showToast("Dossier aangemaakt.", "succes");
      }
      setDossierForm(null);
      await laad();
    } catch (e) {
      console.error("dossier opslaan", e);
      _showToast && _showToast("Opslaan mislukt.", "fout");
    }
  }

  async function verwijderDossier(id) {
    try {
      await _sbFetch(`vve_dossiers?id=eq.${id}`, { method: "DELETE" });
      _showToast && _showToast("Dossier verwijderd.", "succes");
      setTeVerwijderenDossier(null);
      if (actiefDossierId === id) setActiefDossierId(null);
      await laad();
    } catch (e) {
      console.error("dossier verwijderen", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  async function opslaanActiepunt(a, dossierId) {
    const payload = {
      dossier_id: dossierId,
      omschrijving: (a.omschrijving || "").trim(),
      verantwoordelijke: (a.verantwoordelijke || "").trim() || null,
      deadline: a.deadline || null,
      status: a.status || "open",
      notitie: (a.notitie || "").trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (a.id) {
        await _sbFetch(`actiepunten?id=eq.${a.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        _showToast && _showToast("Actiepunt bijgewerkt.", "succes");
      } else {
        await _sbFetch("actiepunten", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        _showToast && _showToast("Actiepunt toegevoegd.", "succes");
      }
      setActiepuntForm(null);
      await laad();
    } catch (e) {
      console.error("actiepunt opslaan", e);
      _showToast && _showToast("Opslaan mislukt.", "fout");
    }
  }

  async function zetStatus(a, status) {
    try {
      await _sbFetch(`actiepunten?id=eq.${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      await laad();
    } catch (e) {
      console.error("status wijzigen", e);
      _showToast && _showToast("Status wijzigen mislukt.", "fout");
    }
  }

  async function verwijderActiepunt(id) {
    try {
      await _sbFetch(`actiepunten?id=eq.${id}`, { method: "DELETE" });
      _showToast && _showToast("Actiepunt verwijderd.", "succes");
      setTeVerwijderenActiepunt(null);
      await laad();
    } catch (e) {
      console.error("actiepunt verwijderen", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  const actiefDossier = dossiers.find((d) => d.id === actiefDossierId) || null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-[#E7E2DB] px-6 lg:px-8 pt-5 pb-4">
        <button
          onClick={actiefDossier ? () => setActiefDossierId(null) : onTerug}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {actiefDossier ? "Terug naar dossiers" : "Terug naar dashboard"}
        </button>

        {actiefDossier ? (
          <>
            <h1 className="text-[22px] font-bold text-[#2D2D2D] leading-tight">{actiefDossier.vve_naam}</h1>
            <p className="text-[13px] text-[#8A847E] mt-0.5">
              {actiefDossier.vergaderdatum ? `Vergadering: ${fmtDatumISO(actiefDossier.vergaderdatum)}` : "Geen vergaderdatum ingevuld"}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[22px] font-bold text-[#2D2D2D] leading-tight">Actiepunten</h1>
            <p className="text-[13px] text-[#8A847E] mt-0.5">
              Dossiers per VvE met actiepunten en deadlines uit vergaderingen.
            </p>
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-8">
        {laden ? (
          <p className="text-[13.5px] text-[#8A847E]">Laden…</p>
        ) : actiefDossier ? (
          <DossierDetail
            dossier={actiefDossier}
            actiepunten={actiepunten.filter((a) => a.dossier_id === actiefDossier.id)}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            onNieuw={() => setActiepuntForm(legeActiepunt())}
            onOpen={(a) => openDetail(a.id)}
            onStatus={zetStatus}
            onVerwijder={(a) => setTeVerwijderenActiepunt(a)}
            onDossierBewerk={() => setDossierForm(actiefDossier)}
            onDossierVerwijder={() => setTeVerwijderenDossier(actiefDossier)}
          />
        ) : (
          <DossierLijst
            dossiers={dossiers}
            statsVoorDossier={statsVoorDossier}
            onOpen={(id) => setActiefDossierId(id)}
            onNieuw={() => setDossierForm(legeDossier())}
          />
        )}
      </div>

      {dossierForm && (
        <DossierForm initieel={dossierForm} onSluit={() => setDossierForm(null)} onOpslaan={opslaanDossier} />
      )}
      {teVerwijderenDossier && (
        <BevestigVerwijderen
          naam={teVerwijderenDossier.vve_naam}
          titel="Dossier verwijderen?"
          onSluit={() => setTeVerwijderenDossier(null)}
          onBevestig={() => verwijderDossier(teVerwijderenDossier.id)}
        />
      )}
      {actiepuntForm && actiefDossier && (
        <ActiepuntForm
          initieel={actiepuntForm}
          onSluit={() => setActiepuntForm(null)}
          onOpslaan={(a) => opslaanActiepunt(a, actiefDossier.id)}
        />
      )}
      {teVerwijderenActiepunt && (
        <BevestigVerwijderen
          naam={teVerwijderenActiepunt.omschrijving}
          titel="Actiepunt verwijderen?"
          onSluit={() => setTeVerwijderenActiepunt(null)}
          onBevestig={() => verwijderActiepunt(teVerwijderenActiepunt.id)}
        />
      )}
      {actiefActiepuntId && (
        <ActiepuntDetail
          actiepunt={actiepunten.find((a) => a.id === actiefActiepuntId)}
          acties={acties}
          ladenActies={ladenActies}
          onSluit={() => setActiefActiepuntId(null)}
          onOpslaanVelden={(a) => opslaanActiepunt(a, a.dossier_id)}
          onNieuweActie={(payload) => nieuweActie(actiefActiepuntId, payload)}
          onVerwijder={() => { setTeVerwijderenActiepunt(actiepunten.find((a) => a.id === actiefActiepuntId)); setActiefActiepuntId(null); }}
        />
      )}
    </div>
  );
}

// ══ Dossierlijst ══════════════════════════════════════════════════
function DossierLijst({ dossiers, statsVoorDossier, onOpen, onNieuw }) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-bold text-[#2D2D2D]">Dossiers</h2>
        <button
          onClick={onNieuw}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#991A21] hover:bg-[#7d151b] text-white text-[13px] font-semibold transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
          Nieuw dossier
        </button>
      </div>

      {dossiers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DDD5CE] bg-white/50 px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-[#2D2D2D]">Nog geen dossiers</p>
          <p className="text-[13px] text-[#8A847E] mt-1">Maak een dossier aan per VvE om actiepunten uit een vergadering bij te houden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dossiers.map((d) => {
            const s = statsVoorDossier(d.id);
            const info = s.eerstvolgende ? deadlineInfo(s.eerstvolgende.deadline) : null;
            return (
              <button
                key={d.id}
                onClick={() => onOpen(d.id)}
                className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-[#E7E2DB] bg-white px-4 py-3.5 hover:border-[#991A21]/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[14.5px] font-bold text-[#2D2D2D]">{d.vve_naam}</div>
                  <p className="text-[12px] text-[#9B958E] mt-0.5">
                    {[d.vergaderdatum ? `vergadering: ${fmtDatumISO(d.vergaderdatum)}` : null, `${s.open} open van ${s.totaal} actiepunten`].filter(Boolean).join("  ·  ")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {info && (
                    <span className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: info.tekst, backgroundColor: info.bg }}>
                      {info.label}
                    </span>
                  )}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#8A847E]"><path d="m9 18 6-6-6-6" /></svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══ Dossierdetail: actiepuntenlijst ══════════════════════════════
function DossierDetail({ dossier, actiepunten, filterStatus, setFilterStatus, onNieuw, onOpen, onStatus, onVerwijder, onDossierBewerk, onDossierVerwijder }) {
  const gefilterd = actiepunten
    .filter((a) => filterStatus === "alle" || a.status === filterStatus)
    .slice()
    .sort((a, b) => {
      const na = dagenTot(a.deadline), nb = dagenTot(b.deadline);
      if (na == null && nb == null) return 0;
      if (na == null) return 1;
      if (nb == null) return -1;
      return na - nb;
    });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1">
          {["alle", "open", "in_uitvoering", "afgerond"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 h-8 rounded-lg text-[12.5px] font-semibold transition-colors ${
                filterStatus === s ? "bg-[#2D2D2D] text-white" : "bg-[#F2EFEC] text-[#6B6560] hover:bg-[#E7E2DB]"
              }`}
            >
              {s === "alle" ? "Alle" : STATUS_META[s].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onDossierBewerk} className="text-[12.5px] font-medium text-[#8A847E] hover:text-[#991A21] transition-colors">
            Dossier bewerken
          </button>
          <button onClick={onDossierVerwijder} className="text-[12.5px] font-medium text-[#8A847E] hover:text-[#991A21] transition-colors">
            Verwijderen
          </button>
          <button
            onClick={onNieuw}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#991A21] hover:bg-[#7d151b] text-white text-[13px] font-semibold transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
            Nieuw actiepunt
          </button>
        </div>
      </div>

      {gefilterd.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DDD5CE] bg-white/50 px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-[#2D2D2D]">Geen actiepunten</p>
          <p className="text-[13px] text-[#8A847E] mt-1">Voeg een actiepunt toe met de knop rechtsboven.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((a) => (
            <ActiepuntRij key={a.id} a={a} onOpen={() => onOpen(a)} onStatus={(s) => onStatus(a, s)} onVerwijder={() => onVerwijder(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActiepuntRij({ a, onOpen, onStatus, onVerwijder }) {
  const info = deadlineInfo(a.deadline);
  const status = STATUS_META[a.status] || STATUS_META.open;
  const afgerond = a.status === "afgerond";
  const stilDagen = dagenSindsUpdate(a.updated_at);
  const isStilgevallen = !afgerond && stilDagen != null && stilDagen >= STIL_DREMPEL_DAGEN;
  return (
    <div
      onClick={onOpen}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer hover:border-[#991A21]/40 transition-colors ${afgerond ? "border-[#EAE5DF] bg-[#FAF8F5]" : "border-[#E7E2DB] bg-white"}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-[14.5px] font-bold ${afgerond ? "text-[#9B958E] line-through" : "text-[#2D2D2D]"}`}>{a.omschrijving}</span>
          {isStilgevallen && (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-[#B07414] bg-[#FBF3E4]" title="Al een tijd geen actie meer gelogd">
              geen update sinds {stilDagen} dagen
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#9B958E] mt-0.5">
          {[a.verantwoordelijke, a.deadline ? `deadline: ${fmtDatumISO(a.deadline)}` : null].filter(Boolean).join("  ·  ")}
        </p>
        {a.notitie && <p className="text-[12px] text-[#8A847E] mt-1">{a.notitie}</p>}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          {!afgerond && a.deadline && (
            <span className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: info.tekst, backgroundColor: info.bg }}>
              {info.label}
            </span>
          )}
          <span className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: status.tekst, backgroundColor: status.bg }}>
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {a.status !== "open" && (
            <button onClick={() => onStatus("open")} title="Zet op open" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#FBF3E4] hover:text-[#B07414] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3M3 4v5h5" /></svg>
            </button>
          )}
          {a.status !== "in_uitvoering" && a.status !== "afgerond" && (
            <button onClick={() => onStatus("in_uitvoering")} title="Zet op in uitvoering" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#E7F0FA] hover:text-[#2563A6] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></svg>
            </button>
          )}
          {!afgerond && (
            <button onClick={() => onStatus("afgerond")} title="Markeer als afgerond" className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6560] hover:bg-[#EAF4EE] hover:text-[#2D6A4F] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 6 9 17l-5-5" /></svg>
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

// ══ Formulieren ══════════════════════════════════════════════════
function DossierForm({ initieel, onSluit, onOpslaan }) {
  const [d, setD] = useState(initieel);
  const [bezig, setBezig] = useState(false);
  const set = (veld) => (waarde) => setD((prev) => ({ ...prev, [veld]: waarde }));
  const geldig = (d.vve_naam || "").trim().length > 0;

  async function bewaar() {
    if (!geldig || bezig) return;
    setBezig(true);
    await onOpslaan(d);
    setBezig(false);
  }

  return (
    <Modal onSluit={onSluit}>
      <h3 className="text-[17px] font-bold text-[#2D2D2D] mb-4">{d.id ? "Dossier bewerken" : "Nieuw dossier"}</h3>
      <div className="space-y-3">
        <Veld label="Naam VvE" value={d.vve_naam} onChange={set("vve_naam")} verplicht autoFocus placeholder="VvE ... te ..." />
        <Veld label="Vergaderdatum" type="date" value={d.vergaderdatum} onChange={set("vergaderdatum")} />
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

function ActiepuntForm({ initieel, onSluit, onOpslaan }) {
  const [a, setA] = useState(initieel);
  const [bezig, setBezig] = useState(false);
  const set = (veld) => (waarde) => setA((prev) => ({ ...prev, [veld]: waarde }));
  const geldig = (a.omschrijving || "").trim().length > 0;
  const inputCls = "w-full h-10 px-3 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors";

  async function bewaar() {
    if (!geldig || bezig) return;
    setBezig(true);
    await onOpslaan(a);
    setBezig(false);
  }

  return (
    <Modal onSluit={onSluit}>
      <h3 className="text-[17px] font-bold text-[#2D2D2D] mb-4">{a.id ? "Actiepunt bewerken" : "Nieuw actiepunt"}</h3>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">
            Omschrijving<span className="text-[#991A21]"> *</span>
          </span>
          <textarea
            value={a.omschrijving || ""}
            onChange={(e) => set("omschrijving")(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Wat moet er gebeuren?"
            className="w-full px-3 py-2 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors resize-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Verantwoordelijke" value={a.verantwoordelijke} onChange={set("verantwoordelijke")} placeholder="Optioneel" />
          <Veld label="Deadline" type="date" value={a.deadline} onChange={set("deadline")} />
        </div>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Status</span>
          <select value={a.status || "open"} onChange={(e) => set("status")(e.target.value)} className={inputCls}>
            <option value="open">Open</option>
            <option value="in_uitvoering">In uitvoering</option>
            <option value="afgerond">Afgerond</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Notitie</span>
          <textarea
            value={a.notitie || ""}
            onChange={(e) => set("notitie")(e.target.value)}
            rows={2}
            placeholder="Optionele voortgangsnotitie"
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

// ══ Actiepunt-detail: velden bewerken + tijdlijn van acties ════════
function ActiepuntDetail({ actiepunt, acties, ladenActies, onSluit, onOpslaanVelden, onNieuweActie, onVerwijder }) {
  const [a, setA] = useState(actiepunt);
  const [bezigVelden, setBezigVelden] = useState(false);
  const [nieuweTekst, setNieuweTekst] = useState("");
  const [nieuweDatum, setNieuweDatum] = useState(new Date().toISOString().slice(0, 10));
  const [nieuweStatusNa, setNieuweStatusNa] = useState("");
  const [nieuweVervolgDeadline, setNieuweVervolgDeadline] = useState("");
  const [bezigActie, setBezigActie] = useState(false);

  useEffect(() => { setA(actiepunt); }, [actiepunt]);

  if (!a) return null;
  const set = (veld) => (waarde) => setA((prev) => ({ ...prev, [veld]: waarde }));
  const inputCls = "w-full h-10 px-3 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors";

  async function bewaarVelden() {
    setBezigVelden(true);
    await onOpslaanVelden(a);
    setBezigVelden(false);
  }

  async function actieToevoegen() {
    if (!nieuweTekst.trim() || bezigActie) return;
    setBezigActie(true);
    await onNieuweActie({ tekst: nieuweTekst, datum: nieuweDatum, statusNa: nieuweStatusNa || null, vervolgDeadline: nieuweVervolgDeadline || null });
    setNieuweTekst("");
    setNieuweStatusNa("");
    setNieuweVervolgDeadline("");
    setBezigActie(false);
  }

  return (
    <Modal onSluit={onSluit}>
      <h3 className="text-[17px] font-bold text-[#2D2D2D] mb-4">Actiepunt</h3>

      {/* Bewerkbare velden */}
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Omschrijving</span>
          <textarea
            value={a.omschrijving || ""}
            onChange={(e) => set("omschrijving")(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors resize-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Verantwoordelijke" value={a.verantwoordelijke} onChange={set("verantwoordelijke")} placeholder="Optioneel" />
          <Veld label="Deadline" type="date" value={a.deadline} onChange={set("deadline")} />
        </div>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Status</span>
          <select value={a.status || "open"} onChange={(e) => set("status")(e.target.value)} className={inputCls}>
            <option value="open">Open</option>
            <option value="in_uitvoering">In uitvoering</option>
            <option value="afgerond">Afgerond</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-[#4A4540] mb-1">Notitie</span>
          <textarea
            value={a.notitie || ""}
            onChange={(e) => set("notitie")(e.target.value)}
            rows={2}
            placeholder="Optioneel"
            className="w-full px-3 py-2 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors resize-none"
          />
        </label>
        <div className="flex items-center justify-between">
          <button onClick={onVerwijder} className="text-[12.5px] font-medium text-[#8A847E] hover:text-[#991A21] transition-colors">
            Actiepunt verwijderen
          </button>
          <button onClick={bewaarVelden} disabled={bezigVelden} className="h-9 px-4 rounded-xl bg-[#991A21] hover:bg-[#7d151b] disabled:opacity-40 text-white text-[13px] font-semibold transition-colors">
            {bezigVelden ? "Opslaan…" : "Wijzigingen opslaan"}
          </button>
        </div>
      </div>

      {/* Tijdlijn van acties */}
      <div className="mt-6 pt-5 border-t border-[#E7E2DB]">
        <h4 className="text-[12px] font-bold uppercase tracking-wide text-[#991A21] mb-3">Acties</h4>

        <div className="space-y-2 mb-4">
          <textarea
            value={nieuweTekst}
            onChange={(e) => setNieuweTekst(e.target.value)}
            rows={2}
            placeholder="Bijv. offerte aangevraagd bij bedrijf X"
            className="w-full px-3 py-2 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[14px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors resize-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10.5px] font-semibold text-[#9B958E]">Datum actie</span>
              <input
                type="date"
                value={nieuweDatum}
                onChange={(e) => setNieuweDatum(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[13px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10.5px] font-semibold text-[#9B958E]">Nieuwe deadline (optioneel)</span>
              <input
                type="date"
                value={nieuweVervolgDeadline}
                onChange={(e) => setNieuweVervolgDeadline(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[13px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors"
              />
            </label>
            <select
              value={nieuweStatusNa}
              onChange={(e) => setNieuweStatusNa(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[#E0D9D3] bg-[#FAF7F2] text-[13px] text-[#2D2D2D] outline-none focus:border-[#991A21] focus:bg-white transition-colors self-end"
            >
              <option value="">Status niet wijzigen</option>
              <option value="open">→ Open</option>
              <option value="in_uitvoering">→ In uitvoering</option>
              <option value="afgerond">→ Afgerond</option>
            </select>
            <button
              onClick={actieToevoegen}
              disabled={!nieuweTekst.trim() || bezigActie}
              className="h-9 px-4 rounded-xl bg-[#2D2D2D] hover:bg-[#1c1c1c] disabled:opacity-40 text-white text-[12.5px] font-semibold transition-colors ml-auto self-end"
            >
              {bezigActie ? "Toevoegen…" : "Actie toevoegen"}
            </button>
          </div>
          {nieuweVervolgDeadline && (
            <p className="text-[11.5px] text-[#B07414]">
              Let op: de deadline van dit actiepunt wordt hiermee verzet naar {fmtDatumISO(nieuweVervolgDeadline)}.
            </p>
          )}
        </div>

        {ladenActies ? (
          <p className="text-[13px] text-[#8A847E]">Laden…</p>
        ) : acties.length === 0 ? (
          <p className="text-[13px] text-[#9B958E]">Nog geen acties gelogd.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {acties.map((act) => (
              <div key={act.id} className="rounded-lg border border-[#EAE5DF] bg-[#FAF8F5] px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-[#2D2D2D]">{fmtDatumISO(act.datum)}</span>
                  {act.status_na && (
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{ color: STATUS_META[act.status_na].tekst, backgroundColor: STATUS_META[act.status_na].bg }}
                    >
                      → {STATUS_META[act.status_na].label}
                    </span>
                  )}
                  {act.vervolg_deadline && (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-[#B07414] bg-[#FBF3E4]">
                      → deadline {fmtDatumISO(act.vervolg_deadline)}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[#4A4540] mt-0.5">{act.tekst}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Herbruikbare UI-bouwstenen (zelfde patroon als Overdrachten.jsx) ──
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
