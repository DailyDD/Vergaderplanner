import React, { useState, useEffect, useMemo } from "react";

// ── Feedback & Communicatie (hoofd_admin) ────────────────────────
// Beheerkant van de feedbackmodule. Alleen zichtbaar voor hoofd_admin.
// Drie onderdelen:
//   1. Enquêtes  — bouwen, publiceren, doelgroep bepalen, resultaten bekijken
//   2. Berichten — eenmalige mededelingen met leesbevestiging
//   3. Ideeën    — doorlopende ideeënbox modereren (status + reden)
//
// De invulkant (modal + berichten-popup + ideeën indienen) leeft in App.jsx
// en schrijft via de RPC submit_enquete. Toegang server-side geregeld via
// RLS + public.is_hoofd_admin(). Deze module vertrouwt daar volledig op.
//
// Supabase-afhankelijkheden geïnjecteerd vanuit App.jsx via
// initFeedbackDeps({ sbFetch, showToast, getUid }).

let _sbFetch = null;
let _showToast = null;
let _getUid = null;
export function initFeedbackDeps({ sbFetch, showToast, getUid }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
  _getUid = getUid;
}

// ── Portaalwidget: openstaande items voor de dashboardkaart ──────
// Telt gepubliceerde enquêtes, gepubliceerde berichten en nieuwe ideeën.
export async function feedbackSupaLoad() {
  if (!_sbFetch) return null;
  try {
    const [enq, ber, idee] = await Promise.all([
      _sbFetch("enquetes?select=id,status&status=eq.gepubliceerd"),
      _sbFetch("berichten?select=id,status&status=eq.gepubliceerd"),
      _sbFetch("ideeen?select=id,status&status=eq.ontvangen"),
    ]);
    return {
      enquetesLive: (enq || []).length,
      berichtenLive: (ber || []).length,
      nieuweIdeeen: (idee || []).length,
    };
  } catch (e) {
    console.error("feedbackSupaLoad", e);
    return null;
  }
}

