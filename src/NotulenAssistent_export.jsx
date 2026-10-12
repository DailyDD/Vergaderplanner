// Word-export voor de Notulen Assistent.
// Bouwt een Word-compatibel HTML-bestand (.doc) met TVB-briefhoofd — geen externe
// libraries. Word en LibreOffice openen dit direct als bewerkbaar document.

// Optioneel: plak hier de base64 van het TVB-logo ("data:image/png;base64,....").
// Laat leeg voor een tekstbriefhoofd.
const TVB_LOGO = "";

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Zet de platte notuletekst om naar eenvoudige, nette HTML.
// - "1.  OPENING ..."         -> hoofdstukkop (bordeaux, bold)
// - "─────"                   -> scheidingslijn
// - "Vereniging/Datum/..."    -> vet (koptekst van de notule)
// - overige regels            -> alinea
function notuleNaarHtml(output) {
  const regels = String(output || "").split("\n");
  let html = "";
  for (const regel of regels) {
    const t = regel.replace(/\s+$/, "");
    if (!t.trim()) { html += '<p style="margin:0;height:7pt"></p>'; continue; }
    if (/^─{3,}$/.test(t.trim())) {
      html += '<hr style="border:none;border-top:1px solid #d7d0d1;margin:7pt 0">';
    } else if (/^\d+\.\s{2,}\S/.test(t)) {
      html += `<h3 style="font-size:10pt;color:#991A21;margin:13pt 0 4pt;font-weight:bold">${esc(t)}</h3>`;
    } else if (/^(NOTULEN|Vereniging|Datum|Locatie)\b/.test(t)) {
      html += `<p style="margin:0 0 2pt"><strong>${esc(t)}</strong></p>`;
    } else {
      html += `<p style="margin:0 0 3pt">${esc(t)}</p>`;
    }
  }
  return html;
}

function briefhoofd() {
  const logo = TVB_LOGO
    ? `<img src="${TVB_LOGO}" alt="Totaal VvE Beheer" style="width:120px;height:auto">`
    : `<div style="font-weight:bold;color:#991A21;font-size:13pt">Totaal VvE Beheer</div>
       <div style="font-size:8pt;color:#555">Den Haag en omstreken B.V.</div>`;
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:16pt">
    <tr>
      <td style="border:0;padding:0;vertical-align:top">${logo}</td>
      <td style="border:0;padding:0;text-align:right;font-size:8pt;color:#555;vertical-align:top">
        Volmerlaan 5 · 2288 GC Rijswijk<br>070 - 360 34 43<br>www.totaalvve.nl · info@totaalvve.nl
      </td>
    </tr>
  </table>`;
}

export function exportNotuleWord(output, vergadering = {}) {
  if (!output || !output.trim()) return;
  const html = `<html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:21mm 19mm 19mm 19mm}
    body,p,td,li,span,div{font-family:Verdana,Geneva,sans-serif;font-size:9pt;color:#292929;line-height:1.45}
    h1,h2,h3{font-family:Verdana,Geneva,sans-serif;color:#991A21}
    strong,b{font-weight:bold}
  </style></head><body>${briefhoofd()}${notuleNaarHtml(output)}</body></html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const naam = (vergadering.naam || "Notule").replace(/[^\w\-]+/g, "_").slice(0, 60) || "Notule";
  a.href = url;
  a.download = `Notulen_${naam}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
