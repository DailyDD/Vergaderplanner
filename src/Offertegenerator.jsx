import React, { useState } from "react";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { logEvent } from './telemetry';

// ── Huisstijl Totaal VvE Beheer ──────────────────────────────────
const BORDEAUX = "#991A21";
const ANTRACIET = "#2D2D2D";

// ── Tariefregels (bevestigd) ─────────────────────────────────────
// Jaarbedrag  = max(675, aantal × 225)
// Openingskn. = aantal × 30
// Layout: kleine VvE (tekstregels) t/m 12 rechten, grote VvE (tabel) vanaf 13.
// Wil je de grens verleggen: pas GROOT_VANAF aan, verder niets.
const GROOT_VANAF = 13;
const TARIEF_PER_RECHT = 225;
const JAAR_MINIMUM = 675;
const OPENING_PER_RECHT = 30;

const NL_MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december"];

// Hele euro's, Nederlandse duizendtal-notatie, met ",-" suffix: 1234 -> "1.234,-"
function euroNotatie(bedrag) {
  if (!Number.isFinite(bedrag)) return "";
  return `${Math.round(bedrag).toLocaleString("nl-NL")},-`;
}

function vandaagNL() {
  const d = new Date();
  return `${d.getDate()} ${NL_MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

// Bestandsnaam veilig maken voor Windows
function veiligeBestandsnaam(s) {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

const STIJL = `
.ofg-wrap { max-width: 860px; margin: 0 auto; padding: 4px 4px 40px; color: ${ANTRACIET}; }
.ofg-top { display:flex; align-items:center; gap:14px; margin-bottom:20px; }
.ofg-terug { background:none; border:none; color:${BORDEAUX}; font-size:14px; font-weight:500;
  cursor:pointer; padding:6px 2px; display:inline-flex; align-items:center; gap:6px; }
.ofg-terug:hover { text-decoration:underline; }
.ofg-titel { font-size:22px; font-weight:700; color:${ANTRACIET}; margin:0; }
.ofg-kaart { background:#fff; border:1px solid #E9E2DD; border-radius:12px; padding:20px 22px; margin-bottom:16px; }
.ofg-kop { font-size:13px; font-weight:700; color:${BORDEAUX}; text-transform:uppercase;
  letter-spacing:.04em; margin:0 0 14px; }
.ofg-rij { display:grid; grid-template-columns:1fr 1fr; gap:14px 16px; }
.ofg-veld { display:flex; flex-direction:column; gap:5px; }
.ofg-veld.vol { grid-column:1 / -1; }
.ofg-label { font-size:13px; font-weight:500; color:${ANTRACIET}; }
.ofg-hulp { font-size:12px; color:#8A817B; line-height:1.35; }
.ofg-inp, .ofg-sel { width:100%; padding:9px 12px; border:1.5px solid #E5DEDA; border-radius:8px;
  font-size:14px; color:#1A1614; background:#FAF7F2; outline:none; box-sizing:border-box; }
.ofg-inp:focus, .ofg-sel:focus { border-color:${BORDEAUX}; background:#fff; }
.ofg-inp[type=number]::-webkit-inner-spin-button,
.ofg-inp[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
.ofg-check { display:flex; align-items:flex-start; gap:10px; background:#FAF7F2;
  border:1.5px solid #E5DEDA; border-radius:8px; padding:12px 14px; cursor:pointer; }
.ofg-check input { margin-top:2px; width:16px; height:16px; accent-color:${BORDEAUX}; cursor:pointer; }
.ofg-check-tekst { font-size:13px; color:${ANTRACIET}; line-height:1.4; }
.ofg-preview { background:#FAF7F2; border:1px dashed #D8CEC7; border-radius:8px; padding:12px 14px;
  font-size:13px; color:#5A524C; line-height:1.5; }
.ofg-badge { display:inline-block; font-size:12px; font-weight:600; padding:3px 10px; border-radius:99px; }
.ofg-badge.klein { background:#EBF3EE; color:#2E6B45; }
.ofg-badge.groot { background:#F3ECEC; color:${BORDEAUX}; }
.ofg-genbalk { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.ofg-knop { background:${BORDEAUX}; color:#fff; border:none; border-radius:9px; padding:12px 26px;
  font-size:15px; font-weight:600; cursor:pointer; }
.ofg-knop:disabled { background:#C9BEB9; cursor:not-allowed; }
.ofg-fout { color:${BORDEAUX}; font-size:13px; font-weight:500; }
.ofg-ok { color:#2E6B45; font-size:13px; font-weight:600; }
.ofg-topbar { display:flex; align-items:center; justify-content:space-between; height:56px; padding:0 24px; background:#fff; border-bottom:1px solid #E7E2DB; position:sticky; top:0; z-index:50; }
.ofg-topbar-kop { display:flex; align-items:center; gap:11px; }
.ofg-topbar-accent { width:3px; height:22px; background:${BORDEAUX}; border-radius:2px; }
.ofg-topbar-ico { color:${BORDEAUX}; display:flex; }
.ofg-topbar-titel { font-size:14px; font-weight:700; color:${ANTRACIET}; }
.ofg-topbar-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; padding:7px 13px; background:#fff; border:1px solid #E7E2DB; border-radius:9px; color:#6B6560; cursor:pointer; transition:all .15s; }
.ofg-topbar-btn:hover { border-color:${BORDEAUX}; color:${BORDEAUX}; }
`;

export default function Offertegenerator({ onTerug }) {
  // Contactgegevens
  const [vorm, setVorm] = useState("heer");
  const [achternaam, setAchternaam] = useState("");
  const [voornaam, setVoornaam] = useState("");
  // VvE-gegevens
  const [vveNaam, setVveNaam] = useState("");
  const [plaats, setPlaats] = useState("");
  const [aantal, setAantal] = useState("");
  const [eenhedenOverride, setEenhedenOverride] = useState("");
  // Offerte-opties
  const [datum, setDatum] = useState(vandaagNL());
  const [ondertekenaar, setOndertekenaar] = useState("Conny Mertens");
  const [ondersplitsing, setOndersplitsing] = useState(false);
  const [jaarOverride, setJaarOverride] = useState("");
  const [openingOverride, setOpeningOverride] = useState("");
  // Status
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState(false);

  const n = parseInt(aantal, 10);
  const geldigAantal = Number.isInteger(n) && n > 0;
  const isGroot = geldigAantal && n >= GROOT_VANAF;

  const jaarBerekend = geldigAantal ? Math.max(JAAR_MINIMUM, n * TARIEF_PER_RECHT) : null;
  const openingBerekend = geldigAantal ? n * OPENING_PER_RECHT : null;

  const jaarNum = jaarOverride.trim() ? parseFloat(jaarOverride.replace(",", ".")) : jaarBerekend;
  const openingNum = openingOverride.trim() ? parseFloat(openingOverride.replace(",", ".")) : openingBerekend;

  const eenhedenAuto = geldigAantal ? `${n} appartementsrechten` : "";
  const eenhedenTekst = eenhedenOverride.trim() || eenhedenAuto;

  const aanhef = achternaam.trim()
    ? `Geachte ${vorm} ${achternaam.trim()}${voornaam.trim() ? `, beste ${voornaam.trim()}` : ""},`
    : `Geachte ${vorm},`;

  const betreftPreview = `Offerte beheer VvE ${vveNaam.trim() || "…"} te ${plaats.trim() || "…"} (${eenhedenTekst || "…"})`;

  const kanGenereren = geldigAantal && vveNaam.trim() && plaats.trim() && Number.isFinite(jaarNum) && Number.isFinite(openingNum);

  async function genereer() {
    setFout("");
    setKlaar(false);
    if (!kanGenereren) return;
    setBezig(true);
    try {
      const templateBestand = isGroot ? "offerte-groot.docx" : "offerte-standaard.docx";
      const resp = await fetch(`/templates/${templateBestand}`);
      if (!resp.ok) {
        throw new Error(`Template "${templateBestand}" niet gevonden. Staat hij in public/templates/?`);
      }
      const buf = await resp.arrayBuffer();
      const zip = new PizZip(buf);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });
      doc.render({
        datum: datum.trim(),
        vveNaam: vveNaam.trim(),
        plaats: plaats.trim(),
        eenhedenTekst,
        aanhef,
        jaarbedrag: euroNotatie(jaarNum),
        openingskosten: euroNotatie(openingNum),
        ondertekenaar,
        isOndersplitsing: isGroot && ondersplitsing,
      });
      const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${veiligeBestandsnaam(`Offerte ${vveNaam.trim() || "VvE"}`)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setKlaar(true);
      logEvent('offerte_generated', { module: 'offertes' });
    } catch (e) {
      setFout(e && e.message ? e.message : "Er ging iets mis bij het genereren van de offerte.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <style>{STIJL}</style>

      {/* Standaard topbar (gelijk aan de overige modules) */}
      <div className="ofg-topbar">
        <div className="ofg-topbar-kop">
          <span className="ofg-topbar-accent" />
          <span className="ofg-topbar-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="19" height="19"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
          </span>
          <span className="ofg-topbar-titel">Offertegenerator</span>
        </div>
        <button className="ofg-topbar-btn" onClick={onTerug}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Terug naar portaal
        </button>
      </div>

      <div className="ofg-wrap">
        <p className="ofg-hulp" style={{ margin: "4px 0 20px" }}>
          Vul de gegevens in, controleer de voorbeelden en genereer de offerte in de juiste template.
        </p>

      {/* ── Contactgegevens ── */}
      <div className="ofg-kaart">
        <h2 className="ofg-kop">Contactgegevens</h2>
        <div className="ofg-rij">
          <div className="ofg-veld">
            <label className="ofg-label">Aanspreekvorm</label>
            <select className="ofg-sel" value={vorm} onChange={e => setVorm(e.target.value)}>
              <option value="heer">heer</option>
              <option value="mevrouw">mevrouw</option>
              <option value="heer / mevrouw">heer / mevrouw (algemeen)</option>
            </select>
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Achternaam</label>
            <input className="ofg-inp" value={achternaam} onChange={e => setAchternaam(e.target.value)}
              placeholder="bijv. Rumphorst" />
            <span className="ofg-hulp">Leeg laten bij algemene aanhef "heer / mevrouw".</span>
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Voornaam <span style={{ color: "#8A817B" }}>(optioneel)</span></label>
            <input className="ofg-inp" value={voornaam} onChange={e => setVoornaam(e.target.value)}
              placeholder="bijv. Mark" />
            <span className="ofg-hulp">Ingevuld → voegt ", beste [voornaam]" toe.</span>
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Aanhef (zo komt hij in de brief)</label>
            <div className="ofg-preview" style={{ padding: "9px 12px" }}>{aanhef}</div>
          </div>
        </div>
      </div>

      {/* ── VvE-gegevens ── */}
      <div className="ofg-kaart">
        <h2 className="ofg-kop">VvE-gegevens</h2>
        <div className="ofg-rij">
          <div className="ofg-veld">
            <label className="ofg-label">Naam / adres VvE</label>
            <input className="ofg-inp" value={vveNaam} onChange={e => setVveNaam(e.target.value)}
              placeholder="bijv. Loosduinse Hoofdstraat 254-256" />
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Plaats</label>
            <input className="ofg-inp" value={plaats} onChange={e => setPlaats(e.target.value)}
              placeholder="bijv. 's-Gravenhage" />
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Aantal appartementsrechten</label>
            <input className="ofg-inp" type="number" min="1" value={aantal}
              onChange={e => setAantal(e.target.value)} placeholder="bijv. 8" />
            {geldigAantal && (
              <span className="ofg-hulp">
                Template:{" "}
                <span className={`ofg-badge ${isGroot ? "groot" : "klein"}`}>
                  {isGroot ? "grote VvE — tabel" : "kleine VvE — tekstregels"}
                </span>
              </span>
            )}
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Omschrijving eenheden</label>
            <input className="ofg-inp" value={eenhedenOverride} onChange={e => setEenhedenOverride(e.target.value)}
              placeholder={eenhedenAuto || "eerst aantal invullen"} />
            <span className="ofg-hulp">
              Leeg = automatisch ("{eenhedenAuto || "…"}"). Aanpassen bij bijv. "totaal 18 appartementsrechten" of "84 woningen en 84 bergingen".
            </span>
          </div>
          <div className="ofg-veld vol">
            <label className="ofg-label">Betreft-regel (voorbeeld)</label>
            <div className="ofg-preview">{betreftPreview}</div>
          </div>
        </div>
      </div>

      {/* ── Offerte-opties ── */}
      <div className="ofg-kaart">
        <h2 className="ofg-kop">Offerte-opties</h2>
        <div className="ofg-rij">
          <div className="ofg-veld">
            <label className="ofg-label">Datum</label>
            <input className="ofg-inp" value={datum} onChange={e => setDatum(e.target.value)}
              placeholder="bijv. 27 juli 2026" />
            <span className="ofg-hulp">Verschijnt als "Rijswijk, [datum]".</span>
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Ondertekend door</label>
            <select className="ofg-sel" value={ondertekenaar} onChange={e => setOndertekenaar(e.target.value)}>
              <option value="Conny Mertens">Conny Mertens</option>
              <option value="Chris Sleeking">Chris Sleeking</option>
              <option value="Nick Sleeking">Nick Sleeking</option>
            </select>
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Jaarbedrag (VvE Bestuurder/Administrateur)</label>
            <input className="ofg-inp" type="number" min="0" value={jaarOverride}
              onChange={e => setJaarOverride(e.target.value)}
              placeholder={jaarBerekend != null ? String(jaarBerekend) : "eerst aantal invullen"} />
            <span className="ofg-hulp">
              {jaarBerekend != null ? `Berekend: € ${euroNotatie(jaarBerekend)}. ` : ""}Leeg = automatisch.
            </span>
          </div>
          <div className="ofg-veld">
            <label className="ofg-label">Eenmalige openingskosten</label>
            <input className="ofg-inp" type="number" min="0" value={openingOverride}
              onChange={e => setOpeningOverride(e.target.value)}
              placeholder={openingBerekend != null ? String(openingBerekend) : "eerst aantal invullen"} />
            <span className="ofg-hulp">
              {openingBerekend != null ? `Berekend: € ${euroNotatie(openingBerekend)}. ` : ""}Leeg = automatisch.
            </span>
          </div>
          {isGroot && (
            <div className="ofg-veld vol">
              <label className="ofg-check" onClick={e => e.target.tagName !== "INPUT" && setOndersplitsing(!ondersplitsing)}>
                <input type="checkbox" checked={ondersplitsing} onChange={e => setOndersplitsing(e.target.checked)} />
                <span className="ofg-check-tekst">
                  <strong>Ondersplitsing</strong> — voegt de extra alinea toe over vertegenwoordiging richting de hoofdsplitsing (afzonderlijk gefactureerd op nacalculatie).
                </span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ── Genereren ── */}
      <div className="ofg-genbalk">
        <button className="ofg-knop" onClick={genereer} disabled={!kanGenereren || bezig}>
          {bezig ? "Bezig…" : "Genereer offerte (Word)"}
        </button>
        {!kanGenereren && !bezig && (
          <span className="ofg-hulp">Vul minimaal aantal, naam/adres en plaats in.</span>
        )}
        {fout && <span className="ofg-fout">{fout}</span>}
        {klaar && !fout && <span className="ofg-ok">Offerte gegenereerd &#10003; — controleer de download.</span>}
      </div>
    </div>
    </>
  );
}
