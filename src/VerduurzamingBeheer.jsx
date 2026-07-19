import React, { useState, useEffect, useRef, useCallback } from "react";

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

const CSS_PRINT = `
@media print {
  body * { visibility: hidden !important; }
  #vd-print-area, #vd-print-area * { visibility: visible !important; }
  #vd-print-area {
    position: absolute !important;
    top: 0 !important; left: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    background: #fff !important;
  }
  #vd-print-area .print-header { display: flex !important; }
  #vd-print-area .print-footer { display: flex !important; }
  #vd-print-area button { display: none !important; }
  #vd-print-area table { page-break-inside: auto; }
  #vd-print-area tr { page-break-inside: avoid; page-break-after: auto; }
  #vd-print-area thead { display: table-header-group; }
  @page { margin: 1.5cm; size: A4; }
}`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TOKEN_KEY = "vve_access_token";
const VD_TABLE = "verduurzaming_data";

/* ── Warme huisstijl-ramp (geen koude Tailwind-grijzen) ── */
const C = {
  ink: "#2D2D2D", inkSoft: "#3f3d3b", tekst2: "#6B6560", tekst3: "#9B958E",
  bordeaux: "#991A21", bordeauxDonker: "#7A1419", bordeauxTint: "#F6ECEC", bordeauxRand: "#E3C9C9",
  papier: "#F2EFEC", wit: "#FFFFFF", inset: "#FAF8F5",
  lijn: "#E7E2DB", lijnZacht: "#EFEBE4", randHover: "#C9BEB2",
  groen: "#3B7A57", groenTint: "#EAF2EC", groenRand: "#CFE0D5",
  amber: "#B07414", amberTint: "#F7EEDD", amberRand: "#E8D5B0",
  blauw: "#4A6B8A", blauwTint: "#EAEFF4", blauwRand: "#C4D2DE",
  // Vlakvulling in voortgangsbalken — lichter dan bordeaux, dat als gevuld
  // vlak te donker uitvalt naast het groen.
  balkRood: "#C4565C",
};

function getAuthHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return { apikey: SUPABASE_ANON, Authorization: `Bearer ${token || SUPABASE_ANON}`, "Content-Type": "application/json" };
}

async function vdFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...getAuthHeaders(), ...(options.headers || {}) } });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* vdLoad — GEEN localStorage-fallback meer.
   Reden: localStorage is per browser, niet per gebruiker (AVG-lek: admin op
   Brians machine zag Brians dossiers), en de oude fallback overschreef bij
   opslaan nieuwere Supabase-data met een stale lokale kopie. Bij een lege of
   mislukte respons geven we een lege lijst + een foutsignaal terug, zodat de
   UI "kon niet laden" toont in plaats van stilzwijgend oude data. */
async function vdLoad() {
  const rows = await vdFetch(`${VD_TABLE}?select=id,data&order=created_at.desc`);
  if (!rows) return [];
  return rows.map(r => ({ id: r.id, ...r.data }));
}

