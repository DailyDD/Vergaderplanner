// Word-export voor de Notulen Assistent.
//
// Maakt een echt .docx-bestand in de huisstijl van Totaal VvE Beheer, nagebouwd
// naar de voorbeeldnotulen: briefhoofd met logo en adres op elke pagina, titel,
// kader met Vereniging / Datum / Plaats, Verdana 8 pt met uitgelijnde alinea's,
// vette kopjes en een bordeauxrood paginanummer rechtsonder.
//
// Het logo wordt bij het exporteren opgehaald uit /tvb-logo.png (map public/).
// Ontbreekt het bestand, dan valt het briefhoofd terug op tekst.

// De docx-bibliotheek is groot (ruim 300 kB). Ze wordt daarom pas geladen op het
// moment dat iemand daadwerkelijk exporteert, zodat de rest van de app snel blijft.
let lib = null;

const FONT = "Verdana";
const BODY = 16;          // 8 pt (halve punten)
const KLEIN = 14;         // 7 pt, briefhoofd
const BORDEAUX = "C00000"; // zoals het paginanummer in de voorbeeldnotulen
const geen = () => ({ style: lib.BorderStyle.NONE, size: 0, color: "FFFFFF" });

const run = (text, extra = {}) => new lib.TextRun({ text, font: FONT, size: BODY, ...extra });

// Tabs in een regel (bijv. in een lijst met bijdragen) omzetten naar echte tabstops.
function runsMetTabs(tekst, extra = {}) {
  const delen = String(tekst).split("\t");
  const kinderen = [];
  delen.forEach((d, i) => {
    if (i > 0) kinderen.push(new lib.Tab());
    if (d) kinderen.push(d);
  });
  return new lib.TextRun({ children: kinderen, font: FONT, size: BODY, ...extra });
}

// Een korte regel die alleen op een eigen alinea staat en niet op leesteken eindigt,
// is in de notule een tussenkopje (zoals "Opmerking bestuurder" of de titel van een
// tekstblok) en wordt vet gezet.
function isTussenkop(regels, i) {
  const t = regels[i].trim();
  if (!t || t.length > 90) return false;
  if (/[.;:,!?]$/.test(t)) return false;
  if (/^[-•]\s/.test(t) || /^\d+\.\s/.test(t)) return false;
  const vorige = i === 0 ? "" : regels[i - 1].trim();
  const volgende = i + 1 < regels.length ? regels[i + 1].trim() : "";
  if (vorige !== "" || volgende !== "") return false;
  // er moet daadwerkelijk tekst op volgen
  for (let j = i + 2; j < regels.length; j++) if (regels[j].trim()) return true;
  return false;
}

