import { jsPDF } from "jspdf";

// Schoon Totaal VvE Beheer-logo (image1 uit het Excel-sjabloon), base64.
const LOGO = "data:image/jpeg;base64,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";
const LOGO_RATIO = 293 / 176; // breedte/hoogte van de bron

const MAANDEN_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

// ── Helpers ──────────────────────────────────────────────────────
function parseGetal(s) {
  if (s == null) return NaN;
  let t = String(s).trim().replace(/\s/g, "");
  if (t === "") return NaN;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  return parseFloat(t);
}
function euro(v) {
  const n = parseGetal(v);
  if (isNaN(n)) return "";
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function datumNL(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${d.getDate()} ${MAANDEN_NL[d.getMonth()]} ${d.getFullYear()}`;
}
function schoonBestandsnaam(s, fallback) {
  const t = (s || "").replace(/[\\/:*?"<>|]/g, "").trim();
  return t || fallback;
}
function logoTekenen(doc, x, y, breedte) {
  try { doc.addImage(LOGO, "JPEG", x, y, breedte, breedte / LOGO_RATIO); }
  catch (e) { /* logo overslaan als het niet lukt */ }
}

// ── Factuur (verkoper of koper) ──────────────────────────────────
function bouwFactuur(o, rol) {
  const koper = rol === "koper";
  const geadresseerde = koper ? o.naam_koper : o.naam_verkoper;
  const factuurnr = koper ? o.factuurnr_koper : o.factuurnr_verkoper;
  const omschrijving = koper ? o.omschrijving_koper : o.omschrijving_verkoper;
  const bedrag = koper ? o.verrekenen_koper : o.verrekenen_verkoper;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const links = 20, rechts = 190;
  doc.setTextColor(45, 45, 45);

  // Logo rechtsboven
  logoTekenen(doc, rechts - 48, 14, 48);

  // Afzenderblok rechts
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let ry = 48;
  ["Postbus 89", "2280 AB Rijswijk", "Email : info@totaalvve.nl"].forEach((r) => {
    doc.text(r, rechts, ry, { align: "right" }); ry += 4.6;
  });

  // Geadresseerde links
  doc.setFontSize(10.5);
  let y = 48;
  [geadresseerde, o.notaris_naam, o.notaris_adres, o.notaris_postcode_plaats].forEach((r) => {
    if (r) doc.text(String(r), links, y);
    y += 5.2;
  });

  // FACTUUR
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("FACTUUR", links, 82);

  // Datum + nummer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text("Factuurdatum:", links, 94);
  doc.text(datumNL(o.factuurdatum), links + 34, 94);
  doc.text("Factuurnummer:", links, 100.5);
  doc.text(String(factuurnr || ""), links + 34, 100.5);

  // Tabelkop
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Omschrijving van de geleverde diensten en/of artikelen", links, 116);
  doc.setDrawColor(153, 26, 33);
  doc.setLineWidth(0.4);
  doc.line(links, 118.5, rechts, 118.5);

  // Regel
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const omsRegels = doc.splitTextToSize(String(omschrijving || ""), 120);
  doc.text(omsRegels, links, 126);
  const bedragStr = euro(bedrag);
  if (bedragStr) {
    doc.text("€", rechts - 26, 126);
    doc.text(bedragStr, rechts, 126, { align: "right" });
  }

  // Totaal
  const ty = 126 + Math.max(omsRegels.length, 1) * 5.2 + 8;
  doc.setDrawColor(200, 195, 188);
  doc.setLineWidth(0.3);
  doc.line(links, ty - 5, rechts, ty - 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("Totaal door u te voldoen", links, ty);
  if (bedragStr) {
    doc.text("€", rechts - 26, ty);
    doc.text(bedragStr, rechts, ty, { align: "right" });
  }

  // Betaalgegevens onderaan
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  let by = ty + 22;
  if (o.rekeningnummer) { doc.text(String(o.rekeningnummer), links, by); by += 5.2; }
  if (o.tnv) doc.text(String(o.tnv), links, by);

  return doc;
}

// ── Overdrachtoverzicht (Voorblad) ───────────────────────────────
function bouwOverzicht(o) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const links = 20, rechts = 190;
  doc.setTextColor(45, 45, 45);

  // Logo linksboven
  logoTekenen(doc, links, 14, 48);

  let y = 50;
  const regel = (tekst, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size || 10.5);
    if (tekst) doc.text(String(tekst), links, y);
    y += opts.na != null ? opts.na : 5.2;
  };

  // VvE + notaris-adres
  regel(o.vve, { bold: true, size: 11, na: 8 });
  regel(o.notaris_naam);
  regel(o.notaris_adres);
  regel(o.notaris_postcode_plaats, { na: 9 });

  // Plaats + datum
  regel(o.plaats_datum, { na: 9 });

  // Betreft
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  if (o.betreft) doc.text(`Betreft: ${o.betreft}`, links, y);
  y += 9;

  // Aanhef + intro
  regel(o.aanhef, { na: 8 });
  regel("De volgende zaken willen wij u melden:", { na: 7 });

  // Bedragenlijst
  const bedragRegel = (label, waarde) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(label, links, y);
    const s = euro(waarde);
    if (s) {
      doc.text("€", rechts - 26, y);
      doc.text(s, rechts, y, { align: "right" });
    }
    y += 5.6;
  };
  bedragRegel("Maandbijdrage vereniging", o.maandbijdrage);
  bedragRegel("Te verrekenen verkoper", o.verrekenen_verkoper);
  bedragRegel("Te verrekenen koper", o.verrekenen_koper);
  bedragRegel("Aandeel reservefonds koper-verkoper", o.aandeel_reservefonds);
  bedragRegel("Administratiekosten koper-verkoper", "");
  y += 4;

  // Bijgaand
  regel("Bijgaand ontvangt u:", { na: 6 });
  regel("Diverse facturen");
  regel("NAW formulier", { na: 9 });

  // Slotzin
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const slot = doc.splitTextToSize(
    "Wij verzoeken u om de facturen van de bijdragen op te nemen op uw eindafrekening, evenals de nota's aangaande de administratiekosten VvE.",
    rechts - links
  );
  doc.text(slot, links, y);
  y += slot.length * 5.2 + 10;

  // Ondertekening
  regel("Met vriendelijke groet,", { na: 20 });
  regel("Nick Sleeking");
  regel("Totaal VvE Beheer Den-Haag en Omstreken B.V.");

  return doc;
}

// ── Publieke download-functies ───────────────────────────────────
export function downloadFactuur(o, rol) {
  const doc = bouwFactuur(o, rol);
  const nr = rol === "koper" ? o.factuurnr_koper : o.factuurnr_verkoper;
  doc.save(`Factuur ${schoonBestandsnaam(nr, rol === "koper" ? "koper" : "verkoper")}.pdf`);
}
export function downloadOverzicht(o) {
  const doc = bouwOverzicht(o);
  doc.save(`Overdrachtoverzicht ${schoonBestandsnaam(o.vve, "overdracht")}.pdf`);
}