async function vdSave(record) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${VD_TABLE}`, {
    method: "POST",
    headers: { ...getAuthHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: record.id, data: record }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  return true;
}

async function vdDelete(id) {
  await vdFetch(`${VD_TABLE}?id=eq.${id}`, { method: "DELETE" });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nu() { return new Date().toISOString(); }

/* Tijdzone-discipline: datum-alleen waarden via lokale getters, nooit toISOString().slice.
   toISOString() is UTC — tussen middernacht en ~02:00 (CET/CEST) levert dat de
   datum van gisteren. Dit is exact de bug die in App.jsx is verholpen. */
const pad2 = n => String(n).padStart(2, "0");
function isoLokaal(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function vandaagLokaal() { return isoLokaal(new Date()); }

function datumNL(iso) { if (!iso) return "—"; return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function datumTijdNL(iso) { if (!iso) return "—"; return new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function dagenTot(iso) { if (!iso) return null; return Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000); }
function dagenActief(iso) { if (!iso) return null; return Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000); }

/* Robuuste geldparser — vervangt de kapotte parseFloat.
   parseFloat("1635,45") = 1635 (centen weg); parseFloat("€ 1635") = 0 (weg);
   parseFloat("1.635,45") = 1.635 (1000x te laag). Deze parser leest alle NL-
   en US-notaties correct en negeert eurotekens, spaties en boekhoudstreepjes.
   Bewezen op alle 15 productiewaarden + randgevallen. */
function parseGeld(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  const negatief = /^-/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return 0;
  const k = s.lastIndexOf(","), p = s.lastIndexOf(".");
  let g;
  if (k > -1 && p > -1) {
    g = k > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (k > -1) {
    const d = s.split(",");
    g = d.length > 2 ? d.slice(0, -1).join("") + "." + d[d.length - 1] : d.join(".");
  } else if (p > -1) {
    const d = s.split(".");
    g = (d.length > 2 || d[d.length - 1].length === 3) ? d.join("") : s;
  } else g = s;
  const n = parseFloat(g);
  if (!Number.isFinite(n)) return 0;
  return negatief ? -Math.abs(n) : n;
}

function euro(n) {
  const val = typeof n === "number" ? n : parseGeld(n);
  return `€ ${(val || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Statussen ── */
const DOSSIER_STATUS = {
  nieuw:           { label: "Nieuw",                 kleur: C.blauw,  bg: C.blauwTint,  rand: C.blauwRand },
  in_behandeling:  { label: "In behandeling",        kleur: C.bordeaux, bg: C.bordeauxTint, rand: C.bordeauxRand },
  wacht_vve:       { label: "Wacht op VvE",          kleur: C.groen,  bg: C.groenTint,  rand: C.groenRand },
  wacht_offertes:  { label: "In afwachting offertes", kleur: C.blauw, bg: C.blauwTint,  rand: C.blauwRand },
  wacht_gemeente:  { label: "Wacht op gemeente",     kleur: C.amber,  bg: C.amberTint,  rand: C.amberRand },
  wacht_subsidie:  { label: "Wacht op subsidie",     kleur: C.amber,  bg: C.amberTint,  rand: C.amberRand },
  afgerond:        { label: "Afgerond",              kleur: C.groen,  bg: C.groenTint,  rand: C.groenRand },
  gesloten:        { label: "Gesloten",              kleur: C.tekst2, bg: "#EFECE8",    rand: C.lijn },
};
/* Statussen die een dossier uit de actieve werkstroom halen. */
const NIET_ACTIEF = ["afgerond", "gesloten"];
const isActief = v => !NIET_ACTIEF.includes(v.status);

const TRAJECTEN = { procesbegeleiding: "Procesbegeleiding leningaanvragen", subsidie: "Subsidieaanvragen", isolatie: "Gemeentelijke isolatieactie Den Haag" };
const TRAJECT_KORT = { procesbegeleiding: "Lening", subsidie: "Subsidie", isolatie: "Isolatie" };
const TRAJECT_KLEUR = {
  procesbegeleiding: { kleur: C.blauw, bg: C.blauwTint, rand: C.blauwRand },
  subsidie:          { kleur: C.groen, bg: C.groenTint, rand: C.groenRand },
  isolatie:          { kleur: C.amber, bg: C.amberTint, rand: C.amberRand },
};
const TYPE_EIGENDOM = { volledig_bewoond: "Volledig eigenaar bewoond", gedeeltelijk_verhuurd: "Gedeeltelijk verhuurd", volledig_verhuurd: "Volledig verhuurd" };
const FONDS_OPTIES = [{ value: "warmtefonds", label: "Warmtefonds" }, { value: "duurzaamheidsfonds", label: "Duurzaamheidsfonds" }, { value: "onbekend", label: "Nog niet bekend" }];
const KANAAL_OPTIES = ["mail", "telefoon", "vergadering", "app", "anders"];
const ACTIETYPE_LABELS = { opvolgen: "Opvolgen dossier", offerte_aanvragen: "Offerte aanvragen", offerte_doorsturen: "Offerte doorsturen naar gemeente", akkoord_ophalen: "Akkoord ophalen bij VvE", document_opvragen: "Document opvragen", factuur_versturen: "Factuur versturen", inkooporder_opvolgen: "Inkooporder opvolgen", traject_afronden: "Traject afronden" };

/* ── Lege constructors ──
   gefactureerdVve + factuurdatumVve staan nu expliciet in het isolatie-traject.
   Ze werden voorheen wél weggeschreven maar niet geïnitialiseerd — een bron van
   inconsistente records. */
function leegVve() { return { id: uid(), naam: "", adres: "", beheerder: "", typeEigendom: "volledig_bewoond", alvBesluit: false, alvDatum: "", status: "nieuw", aangemaakt: nu(), opvolgenOp: "", trajecten: [], offertes: [], communicatielog: [], audittrail: [], tijdlijn: {}, geslotenReden: "" }; }
function leegTraject(type) {
  const base = { id: uid(), type, aangemaakt: nu() };
  if (type === "procesbegeleiding") return { ...base, fonds: "onbekend", bedrag: "", overeenkomstGetekend: false, overeenkomstDatum: "", status: "lopend", gefactureerd: false, factuurdatum: "" };
  if (type === "subsidie") return { ...base, begindatum: "", einddatum: "", voortgang: 0, status: "lopend", teFactureren: "", gefactureerd: false, factuurdatum: "", ontbrekendeDocs: "", instantie: "", opmerkingen: "" };
  return { ...base, aannemers: [{ id: uid(), naam: "", contactpersoon: "" }], werkzaamheden: "", vveAkkoord: false, vveAkkoordDatum: "", doorgestuurdGemeente: false, doorgestuurdDatum: "", inkooporderOntvangen: false, begeleidingsvergoeding: "", gefactureerdVve: false, factuurdatumVve: "", mailNodig: false, actiepunten: "" };
}
function leegOfferte() { return { id: uid(), partij: "", bedrag: "", notitie: "", aangevraagd: false, ontvangen: false, vveVoorlegd: false, vveAkkoord: false, opdracht: false, opdrachtAfgerond: false, tijdlijn: {} }; }
function leegLog() { return { id: uid(), datum: vandaagLokaal(), beheerder: "", partij: "", kanaal: "mail", omschrijving: "" }; }

/* ══════════════════════════════════════════════════════════════════════
   FINANCIEEL — één rekenmodel, één waarheid.
   Voorheen twee tabbladen met tegenstrijdige uitkomsten:
   - "Financieel" telde isolatie-begeleidingsvergoeding als open o.b.v.
     t.gefactureerd (altijd false → eeuwig open), en subsidie's teFactureren.
   - "Facturering" las t.gefactureerdVve (correct) maar liet subsidie weg.
   Nu leest alles via parseGeld en via de JUISTE gefactureerd-vlag per type:
     · isolatie          → begeleidingsvergoeding, vlag = gefactureerdVve
     · procesbegeleiding → bedrag,                vlag = gefactureerd
     · subsidie          → teFactureren,          vlag = gefactureerd
   Eén functie voedt zowel de KPI's, het overzicht per traject, als de
   factureringstabel. Onmogelijk om nog uiteen te lopen. ══════════════════ */
function factureerbareRegels(vves) {
  const rijen = [];
  (vves || []).forEach(v => {
    (v.trajecten || []).forEach(t => {
      if (t.type === "isolatie") {
        const bedrag = parseGeld(t.begeleidingsvergoeding);
        if (bedrag > 0) rijen.push({ vveId: v.id, naam: v.naam || "—", adres: v.adres || "—", beheerder: v.beheerder || "—", type: "isolatie", typeLabel: "Begeleidingsvergoeding", bedrag, gefactureerd: !!t.gefactureerdVve, datum: t.factuurdatumVve || "" });
      } else if (t.type === "procesbegeleiding") {
        const bedrag = parseGeld(t.bedrag);
        if (bedrag > 0) rijen.push({ vveId: v.id, naam: v.naam || "—", adres: v.adres || "—", beheerder: v.beheerder || "—", type: "procesbegeleiding", typeLabel: "Procesbegeleiding", bedrag, gefactureerd: !!t.gefactureerd, datum: t.factuurdatum || "" });
      } else if (t.type === "subsidie") {
        const bedrag = parseGeld(t.teFactureren);
        if (bedrag > 0) rijen.push({ vveId: v.id, naam: v.naam || "—", adres: v.adres || "—", beheerder: v.beheerder || "—", type: "subsidie", typeLabel: "Subsidie", bedrag, gefactureerd: !!t.gefactureerd, datum: t.factuurdatum || "" });
      }
    });
  });
  return rijen;
}

function financieelOverzicht(vves) {
  const rijen = factureerbareRegels(vves);
  const leeg = () => ({ totaal: 0, gefactureerd: 0, open: 0, aantal: 0 });
  const totaal = leeg();
  const per = { isolatie: leeg(), procesbegeleiding: leeg(), subsidie: leeg() };
  rijen.forEach(r => {
    totaal.totaal += r.bedrag; totaal.aantal += 1;
    per[r.type].totaal += r.bedrag; per[r.type].aantal += 1;
    if (r.gefactureerd) { totaal.gefactureerd += r.bedrag; per[r.type].gefactureerd += r.bedrag; }
    else { totaal.open += r.bedrag; per[r.type].open += r.bedrag; }
  });
  return { rijen, totaal, per };
}

/* ══════════════════════════════════════════════════════════════════════
   VOORTGANG — model B: stappen afgeleid uit de aanwezige trajecten.
   Een puur subsidie- of leningdossier kon voorheen nooit boven 33%, omdat de
   balk de isolatie/offerte-flow aannam. Nu heeft elk trajecttype zijn eigen
   stappenreeks; de dossierbalk is het gemiddelde over de aanwezige trajecten.
   Status "afgerond" forceert 100% (bewuste keuze). Status "gesloten" doet dat
   NIET — die toont de echte voortgang tot het punt van sluiten. ══════════ */
function isolatieStappen(v, t) {
  const ofs = v.offertes || [];
  const aangevraagd = ofs.some(o => o.aangevraagd);
  const ontvangen = ofs.filter(o => o.aangevraagd).length > 0 && ofs.filter(o => o.aangevraagd).every(o => o.ontvangen);
  return [
    { lbl: "Dossier aangemaakt", ok: true },
    { lbl: "ALV-besluit", ok: !!v.alvBesluit },
    { lbl: "Offertes aangevraagd", ok: aangevraagd },
    { lbl: "Offertes ontvangen", ok: ontvangen },
    { lbl: "VvE akkoord", ok: !!t.vveAkkoord || ofs.some(o => o.vveAkkoord) },
    { lbl: "Doorgestuurd gemeente", ok: !!t.doorgestuurdGemeente },
    { lbl: "Inkooporder ontvangen", ok: !!t.inkooporderOntvangen },
    { lbl: "Gefactureerd aan VvE", ok: !!t.gefactureerdVve },
  ];
}
function procesStappen(v, t) {
  return [
    { lbl: "Dossier aangemaakt", ok: true },
    { lbl: "ALV-besluit", ok: !!v.alvBesluit },
    { lbl: "Overeenkomst getekend", ok: !!t.overeenkomstGetekend },
    { lbl: "Traject afgerond", ok: t.status === "afgerond" },
    { lbl: "Gefactureerd", ok: !!t.gefactureerd },
  ];
}
function subsidieStappen(v, t) {
  return [
    { lbl: "Dossier aangemaakt", ok: true },
    { lbl: "ALV-besluit", ok: !!v.alvBesluit },
    { lbl: "Aanvraag gestart", ok: !!t.begindatum },
    { lbl: "Documenten compleet", ok: !(t.ontbrekendeDocs || "").trim() && !!t.begindatum },
    { lbl: "Toegekend / afgerond", ok: t.status === "afgerond" },
    { lbl: "Gefactureerd", ok: !!t.gefactureerd },
  ];
}
function trajectStappen(v, t) {
  if (t.type === "isolatie") return isolatieStappen(v, t);
  if (t.type === "procesbegeleiding") return procesStappen(v, t);
  if (t.type === "subsidie") return subsidieStappen(v, t);
  return [{ lbl: "Dossier aangemaakt", ok: true }];
}
function trajectPct(v, t) {
  const s = trajectStappen(v, t);
  return Math.round((s.filter(x => x.ok).length / s.length) * 100);
}
/* Dossier-voortgang: afgerond=100 (bewust); anders gemiddelde over trajecten;
   geen trajecten → alleen "aangemaakt" telt (klein maar eerlijk). */
function dossierPct(v) {
  if (v.status === "afgerond") return 100;
  const tr = v.trajecten || [];
  if (!tr.length) return v.alvBesluit ? 40 : 15;
  const som = tr.reduce((a, t) => a + trajectPct(v, t), 0);
  return Math.round(som / tr.length);
}

function buildTijdlijn(vve) {
  const ev = [];
  const add = (ts, tekst, kleur) => { if (ts) ev.push({ ts, tekst, kleur }); };
  add(vve.aangemaakt, "Dossier aangemaakt", C.blauw);
  add(vve.tijdlijn?.alvBesluit, "ALV-besluit genomen", C.groen);
  (vve.offertes || []).forEach(o => {
    add(o.tijdlijn?.aangevraagd, `Offerte aangevraagd — ${o.partij || "onbekend"}`, C.blauw);
    add(o.tijdlijn?.ontvangen, `Offerte ontvangen — ${o.partij || "onbekend"}`, C.amber);
    add(o.tijdlijn?.vveVoorlegd, `Voorgelegd aan VvE — ${o.partij || "onbekend"}`, C.amber);
    add(o.tijdlijn?.vveAkkoord, `VvE akkoord — ${o.partij || "onbekend"}`, C.groen);
    add(o.tijdlijn?.opdracht, `Opdracht verstrekt — ${o.partij || "onbekend"}`, C.blauw);
    add(o.tijdlijn?.opdrachtAfgerond, `Opdracht afgerond — ${o.partij || "onbekend"}`, C.groen);
  });
  (vve.trajecten || []).forEach(t => {
    if (t.type === "subsidie" && t.begindatum) add(t.begindatum + "T00:00:00", `Subsidieaanvraag gestart (${t.instantie || "?"})`, C.amber);
    if (t.type === "procesbegeleiding" && t.overeenkomstDatum) add(t.overeenkomstDatum + "T00:00:00", "Overeenkomst procesbegeleiding getekend", C.groen);
    if (t.type === "isolatie" && t.doorgestuurdDatum) add(t.doorgestuurdDatum + "T00:00:00", "Offerte doorgestuurd gemeente", C.amber);
    if (t.type === "isolatie" && t.vveAkkoordDatum) add(t.vveAkkoordDatum + "T00:00:00", "VvE akkoord (isolatietraject)", C.groen);
  });
  (vve.communicatielog || []).forEach(l => { if (l.datum) add(l.datum + "T00:00:00", `${l.kanaal} met ${l.partij || "?"} — ${(l.omschrijving || "").slice(0, 55)}`, C.tekst2); });
  add(vve.tijdlijn?.afgerond, "Dossier afgerond", C.groen);
  add(vve.tijdlijn?.gesloten, "Dossier gesloten (niet afgerond)", C.tekst2);
  return ev.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

/* ══════════════════════════════════════════════════════════════════════
   ACTIELIJST — genereert per dossier openstaande acties.
   FIX: afgeronde én gesloten dossiers genereren GEEN acties meer. Voorheen
   filterde alleen "opvolgen" op status; de traject-acties (offerte aanvragen,
   doorsturen, akkoord, inkooporder, factuur) telden door op afgeronde
   dossiers. Zelfde klasse bug als "uitnodiging urgent" op het Admin Dashboard. */
function bouwActies(vves) {
  const acties = [];
  (vves || []).forEach(v => {
    if (!isActief(v)) return; // afgerond/gesloten → geen acties
    if (v.opvolgenOp) {
      const g = dagenTot(v.opvolgenOp);
      if (g !== null && g <= 0) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "opvolgen", traj: "Dossier", detail: `Opvolgen gepland op ${datumNL(v.opvolgenOp)}`, prioriteit: "hoog" });
    }
    (v.trajecten || []).forEach(t => {
      if (t.type === "isolatie") {
        const ofs = v.offertes || [];
        if (!ofs.some(o => o.aangevraagd)) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "offerte_aanvragen", traj: "Isolatie" });
        if (ofs.some(o => o.aangevraagd) && !t.doorgestuurdGemeente) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "offerte_doorsturen", traj: "Isolatie" });
        if (!ofs.some(o => o.vveAkkoord) && ofs.some(o => o.ontvangen)) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "akkoord_ophalen", traj: "Isolatie" });
        if (!t.inkooporderOntvangen && t.doorgestuurdGemeente) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "inkooporder_opvolgen", traj: "Isolatie" });
        if (t.inkooporderOntvangen && !t.gefactureerdVve && parseGeld(t.begeleidingsvergoeding) > 0) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "factuur_versturen", traj: "Isolatie" });
      }
      if (t.type === "subsidie") {
        if ((t.ontbrekendeDocs || "").trim()) acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "document_opvragen", traj: "Subsidie", detail: t.ontbrekendeDocs });
        if (!t.gefactureerd && t.status === "afgerond") acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "factuur_versturen", traj: "Subsidie" });
      }
      if (t.type === "procesbegeleiding" && !t.gefactureerd && t.status === "afgerond") acties.push({ vveId: v.id, vve: v.naam, beh: v.beheerder, type: "factuur_versturen", traj: "Procesbegeleiding" });
    });
  });
  return acties;
}

