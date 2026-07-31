import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Levend MJOP ────────────────────────────────────────────────────
// Aparte module, volgt exact het patroon van LodBeheer:
// gedeelde helpers komen binnen via initMjopDeps() dat App.jsx
// één keer aanroept. Geen Supabase-client — alles via sbFetch (REST).
//
// Datamodel: elke Excel-regel is een sjabloon dat over meerdere jaren
// terugkomt. De opgeslagen eenheid is de "occurrence" = werkzaamheid
// in één specifiek jaar (regel × niet-nul jaarkolom).

let _sbFetch = null;
let _showToast = null;
let _getUid = null;

export function initMjopDeps({ sbFetch, showToast, getUid }) {
  _sbFetch = sbFetch;
  _showToast = showToast;
  _getUid = getUid;
}

function toast(msg, type) {
  if (_showToast) _showToast(msg, type);
}

// ── Constanten ─────────────────────────────────────────────────────
const STATUS_META = {
  gepland: { label: "Gepland", pil: "bg-[#F1EEE9] text-[#6B6560]" },
  uitgevoerd: { label: "Uitgevoerd", pil: "bg-[#E8F5EC] text-[#1E7D43]" },
  doorgeschoven: { label: "Doorgeschoven", pil: "bg-[#FBF0DD] text-[#9A6C1E]" },
  vervallen: { label: "Vervallen", pil: "bg-[#F1EEE9] text-[#9B958E] line-through" },
};
const STATUS_KEYS = ["gepland", "uitgevoerd", "doorgeschoven", "vervallen"];

const URGENTIE = [
  { key: "alle", label: "Alle" },
  { key: "achterstallig", label: "Achterstallig" },
  { key: "ditjaar", label: "Dit jaar" },
  { key: "komend", label: "Komende jaren" },
  { key: "uitgevoerd", label: "Uitgevoerd" },
];

// ── Helpers ────────────────────────────────────────────────────────
function euro(n) {
  const v = Number(n) || 0;
  return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normStr(x) {
  return x === null || x === undefined ? "" : String(x).trim();
}

function fmtDatum(iso) {
  return iso
    ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function vandaagISO() {
  return new Date().toISOString().slice(0, 10);
}

// Natuurlijke sleutel van een occurrence — voor dedup bij herimport.
function natKey(o) {
  return [normStr(o.element), normStr(o.locatie), normStr(o.handeling), String(o.jaar)]
    .map((s) => s.toLowerCase())
    .join("|");
}

function isAchterstallig(r, jaarNu) {
  return r.status === "gepland" && r.jaar < jaarNu;
}

// Dekkingsprojectie: gegeven het huidige reservesaldo + jaarlijkse storting,
// per jaar het eindsaldo na aftrek van de nog openstaande (gepland +
// doorgeschoven) kosten. Achterstallige kosten (jaar < nu) worden bij het
// huidige jaar opgeteld, want die moeten nu betaald worden. Uitgevoerd en
// vervallen tellen niet mee. Retourneert null als er geen reserve is ingevoerd.
function berekenDekking(rijen, reserveSaldo, jaarlijkseStorting, jaarNu) {
  if (reserveSaldo === null || reserveSaldo === undefined || reserveSaldo === "") return null;
  const start = Number(reserveSaldo) || 0;
  const storting = Number(jaarlijkseStorting) || 0;
  const open = rijen.filter((r) => r.status === "gepland" || r.status === "doorgeschoven");

  if (open.length === 0) {
    return { jaren: [], gedektTot: null, tekortVanaf: null, altijdGedekt: true, eindSaldo: start, geenKosten: true };
  }

  const maxJaar = Math.max(...open.map((r) => r.jaar));
  const kostenPerJaar = {};
  for (const r of open) {
    const y = r.jaar < jaarNu ? jaarNu : r.jaar;
    kostenPerJaar[y] = (kostenPerJaar[y] || 0) + (Number(r.begroot_bedrag) || 0);
  }

  const jaren = [];
  let saldo = start;
  let tekortVanaf = null;
  for (let y = jaarNu; y <= maxJaar; y++) {
    const kosten = kostenPerJaar[y] || 0;
    const beginSaldo = saldo;
    saldo = saldo + storting - kosten;
    jaren.push({ jaar: y, beginSaldo, storting, kosten, eindSaldo: saldo });
    if (saldo < 0 && tekortVanaf === null) tekortVanaf = y;
  }

  const altijdGedekt = tekortVanaf === null;
  const gedektTot = altijdGedekt ? maxJaar : tekortVanaf - 1;

  // Minimale extra jáárlijkse storting zodat de reserve nooit negatief wordt:
  // per tekortjaar geldt extra × (aantal stortingsjaren tot dat jaar) >= tekort.
  // Het maximum daarvan dekt alle jaren. Naar boven afgerond op hele euro's.
  let extraJaarlijks = 0;
  let diepsteTekort = 0;
  let diepsteTekortJaar = null;
  for (const j of jaren) {
    if (j.eindSaldo < 0) {
      const n = j.jaar - jaarNu + 1;
      const nodig = -j.eindSaldo / n;
      if (nodig > extraJaarlijks) extraJaarlijks = nodig;
      if (j.eindSaldo < diepsteTekort) {
        diepsteTekort = j.eindSaldo;
        diepsteTekortJaar = j.jaar;
      }
    }
  }
  extraJaarlijks = Math.ceil(extraJaarlijks);

  return {
    jaren,
    gedektTot,
    tekortVanaf,
    altijdGedekt,
    eindSaldo: saldo,
    geenKosten: false,
    extraJaarlijks,
    extraMaandelijks: extraJaarlijks / 12,
    diepsteTekort,
    diepsteTekortJaar,
  };
}

// ── Parser: Excel → occurrences ───────────────────────────────────
function parseMjopWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!rows.length) throw new Error("Het bestand bevat geen rijen.");

  const header = rows[0];
  const col = {};
  const yearCols = [];

  header.forEach((h, i) => {
    const hn = normStr(h).toLowerCase();
    if (hn === "nl/sfb" || hn === "nl sfb" || hn === "sfb") col.nl_sfb = i;
    else if (hn === "element") col.element = i;
    else if (hn === "locatie") col.locatie = i;
    else if (hn === "hoeveelheid") col.hoeveelheid = i;
    else if (hn === "eenheid") col.eenheid = i;
    else if (hn === "handeling") col.handeling = i;
    else if (hn === "cyclus") col.cyclus = i;
    else {
      const y = Number(h);
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) yearCols.push({ i, jaar: y });
    }
  });

  if (col.element === undefined || col.handeling === undefined || yearCols.length === 0) {
    throw new Error(
      "Kon de MJOP-kolommen niet herkennen. Verwacht kolommen als Element, Handeling en jaarkolommen (bv. 2025 t/m 2045). Is dit het juiste Excel-formaat van de bouwkundige?"
    );
  }

  const num = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const occurrences = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const element = normStr(row[col.element]);
    if (element === "") continue; // totalenregel / lege regel
    const handeling = normStr(row[col.handeling]);
    const hoev = col.hoeveelheid !== undefined ? num(row[col.hoeveelheid]) : null;
    const cyc = col.cyclus !== undefined ? num(row[col.cyclus]) : null;
    for (const yc of yearCols) {
      const val = num(row[yc.i]);
      if (val !== null && val !== 0) {
        occurrences.push({
          nl_sfb: col.nl_sfb !== undefined ? normStr(row[col.nl_sfb]) : null,
          element,
          locatie: col.locatie !== undefined ? normStr(row[col.locatie]) : null,
          hoeveelheid: hoev,
          eenheid: col.eenheid !== undefined ? normStr(row[col.eenheid]) : null,
          handeling,
          cyclus_jaren: cyc !== null ? Math.round(cyc) : null,
          jaar: yc.jaar,
          begroot_bedrag: Math.round(val * 100) / 100,
        });
      }
    }
  }

  const jaren = yearCols.map((y) => y.jaar);
  return {
    occurrences,
    minJaar: Math.min(...jaren),
    maxJaar: Math.max(...jaren),
    aantalJaarkolommen: yearCols.length,
  };
}

