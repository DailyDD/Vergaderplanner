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
    "mjop_vve?select=id,vve_naam,laatste_import_op,laatste_import_bron&order=vve_naam.asc"
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

  // ── Afgeleide waarden ──
  const statsVoor = (mjopId) => {
    const rijen = alleWerk.filter((w) => w.mjop_id === mjopId);
    let uitgevoerd = 0,
      open = 0,
      achterstallig = 0,
      totOpen = 0,
      werkelijk = 0,
      vervallen = 0;
    for (const r of rijen) {
      if (r.status === "uitgevoerd") {
        uitgevoerd++;
        werkelijk += Number(r.werkelijk_bedrag) || 0;
      } else if (r.status === "vervallen") {
        vervallen++; // telt niet mee als 'nog te doen' of in het resterende budget
      } else {
        open++;
        totOpen += Number(r.begroot_bedrag) || 0;
        if (isAchterstallig(r, jaarNu)) achterstallig++;
      }
    }
    return { aantal: rijen.length, uitgevoerd, open, achterstallig, totOpen, werkelijk, vervallen };
  };

  const gefilterdeParents = parents.filter((p) =>
    normStr(p.vve_naam).toLowerCase().includes(zoek.trim().toLowerCase())
  );

  const geselParent = parents.find((p) => p.id === detailMjopId);
  const detailStats = detailMjopId ? statsVoor(detailMjopId) : null;

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
  // Exporteert altijd de volledige VvE, ongeacht het schermfilter.
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
    const open = detailRows.filter((r) => r.status === "gepland" || r.status === "doorgeschoven").sort(sorteer);
    const gedaan = detailRows.filter((r) => r.status === "uitgevoerd").sort(sorteer);
    const verv = detailRows.filter((r) => r.status === "vervallen").sort(sorteer);

    const som = (arr, veld) => arr.reduce((s, r) => s + (Number(r[veld]) || 0), 0);
    const totOpen = som(open, "begroot_bedrag");
    const totGedaanBegroot = som(gedaan, "begroot_bedrag");
    const totGedaanWerkelijk = som(gedaan, "werkelijk_bedrag");
    const aantalAcht = open.filter((r) => isAchterstallig(r, jaarNu)).length;
    const jaren = Array.from(new Set(open.map((r) => r.jaar))).sort((a, b) => a - b);

    let html =
      `<html><head><meta charset="utf-8"><title>MJOP ${esc(naam)}</title><style>` +
      `body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:24px}` +
      `h1{font-size:17px;color:#991A21;margin:0 0 2px}` +
      `.subtitle{font-size:12px;color:#2D2D2D;margin:0 0 2px}` +
      `.sub{color:#888;font-size:9.5px;margin:0}` +
      `h2{font-size:12.5px;color:#991A21;margin:20px 0 6px;border-bottom:1px solid #991A21;padding-bottom:2px}` +
      `table{width:100%;border-collapse:collapse;margin-bottom:6px}` +
      `th{background:#991A21;color:#fff;padding:4px 6px;text-align:left;font-size:9.5px}` +
      `td{padding:3px 6px;border-bottom:1px solid #eee;vertical-align:top;font-size:10px}` +
      `.num{text-align:right;white-space:nowrap}` +
      `.jaarrij td{background:#f3ece9;font-weight:bold;color:#2D2D2D}` +
      `.totaalrij td{font-weight:bold;border-top:2px solid #991A21;background:#faf7f7}` +
      `.red{color:#B23636;font-weight:bold}` +
      `.samenvatting{width:auto;border-collapse:collapse;margin:10px 0 4px}` +
      `.samenvatting td{border:none;padding:2px 18px 2px 0;font-size:10.5px}` +
      `.samenvatting .lbl{color:#888}.samenvatting .kv{font-weight:bold}` +
      `@media print{h2{page-break-after:avoid}tr{page-break-inside:avoid}}` +
      `</style></head><body>`;

    html += `<h1>${esc(naam)}</h1>`;
    html += `<p class="subtitle">Meerjarenonderhoudsplan — overzicht uitgevoerd en gepland onderhoud</p>`;
    html += `<p class="sub">Gegenereerd op ${fmtDatum(vandaagISO())}${
      geselParent && geselParent.laatste_import_op ? ` &middot; laatste import ${fmtDatum(geselParent.laatste_import_op)}` : ""
    }</p>`;

    html +=
      `<table class="samenvatting">` +
      `<tr><td class="lbl">Uitgevoerd</td><td class="kv">${gedaan.length}</td>` +
      `<td class="lbl">Nog uit te voeren</td><td class="kv">${open.length}${
        aantalAcht ? ` (waarvan ${aantalAcht} achterstallig)` : ""
      }</td></tr>` +
      `<tr><td class="lbl">Begroot nog uit te voeren</td><td class="kv">${euro(totOpen)}</td>` +
      `<td class="lbl">Werkelijk uitgegeven</td><td class="kv">${euro(totGedaanWerkelijk)}</td></tr>` +
      `</table>`;

    // Nog uit te voeren
    html += `<h2>Nog uit te voeren</h2>`;
    if (open.length === 0) {
      html += `<p class="sub">Geen openstaande werkzaamheden.</p>`;
    } else {
      html += `<table><tr><th style="width:56px">Jaar</th><th>Element</th><th>Werkzaamheid</th><th style="width:90px" class="num">Begroot</th></tr>`;
      jaren.forEach((j) => {
        const rj = open.filter((r) => r.jaar === j);
        const sub = som(rj, "begroot_bedrag");
        html += `<tr class="jaarrij"><td>${j}</td><td colspan="2">${rj.length} werkzaamhe${
          rj.length === 1 ? "id" : "den"
        }</td><td class="num">${euro(sub)}</td></tr>`;
        rj.forEach((r) => {
          const loc = r.locatie ? ` — ${esc(r.locatie)}` : "";
          const merk =
            r.status === "doorgeschoven"
              ? ` <span class="red">(doorgeschoven)</span>`
              : isAchterstallig(r, jaarNu)
              ? ` <span class="red">(achterstallig)</span>`
              : "";
          html += `<tr><td></td><td>${esc(r.element)}${loc}</td><td>${esc(r.handeling)}${merk}</td><td class="num">${euro(
            r.begroot_bedrag
          )}</td></tr>`;
        });
      });
      html += `<tr class="totaalrij"><td colspan="3">Totaal nog uit te voeren</td><td class="num">${euro(totOpen)}</td></tr>`;
      html += `</table>`;
    }

    // Uitgevoerd
    html += `<h2>Uitgevoerd</h2>`;
    if (gedaan.length === 0) {
      html += `<p class="sub">Nog geen werkzaamheden afgevinkt als uitgevoerd.</p>`;
    } else {
      html += `<table><tr><th style="width:56px">Jaar</th><th>Element</th><th>Werkzaamheid</th><th style="width:80px" class="num">Begroot</th><th style="width:80px" class="num">Werkelijk</th><th style="width:78px">Datum</th></tr>`;
      gedaan.forEach((r) => {
        const loc = r.locatie ? ` — ${esc(r.locatie)}` : "";
        const w = r.werkelijk_bedrag !== null && r.werkelijk_bedrag !== undefined ? euro(r.werkelijk_bedrag) : "—";
        html += `<tr><td>${r.jaar}</td><td>${esc(r.element)}${loc}</td><td>${esc(r.handeling)}</td><td class="num">${euro(
          r.begroot_bedrag
        )}</td><td class="num">${w}</td><td>${r.datum_uitgevoerd ? fmtDatum(r.datum_uitgevoerd) : "—"}</td></tr>`;
      });
      html += `<tr class="totaalrij"><td colspan="3">Totaal uitgevoerd</td><td class="num">${euro(
        totGedaanBegroot
      )}</td><td class="num">${euro(totGedaanWerkelijk)}</td><td></td></tr>`;
      html += `</table>`;
    }

    // Vervallen (alleen indien aanwezig)
    if (verv.length) {
      html += `<h2>Vervallen</h2>`;
      html += `<table><tr><th style="width:56px">Jaar</th><th>Element</th><th>Werkzaamheid</th><th style="width:90px" class="num">Begroot</th></tr>`;
      verv.forEach((r) => {
        const loc = r.locatie ? ` — ${esc(r.locatie)}` : "";
        html += `<tr><td>${r.jaar}</td><td>${esc(r.element)}${loc}</td><td>${esc(r.handeling)}</td><td class="num">${euro(
          r.begroot_bedrag
        )}</td></tr>`;
      });
      html += `</table>`;
    }

    html += `<p class="sub" style="margin-top:16px">Bedragen conform het geïmporteerde meerjarenonderhoudsplan van de bouwkundige. Dit overzicht toont de actuele stand van uitvoering en dient als hulpmiddel voor de vergadering.</p>`;
    html += `</body></html>`;

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
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={onTerug}
              className="w-9 h-9 rounded-lg border border-[#E7E2DB] flex items-center justify-center text-[#6B6560] hover:text-[#991A21] hover:border-[#D8CFC5] transition-colors shrink-0"
              title="Terug naar portaal"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-[22px] font-bold text-[#2D2D2D] leading-tight">Levend MJOP</h1>
              <p className="text-[13px] text-[#9B958E]">Onderhoudsplan inspoelen en per VvE bijhouden wat is uitgevoerd</p>
            </div>
          </div>

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
  );
}