/* ── Dashboard-samenvatting ──────────────────────────────────────
   Haalt de dossiers zelf op (App.jsx heeft ze niet in state) en geeft
   alleen samengevatte cijfers terug — niet de volledige dossiers. Zo blijft
   de dossierinhoud binnen deze module en verhuist er geen persoonsgegevens
   naar het portaal die daar niet getoond worden.

   `eigenNaam` is optioneel: is die meegegeven, dan komt er een extra telling
   van de dossiers waar die naam als beheerder op staat. Dat is een aanvulling
   op het totaal, geen filter — de module zelf toont ook alle dossiers, en
   portaal en module moeten hetzelfde beeld geven. */
export async function vdDashboardStats(eigenNaam) {
  const dossiers = await vdLoad();
  const lijst = Array.isArray(dossiers) ? dossiers : [];
  const actieveDossiers = lijst.filter(isActief);
  const acties = bouwActies(lijst);

  // Per traject tellen, alleen over actieve dossiers.
  const perTraject = { procesbegeleiding: 0, subsidie: 0, isolatie: 0 };
  actieveDossiers.forEach(v => {
    (v.trajecten || []).forEach(t => {
      if (perTraject[t.type] !== undefined) perTraject[t.type] += 1;
    });
  });

  // Subsidie-einddatums die binnen 14 dagen verlopen — zelfde regel als in
  // de moduleweergave (aantalDl).
  const deadlineNabij = actieveDossiers.filter(v =>
    (v.trajecten || []).some(t => {
      if (t.type !== 'subsidie' || !t.einddatum) return false;
      const g = dagenTot(t.einddatum);
      return g !== null && g <= 14 && g >= 0;
    })
  ).length;

  // Dossiers waarvan de opvolgdatum is verstreken of vandaag is.
  const opvolgenNu = actieveDossiers.filter(v => {
    if (!v.opvolgenOp) return false;
    const g = dagenTot(v.opvolgenOp);
    return g !== null && g <= 0;
  }).length;

  const eigen = eigenNaam
    ? actieveDossiers.filter(v => (v.beheerder || '') === eigenNaam).length
    : null;
  const eigenActies = eigenNaam
    ? acties.filter(a => (a.beh || '') === eigenNaam).length
    : null;

  return {
    totaal: lijst.length,
    actief: actieveDossiers.length,
    afgerond: lijst.filter(v => v.status === 'afgerond').length,
    acties: acties.length,
    perTraject,
    deadlineNabij,
    opvolgenNu,
    eigen,
    eigenActies,
  };
}

/* ── Inline SVG-iconen (fill=none, stroke=currentColor, 1.75) — geen emoji ── */
const Ico = {
  leaf: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg>,
  euro: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 8.5a3.5 3.5 0 0 0-5 0M9 12h6M9 15.5a3.5 3.5 0 0 0 5 0" /><circle cx="12" cy="12" r="9" /></svg>,
  list: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
  clock: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  check: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5" /></svg>,
  chevron: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>,
  arrowLeft: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>,
  plus: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>,
  trash: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>,
  print: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>,
  search: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
  alert: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></svg>,
  doc: p => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></svg>,
};
/* ══════════════════════════════════════════════════════════════════════
   UI-PRIMITIEVEN — warme ramp, 1px randen, rounded-xl, geen koude grijzen
   ══════════════════════════════════════════════════════════════════════ */
function Label({ children }) {
  return <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 5 }}>{children}</label>;
}
function Veld({ label, children }) { return <div><Label>{label}</Label>{children}</div>; }

const inpStijl = {
  width: "100%", background: C.inset, border: `1px solid ${C.lijn}`, borderRadius: 10,
  padding: "8px 11px", fontSize: 14, color: C.ink, outline: "none", transition: "border-color .15s",
};
function Inp({ value, onChange, placeholder = "", type = "text" }) {
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={inpStijl}
    onFocus={e => (e.target.style.borderColor = C.bordeaux)}
    onBlur={e => (e.target.style.borderColor = C.lijn)} />;
}
/* Geldveld — toont een live-genormaliseerde hint zodat de gebruiker ziet wat
   het systeem van zijn invoer maakt. Slaat de ruwe string op (compat), maar
   parseGeld leest hem correct. Zo verdwijnt de "€ 1635 → 0"-val zichtbaar. */
function GeldInp({ value, onChange, placeholder = "bijv. 1.500,00" }) {
  const parsed = parseGeld(value);
  const toonHint = (value ?? "").toString().trim() !== "" && Number.isFinite(parsed);
  return (
    <div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.tekst3, pointerEvents: "none" }}>€</span>
        <input value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode="decimal"
          style={{ ...inpStijl, paddingLeft: 24, fontVariantNumeric: "tabular-nums" }}
          onFocus={e => (e.target.style.borderColor = C.bordeaux)}
          onBlur={e => (e.target.style.borderColor = C.lijn)} />
      </div>
      {toonHint && <div style={{ fontSize: 10.5, color: C.tekst3, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>Wordt gelezen als {euro(parsed)}</div>}
    </div>
  );
}
function Sel({ value, onChange, children }) {
  return <select value={value} onChange={e => onChange(e.target.value)}
    style={{ ...inpStijl, cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239B958E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 32 }}
    onFocus={e => (e.target.style.borderColor = C.bordeaux)}
    onBlur={e => (e.target.style.borderColor = C.lijn)}>{children}</select>;
}
function Txa({ value, onChange, placeholder = "", rows = 3 }) {
  return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ ...inpStijl, resize: "none", lineHeight: 1.5 }}
    onFocus={e => (e.target.style.borderColor = C.bordeaux)}
    onBlur={e => (e.target.style.borderColor = C.lijn)} />;
}
function Chk({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <div onClick={() => onChange(!checked)} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? C.bordeaux : C.randHover}`, background: checked ? C.bordeaux : C.wit, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s", color: "#fff" }}>
        {checked && <Ico.check width={12} height={12} />}
      </div>
      <span style={{ fontSize: 14, color: C.ink }}>{label}</span>
    </label>
  );
}
/* Vinkje in "chip"-vorm voor de offerte-/traject-stappen — groen wanneer af. */
function ChipChk({ checked, onChange, label }) {
  return (
    <label onClick={() => onChange(!checked)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "7px 9px", background: checked ? C.groenTint : C.wit, border: `1px solid ${checked ? C.groenRand : C.lijn}`, borderRadius: 8, fontSize: 11, fontWeight: 600, color: checked ? C.groen : C.tekst2, userSelect: "none", transition: "all .15s" }}>
      <div style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${checked ? C.groen : C.randHover}`, background: checked ? C.groen : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}>
        {checked && <Ico.check width={9} height={9} />}
      </div>
      {label}
    </label>
  );
}

function StatusBadge({ status }) {
  const s = DOSSIER_STATUS[status] || DOSSIER_STATUS.nieuw;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: s.bg, color: s.kleur, border: `1px solid ${s.rand}`, whiteSpace: "nowrap" }}>{s.label}</span>;
}
function TrajectBadge({ type }) {
  const k = TRAJECT_KLEUR[type] || { kleur: C.tekst2, bg: "#EFECE8", rand: C.lijn };
  return <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: k.bg, color: k.kleur, border: `1px solid ${k.rand}` }}>{TRAJECT_KORT[type] || type}</span>;
}
function DeadlineBadge({ iso }) {
  const d = dagenTot(iso);
  if (d === null) return null;
  let stijl;
  if (d < 0) stijl = { bg: C.bordeauxTint, kleur: C.bordeaux, rand: C.bordeauxRand, txt: `${Math.abs(d)}d over` };
  else if (d <= 7) stijl = { bg: C.bordeauxTint, kleur: C.bordeaux, rand: C.bordeauxRand, txt: `nog ${d}d` };
  else if (d <= 21) stijl = { bg: C.amberTint, kleur: C.amber, rand: C.amberRand, txt: `nog ${d}d` };
  else stijl = { bg: C.groenTint, kleur: C.groen, rand: C.groenRand, txt: `nog ${d}d` };
  return <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: stijl.bg, color: stijl.kleur, border: `1px solid ${stijl.rand}`, fontVariantNumeric: "tabular-nums" }}>{stijl.txt}</span>;
}