const MAANDEN_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function fmtDatumISO(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MAANDEN_NL[d.getMonth()]} ${d.getFullYear()}`;
}

const VRAAGTYPES = [
  { key: "sterren", label: "Sterren (1–5)", heeftOpties: false },
  { key: "schaal10", label: "Schaal (1–10 / NPS)", heeftOpties: false },
  { key: "keuze_enkel", label: "Meerkeuze — één antwoord", heeftOpties: true },
  { key: "keuze_meer", label: "Meerkeuze — meerdere antwoorden", heeftOpties: true },
  { key: "janee", label: "Ja / Nee", heeftOpties: false },
  { key: "open", label: "Open tekst", heeftOpties: false },
];
const typeLabel = (k) => VRAAGTYPES.find((t) => t.key === k)?.label || k;

const STATUS_STYLE = {
  concept: { label: "Concept", tekst: "#8A847E", bg: "#F2EFEC" },
  gepubliceerd: { label: "Gepubliceerd", tekst: "#2D6A4F", bg: "#EAF4EE" },
  gesloten: { label: "Gesloten", tekst: "#991A21", bg: "#FBEAEB" },
};
const IDEE_STATUS = {
  ontvangen: { label: "Ontvangen", tekst: "#8A847E", bg: "#F2EFEC" },
  gepland: { label: "Gepland", tekst: "#8A6D1A", bg: "#FBF3E0" },
  live: { label: "Live", tekst: "#2D6A4F", bg: "#EAF4EE" },
  afgewezen: { label: "Afgewezen", tekst: "#991A21", bg: "#FBEAEB" },
};

const TABS = [
  { key: "enquetes", label: "Enquêtes" },
  { key: "berichten", label: "Berichten" },
  { key: "ideeen", label: "Ideeënbox" },
];

function legeEnquete() {
  return {
    titel: "",
    omschrijving: "",
    anoniem: false,
    blocking: false,
    doelgroep_type: "alle",
    doelgroep_rollen: [],
    doelgroep_users: [],
    start_datum: "",
    eind_datum: "",
  };
}
function legeVraag() {
  return { _tmp: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, vraag: "", type: "sterren", opties: [], verplicht: true };
}
function legeBericht() {
  return {
    titel: "",
    inhoud: "",
    doelgroep_type: "alle",
    doelgroep_rollen: [],
    doelgroep_users: [],
    start_datum: "",
    eind_datum: "",
  };
}

// Bepaalt hoeveel gebruikers binnen een doelgroep vallen (voor respons-rate).
function doelgroepUsers(users, type, rollen, gekozenUsers) {
  if (type === "alle") return users;
  if (type === "rollen") return users.filter((u) => (rollen || []).includes(u.rol));
  if (type === "users") return users.filter((u) => (gekozenUsers || []).includes(u.id));
  return [];
}

// ══ Hoofdcomponent ═══════════════════════════════════════════════
export default function FeedbackBeheer({ onTerug, beheerder }) {
  const [tab, setTab] = useState("enquetes");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    (async () => {
      if (!_sbFetch) return;
      try {
        const rows = await _sbFetch("user_roles?select=id,naam,rol&order=naam.asc");
        setUsers(rows || []);
      } catch (e) {
        console.error("users laden", e);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
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

        <h1 className="text-[22px] font-bold text-[#2D2D2D] leading-tight">Feedback &amp; Communicatie</h1>
        <p className="text-[13px] text-[#8A847E] mt-0.5 mb-4">
          Enquêtes uitzetten, mededelingen versturen en ideeën van beheerders modereren.
        </p>

        <div className="flex gap-1">
          {TABS.map((t) => {
            const actief = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 h-10 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
                  actief ? "border-[#991A21] text-[#991A21]" : "border-transparent text-[#8A847E] hover:text-[#2D2D2D]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-8">
        {tab === "enquetes" && <EnquetesTab users={users} />}
        {tab === "berichten" && <BerichtenTab users={users} />}
        {tab === "ideeen" && <IdeeenTab users={users} />}
      </div>
    </div>
  );
}

// ══ ENQUÊTES ═════════════════════════════════════════════════════
function EnquetesTab({ users }) {
  const [lijst, setLijst] = useState([]);
  const [laden, setLaden] = useState(true);
  const [editor, setEditor] = useState(null); // null | {enquete, vragen}
  const [resultaten, setResultaten] = useState(null); // enquete-object
  const [verwijder, setVerwijder] = useState(null);
  const [responsMap, setResponsMap] = useState({}); // enquete_id -> count

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const rows = await _sbFetch("enquetes?select=*&order=created_at.desc");
      setLijst(rows || []);
      // Respons-tellingen per enquête
      const resp = await _sbFetch("enquete_responses?select=enquete_id");
      const map = {};
      (resp || []).forEach((r) => { map[r.enquete_id] = (map[r.enquete_id] || 0) + 1; });
      setResponsMap(map);
    } catch (e) {
      console.error("enquetes laden", e);
      _showToast && _showToast("Enquêtes laden mislukt.", "fout");
    }
    setLaden(false);
  }
  useEffect(() => { laad(); }, []);

  async function openBewerk(enq) {
    // Concept met vragen ophalen om te bewerken
    try {
      const vragen = await _sbFetch(`enquete_vragen?enquete_id=eq.${enq.id}&select=*&order=volgorde.asc`);
      setEditor({
        enquete: {
          titel: enq.titel, omschrijving: enq.omschrijving || "", anoniem: enq.anoniem, blocking: enq.blocking,
          doelgroep_type: enq.doelgroep_type, doelgroep_rollen: enq.doelgroep_rollen || [],
          doelgroep_users: enq.doelgroep_users || [], start_datum: enq.start_datum || "", eind_datum: enq.eind_datum || "",
        },
        vragen: (vragen || []).map((v) => ({ ...v, _tmp: v.id, opties: v.opties || [] })),
        id: enq.id,
      });
    } catch (e) {
      console.error("vragen laden", e);
      _showToast && _showToast("Vragen laden mislukt.", "fout");
    }
  }

  async function zetStatus(enq, status) {
    try {
      await _sbFetch(`enquetes?id=eq.${enq.id}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      _showToast && _showToast(status === "gepubliceerd" ? "Enquête gepubliceerd." : status === "gesloten" ? "Enquête gesloten." : "Bijgewerkt.", "succes");
      await laad();
    } catch (e) {
      console.error("status enquête", e);
      _showToast && _showToast("Wijzigen mislukt.", "fout");
    }
  }

  async function doeVerwijder() {
    try {
      await _sbFetch(`enquetes?id=eq.${verwijder.id}`, { method: "DELETE" });
      _showToast && _showToast("Enquête verwijderd.", "succes");
      setVerwijder(null);
      await laad();
    } catch (e) {
      console.error("verwijder enquête", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  if (editor) return <EnqueteEditor initieel={editor} users={users} onSluit={() => setEditor(null)} onOpgeslagen={async () => { setEditor(null); await laad(); }} />;
  if (resultaten) return <ResultatenView enquete={resultaten} users={users} onTerug={() => setResultaten(null)} />;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-bold text-[#2D2D2D]">Enquêtes</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">Bouw een vragenlijst, kies de doelgroep en publiceer.</p>
        </div>
        <button
          onClick={() => setEditor({ enquete: legeEnquete(), vragen: [legeVraag()], id: null })}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
          Nieuwe enquête
        </button>
      </div>

      {laden ? (
        <p className="text-[13px] text-[#8A847E]">Laden…</p>
      ) : lijst.length === 0 ? (
        <LegeStaat tekst="Nog geen enquêtes. Maak je eerste vragenlijst aan." />
      ) : (
        <div className="space-y-3">
          {lijst.map((enq) => {
            const st = STATUS_STYLE[enq.status] || STATUS_STYLE.concept;
            const doel = doelgroepUsers(users, enq.doelgroep_type, enq.doelgroep_rollen, enq.doelgroep_users);
            const ingevuld = responsMap[enq.id] || 0;
            const rate = doel.length ? Math.round((ingevuld / doel.length) * 100) : 0;
            return (
              <div key={enq.id} className="bg-white border border-[#E7E2DB] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-[#2D2D2D]">{enq.titel}</span>
                      <Badge {...st} />
                      {enq.anoniem && <Badge label="Anoniem" tekst="#5A5550" bg="#EFECE7" />}
                      {enq.blocking && <Badge label="Blocking" tekst="#8A6D1A" bg="#FBF3E0" />}
                    </div>
                    {enq.omschrijving && <p className="text-[12.5px] text-[#8A847E] mt-1 line-clamp-2">{enq.omschrijving}</p>}
                    <p className="text-[12px] text-[#A8A29C] mt-1.5">
                      {doelLabel(enq, users)} · {(enq.start_datum || enq.eind_datum) ? `${fmtDatumISO(enq.start_datum) || "—"} t/m ${fmtDatumISO(enq.eind_datum) || "—"}` : "geen looptijd"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[18px] font-bold text-[#2D2D2D] leading-none">{rate}%</div>
                    <div className="text-[11px] text-[#A8A29C] mt-0.5">{ingevuld}/{doel.length} ingevuld</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#F2EFEC] flex-wrap">
                  {enq.status === "concept" && (
                    <>
                      <MiniKnop onClick={() => openBewerk(enq)}>Bewerken</MiniKnop>
                      <MiniKnop primair onClick={() => zetStatus(enq, "gepubliceerd")}>Publiceren</MiniKnop>
                    </>
                  )}
                  {enq.status === "gepubliceerd" && (
                    <>
                      <MiniKnop onClick={() => setResultaten(enq)}>Resultaten</MiniKnop>
                      <MiniKnop onClick={() => zetStatus(enq, "gesloten")}>Sluiten</MiniKnop>
                    </>
                  )}
                  {enq.status === "gesloten" && (
                    <>
                      <MiniKnop onClick={() => setResultaten(enq)}>Resultaten</MiniKnop>
                      <MiniKnop onClick={() => zetStatus(enq, "gepubliceerd")}>Heropenen</MiniKnop>
                    </>
                  )}
                  <MiniKnop gevaar onClick={() => setVerwijder(enq)}>Verwijderen</MiniKnop>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verwijder && (
        <Bevestig
          titel="Enquête verwijderen?"
          tekst={`"${verwijder.titel}" en alle bijbehorende vragen en antwoorden worden definitief verwijderd.`}
          onSluit={() => setVerwijder(null)}
          onBevestig={doeVerwijder}
        />
      )}
    </div>
  );
}

function doelLabel(x, users) {
  if (x.doelgroep_type === "alle") return "Alle beheerders";
  if (x.doelgroep_type === "rollen") return `Rollen: ${(x.doelgroep_rollen || []).join(", ") || "—"}`;
  if (x.doelgroep_type === "users") {
    const namen = users.filter((u) => (x.doelgroep_users || []).includes(u.id)).map((u) => u.naam);
    return `${namen.length} gekozen gebruiker(s)`;
  }
  return "";
}

// ── Enquête-editor (bouwer) ──────────────────────────────────────
function EnqueteEditor({ initieel, users, onSluit, onOpgeslagen }) {
  const [enq, setEnq] = useState(initieel.enquete);
  const [vragen, setVragen] = useState(initieel.vragen);
  const [bezig, setBezig] = useState(false);
  const id = initieel.id;

  const set = (k, v) => setEnq((p) => ({ ...p, [k]: v }));

  function vraagWijzig(tmp, patch) {
    setVragen((p) => p.map((v) => (v._tmp === tmp ? { ...v, ...patch } : v)));
  }
  function vraagVerwijder(tmp) {
    setVragen((p) => p.filter((v) => v._tmp !== tmp));
  }
  function vraagVerplaats(tmp, richting) {
    setVragen((p) => {
      const i = p.findIndex((v) => v._tmp === tmp);
      const j = i + richting;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const kopie = [...p];
      [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
      return kopie;
    });
  }

  function valideer() {
    if (!enq.titel.trim()) return "Geef de enquête een titel.";
    if (vragen.length === 0) return "Voeg minstens één vraag toe.";
    for (const v of vragen) {
      if (!v.vraag.trim()) return "Elke vraag moet een vraagtekst hebben.";
      const heeftOpties = VRAAGTYPES.find((t) => t.key === v.type)?.heeftOpties;
      if (heeftOpties && (v.opties || []).filter((o) => o.trim()).length < 2) return `"${v.vraag || "Een vraag"}" heeft minstens 2 antwoordopties nodig.`;
    }
    if (enq.doelgroep_type === "rollen" && (enq.doelgroep_rollen || []).length === 0) return "Kies minstens één rol als doelgroep.";
    if (enq.doelgroep_type === "users" && (enq.doelgroep_users || []).length === 0) return "Kies minstens één gebruiker als doelgroep.";
    return null;
  }

  async function opslaan() {
    const fout = valideer();
    if (fout) { _showToast && _showToast(fout, "fout"); return; }
    setBezig(true);
    try {
      const payload = {
        titel: enq.titel.trim(),
        omschrijving: enq.omschrijving.trim() || null,
        anoniem: enq.anoniem,
        blocking: enq.blocking,
        doelgroep_type: enq.doelgroep_type,
        doelgroep_rollen: enq.doelgroep_type === "rollen" ? enq.doelgroep_rollen : [],
        doelgroep_users: enq.doelgroep_type === "users" ? enq.doelgroep_users : [],
        start_datum: enq.start_datum || null,
        eind_datum: enq.eind_datum || null,
      };

      let enqId = id;
      if (id) {
        await _sbFetch(`enquetes?id=eq.${id}`, {
          method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
        });
        // Vragen opnieuw opbouwen: bestaande weg, nieuwe erin (concept, dus nog geen antwoorden)
        await _sbFetch(`enquete_vragen?enquete_id=eq.${id}`, { method: "DELETE" });
      } else {
        const rows = await _sbFetch("enquetes", {
          method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
        });
        enqId = rows && rows[0] && rows[0].id;
      }
      if (!enqId) throw new Error("Geen enquête-id ontvangen");

      const vraagRijen = vragen.map((v, i) => ({
        enquete_id: enqId,
        volgorde: i,
        vraag: v.vraag.trim(),
        type: v.type,
        opties: VRAAGTYPES.find((t) => t.key === v.type)?.heeftOpties ? (v.opties || []).filter((o) => o.trim()) : [],
        verplicht: v.verplicht,
      }));
      await _sbFetch("enquete_vragen", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(vraagRijen),
      });

      _showToast && _showToast(id ? "Enquête bijgewerkt." : "Enquête opgeslagen als concept.", "succes");
      onOpgeslagen && (await onOpgeslagen());
    } catch (e) {
      console.error("enquête opslaan", e);
      _showToast && _showToast("Opslaan mislukt.", "fout");
    }
    setBezig(false);
  }

  return (
    <div className="max-w-3xl">
      <button onClick={onSluit} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m15 18-6-6 6-6" /></svg>
        Terug naar overzicht
      </button>

      <h2 className="text-[16px] font-bold text-[#2D2D2D] mb-4">{id ? "Enquête bewerken" : "Nieuwe enquête"}</h2>

      <Sectie titel="Basis">
        <Veld label="Titel" value={enq.titel} onChange={(v) => set("titel", v)} placeholder="Bijv. Portaal-evaluatie Q3" verplicht autoFocus />
        <div className="mt-3">
          <label className="block text-[12.5px] font-semibold text-[#5A5550] mb-1">Omschrijving</label>
          <textarea
            value={enq.omschrijving}
            onChange={(e) => set("omschrijving", e.target.value)}
            rows={2}
            placeholder="Korte toelichting die de beheerder ziet."
            className="w-full rounded-lg border border-[#E0DAD2] px-3 py-2 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] resize-none"
          />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <Toggle label="Anoniem invullen" hint="Antwoorden niet herleidbaar naar persoon" aan={enq.anoniem} onChange={(v) => set("anoniem", v)} />
          <Toggle label="Blocking modal" hint="Niet weg te klikken tot ingevuld" aan={enq.blocking} onChange={(v) => set("blocking", v)} />
        </div>
      </Sectie>

      <Sectie titel="Doelgroep">
        <DoelgroepPicker
          type={enq.doelgroep_type}
          rollen={enq.doelgroep_rollen}
          gekozenUsers={enq.doelgroep_users}
          users={users}
          onType={(t) => set("doelgroep_type", t)}
          onRollen={(r) => set("doelgroep_rollen", r)}
          onUsers={(u) => set("doelgroep_users", u)}
        />
      </Sectie>

      <Sectie titel="Looptijd (optioneel)">
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Startdatum" type="date" value={enq.start_datum} onChange={(v) => set("start_datum", v)} />
          <Veld label="Einddatum" type="date" value={enq.eind_datum} onChange={(v) => set("eind_datum", v)} />
        </div>
      </Sectie>

      <Sectie titel={`Vragen (${vragen.length})`}>
        <div className="space-y-3">
          {vragen.map((v, i) => (
            <VraagEditor
              key={v._tmp}
              index={i}
              totaal={vragen.length}
              vraag={v}
              onWijzig={(patch) => vraagWijzig(v._tmp, patch)}
              onVerwijder={() => vraagVerwijder(v._tmp)}
              onOmhoog={() => vraagVerplaats(v._tmp, -1)}
              onOmlaag={() => vraagVerplaats(v._tmp, 1)}
            />
          ))}
        </div>
        <button
          onClick={() => setVragen((p) => [...p, legeVraag()])}
          className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E0DAD2] text-[12.5px] font-semibold text-[#5A5550] hover:border-[#991A21] hover:text-[#991A21] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M12 5v14M5 12h14" /></svg>
          Vraag toevoegen
        </button>
      </Sectie>

      <div className="flex items-center gap-2 mt-6">
        <button
          onClick={opslaan}
          disabled={bezig}
          className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors disabled:opacity-50"
        >
          {bezig ? "Opslaan…" : id ? "Wijzigingen opslaan" : "Opslaan als concept"}
        </button>
        <button onClick={onSluit} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-[#6B6560] hover:text-[#2D2D2D] transition-colors">
          Annuleren
        </button>
      </div>
    </div>
  );
}

function VraagEditor({ index, totaal, vraag, onWijzig, onVerwijder, onOmhoog, onOmlaag }) {
  const heeftOpties = VRAAGTYPES.find((t) => t.key === vraag.type)?.heeftOpties;
  return (
    <div className="bg-white border border-[#E7E2DB] rounded-xl p-3.5">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 pt-1">
          <button onClick={onOmhoog} disabled={index === 0} className="text-[#B8B2AC] hover:text-[#2D2D2D] disabled:opacity-30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="m18 15-6-6-6 6" /></svg>
          </button>
          <button onClick={onOmlaag} disabled={index === totaal - 1} className="text-[#B8B2AC] hover:text-[#2D2D2D] disabled:opacity-30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-[#F2EFEC] text-[#8A847E] text-[11px] font-bold flex items-center justify-center">{index + 1}</span>
            <input
              value={vraag.vraag}
              onChange={(e) => onWijzig({ vraag: e.target.value })}
              placeholder="Typ hier je vraag…"
              className="flex-1 min-w-0 rounded-lg border border-[#E0DAD2] px-3 h-9 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21]"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap pl-7">
            <select
              value={vraag.type}
              onChange={(e) => onWijzig({ type: e.target.value, opties: VRAAGTYPES.find((t) => t.key === e.target.value)?.heeftOpties ? (vraag.opties.length ? vraag.opties : ["", ""]) : [] })}
              className="rounded-lg border border-[#E0DAD2] px-2.5 h-8 text-[12.5px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] bg-white"
            >
              {VRAAGTYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-[#5A5550] cursor-pointer">
              <input type="checkbox" checked={vraag.verplicht} onChange={(e) => onWijzig({ verplicht: e.target.checked })} className="accent-[#991A21]" />
              Verplicht
            </label>
          </div>

          {heeftOpties && (
            <div className="mt-2.5 pl-7 space-y-1.5">
              {(vraag.opties.length ? vraag.opties : [""]).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8C2BB]" />
                  <input
                    value={opt}
                    onChange={(e) => { const arr = [...vraag.opties]; arr[oi] = e.target.value; onWijzig({ opties: arr }); }}
                    placeholder={`Optie ${oi + 1}`}
                    className="flex-1 rounded-lg border border-[#E0DAD2] px-2.5 h-8 text-[12.5px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21]"
                  />
                  <button onClick={() => onWijzig({ opties: vraag.opties.filter((_, x) => x !== oi) })} className="text-[#B8B2AC] hover:text-[#991A21]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button onClick={() => onWijzig({ opties: [...vraag.opties, ""] })} className="text-[12px] font-semibold text-[#991A21] hover:underline pl-3.5">
                + optie
              </button>
            </div>
          )}
        </div>
        <button onClick={onVerwijder} className="text-[#B8B2AC] hover:text-[#991A21] pt-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
        </button>
      </div>
    </div>
  );
}

// ── Resultaten ───────────────────────────────────────────────────
function ResultatenView({ enquete, users, onTerug }) {
  const [vragen, setVragen] = useState([]);
  const [antwoorden, setAntwoorden] = useState([]);
  const [aantalIngevuld, setAantalIngevuld] = useState(0);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    (async () => {
      setLaden(true);
      try {
        const [vr, ant, resp] = await Promise.all([
          _sbFetch(`enquete_vragen?enquete_id=eq.${enquete.id}&select=*&order=volgorde.asc`),
          _sbFetch(`enquete_antwoorden?enquete_id=eq.${enquete.id}&select=*`),
          _sbFetch(`enquete_responses?enquete_id=eq.${enquete.id}&select=id`),
        ]);
        setVragen(vr || []);
        setAntwoorden(ant || []);
        setAantalIngevuld((resp || []).length);
      } catch (e) {
        console.error("resultaten laden", e);
        _showToast && _showToast("Resultaten laden mislukt.", "fout");
      }
      setLaden(false);
    })();
  }, [enquete.id]);

  const doel = doelgroepUsers(users, enquete.doelgroep_type, enquete.doelgroep_rollen, enquete.doelgroep_users);
  const rate = doel.length ? Math.round((aantalIngevuld / doel.length) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <button onClick={onTerug} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m15 18-6-6 6-6" /></svg>
        Terug naar overzicht
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[16px] font-bold text-[#2D2D2D]">{enquete.titel}</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">{enquete.anoniem ? "Anonieme enquête" : "Herleidbaar"} · {aantalIngevuld}/{doel.length} ingevuld ({rate}%)</p>
        </div>
      </div>

      {laden ? (
        <p className="text-[13px] text-[#8A847E]">Laden…</p>
      ) : aantalIngevuld === 0 ? (
        <LegeStaat tekst="Nog geen reacties binnen." />
      ) : (
        <div className="space-y-4">
          {vragen.map((v, i) => (
            <VraagResultaat key={v.id} index={i} vraag={v} antwoorden={antwoorden.filter((a) => a.vraag_id === v.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VraagResultaat({ index, vraag, antwoorden }) {
  const n = antwoorden.length;
  return (
    <div className="bg-white border border-[#E7E2DB] rounded-xl p-4">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-5 h-5 shrink-0 rounded-full bg-[#F2EFEC] text-[#8A847E] text-[11px] font-bold flex items-center justify-center mt-0.5">{index + 1}</span>
        <div>
          <p className="text-[13.5px] font-semibold text-[#2D2D2D]">{vraag.vraag}</p>
          <p className="text-[11.5px] text-[#A8A29C] mt-0.5">{typeLabel(vraag.type)} · {n} reactie(s)</p>
        </div>
      </div>

      {(vraag.type === "sterren" || vraag.type === "schaal10") && <GetalResultaat antwoorden={antwoorden} max={vraag.type === "sterren" ? 5 : 10} />}
      {(vraag.type === "keuze_enkel" || vraag.type === "keuze_meer") && <OptieResultaat vraag={vraag} antwoorden={antwoorden} />}
      {vraag.type === "janee" && <JaNeeResultaat antwoorden={antwoorden} />}
      {vraag.type === "open" && <OpenResultaat antwoorden={antwoorden} />}
    </div>
  );
}

function GetalResultaat({ antwoorden, max }) {
  const getallen = antwoorden.map((a) => Number(a.antwoord_getal)).filter((x) => !isNaN(x));
  if (getallen.length === 0) return <p className="text-[12.5px] text-[#A8A29C]">Geen numerieke antwoorden.</p>;
  const gem = (getallen.reduce((s, x) => s + x, 0) / getallen.length).toFixed(1);
  const verdeling = {};
  for (let i = 1; i <= max; i++) verdeling[i] = 0;
  getallen.forEach((g) => { if (verdeling[g] !== undefined) verdeling[g]++; });
  const piek = Math.max(...Object.values(verdeling), 1);
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-[24px] font-bold text-[#991A21] leading-none">{gem}</span>
        <span className="text-[12.5px] text-[#8A847E]">gemiddeld (van {max})</span>
      </div>
      <div className="space-y-1">
        {Object.entries(verdeling).map(([waarde, aantal]) => (
          <div key={waarde} className="flex items-center gap-2">
            <span className="w-5 text-[11.5px] text-[#8A847E] text-right">{waarde}</span>
            <div className="flex-1 h-4 bg-[#F2EFEC] rounded overflow-hidden">
              <div className="h-full bg-[#991A21] rounded" style={{ width: `${(aantal / piek) * 100}%` }} />
            </div>
            <span className="w-6 text-[11.5px] text-[#8A847E]">{aantal}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptieResultaat({ vraag, antwoorden }) {
  const tel = {};
  (vraag.opties || []).forEach((o) => { tel[o] = 0; });
  let totaalKeuzes = 0;
  antwoorden.forEach((a) => {
    (a.antwoord_opties || []).forEach((o) => { if (tel[o] === undefined) tel[o] = 0; tel[o]++; totaalKeuzes++; });
  });
  const piek = Math.max(...Object.values(tel), 1);
  return (
    <div className="space-y-1.5">
      {Object.entries(tel).map(([opt, aantal]) => (
        <div key={opt} className="flex items-center gap-2">
          <span className="w-40 shrink-0 text-[12.5px] text-[#5A5550] truncate">{opt}</span>
          <div className="flex-1 h-4 bg-[#F2EFEC] rounded overflow-hidden">
            <div className="h-full bg-[#991A21] rounded" style={{ width: `${(aantal / piek) * 100}%` }} />
          </div>
          <span className="w-6 text-[11.5px] text-[#8A847E]">{aantal}</span>
        </div>
      ))}
    </div>
  );
}

function JaNeeResultaat({ antwoorden }) {
  let ja = 0, nee = 0;
  antwoorden.forEach((a) => { const t = (a.antwoord_tekst || "").toLowerCase(); if (t === "ja") ja++; else if (t === "nee") nee++; });
  const tot = ja + nee || 1;
  return (
    <div className="flex gap-3">
      <div className="flex-1 bg-[#EAF4EE] rounded-lg p-3 text-center">
        <div className="text-[20px] font-bold text-[#2D6A4F]">{ja}</div>
        <div className="text-[11.5px] text-[#5A8267]">Ja · {Math.round((ja / tot) * 100)}%</div>
      </div>
      <div className="flex-1 bg-[#FBEAEB] rounded-lg p-3 text-center">
        <div className="text-[20px] font-bold text-[#991A21]">{nee}</div>
        <div className="text-[11.5px] text-[#A85A5E]">Nee · {Math.round((nee / tot) * 100)}%</div>
      </div>
    </div>
  );
}

function OpenResultaat({ antwoorden }) {
  const teksten = antwoorden.map((a) => a.antwoord_tekst).filter((t) => t && t.trim());
  if (teksten.length === 0) return <p className="text-[12.5px] text-[#A8A29C]">Geen open antwoorden.</p>;
  return (
    <div className="space-y-1.5">
      {teksten.map((t, i) => (
        <div key={i} className="text-[12.5px] text-[#5A5550] bg-[#FAF8F5] border border-[#F2EFEC] rounded-lg px-3 py-2">{t}</div>
      ))}
    </div>
  );
}

// ══ BERICHTEN ════════════════════════════════════════════════════
function BerichtenTab({ users }) {
  const [lijst, setLijst] = useState([]);
  const [laden, setLaden] = useState(true);
  const [editor, setEditor] = useState(null);
  const [leesOverzicht, setLeesOverzicht] = useState(null);
  const [verwijder, setVerwijder] = useState(null);
  const [gelezenMap, setGelezenMap] = useState({});

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const rows = await _sbFetch("berichten?select=*&order=created_at.desc");
      setLijst(rows || []);
      const gel = await _sbFetch("bericht_gelezen?select=bericht_id");
      const map = {};
      (gel || []).forEach((g) => { map[g.bericht_id] = (map[g.bericht_id] || 0) + 1; });
      setGelezenMap(map);
    } catch (e) {
      console.error("berichten laden", e);
      _showToast && _showToast("Berichten laden mislukt.", "fout");
    }
    setLaden(false);
  }
  useEffect(() => { laad(); }, []);

  async function zetStatus(ber, status) {
    try {
      await _sbFetch(`berichten?id=eq.${ber.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status }) });
      _showToast && _showToast(status === "gepubliceerd" ? "Bericht gepubliceerd." : "Bijgewerkt.", "succes");
      await laad();
    } catch (e) {
      console.error("status bericht", e);
      _showToast && _showToast("Wijzigen mislukt.", "fout");
    }
  }
  async function doeVerwijder() {
    try {
      await _sbFetch(`berichten?id=eq.${verwijder.id}`, { method: "DELETE" });
      _showToast && _showToast("Bericht verwijderd.", "succes");
      setVerwijder(null);
      await laad();
    } catch (e) {
      console.error("verwijder bericht", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  if (editor) return <BerichtEditor initieel={editor} users={users} onSluit={() => setEditor(null)} onOpgeslagen={async () => { setEditor(null); await laad(); }} />;
  if (leesOverzicht) return <LeesOverzicht bericht={leesOverzicht} users={users} onTerug={() => setLeesOverzicht(null)} />;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-bold text-[#2D2D2D]">Berichten</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">Eenmalige mededelingen. Verschijnen één keer, met leesbevestiging.</p>
        </div>
        <button
          onClick={() => setEditor({ bericht: legeBericht(), id: null })}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
          Nieuw bericht
        </button>
      </div>

      {laden ? (
        <p className="text-[13px] text-[#8A847E]">Laden…</p>
      ) : lijst.length === 0 ? (
        <LegeStaat tekst="Nog geen berichten." />
      ) : (
        <div className="space-y-3">
          {lijst.map((ber) => {
            const st = ber.status === "gepubliceerd" ? STATUS_STYLE.gepubliceerd : STATUS_STYLE.concept;
            const doel = doelgroepUsers(users, ber.doelgroep_type, ber.doelgroep_rollen, ber.doelgroep_users);
            const gelezen = gelezenMap[ber.id] || 0;
            return (
              <div key={ber.id} className="bg-white border border-[#E7E2DB] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-[#2D2D2D]">{ber.titel}</span>
                      <Badge {...st} />
                    </div>
                    <p className="text-[12.5px] text-[#8A847E] mt-1 line-clamp-2">{ber.inhoud}</p>
                    <p className="text-[12px] text-[#A8A29C] mt-1.5">{doelLabel(ber, users)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[18px] font-bold text-[#2D2D2D] leading-none">{gelezen}/{doel.length}</div>
                    <div className="text-[11px] text-[#A8A29C] mt-0.5">gelezen</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#F2EFEC] flex-wrap">
                  {ber.status === "concept" ? (
                    <>
                      <MiniKnop onClick={() => setEditor({ bericht: { ...ber, start_datum: ber.start_datum || "", eind_datum: ber.eind_datum || "" }, id: ber.id })}>Bewerken</MiniKnop>
                      <MiniKnop primair onClick={() => zetStatus(ber, "gepubliceerd")}>Publiceren</MiniKnop>
                    </>
                  ) : (
                    <MiniKnop onClick={() => setLeesOverzicht(ber)}>Wie heeft gelezen</MiniKnop>
                  )}
                  <MiniKnop gevaar onClick={() => setVerwijder(ber)}>Verwijderen</MiniKnop>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verwijder && (
        <Bevestig titel="Bericht verwijderen?" tekst={`"${verwijder.titel}" wordt definitief verwijderd.`} onSluit={() => setVerwijder(null)} onBevestig={doeVerwijder} />
      )}
    </div>
  );
}

function BerichtEditor({ initieel, users, onSluit, onOpgeslagen }) {
  const [ber, setBer] = useState(initieel.bericht);
  const [bezig, setBezig] = useState(false);
  const id = initieel.id;
  const set = (k, v) => setBer((p) => ({ ...p, [k]: v }));

  async function opslaan() {
    if (!ber.titel.trim()) { _showToast && _showToast("Geef het bericht een titel.", "fout"); return; }
    if (!ber.inhoud.trim()) { _showToast && _showToast("Het bericht heeft inhoud nodig.", "fout"); return; }
    if (ber.doelgroep_type === "rollen" && (ber.doelgroep_rollen || []).length === 0) { _showToast && _showToast("Kies minstens één rol.", "fout"); return; }
    if (ber.doelgroep_type === "users" && (ber.doelgroep_users || []).length === 0) { _showToast && _showToast("Kies minstens één gebruiker.", "fout"); return; }
    setBezig(true);
    try {
      const payload = {
        titel: ber.titel.trim(),
        inhoud: ber.inhoud.trim(),
        doelgroep_type: ber.doelgroep_type,
        doelgroep_rollen: ber.doelgroep_type === "rollen" ? ber.doelgroep_rollen : [],
        doelgroep_users: ber.doelgroep_type === "users" ? ber.doelgroep_users : [],
        start_datum: ber.start_datum || null,
        eind_datum: ber.eind_datum || null,
      };
      if (id) {
        await _sbFetch(`berichten?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
      } else {
        await _sbFetch("berichten", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
      }
      _showToast && _showToast(id ? "Bericht bijgewerkt." : "Bericht opgeslagen als concept.", "succes");
      onOpgeslagen && (await onOpgeslagen());
    } catch (e) {
      console.error("bericht opslaan", e);
      _showToast && _showToast("Opslaan mislukt.", "fout");
    }
    setBezig(false);
  }

  return (
    <div className="max-w-2xl">
      <button onClick={onSluit} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m15 18-6-6 6-6" /></svg>
        Terug naar overzicht
      </button>
      <h2 className="text-[16px] font-bold text-[#2D2D2D] mb-4">{id ? "Bericht bewerken" : "Nieuw bericht"}</h2>

      <Sectie titel="Bericht">
        <Veld label="Titel" value={ber.titel} onChange={(v) => set("titel", v)} placeholder="Bijv. Nieuwe module Overdrachten live" verplicht autoFocus />
        <div className="mt-3">
          <label className="block text-[12.5px] font-semibold text-[#5A5550] mb-1">Inhoud <span className="text-[#991A21]">*</span></label>
          <textarea
            value={ber.inhoud}
            onChange={(e) => set("inhoud", e.target.value)}
            rows={5}
            placeholder="Wat wil je de beheerders laten weten?"
            className="w-full rounded-lg border border-[#E0DAD2] px-3 py-2 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] resize-none"
          />
        </div>
      </Sectie>

      <Sectie titel="Doelgroep">
        <DoelgroepPicker
          type={ber.doelgroep_type}
          rollen={ber.doelgroep_rollen}
          gekozenUsers={ber.doelgroep_users}
          users={users}
          onType={(t) => set("doelgroep_type", t)}
          onRollen={(r) => set("doelgroep_rollen", r)}
          onUsers={(u) => set("doelgroep_users", u)}
        />
      </Sectie>

      <div className="flex items-center gap-2 mt-6">
        <button onClick={opslaan} disabled={bezig} className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors disabled:opacity-50">
          {bezig ? "Opslaan…" : id ? "Wijzigingen opslaan" : "Opslaan als concept"}
        </button>
        <button onClick={onSluit} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-[#6B6560] hover:text-[#2D2D2D] transition-colors">Annuleren</button>
      </div>
    </div>
  );
}

function LeesOverzicht({ bericht, users, onTerug }) {
  const [gelezen, setGelezen] = useState([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    (async () => {
      setLaden(true);
      try {
        const rows = await _sbFetch(`bericht_gelezen?bericht_id=eq.${bericht.id}&select=user_id,gelezen_op`);
        setGelezen(rows || []);
      } catch (e) {
        console.error("leesoverzicht", e);
      }
      setLaden(false);
    })();
  }, [bericht.id]);

  const doel = doelgroepUsers(users, bericht.doelgroep_type, bericht.doelgroep_rollen, bericht.doelgroep_users);
  const gelezenIds = new Set(gelezen.map((g) => g.user_id));
  const gelezenOp = {};
  gelezen.forEach((g) => { gelezenOp[g.user_id] = g.gelezen_op; });
  const welGelezen = doel.filter((u) => gelezenIds.has(u.id));
  const nietGelezen = doel.filter((u) => !gelezenIds.has(u.id));

  return (
    <div className="max-w-2xl">
      <button onClick={onTerug} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] hover:text-[#991A21] transition-colors mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m15 18-6-6 6-6" /></svg>
        Terug naar overzicht
      </button>
      <h2 className="text-[16px] font-bold text-[#2D2D2D] mb-1">{bericht.titel}</h2>
      <p className="text-[12.5px] text-[#8A847E] mb-4">{welGelezen.length} van {doel.length} beheerders hebben dit gelezen.</p>

      {laden ? (
        <p className="text-[13px] text-[#8A847E]">Laden…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] font-bold text-[#2D6A4F] mb-2 uppercase tracking-wide">Gelezen ({welGelezen.length})</p>
            <div className="space-y-1">
              {welGelezen.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-[#EAF4EE] rounded-lg px-3 py-2">
                  <span className="text-[12.5px] text-[#2D2D2D]">{u.naam}</span>
                  <span className="text-[11px] text-[#5A8267]">{fmtDatumISO(gelezenOp[u.id])}</span>
                </div>
              ))}
              {welGelezen.length === 0 && <p className="text-[12px] text-[#A8A29C]">Nog niemand.</p>}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold text-[#991A21] mb-2 uppercase tracking-wide">Nog niet ({nietGelezen.length})</p>
            <div className="space-y-1">
              {nietGelezen.map((u) => (
                <div key={u.id} className="bg-[#FAF8F5] border border-[#F2EFEC] rounded-lg px-3 py-2">
                  <span className="text-[12.5px] text-[#5A5550]">{u.naam}</span>
                </div>
              ))}
              {nietGelezen.length === 0 && <p className="text-[12px] text-[#A8A29C]">Iedereen heeft gelezen.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══ IDEEËNBOX ════════════════════════════════════════════════════
function IdeeenTab({ users }) {
  const [lijst, setLijst] = useState([]);
  const [stemMap, setStemMap] = useState({});
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState("alle");
  const [bewerk, setBewerk] = useState(null); // idee met status-editor open
  const [verwijder, setVerwijder] = useState(null);

  async function laad() {
    if (!_sbFetch) return;
    setLaden(true);
    try {
      const [rows, stemmen] = await Promise.all([
        _sbFetch("ideeen?select=*&order=created_at.desc"),
        _sbFetch("idee_stemmen?select=idee_id"),
      ]);
      setLijst(rows || []);
      const map = {};
      (stemmen || []).forEach((s) => { map[s.idee_id] = (map[s.idee_id] || 0) + 1; });
      setStemMap(map);
    } catch (e) {
      console.error("ideeen laden", e);
      _showToast && _showToast("Ideeën laden mislukt.", "fout");
    }
    setLaden(false);
  }
  useEffect(() => { laad(); }, []);

  async function bewaarStatus(idee, status, reden) {
    try {
      // Alleen een echte statusovergang meldt zich bij de indiener — alleen de
      // toelichting aanpassen terwijl de status gelijk blijft triggert niets.
      // Anonieme ideeën hebben geen indiener om te melden.
      const statusGewijzigd = status !== idee.status;
      await _sbFetch(`ideeen?id=eq.${idee.id}`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status, status_reden: reden || null,
          ...(statusGewijzigd && !idee.anoniem ? { status_ongelezen: true } : {}),
        }),
      });
      _showToast && _showToast("Status bijgewerkt.", "succes");
      setBewerk(null);
      await laad();
    } catch (e) {
      console.error("idee status", e);
      _showToast && _showToast("Bijwerken mislukt.", "fout");
    }
  }
  async function doeVerwijder() {
    try {
      await _sbFetch(`ideeen?id=eq.${verwijder.id}`, { method: "DELETE" });
      _showToast && _showToast("Idee verwijderd.", "succes");
      setVerwijder(null);
      await laad();
    } catch (e) {
      console.error("verwijder idee", e);
      _showToast && _showToast("Verwijderen mislukt.", "fout");
    }
  }

  const naamVan = (uid) => users.find((u) => u.id === uid)?.naam || "Onbekend";
  const zichtbaar = filter === "alle" ? lijst : lijst.filter((i) => i.status === filter);
  const gesorteerd = [...zichtbaar].sort((a, b) => (stemMap[b.id] || 0) - (stemMap[a.id] || 0));

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-bold text-[#2D2D2D]">Ideeënbox</h2>
          <p className="text-[12.5px] text-[#8A847E] mt-0.5">Ideeën van beheerders, gesorteerd op stemmen. Zet de status zodat inzenders terugkoppeling zien.</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {["alle", "ontvangen", "gepland", "live", "afgewezen"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ${
              filter === f ? "bg-[#2D2D2D] text-white" : "bg-white border border-[#E7E2DB] text-[#8A847E] hover:text-[#2D2D2D]"
            }`}
          >
            {f === "alle" ? "Alle" : IDEE_STATUS[f].label}
          </button>
        ))}
      </div>

      {laden ? (
        <p className="text-[13px] text-[#8A847E]">Laden…</p>
      ) : gesorteerd.length === 0 ? (
        <LegeStaat tekst="Geen ideeën in deze categorie." />
      ) : (
        <div className="space-y-3">
          {gesorteerd.map((idee) => {
            const st = IDEE_STATUS[idee.status] || IDEE_STATUS.ontvangen;
            const stemmen = stemMap[idee.id] || 0;
            return (
              <div key={idee.id} className="bg-white border border-[#E7E2DB] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-11 text-center">
                    <div className="w-11 h-11 rounded-lg bg-[#F2EFEC] flex flex-col items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#991A21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="m18 15-6-6-6 6" /></svg>
                      <span className="text-[13px] font-bold text-[#2D2D2D] leading-none mt-0.5">{stemmen}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-[#2D2D2D]">{idee.titel}</span>
                      <Badge {...st} />
                    </div>
                    {idee.omschrijving && <p className="text-[12.5px] text-[#5A5550] mt-1">{idee.omschrijving}</p>}
                    <p className="text-[11.5px] text-[#A8A29C] mt-1.5">
                      {idee.anoniem ? "Anoniem ingediend" : `Door ${naamVan(idee.ingediend_door)}`} · {fmtDatumISO(idee.created_at)}
                    </p>
                    {idee.status_reden && (
                      <p className="text-[12px] text-[#8A847E] mt-2 bg-[#FAF8F5] border border-[#F2EFEC] rounded-lg px-3 py-1.5">
                        <span className="font-semibold">Toelichting:</span> {idee.status_reden}
                      </p>
                    )}

                    {bewerk === idee.id ? (
                      <StatusEditor idee={idee} onBewaar={bewaarStatus} onAnnuleer={() => setBewerk(null)} />
                    ) : (
                      <div className="flex items-center gap-1.5 mt-3">
                        <MiniKnop onClick={() => setBewerk(idee.id)}>Status wijzigen</MiniKnop>
                        <MiniKnop gevaar onClick={() => setVerwijder(idee)}>Verwijderen</MiniKnop>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verwijder && (
        <Bevestig titel="Idee verwijderen?" tekst={`"${verwijder.titel}" wordt definitief verwijderd.`} onSluit={() => setVerwijder(null)} onBevestig={doeVerwijder} />
      )}
    </div>
  );
}

function StatusEditor({ idee, onBewaar, onAnnuleer }) {
  const [status, setStatus] = useState(idee.status);
  const [reden, setReden] = useState(idee.status_reden || "");
  return (
    <div className="mt-3 pt-3 border-t border-[#F2EFEC]">
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {Object.entries(IDEE_STATUS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setStatus(k)}
            className={`h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ${status === k ? "text-white" : "border"}`}
            style={status === k ? { background: "#2D2D2D" } : { color: v.tekst, borderColor: "#E7E2DB", background: "#fff" }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <input
        value={reden}
        onChange={(e) => setReden(e.target.value)}
        placeholder="Toelichting voor de inzender (optioneel, bij afwijzing aan te raden)"
        className="w-full rounded-lg border border-[#E0DAD2] px-3 h-9 text-[12.5px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21]"
      />
      <div className="flex items-center gap-1.5 mt-2">
        <MiniKnop primair onClick={() => onBewaar(idee, status, reden)}>Opslaan</MiniKnop>
        <MiniKnop onClick={onAnnuleer}>Annuleren</MiniKnop>
      </div>
    </div>
  );
}

// ══ Gedeelde UI-onderdelen ═══════════════════════════════════════
function DoelgroepPicker({ type, rollen, gekozenUsers, users, onType, onRollen, onUsers }) {
  const beschikbareRollen = useMemo(() => Array.from(new Set(users.map((u) => u.rol).filter(Boolean))).sort(), [users]);
  return (
    <div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {[
          { k: "alle", l: "Alle beheerders" },
          { k: "rollen", l: "Per rol" },
          { k: "users", l: "Specifieke gebruikers" },
        ].map((o) => (
          <button
            key={o.k}
            onClick={() => onType(o.k)}
            className={`h-9 px-3.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
              type === o.k ? "bg-[#991A21] text-white" : "bg-white border border-[#E7E2DB] text-[#8A847E] hover:text-[#2D2D2D]"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>

      {type === "rollen" && (
        <div className="flex flex-wrap gap-1.5">
          {beschikbareRollen.map((r) => {
            const aan = (rollen || []).includes(r);
            return (
              <button
                key={r}
                onClick={() => onRollen(aan ? rollen.filter((x) => x !== r) : [...(rollen || []), r])}
                className={`h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors ${
                  aan ? "border-[#991A21] bg-[#FBEAEB] text-[#991A21]" : "border-[#E7E2DB] text-[#8A847E] hover:text-[#2D2D2D]"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      )}

      {type === "users" && (
        <div className="max-h-56 overflow-y-auto border border-[#E7E2DB] rounded-lg divide-y divide-[#F2EFEC]">
          {users.map((u) => {
            const aan = (gekozenUsers || []).includes(u.id);
            return (
              <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#FAF8F5]">
                <input
                  type="checkbox"
                  checked={aan}
                  onChange={() => onUsers(aan ? gekozenUsers.filter((x) => x !== u.id) : [...(gekozenUsers || []), u.id])}
                  className="accent-[#991A21]"
                />
                <span className="text-[12.5px] text-[#2D2D2D]">{u.naam}</span>
                <span className="text-[11px] text-[#A8A29C] ml-auto">{u.rol}</span>
              </label>
            );
          })}
          {users.length === 0 && <p className="px-3 py-2 text-[12px] text-[#A8A29C]">Geen gebruikers gevonden.</p>}
        </div>
      )}
    </div>
  );
}

function Sectie({ titel, children }) {
  return (
    <div className="bg-white border border-[#E7E2DB] rounded-xl p-4 mb-4">
      <h3 className="text-[12px] font-bold text-[#991A21] uppercase tracking-wide mb-3">{titel}</h3>
      {children}
    </div>
  );
}

function Veld({ label, value, onChange, type = "text", placeholder, verplicht, autoFocus }) {
  return (
    <div>
      <label className="block text-[12.5px] font-semibold text-[#5A5550] mb-1">
        {label} {verplicht && <span className="text-[#991A21]">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-[#E0DAD2] px-3 h-10 text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21]"
      />
    </div>
  );
}

function Toggle({ label, hint, aan, onChange }) {
  return (
    <button onClick={() => onChange(!aan)} className="flex items-start gap-2.5 text-left">
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${aan ? "bg-[#991A21]" : "bg-[#D8D2CB]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${aan ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block text-[12.5px] font-semibold text-[#2D2D2D] leading-tight">{label}</span>
        {hint && <span className="block text-[11px] text-[#A8A29C] leading-tight mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}

function Badge({ label, tekst, bg }) {
  return <span className="inline-flex items-center px-2 h-5 rounded text-[10.5px] font-bold" style={{ color: tekst, background: bg }}>{label}</span>;
}

function MiniKnop({ children, onClick, primair, gevaar }) {
  const stijl = primair
    ? "bg-[#991A21] text-white hover:bg-[#7d151b] border-[#991A21]"
    : gevaar
    ? "bg-white text-[#991A21] border-[#E7E2DB] hover:border-[#991A21]"
    : "bg-white text-[#5A5550] border-[#E7E2DB] hover:border-[#B8B2AC]";
  return (
    <button onClick={onClick} className={`h-8 px-3 rounded-lg text-[12px] font-semibold border transition-colors ${stijl}`}>
      {children}
    </button>
  );
}

function LegeStaat({ tekst }) {
  return (
    <div className="bg-white border border-dashed border-[#D8D2CB] rounded-xl py-10 text-center">
      <p className="text-[13px] text-[#A8A29C]">{tekst}</p>
    </div>
  );
}

function Bevestig({ titel, tekst, onSluit, onBevestig }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onSluit}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold text-[#2D2D2D] mb-1.5">{titel}</h3>
        <p className="text-[13px] text-[#8A847E] mb-5">{tekst}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onSluit} className="h-9 px-4 rounded-lg text-[13px] font-semibold text-[#6B6560] hover:text-[#2D2D2D] transition-colors">Annuleren</button>
          <button onClick={onBevestig} className="h-9 px-4 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d151b] transition-colors">Verwijderen</button>
        </div>
      </div>
    </div>
  );
}