export async function bouwNotuleDocument(output, logo /* Uint8Array | null */) {
  if (!lib) lib = await import("docx");
  const alle = String(output || "").replace(/\r/g, "").split("\n").map((r) => r.replace(/\s+$/, ""));
  const kinderen = [];
  let i = 0;

  // ── Titel en kader (Vereniging / Datum / Plaats) ─────────────────────────
  if (alle[i] && /^Notulen\b/i.test(alle[i].trim())) {
    kinderen.push(new lib.Paragraph({ children: [run(alle[i].trim(), { size: 20 })], spacing: { after: 200 } }));
    i++;
  }
  while (i < alle.length && !alle[i].trim()) i++;
  const meta = [];
  while (i < alle.length && /^(Vereniging|Datum|Plaats|Locatie)\s*:/.test(alle[i])) {
    const m = alle[i].match(/^(\w+)\s*:\s*(.*)$/);
    meta.push([m[1] === "Locatie" ? "Plaats" : m[1], m[2]]);
    i++;
  }
  if (meta.length) {
    const rand = (zijde) => ({ style: lib.BorderStyle.SINGLE, size: 4, color: "000000", space: zijde });
    meta.forEach(([label, waarde]) => {
      kinderen.push(new lib.Paragraph({
        children: [run(label), new lib.TextRun({ children: [new lib.Tab()], font: FONT, size: BODY }), run(`: ${waarde}`)],
        tabStops: [{ type: lib.TabStopType.LEFT, position: 1500 }],
        border: { top: rand(1), bottom: rand(1), left: rand(4), right: rand(4) },
        spacing: { line: 276 },
      }));
    });
    kinderen.push(new lib.Paragraph({ children: [run("")] }));
  }
  // scheidingslijn uit de platte tekst overslaan
  while (i < alle.length && (!alle[i].trim() || /^─{3,}$/.test(alle[i].trim()))) i++;

  // ── Inhoud ───────────────────────────────────────────────────────────────
  const rest = alle.slice(i);
  let vorigeLeeg = true;
  rest.forEach((regel, idx) => {
    const t = regel.trim();
    if (!t) {
      if (!vorigeLeeg) kinderen.push(new lib.Paragraph({ children: [run("")] }));
      vorigeLeeg = true;
      return;
    }
    vorigeLeeg = false;

    const kop = regel.match(/^(\d+)\.\s{2,}(\S.*)$/);
    if (kop) {
      kinderen.push(new lib.Paragraph({
        children: [run(`${kop[1]}. ${kop[2]}`, { bold: true })],
        keepNext: true,
        spacing: { before: 120 },
      }));
      return;
    }

    if (/^-\s+/.test(t)) {
      kinderen.push(new lib.Paragraph({
        children: [run(t.replace(/^-\s+/, ""))],
        bullet: { level: 0 },
        alignment: lib.AlignmentType.JUSTIFIED,
      }));
      return;
    }

    if (isTussenkop(rest, idx)) {
      kinderen.push(new lib.Paragraph({ children: [run(t, { bold: true })], keepNext: true, alignment: lib.AlignmentType.JUSTIFIED }));
      return;
    }

    if (/^Maandelijkse bijdragen \|/.test(t) || /^Extra eenmalige bijdrage \|/.test(t)) {
      kinderen.push(new lib.Paragraph({ children: [run(t, { bold: true })], keepNext: true }));
      return;
    }

    const besluit = t.match(/^(Besluit:)\s+(.*)$/);
    if (besluit) {
      kinderen.push(new lib.Paragraph({
        children: [run(`${besluit[1]} `, { bold: true }), run(besluit[2])],
        alignment: lib.AlignmentType.JUSTIFIED,
      }));
      return;
    }

    kinderen.push(new lib.Paragraph({
      children: [regel.includes("\t") ? runsMetTabs(regel) : run(t)],
      alignment: lib.AlignmentType.JUSTIFIED,
    }));
  });

  // ── Briefhoofd (op elke pagina) ──────────────────────────────────────────
  const adres = ["Volmerlaan 5", "2288 GC Rijswijk", "T: 070 - 360 34 43", "www.totaalvve.nl", "info@totaalvve.nl"];
  const linksInhoud = logo
    ? [new lib.Paragraph({
        children: [new lib.ImageRun({
          type: "png",
          data: logo,
          transformation: { width: 140, height: 89 },
          altText: { title: "Totaal VvE Beheer", description: "Logo Totaal VvE Beheer Den Haag en omstreken B.V.", name: "logo" },
        })],
      })]
    : [
        new lib.Paragraph({ children: [run("Totaal VvE Beheer", { bold: true, color: "991A21", size: 26 })] }),
        new lib.Paragraph({ children: [run("Den Haag en omstreken B.V.", { size: KLEIN, color: "555555" })] }),
      ];
  const celRand = { top: geen(), bottom: geen(), left: geen(), right: geen() };
  const header = new lib.Header({
    children: [
      new lib.Table({
        width: { size: 9072, type: lib.WidthType.DXA },
        columnWidths: [4536, 4536],
        borders: { top: geen(), bottom: geen(), left: geen(), right: geen(), insideHorizontal: geen(), insideVertical: geen() },
        rows: [new lib.TableRow({
          children: [
            new lib.TableCell({ width: { size: 4536, type: lib.WidthType.DXA }, borders: celRand, children: linksInhoud }),
            new lib.TableCell({
              width: { size: 4536, type: lib.WidthType.DXA },
              borders: celRand,
              children: adres.map((a) => new lib.Paragraph({
                alignment: lib.AlignmentType.RIGHT,
                children: [run(a, { size: KLEIN })],
              })),
            }),
          ],
        })],
      }),
      new lib.Paragraph({ children: [run("")] }),
    ],
  });

  // ── Paginanummer rechtsonder, bordeauxrood met korte streep erboven ───────
  const footer = new lib.Footer({
    children: [new lib.Paragraph({
      alignment: lib.AlignmentType.CENTER,
      indent: { left: 9072 - 850 },
      border: { top: { style: lib.BorderStyle.SINGLE, size: 4, space: 1, color: "7F7F7F" } },
      children: [new lib.TextRun({ children: [lib.PageNumber.CURRENT], font: FONT, size: BODY, color: BORDEAUX })],
    })],
  });

  return new lib.Document({
    creator: "Totaal VvE Beheer Den Haag en omstreken B.V.",
    title: "Notulen",
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1417, right: 1417, bottom: 1417, left: 1417, header: 708, footer: 708 },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: kinderen,
    }],
  });
}

async function haalLogoOp() {
  try {
    const basis = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
    const res = await fetch(`${basis}tvb-logo.png`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function exportNotuleWord(output, vergadering = {}) {
  if (!output || !output.trim()) return;
  const logo = await haalLogoOp();
  const doc = await bouwNotuleDocument(output, logo);
  const blob = await lib.Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const naam = (vergadering.naam || "Notule").replace(/[^\w\-]+/g, "_").slice(0, 60) || "Notule";
  a.href = url;
  a.download = `Notulen_${naam}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