// ── Supabase-laag ─────────────────────────────────────────────────
async function laadParents() {
  const rows = await _sbFetch(
    "mjop_vve?select=id,vve_naam,laatste_import_op,laatste_import_bron,reserve_saldo,jaarlijkse_storting&order=vve_naam.asc"
  );
  return rows || [];
}

// Lichte set van alle werkzaamheden (RLS scoped) — voor tellingen per VvE.
async function laadAlleWerk() {
  const rows = await _sbFetch(
    "mjop_werkzaamheden?select=id,mjop_id,status,jaar,begroot_bedrag,werkelijk_bedrag&order=jaar.asc"
  );
  return rows || [];
}

// Volledige regels van één VvE — voor het detailoverzicht.
async function laadWerkVoor(mjopId) {
  const rows = await _sbFetch(
    `mjop_werkzaamheden?mjop_id=eq.${mjopId}&select=*&order=jaar.asc,element.asc`
  );
  return rows || [];
}

async function updateWerk(rowId, payload) {
  await _sbFetch(`mjop_werkzaamheden?id=eq.${rowId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
}

async function updateReserve(mjopId, payload) {
  await _sbFetch(`mjop_vve?id=eq.${mjopId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
}

// Herimport: parent get-or-create, uitgevoerde regels behouden, rest
// vervangen, nieuwe prognose invoegen (dedup tegen behouden regels).
async function importeerMjop(vveNaam, occurrences, bestandsnaam) {
  const uid = _getUid();
  if (!uid) throw new Error("Geen ingelogde gebruiker gevonden.");

  const bestaand = await _sbFetch(
    `mjop_vve?vve_naam=eq.${encodeURIComponent(vveNaam)}&select=id`
  );
  let mjopId;
  if (bestaand && bestaand.length) {
    mjopId = bestaand[0].id;
  } else {
    const created = await _sbFetch("mjop_vve", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ vve_naam: vveNaam, user_id: uid }),
    });
    mjopId = created[0].id;
  }

  const bestaandeUitgevoerd =
    (await _sbFetch(
      `mjop_werkzaamheden?mjop_id=eq.${mjopId}&status=eq.uitgevoerd&select=element,locatie,handeling,jaar`
    )) || [];
  const behoudenKeys = new Set(bestaandeUitgevoerd.map(natKey));

  await _sbFetch(`mjop_werkzaamheden?mjop_id=eq.${mjopId}&status=neq.uitgevoerd`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  const teInsert = occurrences
    .filter((o) => !behoudenKeys.has(natKey(o)))
    .map((o) => ({ ...o, mjop_id: mjopId, user_id: uid, status: "gepland" }));

  if (teInsert.length) {
    await _sbFetch("mjop_werkzaamheden", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(teInsert),
    });
  }

  await _sbFetch(`mjop_vve?id=eq.${mjopId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      laatste_import_op: new Date().toISOString(),
      laatste_import_bron: bestandsnaam || null,
    }),
  });

  return { mjopId, ingevoegd: teInsert.length, behouden: behoudenKeys.size };
}

// ── Sub-component: statusbadge ─────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.gepland;
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.pil}`}>
      {m.label}
    </span>
  );
}

// ── Sub-component: afvink-editor (top-level i.v.m. focus-behoud) ───
function WerkEditor({ row, bezig, onOpslaan, onAnnuleer }) {
  const [status, setStatus] = useState(row.status || "gepland");
  const [werkelijk, setWerkelijk] = useState(
    row.werkelijk_bedrag === null || row.werkelijk_bedrag === undefined ? "" : String(row.werkelijk_bedrag)
  );
  const [datum, setDatum] = useState(row.datum_uitgevoerd || "");
  const [opmerking, setOpmerking] = useState(row.opmerking || "");

  const kiesStatus = (s) => {
    setStatus(s);
    if (s === "uitgevoerd" && !datum) setDatum(vandaagISO());
  };

  const opslaan = () => {
    const payload = { status, opmerking: opmerking.trim() || null };
    if (status === "uitgevoerd") {
      payload.werkelijk_bedrag = werkelijk === "" ? null : Number(werkelijk);
      payload.datum_uitgevoerd = datum || vandaagISO();
    } else {
      payload.werkelijk_bedrag = null;
      payload.datum_uitgevoerd = null;
    }
    onOpslaan(payload);
  };

  return (
    <div className="px-4 py-4 bg-[#FCFBF9] border-t border-[#F0ECE5]">
      <p className="text-[13px] font-semibold text-[#2D2D2D] mb-0.5">
        {row.jaar} · {row.element}
      </p>
      <p className="text-[12.5px] text-[#6B6560] mb-3">
        {row.handeling}
        {row.locatie ? ` — ${row.locatie}` : ""} · begroot {euro(row.begroot_bedrag)}
      </p>

      <label className="block text-[12px] font-semibold text-[#2D2D2D] mb-1.5">Status</label>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUS_KEYS.map((s) => (
          <button
            key={s}
            onClick={() => kiesStatus(s)}
            className={`h-8 px-3 rounded-lg text-[12.5px] font-medium border transition-colors ${
              status === s
                ? "border-[#991A21] bg-[#F6ECEC] text-[#991A21]"
                : "border-[#E7E2DB] text-[#6B6560] hover:bg-[#FAF8F5]"
            }`}
          >
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      {status === "uitgevoerd" && (
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#2D2D2D] mb-1.5">
              Werkelijk bedrag <span className="font-normal text-[#9B958E]">(begroot: {euro(row.begroot_bedrag)})</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={werkelijk}
              onChange={(e) => setWerkelijk(e.target.value)}
              placeholder="bv. 1150.00"
              className="w-full h-9 px-3 rounded-lg border border-[#E7E2DB] text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#2D2D2D] mb-1.5">Datum uitgevoerd</label>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E7E2DB] text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21]"
            />
          </div>
        </div>
      )}

      <label className="block text-[12px] font-semibold text-[#2D2D2D] mb-1.5">Opmerking (optioneel)</label>
      <textarea
        value={opmerking}
        onChange={(e) => setOpmerking(e.target.value)}
        rows={2}
        placeholder="bv. uitgevoerd door aannemer X, of reden van doorschuiven"
        className="w-full px-3 py-2 rounded-lg border border-[#E7E2DB] text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21] mb-3"
      />

      <div className="flex gap-2">
        <button
          onClick={opslaan}
          disabled={bezig}
          className="h-9 px-4 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d1519] transition-colors disabled:opacity-40"
        >
          {bezig ? "Opslaan…" : "Opslaan"}
        </button>
        <button
          onClick={onAnnuleer}
          disabled={bezig}
          className="h-9 px-4 rounded-lg border border-[#E7E2DB] text-[#6B6560] text-[13px] font-medium hover:bg-[#FAF8F5] transition-colors disabled:opacity-40"
        >
          Annuleren
        </button>
      </div>
    </div>
  );
}