/* ── Voortgangsbalk (model B): segment per trajecttype, gemiddelde bovenaan ── */
function VoortgangsBalk({ vve }) {
  const pct = dossierPct(vve);
  const tr = vve.trajecten || [];
  const afgerond = vve.status === "afgerond";
  const gesloten = vve.status === "gesloten";
  const balkKleur = afgerond ? C.groen : gesloten ? C.tekst2 : pct >= 75 ? C.groen : pct >= 40 ? C.amber : C.bordeaux;
  // Balkvulling volgt dezelfde drempels, maar met het lichtere rood — als
  // gevuld vlak is bordeaux te donker. De percentagetekst houdt bordeaux,
  // want tekst heeft het contrast wél nodig.
  const balkVulling = afgerond ? C.groen : gesloten ? C.tekst2 : pct >= 75 ? C.groen : pct >= 40 ? C.amber : C.balkRood;
  // Bij precies 1 traject is de bovenste balk een letterlijk duplicaat van de
  // enige traject-rij eronder — dan verbergen we 'm. Bij 0 of 2+ trajecten
  // blijft hij staan: bij 0 is het de enige voortgangsindicatie, bij 2+ is
  // het de enige plek die het gecombineerde totaal toont.
  const toonTotaalBalk = tr.length !== 1;
  return (
    <div>
      {toonTotaalBalk && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3 }}>Voortgang{gesloten ? " (gesloten)" : ""}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: balkKleur, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: C.lijnZacht, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: balkVulling, borderRadius: 999, transition: "width .4s" }} />
          </div>
        </>
      )}
      {tr.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: toonTotaalBalk ? 10 : 0 }}>
          {tr.map(t => {
            const tp = afgerond ? 100 : trajectPct(vve, t);
            const k = TRAJECT_KLEUR[t.type] || { kleur: C.tekst2, bg: "#EFECE8", rand: C.lijn };
            return (
              <div key={t.id} style={{ flex: "1 1 120px", minWidth: 110, background: k.bg, border: `1px solid ${k.rand}`, borderRadius: 9, padding: "7px 9px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: k.kleur }}>{TRAJECT_KORT[t.type]}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: k.kleur, fontVariantNumeric: "tabular-nums" }}>{tp}%</span>
                </div>
                <div style={{ height: 4, background: C.wit, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${tp}%`, height: "100%", background: k.kleur, borderRadius: 999, transition: "width .4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Stappen-checklist per traject (leest model-B stappen) ── */
function StappenLijst({ vve, t }) {
  const stappen = trajectStappen(vve, t);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {stappen.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", background: s.ok ? C.groenTint : C.inset, border: `1px solid ${s.ok ? C.groenRand : C.lijn}`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: s.ok ? C.groen : C.tekst3 }}>
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: s.ok ? C.groen : "transparent", border: `1.5px solid ${s.ok ? C.groen : C.randHover}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
            {s.ok && <Ico.check width={8} height={8} />}
          </div>
          {s.lbl}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   OFFERTES-TAB — label "Voorgelegd aan VvE" consistent gemaakt
   ══════════════════════════════════════════════════════════════════════ */
function OffertesTab({ vve, onUpdate }) {
  const togChk = (idx, field, value) => {
    const ofs = [...(vve.offertes || [])];
    const tl = { ...(ofs[idx].tijdlijn || {}) };
    if (value && !tl[field]) tl[field] = nu(); else if (!value) delete tl[field];
    ofs[idx] = { ...ofs[idx], [field]: value, tijdlijn: tl };
    onUpdate({ ...vve, offertes: ofs });
  };
  const updV = (idx, field, val) => { const ofs = [...(vve.offertes || [])]; ofs[idx] = { ...ofs[idx], [field]: val }; onUpdate({ ...vve, offertes: ofs }); };
  const add = () => onUpdate({ ...vve, offertes: [...(vve.offertes || []), leegOfferte()] });
  const del = (idx) => { if (!confirm("Offerte verwijderen?")) return; const ofs = [...(vve.offertes || [])]; ofs.splice(idx, 1); onUpdate({ ...vve, offertes: ofs }); };
  const stappen = [["aangevraagd", "Offerte aangevraagd"], ["ontvangen", "Offerte ontvangen"], ["vveVoorlegd", "Voorgelegd aan VvE"], ["vveAkkoord", "VvE akkoord"], ["opdracht", "Opdracht verstrekt"], ["opdrachtAfgerond", "Opdracht afgerond"]];
  return (
    <div>
      <p style={{ fontSize: 12.5, color: C.tekst2, marginBottom: 14 }}>Registreer per partij de offertestatus. De voortgangsbalk wordt automatisch bijgewerkt.</p>
      {(vve.offertes || []).length === 0 && <div style={{ textAlign: "center", padding: "28px 0", color: C.tekst3, fontSize: 13 }}>Nog geen offertes geregistreerd.</div>}
      {(vve.offertes || []).map((o, i) => (
        <div key={o.id || i} style={{ background: C.inset, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, marginBottom: 14, alignItems: "end" }}>
            <Veld label="Partij / aannemer"><Inp value={o.partij} onChange={v => updV(i, "partij", v)} placeholder="bijv. Bouwbedrijf Jansen" /></Veld>
            <Veld label="Offertebedrag"><GeldInp value={o.bedrag} onChange={v => updV(i, "bedrag", v)} placeholder="bijv. 18.500,00" /></Veld>
            <button onClick={() => del(i)} title="Verwijderen" style={{ color: C.tekst3, padding: "8px", borderRadius: 8, display: "flex" }} onMouseEnter={e => (e.currentTarget.style.color = C.bordeaux)} onMouseLeave={e => (e.currentTarget.style.color = C.tekst3)}><Ico.trash width={17} height={17} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
            {stappen.map(([field, lbl]) => <ChipChk key={field} checked={!!o[field]} onChange={val => togChk(i, field, val)} label={lbl} />)}
          </div>
          {o.ontvangen && parseGeld(o.bedrag) > 0 && <div style={{ marginTop: 8, padding: "7px 11px", background: C.groenTint, border: `1px solid ${C.groenRand}`, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: C.groen, fontVariantNumeric: "tabular-nums" }}>Offertebedrag: {euro(o.bedrag)}</div>}
          <div style={{ marginTop: 10 }}>
            <Label>Notitie</Label>
            <Txa value={o.notitie} onChange={v => updV(i, "notitie", v)} placeholder="Opmerking of aanvullende informatie over deze offerte…" rows={2} />
          </div>
        </div>
      ))}
      <button onClick={add} style={{ width: "100%", padding: "11px", background: C.wit, border: `1.5px dashed ${C.lijn}`, borderRadius: 12, color: C.tekst2, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.bordeaux; e.currentTarget.style.color = C.bordeaux; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.tekst2; }}><Ico.plus width={15} height={15} /> Partij / offerte toevoegen</button>
    </div>
  );
}

function TijdlijnTab({ vve }) {
  const tl = buildTijdlijn(vve);
  if (!tl.length) return <div style={{ textAlign: "center", padding: "28px 0", color: C.tekst3, fontSize: 13 }}>Nog geen gebeurtenissen. Vul gegevens in en vink stappen aan.</div>;
  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 2, background: C.lijn, borderRadius: 2 }} />
      {tl.map((e, i) => (
        <div key={i} style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ position: "absolute", left: -22, top: 3, width: 10, height: 10, borderRadius: "50%", background: e.kleur, border: "2px solid #fff", boxShadow: `0 0 0 2px ${e.kleur}` }} />
          <div style={{ fontSize: 11, color: C.tekst3, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>{datumTijdNL(e.ts)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: e.kleur }}>{e.tekst}</div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TRAJECT-SUBFORMULIEREN
   ══════════════════════════════════════════════════════════════════════ */
function TrajectProcesbegeleiding({ vve, t, onChange }) {
  const u = (k, v) => onChange({ ...t, [k]: v });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StappenLijst vve={vve} t={t} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Veld label="Fonds"><Sel value={t.fonds} onChange={v => u("fonds", v)}>{FONDS_OPTIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</Sel></Veld>
        <Veld label="Bedrag procesbegeleiding"><GeldInp value={t.bedrag} onChange={v => u("bedrag", v)} /></Veld>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Veld label="Datum overeenkomst"><Inp type="date" value={t.overeenkomstDatum} onChange={v => u("overeenkomstDatum", v)} /></Veld>
        <Veld label="Status"><Sel value={t.status} onChange={v => u("status", v)}><option value="lopend">Lopend</option><option value="afgerond">Afgerond</option></Sel></Veld>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Chk checked={t.overeenkomstGetekend} onChange={v => u("overeenkomstGetekend", v)} label="Overeenkomst getekend" />
        <Chk checked={t.gefactureerd} onChange={v => u("gefactureerd", v)} label="Gefactureerd" />
      </div>
      {t.gefactureerd && <Veld label="Factuurdatum"><Inp type="date" value={t.factuurdatum} onChange={v => u("factuurdatum", v)} /></Veld>}
    </div>
  );
}

function TrajectSubsidie({ vve, t, onChange }) {
  const u = (k, v) => onChange({ ...t, [k]: v });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StappenLijst vve={vve} t={t} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Veld label="Instantie"><Inp value={t.instantie} onChange={v => u("instantie", v)} placeholder="bijv. Gemeente Den Haag" /></Veld>
        <Veld label="Te factureren"><GeldInp value={t.teFactureren} onChange={v => u("teFactureren", v)} /></Veld>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Veld label="Begindatum aanvraag"><Inp type="date" value={t.begindatum} onChange={v => u("begindatum", v)} /></Veld>
        <Veld label="Deadline / einddatum"><Inp type="date" value={t.einddatum} onChange={v => u("einddatum", v)} /></Veld>
      </div>
      <Veld label="Status"><Sel value={t.status} onChange={v => u("status", v)}><option value="lopend">Lopend</option><option value="afgerond">Afgerond</option></Sel></Veld>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Chk checked={t.gefactureerd} onChange={v => u("gefactureerd", v)} label="Gefactureerd" />
      </div>
      {t.gefactureerd && <Veld label="Factuurdatum"><Inp type="date" value={t.factuurdatum} onChange={v => u("factuurdatum", v)} /></Veld>}
      <Veld label="Ontbrekende documenten"><Inp value={t.ontbrekendeDocs} onChange={v => u("ontbrekendeDocs", v)} placeholder="Laat leeg als alles compleet is" /></Veld>
      <Veld label="Opmerkingen"><Txa value={t.opmerkingen} onChange={v => u("opmerkingen", v)} placeholder="Overige acties en notities…" /></Veld>
    </div>
  );
}

function TrajectIsolatie({ vve, t, onChange }) {
  const u = (k, v) => onChange({ ...t, [k]: v });
  /* FIX: contactpersoon-veld schreef voorheen naam:"" en knipte de aannemers-
     array af tot één element (dataverlies zodra een aannemersnaam bestond).
     Nu wordt het BESTAANDE eerste element behouden en alleen contactpersoon
     bijgewerkt; de rest van de array blijft intact. */
  const zetContactpersoon = (val) => {
    const arr = [...(t.aannemers || [])];
    const eerste = arr[0] || { id: uid(), naam: "" };
    arr[0] = { ...eerste, contactpersoon: val };
    u("aannemers", arr);
  };
  const contactpersoon = t.aannemers?.[0]?.contactpersoon || "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StappenLijst vve={vve} t={t} />
      <Veld label="Contactpersoon VvE"><Inp value={contactpersoon} onChange={zetContactpersoon} placeholder="Naam contactpersoon VvE" /></Veld>
      <Veld label="Werkzaamheden"><Txa value={t.werkzaamheden} onChange={v => u("werkzaamheden", v)} placeholder="Omschrijving van de uit te voeren werkzaamheden…" /></Veld>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Veld label="Datum VvE akkoord"><Inp type="date" value={t.vveAkkoordDatum} onChange={v => u("vveAkkoordDatum", v)} /></Veld>
        <Veld label="Datum doorgestuurd gemeente"><Inp type="date" value={t.doorgestuurdDatum} onChange={v => u("doorgestuurdDatum", v)} /></Veld>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Chk checked={t.vveAkkoord} onChange={v => u("vveAkkoord", v)} label="VvE akkoord" />
        <Chk checked={t.doorgestuurdGemeente} onChange={v => u("doorgestuurdGemeente", v)} label="Doorgestuurd gemeente" />
        <Chk checked={t.inkooporderOntvangen} onChange={v => u("inkooporderOntvangen", v)} label="Inkooporder ontvangen" />
        <Chk checked={t.mailNodig} onChange={v => u("mailNodig", v)} label="Mail nog te sturen" />
      </div>
      <Veld label="Begeleidingsvergoeding"><GeldInp value={t.begeleidingsvergoeding} onChange={v => u("begeleidingsvergoeding", v)} placeholder="bijv. 695,00" /></Veld>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "end" }}>
        <div style={{ paddingBottom: 6 }}><Chk checked={!!t.gefactureerdVve} onChange={v => u("gefactureerdVve", v)} label="Gefactureerd aan de VvE" /></div>
        {t.gefactureerdVve && <Veld label="Factuurdatum"><Inp type="date" value={t.factuurdatumVve} onChange={v => u("factuurdatumVve", v)} /></Veld>}
      </div>
      <Veld label="Actiepunten"><Txa value={t.actiepunten} onChange={v => u("actiepunten", v)} placeholder="Lopende acties en openstaande punten…" rows={4} /></Veld>
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════════════
   VVE-KAART — één dossier, uitklapbaar, met alle tabs
   ══════════════════════════════════════════════════════════════════════ */
function VveKaart({ vve, onUpdate, onSave, onDelete, openId, setOpenId, beheerderList }) {
  const open = openId === vve.id;
  const [tab, setTab] = useState("info");
  const [nieuweLog, setNieuweLog] = useState(leegLog());
  const [logForm, setLogForm] = useState(false);
  const [bewerkLogId, setBewerkLogId] = useState(null);
  const [bewerkLogData, setBewerkLogData] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [heeftWijzigingen, setHeeftWijzigingen] = useState(false);
  const [sluitDialoog, setSluitDialoog] = useState(false);
  const [sluitReden, setSluitReden] = useState("");

  const markeer = () => { setHeeftWijzigingen(true); setSaveStatus("idle"); };

  const u = (k, v) => {
    const entry = { tijdstip: nu(), veld: k, oud: vve[k], nieuw: v };
    const bij = { ...vve, [k]: v, audittrail: [...(vve.audittrail || []), entry] };
    if (k === "alvBesluit" && v && !vve.tijdlijn?.alvBesluit) bij.tijdlijn = { ...(vve.tijdlijn || {}), alvBesluit: nu() };
    onUpdate(bij);
    markeer();
  };

  const updTraj = t => { onUpdate({ ...vve, trajecten: (vve.trajecten || []).map(x => x.id === t.id ? t : x) }); markeer(); };
  const addTraj = type => { onUpdate({ ...vve, trajecten: [...(vve.trajecten || []), leegTraject(type)] }); markeer(); };
  const delTraj = tid => { if (confirm("Traject verwijderen?")) { onUpdate({ ...vve, trajecten: (vve.trajecten || []).filter(t => t.id !== tid) }); markeer(); } };

  const slaLogOp = () => {
    if (!nieuweLog.omschrijving.trim()) return;
    onUpdate({ ...vve, communicatielog: [...(vve.communicatielog || []), { ...nieuweLog, id: uid() }] });
    setNieuweLog(leegLog()); setLogForm(false);
    markeer();
  };
  const slaLogBewerkingOp = () => {
    if (!bewerkLogData?.omschrijving?.trim()) return;
    const bijgewerkt = (vve.communicatielog || []).map(l => l.id === bewerkLogId ? { ...bewerkLogData } : l);
    onUpdate({ ...vve, communicatielog: bijgewerkt });
    setBewerkLogId(null); setBewerkLogData(null);
    markeer();
  };
  const verwijderLog = (lid) => {
    if (!confirm("Logitem verwijderen?")) return;
    onUpdate({ ...vve, communicatielog: (vve.communicatielog || []).filter(l => l.id !== lid) });
    markeer();
  };

  const opslaanNaarSupabase = async () => {
    setSaveStatus("saving");
    try {
      const ok = await onSave(vve);
      if (ok) { setSaveStatus("saved"); setHeeftWijzigingen(false); setTimeout(() => setSaveStatus("idle"), 2500); }
      else setSaveStatus("error");
    } catch { setSaveStatus("error"); }
  };

  /* Afronden forceert 100% (bewuste keuze). De kaart blijft OPEN — voorheen
     sloot afgerond() de kaart (setOpenId(null)), waardoor de "niet opgeslagen"-
     badge verdween terwijl de wijziging nog niet in Supabase stond. */
  const afgerond = () => { onUpdate({ ...vve, status: "afgerond", tijdlijn: { ...(vve.tijdlijn || {}), afgerond: nu() } }); markeer(); };
  const bevestigSluiten = () => {
    onUpdate({ ...vve, status: "gesloten", geslotenReden: sluitReden.trim(), tijdlijn: { ...(vve.tijdlijn || {}), gesloten: nu() } });
    setSluitDialoog(false); setSluitReden(""); markeer();
  };
  const heropen = () => { onUpdate({ ...vve, status: "in_behandeling" }); markeer(); };

  // Deadlines: alleen subsidie-einddatums
  const deadlines = [];
  (vve.trajecten || []).forEach(t => { if (t.type === "subsidie" && t.einddatum) deadlines.push({ label: "Subsidie deadline", datum: t.einddatum }); });
  const urgDl = deadlines.some(d => { const g = dagenTot(d.datum); return g !== null && g <= 14 && g >= 0; });
  const ovrDl = deadlines.some(d => { const g = dagenTot(d.datum); return g !== null && g < 0; });
  const opvolgenVervallen = vve.opvolgenOp && dagenTot(vve.opvolgenOp) !== null && dagenTot(vve.opvolgenOp) < 0;
  const opvolgenVandaag = vve.opvolgenOp && dagenTot(vve.opvolgenOp) !== null && dagenTot(vve.opvolgenOp) === 0;
  const actDagen = dagenActief(vve.aangemaakt);
  const inactief = !isActief(vve);
  const randKleur = open ? C.bordeaux : ovrDl ? C.bordeauxRand : urgDl ? C.amberRand : C.lijn;

  const tabs = [["info", "Dossier"], ["trajecten", `Trajecten (${(vve.trajecten || []).length})`], ["offertes", `Offertes (${(vve.offertes || []).length})`], ["log", `Log (${(vve.communicatielog || []).length})`], ["tijdlijn", "Tijdlijn"], ["audit", "Audittrail"]];

  return (
    <div style={{ background: inactief ? C.inset : C.wit, border: `1px solid ${randKleur}`, borderRadius: 12, overflow: "hidden", marginBottom: 10, boxShadow: open ? "0 4px 16px rgba(153,26,33,.07)" : "0 1px 2px rgba(0,0,0,.03)", transition: "border-color .2s, box-shadow .2s", opacity: inactief ? 0.82 : 1 }}>
      {/* Kaartkop */}
      <div onClick={() => setOpenId(open ? null : vve.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", cursor: "pointer", userSelect: "none", borderLeft: `3px solid ${inactief ? C.lijn : DOSSIER_STATUS[vve.status]?.kleur || C.bordeaux}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{vve.naam || <span style={{ color: C.tekst3, fontStyle: "italic" }}>Naamloos</span>}</span>
            <StatusBadge status={vve.status} />
            {vve.beheerder && <span style={{ fontSize: 10.5, color: C.tekst2, background: C.papier, padding: "2px 8px", borderRadius: 8 }}>{vve.beheerder}</span>}
            {ovrDl && <span style={{ fontSize: 10.5, fontWeight: 600, background: C.bordeauxTint, color: C.bordeaux, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.bordeauxRand}` }}>Deadline voorbij</span>}
            {urgDl && !ovrDl && <span style={{ fontSize: 10.5, fontWeight: 600, background: C.amberTint, color: C.amber, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.amberRand}` }}>Deadline nadert</span>}
            {(opvolgenVervallen || opvolgenVandaag) && !inactief && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, background: C.blauwTint, color: C.blauw, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.blauwRand}` }}><Ico.clock width={11} height={11} />Opvolgen{opvolgenVandaag ? " vandaag" : ""}</span>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
            {vve.adres && <span style={{ fontSize: 11.5, color: C.tekst2 }}>{vve.adres}</span>}
            {actDagen !== null && <span style={{ fontSize: 10.5, color: C.tekst3 }}>Actief: <strong style={{ color: C.inkSoft }}>{actDagen} dag{actDagen !== 1 ? "en" : ""}</strong></span>}
            {(vve.trajecten || []).map(t => <TrajectBadge key={t.id} type={t.type} />)}
          </div>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ width: 220, flexShrink: 0 }}><VoortgangsBalk vve={vve} /></div>
        <span style={{ color: C.tekst3, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", display: "flex" }}><Ico.chevron width={18} height={18} /></span>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.lijn}`, background: C.inset }}>
          {/* Tabbalk + opslaan */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.lijn}`, background: C.wit, paddingLeft: 16, overflowX: "auto", alignItems: "center" }}>
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 14px", border: "none", borderBottom: `2px solid ${tab === k ? C.bordeaux : "transparent"}`, background: "transparent", fontSize: 12.5, fontWeight: tab === k ? 600 : 500, color: tab === k ? C.bordeaux : C.tekst2, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
            ))}
            <div style={{ marginLeft: "auto", paddingRight: 12, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {heeftWijzigingen && saveStatus !== "saved" && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.amber, background: C.amberTint, padding: "3px 9px", borderRadius: 999, fontWeight: 600, border: `1px solid ${C.amberRand}` }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />Niet opgeslagen</span>}
              {saveStatus === "error" && <span style={{ fontSize: 10.5, color: C.bordeaux, background: C.bordeauxTint, padding: "3px 9px", borderRadius: 999, fontWeight: 600, border: `1px solid ${C.bordeauxRand}` }}>Opslaan mislukt</span>}
              <button onClick={opslaanNaarSupabase} disabled={saveStatus === "saving" || (!heeftWijzigingen && saveStatus !== "error")} style={{ padding: "6px 15px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 600, cursor: (saveStatus === "saving" || (!heeftWijzigingen && saveStatus !== "error")) ? "not-allowed" : "pointer", background: saveStatus === "saved" ? C.groenTint : heeftWijzigingen || saveStatus === "error" ? C.bordeaux : C.lijnZacht, color: saveStatus === "saved" ? C.groen : heeftWijzigingen || saveStatus === "error" ? "#fff" : C.tekst3, transition: "all .2s" }}>
                {saveStatus === "saving" ? "Opslaan…" : saveStatus === "saved" ? "Opgeslagen" : saveStatus === "error" ? "Opnieuw" : "Opslaan"}
              </button>
            </div>
          </div>

          <div style={{ padding: 18 }}>
            {tab === "info" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Veld label="VvE naam"><Inp value={vve.naam} onChange={v => u("naam", v)} placeholder="Naam van de VvE" /></Veld>
                  <Veld label="Adres"><Inp value={vve.adres} onChange={v => u("adres", v)} placeholder="Straat + nummer, plaats" /></Veld>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <Veld label="Beheerder"><Sel value={vve.beheerder} onChange={v => u("beheerder", v)}><option value="">— Kies beheerder —</option>{(beheerderList || []).map(n => <option key={n} value={n}>{n}</option>)}</Sel></Veld>
                  <Veld label="Type eigendom"><Sel value={vve.typeEigendom} onChange={v => u("typeEigendom", v)}>{Object.entries(TYPE_EIGENDOM).map(([k, val]) => <option key={k} value={k}>{val}</option>)}</Sel></Veld>
                  <Veld label="Dossier status"><Sel value={vve.status} onChange={v => u("status", v)}>{Object.entries(DOSSIER_STATUS).map(([k, val]) => <option key={k} value={k}>{val.label}</option>)}</Sel></Veld>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                  <Chk checked={vve.alvBesluit} onChange={v => u("alvBesluit", v)} label="ALV-besluit genomen" />
                  {vve.alvBesluit && <Veld label="Datum ALV-besluit"><Inp type="date" value={vve.alvDatum} onChange={v => u("alvDatum", v)} /></Veld>}
                </div>

                {/* Gesloten-reden weergave */}
                {vve.status === "gesloten" && vve.geslotenReden && (
                  <div style={{ background: "#EFECE8", border: `1px solid ${C.lijn}`, borderRadius: 12, padding: 14 }}>
                    <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 4 }}>Reden van sluiten</p>
                    <p style={{ fontSize: 13, color: C.inkSoft }}>{vve.geslotenReden}</p>
                  </div>
                )}

                {/* Opvolgen */}
                <div style={{ background: C.blauwTint, border: `1px solid ${C.blauwRand}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: C.blauw, display: "flex" }}><Ico.clock width={18} height={18} /></span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.blauw, marginBottom: 5 }}>Opvolgen op</p>
                      <Inp type="date" value={vve.opvolgenOp} onChange={v => u("opvolgenOp", v)} />
                    </div>
                    {vve.opvolgenOp && (
                      <div style={{ textAlign: "right" }}>
                        {dagenTot(vve.opvolgenOp) < 0 ? <span style={{ fontSize: 12, fontWeight: 700, color: C.bordeaux }}>{Math.abs(dagenTot(vve.opvolgenOp))}d vervallen</span> : dagenTot(vve.opvolgenOp) === 0 ? <span style={{ fontSize: 12, fontWeight: 700, color: C.blauw }}>Vandaag</span> : <span style={{ fontSize: 12, fontWeight: 600, color: C.tekst2 }}>Over {dagenTot(vve.opvolgenOp)}d</span>}
                        <button onClick={() => u("opvolgenOp", "")} style={{ display: "block", fontSize: 10.5, color: C.tekst3, marginTop: 2 }}>wissen</button>
                      </div>
                    )}
                  </div>
                </div>

                {deadlines.length > 0 && (
                  <div style={{ background: C.inset, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: 14 }}>
                    <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 10 }}>Deadlines</p>
                    {deadlines.map((d, i) => <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}><span style={{ color: C.tekst2 }}>{d.label}</span><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.tekst2, fontVariantNumeric: "tabular-nums" }}>{datumNL(d.datum)}</span><DeadlineBadge iso={d.datum} /></div></div>)}
                  </div>
                )}

                {/* Actieknoppen onderaan dossier */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: `1px solid ${C.lijnZacht}`, gap: 12, flexWrap: "wrap" }}>
                  <button onClick={() => { if (confirm(`"${vve.naam || "naamloos"}" definitief verwijderen?`)) onDelete(vve.id); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.tekst3, padding: "6px 4px" }} onMouseEnter={e => (e.currentTarget.style.color = C.bordeaux)} onMouseLeave={e => (e.currentTarget.style.color = C.tekst3)}><Ico.trash width={13} height={13} /> VvE verwijderen</button>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {inactief ? (
                      <button onClick={heropen} style={{ fontSize: 12.5, padding: "8px 16px", background: C.wit, border: `1px solid ${C.blauwRand}`, color: C.blauw, borderRadius: 9, fontWeight: 600 }}>Dossier heropenen</button>
                    ) : (
                      <>
                        <button onClick={() => setSluitDialoog(true)} style={{ fontSize: 12.5, padding: "8px 16px", background: C.wit, border: `1px solid ${C.lijn}`, color: C.tekst2, borderRadius: 9, fontWeight: 600 }}>Sluiten (niet afgerond)</button>
                        <button onClick={afgerond} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "8px 16px", background: C.groen, color: "#fff", borderRadius: 9, fontWeight: 600 }}><Ico.check width={14} height={14} /> Dossier afronden</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Sluit-dialoog met verplichte reden */}
                {sluitDialoog && (
                  <div style={{ background: C.wit, border: `1px solid ${C.randHover}`, borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Dossier sluiten zonder afronding</p>
                    <p style={{ fontSize: 12, color: C.tekst2, marginBottom: 12 }}>Het dossier verdwijnt uit de actieve werkstroom en genereert geen acties meer. De voortgang blijft zichtbaar zoals die nu is.</p>
                    <Veld label="Reden van sluiten"><Txa value={sluitReden} onChange={setSluitReden} placeholder="Bijv. VvE ziet af van deelname, of dubbel dossier…" rows={2} /></Veld>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={bevestigSluiten} disabled={!sluitReden.trim()} style={{ fontSize: 12.5, padding: "7px 15px", background: sluitReden.trim() ? C.tekst2 : C.lijnZacht, color: sluitReden.trim() ? "#fff" : C.tekst3, borderRadius: 9, fontWeight: 600, cursor: sluitReden.trim() ? "pointer" : "not-allowed", border: "none" }}>Dossier sluiten</button>
                      <button onClick={() => { setSluitDialoog(false); setSluitReden(""); }} style={{ fontSize: 12.5, padding: "7px 15px", background: C.wit, border: `1px solid ${C.lijn}`, color: C.tekst2, borderRadius: 9, fontWeight: 600 }}>Annuleren</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "trajecten" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {(vve.trajecten || []).length === 0 && <p style={{ fontSize: 12.5, color: C.tekst3, fontStyle: "italic" }}>Nog geen trajecten toegevoegd.</p>}
                {(vve.trajecten || []).map(t => {
                  const k = TRAJECT_KLEUR[t.type] || { kleur: C.tekst2, bg: C.inset, rand: C.lijn };
                  return (
                    <div key={t.id} style={{ border: `1px solid ${C.lijn}`, borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: k.bg, borderLeft: `3px solid ${k.kleur}` }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{TRAJECTEN[t.type]}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: t.status === "afgerond" ? C.groenTint : C.wit, color: t.status === "afgerond" ? C.groen : C.tekst2, border: `1px solid ${t.status === "afgerond" ? C.groenRand : C.lijn}` }}>{t.status === "afgerond" ? "Afgerond" : "Lopend"}</span>
                          <button onClick={() => delTraj(t.id)} title="Verwijderen" style={{ color: C.tekst3, display: "flex" }} onMouseEnter={e => (e.currentTarget.style.color = C.bordeaux)} onMouseLeave={e => (e.currentTarget.style.color = C.tekst3)}><Ico.trash width={15} height={15} /></button>
                        </div>
                      </div>
                      <div style={{ padding: 16 }}>
                        {t.type === "procesbegeleiding" && <TrajectProcesbegeleiding vve={vve} t={t} onChange={updTraj} />}
                        {t.type === "subsidie" && <TrajectSubsidie vve={vve} t={t} onChange={updTraj} />}
                        {t.type === "isolatie" && <TrajectIsolatie vve={vve} t={t} onChange={updTraj} />}
                      </div>
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${C.lijnZacht}`, paddingTop: 12 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 8 }}>Traject toevoegen</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{Object.entries(TRAJECTEN).map(([key, label]) => <button key={key} onClick={() => addTraj(key)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "7px 12px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 9, fontWeight: 500, color: C.tekst2, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.bordeaux; e.currentTarget.style.color = C.bordeaux; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.tekst2; }}><Ico.plus width={13} height={13} /> {label}</button>)}</div>
                </div>
              </div>
            )}

            {tab === "offertes" && <OffertesTab vve={vve} onUpdate={v => { onUpdate(v); markeer(); }} />}

            {tab === "log" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {logForm ? (
                  <div style={{ background: C.inset, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Nieuw logitem</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <Veld label="Datum"><Inp type="date" value={nieuweLog.datum} onChange={v => setNieuweLog({ ...nieuweLog, datum: v })} /></Veld>
                      <Veld label="Beheerder"><Sel value={nieuweLog.beheerder} onChange={v => setNieuweLog({ ...nieuweLog, beheerder: v })}><option value="">— kies —</option>{(beheerderList || []).map(n => <option key={n} value={n}>{n}</option>)}</Sel></Veld>
                      <Veld label="Partij"><Inp value={nieuweLog.partij} onChange={v => setNieuweLog({ ...nieuweLog, partij: v })} placeholder="eigenaar, aannemer, gemeente…" /></Veld>
                      <Veld label="Kanaal"><Sel value={nieuweLog.kanaal} onChange={v => setNieuweLog({ ...nieuweLog, kanaal: v })}>{KANAAL_OPTIES.map(k => <option key={k} value={k}>{k}</option>)}</Sel></Veld>
                    </div>
                    <Veld label="Omschrijving"><Txa value={nieuweLog.omschrijving} onChange={v => setNieuweLog({ ...nieuweLog, omschrijving: v })} placeholder="Wat is er besproken of afgesproken?" /></Veld>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={slaLogOp} style={{ fontSize: 12.5, padding: "7px 15px", background: C.bordeaux, color: "#fff", borderRadius: 9, fontWeight: 600, border: "none" }}>Toevoegen</button>
                      <button onClick={() => setLogForm(false)} style={{ fontSize: 12.5, padding: "7px 15px", background: C.wit, border: `1px solid ${C.lijn}`, color: C.tekst2, borderRadius: 9, fontWeight: 600 }}>Annuleren</button>
                    </div>
                  </div>
                ) : <button onClick={() => setLogForm(true)} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, padding: "7px 12px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 9, fontWeight: 500, color: C.tekst2, transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.bordeaux; e.currentTarget.style.color = C.bordeaux; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.tekst2; }}><Ico.plus width={13} height={13} /> Logitem toevoegen</button>}

                {(vve.communicatielog || []).length === 0 && !logForm && <p style={{ fontSize: 12.5, color: C.tekst3, fontStyle: "italic" }}>Nog geen communicatie geregistreerd.</p>}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...(vve.communicatielog || [])].reverse().map(l => (
                    <div key={l.id}>
                      {bewerkLogId === l.id ? (
                        <div style={{ background: C.inset, border: `1px solid ${C.bordeauxRand}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Logitem bewerken</p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <Veld label="Datum"><Inp type="date" value={bewerkLogData.datum} onChange={v => setBewerkLogData({ ...bewerkLogData, datum: v })} /></Veld>
                            <Veld label="Beheerder"><Sel value={bewerkLogData.beheerder} onChange={v => setBewerkLogData({ ...bewerkLogData, beheerder: v })}><option value="">— kies —</option>{(beheerderList || []).map(n => <option key={n} value={n}>{n}</option>)}</Sel></Veld>
                            <Veld label="Partij"><Inp value={bewerkLogData.partij} onChange={v => setBewerkLogData({ ...bewerkLogData, partij: v })} placeholder="eigenaar, aannemer, gemeente…" /></Veld>
                            <Veld label="Kanaal"><Sel value={bewerkLogData.kanaal} onChange={v => setBewerkLogData({ ...bewerkLogData, kanaal: v })}>{KANAAL_OPTIES.map(k => <option key={k} value={k}>{k}</option>)}</Sel></Veld>
                          </div>
                          <Veld label="Omschrijving"><Txa value={bewerkLogData.omschrijving} onChange={v => setBewerkLogData({ ...bewerkLogData, omschrijving: v })} /></Veld>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={slaLogBewerkingOp} style={{ fontSize: 12.5, padding: "7px 15px", background: C.bordeaux, color: "#fff", borderRadius: 9, fontWeight: 600, border: "none" }}>Opslaan</button>
                            <button onClick={() => { setBewerkLogId(null); setBewerkLogData(null); }} style={{ fontSize: 12.5, padding: "7px 15px", background: C.wit, border: `1px solid ${C.lijn}`, color: C.tekst2, borderRadius: 9, fontWeight: 600 }}>Annuleren</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 12, fontSize: 12.5, borderLeft: `2px solid ${C.lijn}`, paddingLeft: 12, paddingTop: 3, paddingBottom: 3 }} className="log-rij">
                          <div style={{ flexShrink: 0, color: C.tekst3, width: 78, fontVariantNumeric: "tabular-nums" }}>{datumNL(l.datum)}</div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, color: C.ink }}>{l.beheerder}</span>{" · "}<span style={{ color: C.tekst2 }}>{l.partij}</span>{" · "}<span style={{ fontStyle: "italic", color: C.tekst3 }}>{l.kanaal}</span>
                            <p style={{ color: C.tekst2, marginTop: 2 }}>{l.omschrijving}</p>
                          </div>
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }} className="log-acties">
                            <button onClick={() => { setBewerkLogId(l.id); setBewerkLogData({ ...l }); }} title="Bewerken" style={{ fontSize: 11, padding: "4px 6px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 7, color: C.tekst2, display: "flex" }}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>
                            <button onClick={() => verwijderLog(l.id)} title="Verwijderen" style={{ fontSize: 11, padding: "4px 6px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 7, color: C.tekst3, display: "flex" }}><Ico.trash width={12} height={12} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "tijdlijn" && <TijdlijnTab vve={vve} />}

            {tab === "audit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(vve.audittrail || []).length === 0 && <p style={{ fontSize: 12.5, color: C.tekst3, fontStyle: "italic" }}>Nog geen wijzigingen vastgelegd.</p>}
                {[...(vve.audittrail || [])].reverse().map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, fontSize: 12, borderLeft: `2px solid ${C.lijnZacht}`, paddingLeft: 12, paddingTop: 3, paddingBottom: 3 }}>
                    <span style={{ color: C.tekst3, flexShrink: 0, width: 138, fontVariantNumeric: "tabular-nums" }}>{datumTijdNL(a.tijdstip)}</span>
                    <span style={{ color: C.tekst2 }}>{a.veld}: <span style={{ textDecoration: "line-through", color: C.bordeaux }}>{String(a.oud ?? "—").slice(0, 40)}</span> → <span style={{ color: C.groen }}>{String(a.nieuw ?? "—").slice(0, 40)}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════════════
   Herbruikbare shell-onderdelen
   ══════════════════════════════════════════════════════════════════════ */
function KpiKaart({ label, waarde, kleur, subtekst }) {
  return (
    <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
      <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, color: kleur, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{waarde}</p>
      {subtekst && <p style={{ fontSize: 11, color: C.tekst3, marginTop: 6 }}>{subtekst}</p>}
    </div>
  );
}
function ModuleKop({ icoon, titel, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 3, height: 22, background: C.bordeaux, borderRadius: 2 }} />
      <span style={{ color: C.bordeaux, display: "flex" }}>{icoon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{titel}</span>
      {badge}
    </div>
  );
}

/* ── Financieel-scherm: één rekenmodel voor KPI's, per-traject en tabel ── */
function FinancieelScherm({ vves }) {
  const { rijen, totaal, per } = financieelOverzicht(vves);
  const printDatum = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
  const geordend = [...rijen].sort((a, b) => (a.gefactureerd === b.gefactureerd ? 0 : a.gefactureerd ? 1 : -1) || b.bedrag - a.bedrag);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: C.bordeaux, color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 9, border: "none", cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = C.bordeauxDonker)} onMouseLeave={e => (e.currentTarget.style.background = C.bordeaux)}><Ico.print width={15} height={15} /> Exporteren / Afdrukken</button>
      </div>

      <div id="vd-print-area">
        {/* Print-only kop */}
        <div style={{ display: "none" }} className="print-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 16, borderBottom: `2px solid ${C.bordeaux}`, width: "100%" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Financieel overzicht</div>
              <div style={{ fontSize: 12, color: C.tekst2, marginTop: 4 }}>Verduurzaming &amp; Subsidies — Totaal VvE Beheer</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: C.tekst2 }}>
              <div style={{ fontWeight: 600, color: C.ink }}>{printDatum}</div>
              <div>{rijen.length} regel{rijen.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>

        {/* KPI-kaarten */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <KpiKaart label="Totaal te factureren" waarde={euro(totaal.totaal)} kleur={C.ink} subtekst={`${totaal.aantal} regel${totaal.aantal !== 1 ? "s" : ""}`} />
          <KpiKaart label="Al gefactureerd" waarde={euro(totaal.gefactureerd)} kleur={C.groen} />
          <KpiKaart label="Nog te factureren" waarde={euro(totaal.open)} kleur={C.bordeaux} />
        </div>

        {/* Per traject */}
        <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
          <div style={{ padding: "11px 18px", borderBottom: `1px solid ${C.lijnZacht}`, background: C.inset }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3 }}>Per traject</p>
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.lijnZacht}` }}>{["Traject", "Regels", "Totaal", "Gefactureerd", "Open"].map((h, i) => <th key={h} style={{ padding: "10px 18px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, textAlign: i > 0 ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {["isolatie", "procesbegeleiding", "subsidie"].filter(type => per[type].aantal > 0).map(type => {
                const f = per[type];
                return (
                  <tr key={type} style={{ borderBottom: `1px solid ${C.lijnZacht}` }}>
                    <td style={{ padding: "11px 18px" }}><TrajectBadge type={type} /></td>
                    <td style={{ padding: "11px 18px", textAlign: "right", color: C.tekst2, fontVariantNumeric: "tabular-nums" }}>{f.aantal}</td>
                    <td style={{ padding: "11px 18px", textAlign: "right", color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}>{euro(f.totaal)}</td>
                    <td style={{ padding: "11px 18px", textAlign: "right", color: C.groen, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{euro(f.gefactureerd)}</td>
                    <td style={{ padding: "11px 18px", textAlign: "right", color: C.bordeaux, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{euro(f.open)}</td>
                  </tr>
                );
              })}
              {rijen.length === 0 && <tr><td colSpan={5} style={{ padding: "32px", textAlign: "center", fontSize: 12.5, color: C.tekst3, fontStyle: "italic" }}>Nog geen financiële gegevens ingevuld.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Detailtabel per VvE */}
        <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
          <div style={{ padding: "11px 18px", borderBottom: `1px solid ${C.lijnZacht}`, background: C.inset, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3 }}>Te factureren per VvE</p>
            <span style={{ fontSize: 11, color: C.tekst3 }}>{rijen.length} regel{rijen.length !== 1 ? "s" : ""}</span>
          </div>
          {rijen.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: 12.5, color: C.tekst3, fontStyle: "italic" }}>Geen bedragen ingevuld bij isolatie-, subsidie- of procesbegeleidingstrajecten.</div>
          ) : (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${C.lijnZacht}`, background: C.inset }}>{["VvE", "Beheerder", "Type", "Bedrag", "Status", "Datum"].map((h, i) => <th key={h} style={{ padding: "10px 16px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst3, textAlign: i > 2 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {geordend.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.lijnZacht}`, background: !r.gefactureerd ? "rgba(153,26,33,.02)" : "transparent" }}>
                    <td style={{ padding: "11px 16px" }}><div style={{ fontWeight: 600, color: C.ink }}>{r.naam}</div><div style={{ fontSize: 10.5, color: C.tekst3 }}>{r.adres}</div></td>
                    <td style={{ padding: "11px 16px", color: C.tekst2, fontSize: 12 }}>{r.beheerder}</td>
                    <td style={{ padding: "11px 16px" }}><span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: TRAJECT_KLEUR[r.type].bg, color: TRAJECT_KLEUR[r.type].kleur, border: `1px solid ${TRAJECT_KLEUR[r.type].rand}` }}>{r.typeLabel}</span></td>
                    <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{euro(r.bedrag)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right" }}>{r.gefactureerd ? <span style={{ fontSize: 11, fontWeight: 600, color: C.groen, background: C.groenTint, padding: "2px 9px", borderRadius: 999, border: `1px solid ${C.groenRand}` }}>Gefactureerd</span> : <span style={{ fontSize: 11, fontWeight: 600, color: C.bordeaux, background: C.bordeauxTint, padding: "2px 9px", borderRadius: 999, border: `1px solid ${C.bordeauxRand}` }}>Openstaand</span>}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 12, color: C.tekst2, fontVariantNumeric: "tabular-nums" }}>{r.datum ? datumNL(r.datum) : "—"}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.lijn}`, background: C.inset }}>
                  <td colSpan={3} style={{ padding: "11px 16px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.tekst2 }}>Totaal</td>
                  <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{euro(totaal.totaal)}</td>
                  <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.groen, fontVariantNumeric: "tabular-nums" }}>{euro(totaal.gefactureerd)}</td>
                  <td style={{ padding: "11px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.bordeaux, fontVariantNumeric: "tabular-nums" }}>{euro(totaal.open)} open</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "none" }} className="print-footer">
          <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${C.lijn}`, fontSize: 10, color: C.tekst3, display: "flex", justifyContent: "space-between", width: "100%" }}>
            <span>Totaal VvE Beheer Den Haag B.V.</span>
            <span>Gegenereerd op {printDatum}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Actielijst ── */
function ActielijstScherm({ acties }) {
  if (!acties.length) return (
    <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: "48px 24px", textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
      <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: "50%", background: C.groenTint, color: C.groen, alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Ico.check width={22} height={22} /></div>
      <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>Geen openstaande acties</p>
      <p style={{ fontSize: 12.5, color: C.tekst3 }}>Alle actieve dossiers zijn bij.</p>
    </div>
  );
  // Groepeer per beheerder
  const perBeh = {};
  acties.forEach(a => { const b = a.beh || "Zonder beheerder"; (perBeh[b] = perBeh[b] || []).push(a); });
  const beheerders = Object.keys(perBeh).sort((a, b) => perBeh[b].length - perBeh[a].length);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {beheerders.map(beh => (
        <div key={beh} style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
          <div style={{ padding: "11px 18px", borderBottom: `1px solid ${C.lijnZacht}`, background: C.inset, display: "flex", alignItems: "center", justifyContent: "space-between", borderLeft: `3px solid ${C.bordeaux}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{beh}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.tekst2, background: C.papier, padding: "2px 9px", borderRadius: 999 }}>{perBeh[beh].length} acties</span>
          </div>
          <div>
            {perBeh[beh].map((a, i) => {
              const k = a.prioriteit === "hoog" ? C.bordeaux : C.amber;
              const kb = a.prioriteit === "hoog" ? C.bordeauxTint : C.amberTint;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: i < perBeh[beh].length - 1 ? `1px solid ${C.lijnZacht}` : "none" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: k, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{a.vve || "Naamloos"}</span>
                    {a.detail && <span style={{ fontSize: 12, color: C.tekst3 }}> — {a.detail}</span>}
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: C.tekst2, background: C.papier, padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>{a.traj}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: k, background: kb, padding: "3px 10px", borderRadius: 999, flexShrink: 0 }}>{ACTIETYPE_LABELS[a.type] || a.type}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   HOOFDCOMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function VerduurzamingBeheer({ onTerug, beheerder, beheerderList }) {
  const [vves, setVves] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [laadStatus, setLaadStatus] = useState("laden"); // laden | klaar | fout
  const [zoek, setZoek] = useState("");
  const [fTraj, setFTraj] = useState("alle");
  const [fBeh, setFBeh] = useState("alle");
  const [fStat, setFStat] = useState("alle");
  const [hoofdTab, setHoofdTab] = useState("vves");
  const [nieuwId, setNieuwId] = useState(null); // lokaal, nog niet opgeslagen

  useEffect(() => {
    let actief = true;
    vdLoad().then(d => { if (actief) { setVves(d); setLaadStatus("klaar"); } }).catch(() => { if (actief) setLaadStatus("fout"); });
    return () => { actief = false; };
  }, []);

  // vvesRef: altijd de actuele lijst voor gebruik in save-callbacks
  const vvesRef = useRef(vves);
  useEffect(() => { vvesRef.current = vves; }, [vves]);

  /* Nieuw dossier: alleen lokaal aanmaken, NIET direct naar Supabase schrijven.
     Voorheen schreef "+ VvE toevoegen" meteen een leeg record weg → naamloze
     junk-rijen in productie. Nu bestaat het pas na de eerste bewuste opslag. */
  const addVve = () => {
    const n = leegVve();
    setVves(p => [n, ...p]);
    setNieuwId(n.id);
    setOpenId(n.id);
    setHoofdTab("vves");
  };
  const updVve = useCallback((v) => { setVves(p => p.map(x => x.id === v.id ? v : x)); }, []);
  const slaVveOp = useCallback(async (v) => {
    const actueel = vvesRef.current.find(x => x.id === v.id) || v;
    const ok = await vdSave(actueel);
    if (ok) setNieuwId(prev => (prev === v.id ? null : prev)); // niet langer "nieuw"
    return ok;
  }, []);
  const delVve = async (id) => {
    setVves(p => p.filter(x => x.id !== id));
    if (openId === id) setOpenId(null);
    // Alleen in Supabase verwijderen als het daar ooit is opgeslagen
    if (id !== nieuwId) { try { await vdDelete(id); } catch { /* stil */ } }
    if (id === nieuwId) setNieuwId(null);
  };

  const zichtbaar = vves.filter(v => {
    const mz = !zoek || (v.naam || "").toLowerCase().includes(zoek.toLowerCase()) || (v.adres || "").toLowerCase().includes(zoek.toLowerCase());
    const mt = fTraj === "alle" || (v.trajecten || []).some(t => t.type === fTraj);
    const mb = fBeh === "alle" || v.beheerder === fBeh;
    const ms = fStat === "alle" || v.status === fStat;
    return mz && mt && mb && ms;
  });

  const acties = bouwActies(vves);
  const aantalActief = vves.filter(isActief).length;
  const aantalAfgerond = vves.filter(v => v.status === "afgerond").length;
  const aantalDl = vves.filter(v => (v.trajecten || []).some(t => t.type === "subsidie" && t.einddatum && (() => { const g = dagenTot(t.einddatum); return g !== null && g <= 14 && g >= 0; })())).length;

  if (laadStatus === "laden") return (
    <div style={{ minHeight: "100vh", background: C.papier, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS_FONT}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${C.bordeaux}`, borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 12px", animation: "vdspin 0.8s linear infinite" }} />
        <style>{`@keyframes vdspin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 13, color: C.tekst2 }}>Gegevens laden…</p>
      </div>
    </div>
  );

  if (laadStatus === "fout") return (
    <div style={{ minHeight: "100vh", background: C.papier, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS_FONT}</style>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: "50%", background: C.bordeauxTint, color: C.bordeaux, alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Ico.alert width={22} height={22} /></div>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Kon de gegevens niet laden</p>
        <p style={{ fontSize: 13, color: C.tekst2, marginBottom: 16 }}>Er ging iets mis bij het ophalen uit de database. Controleer je verbinding en probeer opnieuw.</p>
        <button onClick={() => { setLaadStatus("laden"); vdLoad().then(d => { setVves(d); setLaadStatus("klaar"); }).catch(() => setLaadStatus("fout")); }} style={{ padding: "9px 18px", background: C.bordeaux, color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 9, border: "none", cursor: "pointer" }}>Opnieuw proberen</button>
        <button onClick={onTerug} style={{ display: "block", margin: "12px auto 0", fontSize: 12.5, color: C.tekst3 }}>Terug naar portaal</button>
      </div>
    </div>
  );

  const hoofdTabs = [["vves", `VvE's (${vves.length})`], ["acties", `Actielijst (${acties.length})`], ["financieel", "Financieel"]];

  return (
    <div style={{ minHeight: "100vh", background: C.papier }}>
      <style>{CSS_FONT}{CSS_PRINT}</style>

      {/* Topbar */}
      <div style={{ borderBottom: `1px solid ${C.lijn}`, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.wit, position: "sticky", top: 0, zIndex: 50 }}>
        <ModuleKop icoon={<Ico.leaf width={19} height={19} />} titel="Verduurzaming & Subsidies" badge={aantalDl > 0 ? <span style={{ fontSize: 10.5, fontWeight: 600, background: C.bordeauxTint, color: C.bordeaux, border: `1px solid ${C.bordeauxRand}`, padding: "2px 9px", borderRadius: 999 }}>{aantalDl} deadline{aantalDl > 1 ? "s" : ""} nadert</span> : null} />
        <button onClick={onTerug} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "7px 13px", background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 9, color: C.tekst2, cursor: "pointer", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.bordeaux; e.currentTarget.style.color = C.bordeaux; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.lijn; e.currentTarget.style.color = C.tekst2; }}><Ico.arrowLeft width={15} height={15} /> Terug naar portaal</button>
      </div>

      <div style={{ padding: 24, maxWidth: 1240, margin: "0 auto" }}>
        {/* KPI-rij */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          <KpiKaart label="VvE's totaal" waarde={vves.length} kleur={C.ink} subtekst={`${aantalAfgerond} afgerond`} />
          <KpiKaart label="Actief" waarde={aantalActief} kleur={C.bordeaux} />
          <KpiKaart label="Openstaande acties" waarde={acties.length} kleur={acties.length > 0 ? C.amber : C.groen} />
          <KpiKaart label="Deadlines < 14d" waarde={aantalDl} kleur={aantalDl > 0 ? C.bordeaux : C.groen} />
        </div>

        {/* Hoofdtabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.lijn}`, marginBottom: 22 }}>
          {hoofdTabs.map(([key, label]) => (
            <button key={key} onClick={() => setHoofdTab(key)} style={{ padding: "12px 20px", fontSize: 13.5, fontWeight: 600, border: "none", background: "transparent", borderBottom: `2px solid ${hoofdTab === key ? C.bordeaux : "transparent"}`, color: hoofdTab === key ? C.bordeaux : C.tekst2, cursor: "pointer", marginBottom: -1 }}>{label}</button>
          ))}
        </div>

        {hoofdTab === "vves" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.tekst3, display: "flex" }}><Ico.search width={16} height={16} /></span>
                <input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoek op naam of adres…" style={{ ...inpStijl, background: C.wit, paddingLeft: 34 }} onFocus={e => (e.target.style.borderColor = C.bordeaux)} onBlur={e => (e.target.style.borderColor = C.lijn)} />
              </div>
              <div style={{ minWidth: 150 }}><Sel value={fStat} onChange={setFStat}><option value="alle">Alle statussen</option>{Object.entries(DOSSIER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Sel></div>
              <div style={{ minWidth: 150 }}><Sel value={fTraj} onChange={setFTraj}><option value="alle">Alle trajecten</option>{Object.entries(TRAJECTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel></div>
              <div style={{ minWidth: 150 }}><Sel value={fBeh} onChange={setFBeh}><option value="alle">Alle beheerders</option>{(beheerderList || []).map(n => <option key={n} value={n}>{n}</option>)}</Sel></div>
              <button onClick={addVve} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: C.bordeaux, color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 9, border: "none", cursor: "pointer", whiteSpace: "nowrap" }} onMouseEnter={e => (e.currentTarget.style.background = C.bordeauxDonker)} onMouseLeave={e => (e.currentTarget.style.background = C.bordeaux)}><Ico.plus width={15} height={15} /> VvE toevoegen</button>
            </div>

            {zichtbaar.length === 0 ? (
              <div style={{ background: C.wit, border: `1px solid ${C.lijn}`, borderRadius: 12, padding: "56px 24px", textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
                <div style={{ display: "inline-flex", width: 48, height: 48, borderRadius: "50%", background: C.groenTint, color: C.groen, alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Ico.leaf width={24} height={24} /></div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{vves.length === 0 ? "Nog geen VvE's toegevoegd" : "Geen resultaten"}</p>
                <p style={{ fontSize: 12.5, color: C.tekst3 }}>{vves.length === 0 ? "Klik op 'VvE toevoegen' om te beginnen." : "Pas de filters aan om meer te zien."}</p>
              </div>
            ) : (
              <div>{zichtbaar.map(v => <VveKaart key={v.id} vve={v} onUpdate={updVve} onSave={slaVveOp} onDelete={delVve} openId={openId} setOpenId={setOpenId} beheerderList={beheerderList} />)}</div>
            )}
          </>
        )}

        {hoofdTab === "acties" && <ActielijstScherm acties={acties} />}
        {hoofdTab === "financieel" && <FinancieelScherm vves={vves} />}
      </div>
    </div>
  );
}