// ── Hoofdcomponent ─────────────────────────────────────────────────
export default function LevendMJOP({ onTerug, beheerder }) {
  const jaarNu = new Date().getFullYear();

  // Import
  const [vveNaam, setVveNaam] = useState("");
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [preview, setPreview] = useState(null);
  const [parseFout, setParseFout] = useState("");
  const [bezig, setBezig] = useState(false);

  // Lijst
  const [parents, setParents] = useState([]);
  const [alleWerk, setAlleWerk] = useState([]);
  const [laden, setLaden] = useState(true);
  const [zoek, setZoek] = useState("");

  // Detail
  const [detailMjopId, setDetailMjopId] = useState(null);
  const [detailRows, setDetailRows] = useState(null); // null = laden
  const [detailLaadFout, setDetailLaadFout] = useState("");
  const [urgentie, setUrgentie] = useState("alle");
  const [jaarFilter, setJaarFilter] = useState("alle");
  const [openRij, setOpenRij] = useState(null);
  const [bezigRij, setBezigRij] = useState(null);
  const [reserveInput, setReserveInput] = useState("");
  const [stortingInput, setStortingInput] = useState("");
  const [bezigReserve, setBezigReserve] = useState(false);

  const herladen = useCallback(async () => {
    setLaden(true);
    try {
      const [p, w] = await Promise.all([laadParents(), laadAlleWerk()]);
      setParents(p);
      setAlleWerk(w);
    } catch (e) {
      toast("Laden mislukt: " + e.message, "error");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    herladen();
  }, [herladen]);

  // ── Import ──
  const onBestand = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setParseFout("");
    setPreview(null);
    setBestandsnaam(file.name);
    try {
      const buf = await file.arrayBuffer();
      const result = parseMjopWorkbook(buf);
      if (result.occurrences.length === 0) {
        setParseFout(
          "Geen uit te voeren werkzaamheden gevonden binnen de jaarkolommen. Mogelijk staan alle bedragen op 0 of buiten het bereik."
        );
      } else {
        setPreview(result);
      }
    } catch (err) {
      setParseFout(err.message);
    }
    e.target.value = "";
  };

  const bestaandeParent = parents.find(
    (p) => normStr(p.vve_naam).toLowerCase() === normStr(vveNaam).toLowerCase()
  );

  const doeImport = async () => {
    if (!vveNaam.trim()) {
      toast("Vul eerst een VvE-naam in.", "error");
      return;
    }
    if (!preview) return;
    setBezig(true);
    try {
      const res = await importeerMjop(vveNaam.trim(), preview.occurrences, bestandsnaam);
      let melding = `${res.ingevoegd} werkzaamheden geïmporteerd voor "${vveNaam.trim()}"`;
      if (res.behouden > 0) melding += ` — ${res.behouden} uitgevoerde regel(s) behouden`;
      toast(melding, "success");
      setPreview(null);
      setBestandsnaam("");
      setVveNaam("");
      await herladen();
    } catch (e) {
      toast("Import mislukt: " + e.message, "error");
    } finally {
      setBezig(false);
    }
  };

  // ── Detail openen ──
  const openDetail = async (mjopId) => {
    setDetailMjopId(mjopId);
    setDetailRows(null);
    setDetailLaadFout("");
    setUrgentie("alle");
    setJaarFilter("alle");
    setOpenRij(null);
    const p = parents.find((x) => x.id === mjopId);
    setReserveInput(p && p.reserve_saldo !== null && p.reserve_saldo !== undefined ? String(p.reserve_saldo) : "");
    setStortingInput(
      p && p.jaarlijkse_storting !== null && p.jaarlijkse_storting !== undefined ? String(p.jaarlijkse_storting) : ""
    );
    try {
      const rows = await laadWerkVoor(mjopId);
      setDetailRows(rows);
    } catch (e) {
      setDetailLaadFout("Laden mislukt: " + e.message);
    }
  };

  const sluitDetail = () => {
    setDetailMjopId(null);
    setDetailRows(null);
  };

  // ── Regel opslaan ──
  const bewaarRij = async (rowId, payload) => {
    setBezigRij(rowId);
    try {
      await updateWerk(rowId, payload);
      setDetailRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, ...payload } : r)));
      setAlleWerk((w) =>
        w.map((x) =>
          x.id === rowId
            ? { ...x, status: payload.status, werkelijk_bedrag: payload.werkelijk_bedrag ?? null }
            : x
        )
      );
      setOpenRij(null);
      toast("Opgeslagen", "success");
    } catch (e) {
      toast("Opslaan mislukt: " + e.message, "error");
    } finally {
      setBezigRij(null);
    }
  };

  // ── Reserve opslaan ──
  const bewaarReserve = async () => {
    const rs = reserveInput.trim() === "" ? null : Number(reserveInput);
    const js = stortingInput.trim() === "" ? null : Number(stortingInput);
    if ((rs !== null && !Number.isFinite(rs)) || (js !== null && !Number.isFinite(js))) {
      toast("Vul geldige bedragen in.", "error");
      return;
    }
    setBezigReserve(true);
    try {
      await updateReserve(detailMjopId, { reserve_saldo: rs, jaarlijkse_storting: js });
      setParents((ps) =>
        ps.map((p) => (p.id === detailMjopId ? { ...p, reserve_saldo: rs, jaarlijkse_storting: js } : p))
      );
      toast("Reserve opgeslagen", "success");
    } catch (e) {
      toast("Opslaan mislukt: " + e.message, "error");
    } finally {
      setBezigReserve(false);
    }
  };

  // ── Afgeleide waarden ──
  const statsVoor = (mjopId) => {
    const rijen = alleWerk.filter((w) => w.mjop_id === mjopId);
    let uitgevoerd = 0,
      open = 0,
      achterstallig = 0,
      totOpen = 0,
      werkelijk = 0,
      vervallen = 0,
      begrootUitgevoerd = 0, // begroot bedrag van uitsluitend de uitgevoerde posten
      werkelijkMetBedrag = 0; // aantal uitgevoerde posten waarvoor ook een werkelijk bedrag is ingevuld
    for (const r of rijen) {
      if (r.status === "uitgevoerd") {
        uitgevoerd++;
        werkelijk += Number(r.werkelijk_bedrag) || 0;
        begrootUitgevoerd += Number(r.begroot_bedrag) || 0;
        if (r.werkelijk_bedrag !== null && r.werkelijk_bedrag !== undefined && r.werkelijk_bedrag !== "") {
          werkelijkMetBedrag++;
        }
      } else if (r.status === "vervallen") {
        vervallen++; // telt niet mee als 'nog te doen' of in het resterende budget
      } else {
        open++;
        totOpen += Number(r.begroot_bedrag) || 0;
        if (isAchterstallig(r, jaarNu)) achterstallig++;
      }
    }
    return {
      aantal: rijen.length,
      uitgevoerd,
      open,
      achterstallig,
      totOpen,
      werkelijk,
      vervallen,
      begrootUitgevoerd,
      werkelijkMetBedrag,
    };
  };

  const gefilterdeParents = parents.filter((p) =>
    normStr(p.vve_naam).toLowerCase().includes(zoek.trim().toLowerCase())
  );

  const geselParent = parents.find((p) => p.id === detailMjopId);
  const detailStats = detailMjopId ? statsVoor(detailMjopId) : null;
  const dek =
    geselParent && detailRows
      ? berekenDekking(detailRows, geselParent.reserve_saldo, geselParent.jaarlijkse_storting, jaarNu)
      : null;
  const reserveGewijzigd =
    geselParent &&
    ((reserveInput.trim() === "" ? null : Number(reserveInput)) !==
      (geselParent.reserve_saldo === null || geselParent.reserve_saldo === undefined ? null : Number(geselParent.reserve_saldo)) ||
      (stortingInput.trim() === "" ? null : Number(stortingInput)) !==
        (geselParent.jaarlijkse_storting === null || geselParent.jaarlijkse_storting === undefined
          ? null
          : Number(geselParent.jaarlijkse_storting)));

  const beschikbareJaren = detailRows
    ? Array.from(new Set(detailRows.map((r) => r.jaar))).sort((a, b) => a - b)
    : [];

  const matchUrgentie = (r) => {
    if (urgentie === "alle") return true;
    if (urgentie === "uitgevoerd") return r.status === "uitgevoerd";
    if (urgentie === "achterstallig") return isAchterstallig(r, jaarNu);
    if (urgentie === "ditjaar") return r.jaar === jaarNu;
    if (urgentie === "komend") return r.jaar > jaarNu;
    return true;
  };

  const gefilterdeRijen = detailRows
    ? detailRows.filter((r) => matchUrgentie(r) && (jaarFilter === "alle" || r.jaar === Number(jaarFilter)))
    : [];

  // ── PDF-export: vergaderrapport (browser-print, geen dependency) ──
  // Hybride opzet: pagina 1 = samenvatting + financieel jaaroverzicht,
  // daarna de onderhoudspunten per jaar. Exporteert altijd de volledige
  // VvE, ongeacht het schermfilter.
  const exporteerPdf = () => {
    if (!detailRows || detailRows.length === 0) return;
    const naam = geselParent ? geselParent.vve_naam : "MJOP";
    const esc = (s) =>
      String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const sorteer = (a, b) => a.jaar - b.jaar || String(a.element).localeCompare(String(b.element));
    const actief = detailRows.filter((r) => r.status !== "vervallen").sort(sorteer);
    const verv = detailRows.filter((r) => r.status === "vervallen").sort(sorteer);

    const som = (arr, veld) => arr.reduce((s, r) => s + (Number(r[veld]) || 0), 0);
    const isOpen = (r) => r.status === "gepland" || r.status === "doorgeschoven";

    const gedaan = actief.filter((r) => r.status === "uitgevoerd");
    const open = actief.filter(isOpen);
    const aantalAcht = open.filter((r) => isAchterstallig(r, jaarNu)).length;
    const totOpen = som(open, "begroot_bedrag");
    const totWerkelijk = som(gedaan, "werkelijk_bedrag");

    const jaren = Array.from(new Set(actief.map((r) => r.jaar))).sort((a, b) => a - b);
    const perJaar = jaren.map((j) => {
      const rj = actief.filter((r) => r.jaar === j);
      return {
        jaar: j,
        rijen: rj,
        aantal: rj.length,
        begroot: som(rj, "begroot_bedrag"),
        open: som(rj.filter(isOpen), "begroot_bedrag"),
      };
    });
    const maxBegroot = Math.max(1, ...perJaar.map((p) => p.begroot));

    const statusKleur = { gepland: "#6B6560", uitgevoerd: "#1E7D43", doorgeschoven: "#9A6C1E", vervallen: "#9B958E" };
    const statusLabel = (s) => (STATUS_META[s] ? STATUS_META[s].label : s);

    let html =
      `<html><head><meta charset="utf-8"><title>MJOP ${esc(naam)}</title><style>` +
      `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
      `body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#2D2D2D;margin:0;padding:0}` +
      `.band{background:#991A21;color:#fff;padding:16px 26px}` +
      `.band h1{font-size:19px;margin:0 0 2px;font-weight:bold}` +
      `.band .st{font-size:11.5px;opacity:.92;margin:0}` +
      `.band .meta{font-size:10px;opacity:.85;margin-top:5px}` +
      `.page{padding:20px 26px}` +
      `.kpis{display:flex;gap:8px;margin:4px 0 6px}` +
      `.kpi{flex:1;border:1px solid #E4DED6;border-radius:6px;padding:7px 9px}` +
      `.kpi .l{font-size:8.5px;color:#8A847C;margin-bottom:2px;text-transform:uppercase;letter-spacing:.03em}` +
      `.kpi .v{font-size:15px;font-weight:bold}` +
      `.kpi .v.red{color:#B23636}` +
      `h2{font-size:12.5px;color:#991A21;margin:20px 0 3px;border-bottom:1px solid #991A21;padding-bottom:2px}` +
      `.hint{font-size:9px;color:#9B958E;margin:0 0 7px}` +
      `table{width:100%;border-collapse:collapse}` +
      `.jt th{background:#F3ECE9;color:#2D2D2D;text-align:left;font-size:9.5px;padding:4px 7px;border-bottom:1px solid #E0D6CD}` +
      `.jt td{padding:4px 7px;font-size:10px;border-bottom:1px solid #EEE}` +
      `.jt .num{text-align:right;white-space:nowrap}` +
      `.jt tr.tot td{font-weight:bold;border-top:2px solid #991A21;background:#FAF7F7}` +
      `.bar{height:8px;background:#E9E0D8;border-radius:3px;overflow:hidden}` +
      `.bar>span{display:block;height:100%;background:#991A21}` +
      `.legend{margin:9px 0 0;font-size:9.5px;color:#6B6560}` +
      `.legend span.it{display:inline-block;margin-right:14px}` +
      `.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}` +
      `.jaarblok{margin-bottom:12px}` +
      `.jaarkop{background:#F3ECE9;border-left:3px solid #991A21;padding:5px 9px;display:flex;justify-content:space-between;font-size:11px}` +
      `.jaarkop .j{font-weight:bold;color:#991A21}` +
      `.jaarkop .s{color:#6B6560}` +
      `.wt th{color:#8A847C;text-align:left;font-weight:normal;font-size:9px;padding:3px 7px;border-bottom:1px solid #E4DED6}` +
      `.wt td{padding:3px 7px;font-size:9.7px;border-bottom:1px solid #F0ECE5;vertical-align:top}` +
      `.wt .num{text-align:right;white-space:nowrap}` +
      `.tag{font-weight:bold}` +
      `.loc{color:#9B958E;font-size:8.7px}` +
      `.strike{text-decoration:line-through;color:#9B958E}` +
      `.foot{margin-top:14px;font-size:9px;color:#9B958E;line-height:1.4}` +
      `.conc{border-radius:6px;padding:8px 12px;font-size:11px;margin:5px 0;line-height:1.45}` +
      `.conc.ok{background:#E8F5EC;color:#1E7D43}` +
      `.conc.nok{background:#FDECEC;color:#B23636}` +
      `.disc{font-size:9px;color:#9B958E;margin:6px 0 0;font-style:italic}` +
      `@media print{.detail{page-break-before:always}.jaarblok{page-break-inside:avoid}h2{page-break-after:avoid}}` +
      `</style></head><body>`;

    html +=
      `<div class="band"><h1>${esc(naam)}</h1>` +
      `<p class="st">Meerjarenonderhoudsplan &middot; stand van uitvoering</p>` +
      `<p class="meta">Gegenereerd op ${fmtDatum(vandaagISO())}${
        geselParent && geselParent.laatste_import_op
          ? ` &nbsp;|&nbsp; laatste import ${fmtDatum(geselParent.laatste_import_op)}`
          : ""
      }</p></div>`;

    html += `<div class="page">`;

    html +=
      `<div class="kpis">` +
      `<div class="kpi"><div class="l">Uitgevoerd</div><div class="v">${gedaan.length}</div></div>` +
      `<div class="kpi"><div class="l">Nog te doen</div><div class="v">${open.length}</div></div>` +
      `<div class="kpi"><div class="l">Achterstallig</div><div class="v red">${aantalAcht}</div></div>` +
      `<div class="kpi"><div class="l">Begroot resterend</div><div class="v">${euro(totOpen)}</div></div>` +
      `<div class="kpi"><div class="l">Werkelijk uitgegeven</div><div class="v">${euro(totWerkelijk)}</div></div>` +
      `</div>`;

    html += `<h2>Financieel jaaroverzicht</h2>`;
    html += `<p class="hint">Begrote bedragen per jaar volgens het onderhoudsplan. "Nog open" is het deel dat nog uitgevoerd moet worden; het cumulatief helpt bij het bepalen van de benodigde reservering.</p>`;
    const saldoKol = !!dek;
    const saldoVoorJaar = {};
    if (dek) dek.jaren.forEach((j) => { saldoVoorJaar[j.jaar] = j.eindSaldo; });
    html +=
      `<table class="jt"><tr><th style="width:52px">Jaar</th><th style="width:52px" class="num">Punten</th>` +
      `<th style="width:100px" class="num">Begroot</th><th style="width:100px" class="num">Nog open</th>` +
      `<th style="width:110px" class="num">Cumulatief</th>` +
      (saldoKol ? `<th style="width:118px" class="num">Eindsaldo reserve</th>` : `<th>Verhouding</th>`) +
      `</tr>`;
    let cum = 0;
    perJaar.forEach((p) => {
      cum += p.begroot;
      const pct = Math.round((p.begroot / maxBegroot) * 100);
      let laatste;
      if (saldoKol) {
        const es = saldoVoorJaar[p.jaar];
        laatste =
          es === undefined
            ? `<td class="num">—</td>`
            : `<td class="num" style="${es < 0 ? "color:#B23636;font-weight:bold" : "color:#1E7D43"}">${euro(es)}</td>`;
      } else {
        laatste = `<td><div class="bar"><span style="width:${pct}%"></span></div></td>`;
      }
      html +=
        `<tr><td>${p.jaar}</td><td class="num">${p.aantal}</td><td class="num">${euro(p.begroot)}</td>` +
        `<td class="num">${euro(p.open)}</td><td class="num">${euro(cum)}</td>` +
        laatste +
        `</tr>`;
    });
    html +=
      `<tr class="tot"><td>Totaal</td><td class="num">${actief.length}</td>` +
      `<td class="num">${euro(som(actief, "begroot_bedrag"))}</td><td class="num">${euro(totOpen)}</td>` +
      `<td class="num">${euro(cum)}</td>` +
      (saldoKol
        ? `<td class="num" style="${dek.eindSaldo < 0 ? "color:#B23636;font-weight:bold" : "color:#1E7D43"}">${euro(dek.eindSaldo)}</td>`
        : `<td></td>`) +
      `</tr>`;
    html += `</table>`;

    html +=
      `<div class="legend">` +
      `<span class="it"><span class="dot" style="background:${statusKleur.gepland}"></span>Gepland</span>` +
      `<span class="it"><span class="dot" style="background:${statusKleur.uitgevoerd}"></span>Uitgevoerd</span>` +
      `<span class="it"><span class="dot" style="background:${statusKleur.doorgeschoven}"></span>Doorgeschoven</span>` +
      `<span class="it"><span class="dot" style="background:#B23636"></span>Achterstallig</span>` +
      (verv.length ? `<span class="it"><span class="dot" style="background:${statusKleur.vervallen}"></span>Vervallen</span>` : "") +
      `</div>`;

    if (dek) {
      html += `<h2>Dekking onderhoudsreserve</h2>`;
      html +=
        `<table class="jt" style="width:auto"><tr>` +
        `<th style="width:150px">Huidige reserve</th><th style="width:170px">Jaarlijkse storting onderhoud</th></tr>` +
        `<tr><td>${euro(geselParent.reserve_saldo)}</td><td>${euro(geselParent.jaarlijkse_storting)}</td></tr></table>`;
      if (dek.geenKosten) {
        html += `<p class="hint">Geen openstaande kosten om te dekken; de reserve blijft ${euro(dek.eindSaldo)}.</p>`;
      } else if (dek.altijdGedekt) {
        html +=
          `<div class="conc ok"><strong>Voldoende: JA.</strong> De reserve dekt alle geplande uitgaven t/m ${dek.gedektTot}. ` +
          `Verwacht eindsaldo ${euro(dek.eindSaldo)}.</div>`;
      } else {
        html +=
          `<div class="conc nok"><strong>Voldoende: NEE.</strong> Gedekt t/m ${dek.gedektTot}; tekort verwacht vanaf ${dek.tekortVanaf}. ` +
          `Op het diepste punt (${dek.diepsteTekortJaar}) komt de reserve ${euro(Math.abs(dek.diepsteTekort))} tekort.<br>` +
          `<strong>Advies:</strong> verhoog de jaarlijkse storting in het onderhoudsfonds met &plusmn; ${euro(dek.extraJaarlijks)} ` +
          `(&asymp; ${euro(dek.extraMaandelijks)} per maand) zodat de reserve gedurende de looptijd niet negatief wordt.</div>`;
      }
      html += `<p class="disc">Het MJOP is een richtlijn. Het werkelijke onderhoudsmoment en de kosten kunnen in de praktijk afwijken van dit overzicht.</p>`;
    }

    html += `<div class="detail">`;
    html += `<h2>Onderhoudspunten per jaar</h2>`;
    perJaar.forEach((p) => {
      html +=
        `<div class="jaarblok"><div class="jaarkop"><span class="j">${p.jaar}</span>` +
        `<span class="s">${p.aantal} punt${p.aantal === 1 ? "" : "en"} &middot; begroot ${euro(p.begroot)}</span></div>`;
      html +=
        `<table class="wt"><tr><th>Element</th><th>Werkzaamheid</th><th style="width:74px">Status</th>` +
        `<th style="width:80px" class="num">Begroot</th><th style="width:80px" class="num">Werkelijk</th><th style="width:68px">Datum</th></tr>`;
      p.rijen.forEach((r) => {
        const acht = isAchterstallig(r, jaarNu);
        const kleur = acht ? "#B23636" : statusKleur[r.status] || "#6B6560";
        const lbl = acht ? "Achterstallig" : statusLabel(r.status);
        const loc = r.locatie ? `<div class="loc">${esc(r.locatie)}</div>` : "";
        const w =
          r.status === "uitgevoerd" && r.werkelijk_bedrag !== null && r.werkelijk_bedrag !== undefined
            ? euro(r.werkelijk_bedrag)
            : "—";
        const dat = r.status === "uitgevoerd" && r.datum_uitgevoerd ? fmtDatum(r.datum_uitgevoerd) : "—";
        html +=
          `<tr><td>${esc(r.element)}${loc}</td><td>${esc(r.handeling)}</td>` +
          `<td><span class="tag" style="color:${kleur}">${lbl}</span></td>` +
          `<td class="num">${euro(r.begroot_bedrag)}</td><td class="num">${w}</td><td>${dat}</td></tr>`;
      });
      html += `</table></div>`;
    });

    if (verv.length) {
      html += `<h2>Vervallen werkzaamheden</h2>`;
      html +=
        `<table class="wt"><tr><th style="width:54px">Jaar</th><th>Element</th><th>Werkzaamheid</th>` +
        `<th style="width:90px" class="num">Begroot</th></tr>`;
      verv.forEach((r) => {
        const loc = r.locatie ? ` — ${esc(r.locatie)}` : "";
        html +=
          `<tr><td>${r.jaar}</td><td class="strike">${esc(r.element)}${loc}</td>` +
          `<td class="strike">${esc(r.handeling)}</td><td class="num strike">${euro(r.begroot_bedrag)}</td></tr>`;
      });
      html += `</table>`;
    }

    html +=
      `<p class="foot">Bedragen conform het geïmporteerde meerjarenonderhoudsplan van de bouwkundige. Dit overzicht toont de actuele stand van uitvoering (uitgevoerd, gepland en achterstallig onderhoud) en dient als hulpmiddel voor de vergadering. Vervallen werkzaamheden zijn niet meegerekend in de begrote bedragen.</p>`;
    html += `</div></div></body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      toast("Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.", "error");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.print();
  };

  // ── KPI-blokje ──
  const Kpi = ({ label, waarde, accent }) => (
    <div className="rounded-lg bg-white border border-[#EFEBE4] px-3 py-2.5">
      <p className="text-[11px] text-[#9B958E] mb-0.5">{label}</p>
      <p className={`text-[17px] font-bold tabular-nums ${accent || "text-[#2D2D2D]"}`}>{waarde}</p>
    </div>
  );

  return (
    <div>
      {/* Standaard topbar (gelijk aan de overige modules) */}
      <div className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 bg-white border-b border-[#E7E2DB]">
        <div className="flex items-center gap-[11px]">
          <div className="w-[3px] h-[22px] bg-[#991A21] rounded-[2px]" />
          <span className="text-[#991A21] flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px]"><path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 5-5"/><path d="M17 9h3v3"/></svg>
          </span>
          <span className="text-[14px] font-bold text-[#2D2D2D]">Levend MJOP</span>
        </div>
        <button
          onClick={onTerug}
          className="inline-flex items-center gap-1.5 text-[12.5px] px-[13px] py-[7px] bg-white border border-[#E7E2DB] rounded-[9px] text-[#6B6560] hover:border-[#991A21] hover:text-[#991A21] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Terug naar portaal
        </button>
      </div>

      <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-7">
      {detailMjopId ? (
        // ══════════════ DETAILWEERGAVE ══════════════
        <>
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={sluitDetail}
              className="w-9 h-9 rounded-lg border border-[#E7E2DB] flex items-center justify-center text-[#6B6560] hover:text-[#991A21] hover:border-[#D8CFC5] transition-colors shrink-0"
              title="Terug naar overzicht"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-[20px] font-bold text-[#2D2D2D] leading-tight truncate">
                {geselParent ? geselParent.vve_naam : "MJOP"}
              </h1>
              <p className="text-[12.5px] text-[#9B958E]">
                Laatste import {geselParent ? fmtDatum(geselParent.laatste_import_op) : "—"}
              </p>
            </div>
            {detailRows && detailRows.length > 0 && (
              <button
                onClick={exporteerPdf}
                className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[#E7E2DB] text-[#6B6560] text-[13px] font-semibold hover:text-[#991A21] hover:border-[#C9BEB2] transition-colors shrink-0"
                title="Exporteer vergaderrapport als PDF"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                <span className="hidden sm:inline">Exporteer PDF</span>
              </button>
            )}
          </div>

          {detailLaadFout ? (
            <div className="rounded-lg bg-[#FDF3F3] border border-[#F3D9D9] px-4 py-3 text-[13px] text-[#9A2A2A]">
              {detailLaadFout}
            </div>
          ) : detailRows === null ? (
            <p className="text-[13px] text-[#9B958E]">Laden…</p>
          ) : (
            <>
              {/* KPI-balk */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
                <Kpi label="Uitgevoerd" waarde={detailStats.uitgevoerd} />
                <Kpi label="Nog te doen" waarde={detailStats.open} />
                <Kpi label="Achterstallig" waarde={detailStats.achterstallig} accent="text-[#B23636]" />
                <Kpi label="Begroot resterend" waarde={euro(detailStats.totOpen)} />
                <Kpi label="Werkelijk uitgegeven" waarde={euro(detailStats.werkelijk)} />
              </div>

              {/* Begroot vs. werkelijk — uitsluitend uitgevoerde posten (optie 1) */}
              {detailStats.werkelijkMetBedrag > 0 && (() => {
                const begroot = detailStats.begrootUitgevoerd;
                const werkelijk = detailStats.werkelijk;
                const verschil = werkelijk - begroot; // > 0 = duurder dan begroot
                const pct = begroot > 0 ? (verschil / begroot) * 100 : null;
                const overBudget = verschil > 0;
                const noemenswaard = Math.abs(verschil) >= 0.005; // afronding op centen
                const kleur = !noemenswaard
                  ? { rand: "#E7E2DB", bg: "#FCFBF9", tekst: "#6B6560", accent: "#2D2D2D" }
                  : overBudget
                  ? { rand: "#F3D9D9", bg: "#FDF6F5", tekst: "#B23636", accent: "#B23636" }
                  : { rand: "#D6E9DC", bg: "#F4FAF6", tekst: "#1E7D43", accent: "#1E7D43" };
                return (
                  <div
                    className="rounded-xl border p-4 sm:p-5 mb-5"
                    style={{ borderColor: kleur.rand, backgroundColor: kleur.bg }}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2.5">
                      <h2 className="text-[14px] font-bold text-[#2D2D2D]">Begroot vs. werkelijk</h2>
                      <span className="text-[12px] text-[#9B958E]">
                        {detailStats.werkelijkMetBedrag} van {detailStats.uitgevoerd} uitgevoerde post
                        {detailStats.uitgevoerd === 1 ? "" : "en"} met werkelijk bedrag
                        {detailStats.werkelijkMetBedrag < detailStats.uitgevoerd
                          ? " (rest zonder bedrag telt niet mee)"
                          : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                      <div>
                        <p className="text-[11px] text-[#9B958E] mb-0.5">Begroot (uitgevoerd deel)</p>
                        <p className="text-[17px] font-bold tabular-nums text-[#2D2D2D]">{euro(begroot)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#9B958E] mb-0.5">Werkelijk uitgegeven</p>
                        <p className="text-[17px] font-bold tabular-nums text-[#2D2D2D]">{euro(werkelijk)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#9B958E] mb-0.5">Afwijking</p>
                        <p className="text-[17px] font-bold tabular-nums" style={{ color: kleur.accent }}>
                          {!noemenswaard
                            ? euro(0)
                            : (overBudget ? "+ " : "− ") + euro(Math.abs(verschil))}
                          {pct !== null && noemenswaard && (
                            <span className="text-[13px] font-semibold ml-1.5">
                              ({overBudget ? "+" : "−"}
                              {Math.abs(pct).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <p className="text-[12px] mt-2.5" style={{ color: kleur.tekst }}>
                      {!noemenswaard
                        ? "Het uitgevoerde onderhoud is precies volgens begroting uitgekomen."
                        : overBudget
                        ? "Het uitgevoerde onderhoud is duurder uitgevallen dan de bouwkundige had begroot."
                        : "Het uitgevoerde onderhoud is goedkoper uitgevallen dan de bouwkundige had begroot."}
                    </p>
                  </div>
                );
              })()}

              {/* Reserve & onderhoudssparen */}
              <div className="bg-white rounded-xl border border-[#E7E2DB] p-4 sm:p-5 mb-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[150px]">
                    <label className="block text-[12px] font-semibold text-[#2D2D2D] mb-1.5">Huidige reserve (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={reserveInput}
                      onChange={(e) => setReserveInput(e.target.value)}
                      placeholder="bv. 45000"
                      className="w-full h-9 px-3 rounded-lg border border-[#E7E2DB] text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21]"
                    />
                  </div>
                  <div className="min-w-[150px]">
                    <label className="block text-[12px] font-semibold text-[#2D2D2D] mb-1.5">Jaarlijkse storting onderhoud (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={stortingInput}
                      onChange={(e) => setStortingInput(e.target.value)}
                      placeholder="bv. 12000"
                      className="w-full h-9 px-3 rounded-lg border border-[#E7E2DB] text-[13px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21]"
                    />
                  </div>
                  <button
                    onClick={bewaarReserve}
                    disabled={bezigReserve || !reserveGewijzigd}
                    className="h-9 px-4 rounded-lg bg-[#991A21] text-white text-[13px] font-semibold hover:bg-[#7d1519] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {bezigReserve ? "Opslaan…" : "Opslaan"}
                  </button>
                </div>

                {reserveGewijzigd && (
                  <p className="text-[11.5px] text-[#9A6C1E] mt-2.5">Niet-opgeslagen wijziging — klik Opslaan om de dekking bij te werken.</p>
                )}

                {dek && !reserveGewijzigd && (
                  <div className="mt-4 border-t border-[#F0ECE5] pt-4">
                    <div className="flex flex-wrap gap-x-8 gap-y-1.5 text-[12.5px] mb-3">
                      <span className="text-[#6B6560]">
                        Huidige reserve <strong className="text-[#2D2D2D]">{euro(geselParent.reserve_saldo)}</strong>
                      </span>
                      <span className="text-[#6B6560]">
                        Jaarlijkse storting <strong className="text-[#2D2D2D]">{euro(geselParent.jaarlijkse_storting)}</strong>
                      </span>
                    </div>

                    {dek.geenKosten ? (
                      <div className="rounded-lg bg-[#F1EEE9] text-[#6B6560] px-4 py-2.5 text-[12.5px]">
                        Geen openstaande kosten om te dekken. Reserve blijft {euro(dek.eindSaldo)}.
                      </div>
                    ) : (
                      <div className={`rounded-lg px-4 py-3 ${dek.altijdGedekt ? "bg-[#E8F5EC]" : "bg-[#FDECEC]"}`}>
                        <p className={`text-[13.5px] font-bold ${dek.altijdGedekt ? "text-[#1E7D43]" : "text-[#B23636]"}`}>
                          Voldoende: {dek.altijdGedekt ? "JA" : "NEE"}
                        </p>
                        <p className={`text-[12.5px] mt-0.5 ${dek.altijdGedekt ? "text-[#1E7D43]" : "text-[#B23636]"}`}>
                          {dek.altijdGedekt
                            ? `De reserve dekt alle geplande uitgaven t/m ${dek.gedektTot}. Verwacht eindsaldo ${euro(dek.eindSaldo)}.`
                            : `Gedekt t/m ${dek.gedektTot} — tekort verwacht vanaf ${dek.tekortVanaf}. Op het diepste punt (${dek.diepsteTekortJaar}) komt de reserve ${euro(Math.abs(dek.diepsteTekort))} tekort.`}
                        </p>
                        {!dek.altijdGedekt && (
                          <p className="text-[12.5px] font-semibold text-[#B23636] mt-2">
                            Advies: verhoog de jaarlijkse storting in het onderhoudsfonds met ± {euro(dek.extraJaarlijks)} (≈ {euro(dek.extraMaandelijks)} per maand).
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-[11px] text-[#9B958E] italic mt-2">
                      Het MJOP is een richtlijn. Het werkelijke onderhoudsmoment en de kosten kunnen in de praktijk afwijken.
                    </p>
                  </div>
                )}

                {!dek && !reserveGewijzigd && (
                  <p className="text-[11.5px] text-[#9B958E] mt-2.5">Voer de reserve en jaarlijkse storting in om te zien tot welk jaar het onderhoud gedekt is.</p>
                )}
              </div>

              {/* Filterbalk */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="flex flex-wrap gap-1.5">
                  {URGENTIE.map((u) => (
                    <button
                      key={u.key}
                      onClick={() => setUrgentie(u.key)}
                      className={`h-8 px-3 rounded-lg text-[12.5px] font-medium border transition-colors ${
                        urgentie === u.key
                          ? "border-[#991A21] bg-[#F6ECEC] text-[#991A21]"
                          : "border-[#E7E2DB] text-[#6B6560] hover:bg-[#FAF8F5]"
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
                <select
                  value={jaarFilter}
                  onChange={(e) => setJaarFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-[#E7E2DB] text-[12.5px] text-[#2D2D2D] bg-white focus:outline-none focus:border-[#991A21] ml-auto"
                >
                  <option value="alle">Alle jaren</option>
                  {beschikbareJaren.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>

              {/* Tabel */}
              <div className="bg-white rounded-xl border border-[#E7E2DB] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] min-w-[680px]">
                    <thead className="bg-[#F8F5F1] text-[#6B6560]">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2.5 w-[58px]">Jaar</th>
                        <th className="text-left font-semibold px-3 py-2.5">Element</th>
                        <th className="text-left font-semibold px-3 py-2.5">Werkzaamheid</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[100px]">Begroot</th>
                        <th className="text-left font-semibold px-3 py-2.5 w-[120px]">Status</th>
                        <th className="text-right font-semibold px-3 py-2.5 w-[100px]">Werkelijk</th>
                        <th className="w-[36px]"></th>
                      </tr>
                    </thead>
                    <tbody className="text-[#2D2D2D]">
                      {gefilterdeRijen.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-[13px] text-[#9B958E]">
                            Geen werkzaamheden voor deze filter.
                          </td>
                        </tr>
                      ) : (
                        gefilterdeRijen.map((r) => {
                          const open = openRij === r.id;
                          const acht = isAchterstallig(r, jaarNu);
                          return (
                            <React.Fragment key={r.id}>
                              <tr
                                onClick={() => setOpenRij(open ? null : r.id)}
                                className={`border-t border-[#F0ECE5] cursor-pointer transition-colors ${open ? "bg-[#FAF8F5]" : "hover:bg-[#FAF8F5]"}`}
                              >
                                <td className="px-3 py-2 tabular-nums">
                                  <span className={acht ? "text-[#B23636] font-semibold" : ""}>{r.jaar}</span>
                                </td>
                                <td className="px-3 py-2">
                                  {r.element}
                                  {r.locatie ? <span className="text-[#9B958E]"> · {r.locatie}</span> : null}
                                </td>
                                <td className="px-3 py-2">{r.handeling}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{euro(r.begroot_bedrag)}</td>
                                <td className="px-3 py-2">
                                  <StatusBadge status={r.status} />
                                  {acht && (
                                    <span className="ml-1.5 text-[10px] font-semibold text-[#B23636]">achterstallig</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-[#6B6560]">
                                  {r.status === "uitgevoerd" && r.werkelijk_bedrag !== null && r.werkelijk_bedrag !== undefined
                                    ? euro(r.werkelijk_bedrag)
                                    : "—"}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-[15px] h-[15px] text-[#B8B2AA] inline transition-transform ${open ? "rotate-180" : ""}`}>
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </td>
                              </tr>
                              {open && (
                                <tr>
                                  <td colSpan={7} className="p-0">
                                    <WerkEditor
                                      key={r.id}
                                      row={r}
                                      bezig={bezigRij === r.id}
                                      onOpslaan={(payload) => bewaarRij(r.id, payload)}
                                      onAnnuleer={() => setOpenRij(null)}
                                    />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-[11.5px] text-[#9B958E] mt-3">
                Klik een regel om de status te wijzigen of werkelijke kosten vast te leggen. Achterstallig = gepland en het jaar is al verstreken.
              </p>
            </>
          )}
        </>
      ) : (
        // ══════════════ OVERZICHTWEERGAVE ══════════════
        <>
          {/* Import-kaart */}
          <div className="bg-white rounded-xl border border-[#E7E2DB] p-5 sm:p-6 mb-6">
            <h2 className="text-[15px] font-bold text-[#2D2D2D] mb-1">MJOP importeren</h2>
            <p className="text-[13px] text-[#6B6560] mb-4">
              Kies het Excel-bestand van de bouwkundige. De werkzaamheden worden per jaar uitgesplitst opgeslagen.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[12.5px] font-semibold text-[#2D2D2D] mb-1.5">VvE-naam</label>
                <input
                  type="text"
                  value={vveNaam}
                  onChange={(e) => setVveNaam(e.target.value)}
                  placeholder="bv. Wassenaarsestraat 46 t/m 56"
                  className="w-full h-10 px-3 rounded-lg border border-[#E7E2DB] text-[13.5px] text-[#2D2D2D] placeholder:text-[#B8B2AA] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21]"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-[#2D2D2D] mb-1.5">Excel-bestand (.xlsx)</label>
                <label className="w-full h-10 px-3 rounded-lg border border-dashed border-[#D8CFC5] text-[13px] text-[#6B6560] flex items-center gap-2 cursor-pointer hover:border-[#991A21] hover:text-[#991A21] transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px] shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  <span className="truncate">{bestandsnaam || "Bestand kiezen…"}</span>
                  <input type="file" accept=".xlsx" onChange={onBestand} className="hidden" />
                </label>
              </div>
            </div>

            {parseFout && (
              <div className="rounded-lg bg-[#FDF3F3] border border-[#F3D9D9] px-4 py-3 text-[13px] text-[#9A2A2A] mb-4">
                {parseFout}
              </div>
            )}

            {preview && (
              <div className="mb-4">
                <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-[#F8F5F1] px-4 py-3 mb-3 text-[13px]">
                  <span className="text-[#6B6560]">
                    <strong className="text-[#2D2D2D]">{preview.occurrences.length}</strong> werkzaamheden
                  </span>
                  <span className="text-[#6B6560]">
                    <strong className="text-[#2D2D2D]">{preview.minJaar}–{preview.maxJaar}</strong> ({preview.aantalJaarkolommen} jaren)
                  </span>
                  <span className="text-[#6B6560]">
                    totaal begroot <strong className="text-[#2D2D2D]">{euro(preview.occurrences.reduce((s, o) => s + o.begroot_bedrag, 0))}</strong>
                  </span>
                </div>

                {bestaandeParent && (
                  <div className="rounded-lg bg-[#FBF6EC] border border-[#EBDCC0] px-4 py-3 text-[12.5px] text-[#8A6D2F] mb-3">
                    Deze VvE heeft al een MJOP (laatste import {fmtDatum(bestaandeParent.laatste_import_op)}). Bij importeren blijven <strong>uitgevoerde</strong> werkzaamheden behouden; de rest wordt vervangen door deze nieuwe prognose.
                  </div>
                )}

                <div className="rounded-lg border border-[#EFEBE4] overflow-hidden">
                  <div className="max-h-[260px] overflow-y-auto">
                    <table className="w-full text-[12.5px]">
                      <thead className="sticky top-0 bg-[#F8F5F1] text-[#6B6560]">
                        <tr>
                          <th className="text-left font-semibold px-3 py-2 w-[54px]">Jaar</th>
                          <th className="text-left font-semibold px-3 py-2">Element</th>
                          <th className="text-left font-semibold px-3 py-2">Locatie</th>
                          <th className="text-left font-semibold px-3 py-2">Werkzaamheid</th>
                          <th className="text-right font-semibold px-3 py-2 w-[110px]">Begroot</th>
                        </tr>
                      </thead>
                      <tbody className="text-[#2D2D2D]">
                        {preview.occurrences.map((o, i) => (
                          <tr key={i} className="border-t border-[#F0ECE5]">
                            <td className="px-3 py-1.5 tabular-nums">{o.jaar}</td>
                            <td className="px-3 py-1.5">{o.element}</td>
                            <td className="px-3 py-1.5 text-[#6B6560]">{o.locatie || "—"}</td>
                            <td className="px-3 py-1.5">{o.handeling}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{euro(o.begroot_bedrag)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={doeImport}
              disabled={!preview || !vveNaam.trim() || bezig}
              className="h-10 px-5 rounded-lg bg-[#991A21] text-white text-[13.5px] font-semibold hover:bg-[#7d1519] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bezig ? "Bezig met importeren…" : preview ? `Importeren naar "${vveNaam.trim() || "…"}"` : "Kies eerst een bestand"}
            </button>
          </div>

          {/* Opgeslagen MJOP's */}
          <div className="bg-white rounded-xl border border-[#E7E2DB] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-[15px] font-bold text-[#2D2D2D]">Opgeslagen MJOP's</h2>
              {parents.length > 0 && (
                <div className="relative ml-auto w-full sm:w-[260px]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px] text-[#B8B2AA] absolute left-3 top-1/2 -translate-y-1/2">
                    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    value={zoek}
                    onChange={(e) => setZoek(e.target.value)}
                    placeholder="Zoek VvE op naam…"
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E7E2DB] text-[13px] text-[#2D2D2D] placeholder:text-[#B8B2AA] focus:outline-none focus:border-[#991A21] focus:ring-1 focus:ring-[#991A21]"
                  />
                </div>
              )}
            </div>

            {laden ? (
              <p className="text-[13px] text-[#9B958E]">Laden…</p>
            ) : parents.length === 0 ? (
              <p className="text-[13px] text-[#9B958E]">Nog geen MJOP's opgeslagen. Importeer hierboven een Excel-bestand om te beginnen.</p>
            ) : gefilterdeParents.length === 0 ? (
              <p className="text-[13px] text-[#9B958E]">Geen VvE gevonden voor "{zoek}".</p>
            ) : (
              <div className="space-y-2">
                {gefilterdeParents.map((p) => {
                  const s = statsVoor(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => openDetail(p.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-[#EFEBE4] text-left hover:bg-[#FAF8F5] hover:border-[#E0D8CD] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-[#2D2D2D] truncate">{p.vve_naam}</p>
                        <p className="text-[11.5px] text-[#9B958E]">
                          {s.aantal} werkzaamheden · {s.uitgevoerd} uitgevoerd · laatste import {fmtDatum(p.laatste_import_op)}
                        </p>
                      </div>
                      {s.achterstallig > 0 && (
                        <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FDECEC] text-[#B23636]">
                          {s.achterstallig} achterstallig
                        </span>
                      )}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px] text-[#B8B2AA] shrink-0">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
