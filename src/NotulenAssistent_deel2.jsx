import React, { useState } from "react";
import { BlokkOpening, BlokkStemgerechtigden, BlokkNotulenVorig, BlokkOnderhoud, BlokkFinancien, BlokkRondvraag, BlokkSluiting, Sectie, Inp, Txa, Sel, Veld, Chk, RadioOptie, CSS_FONT, ROOD, SUPABASE_URL, SUPABASE_ANON, nu, uid } from "./NotulenAssistent_deel1";

// ── Tekstgeneratie op basis van ingevulde data ─────────────────────────────
function genereerTekst(vergadering, blokken, vrij) {
  const lijnen = [];
  const r = (t) => lijnen.push(t);
  const leeg = () => lijnen.push("");

  r(`NOTULEN VERGADERING`);
  r(`Vereniging : ${vergadering.naam || "[NAAM VERENIGING]"}`);
  r(`Datum      : ${vergadering.datum || "[DATUM]"}`);
  r(`Locatie    : ${vergadering.locatie || "[LOCATIE]"}`);
  leeg();
  r(`─────────────────────────────────────────────────────────`);
  leeg();

  // 1. Opening
  r(`1.  OPENING | MEDEDELINGEN | INGEKOMEN STUKKEN`);
  leeg();
  const op = blokken.opening || {};
  if (op.voorzitter) r(`De vergadering wordt geopend door de voorzitter, ${op.voorzitter}.`);
  if (vergadering.naam) r(`Totaal VvE Beheer Den Haag en omstreken B.V. is aangenomen als bestuurder van ${vergadering.naam}; een formaliteit.`);
  if (op.avg === "akkoord") r(`De vergadering gaat akkoord met het delen van persoonsgegevens conform de AVG.`);
  if (op.email === "akkoord") r(`De vergadering stemt in met verzending van correspondentie per e-mail en het delen van contactgegevens van eigenaren onderling (Cc).`);
  leeg();

  // 2. Stemgerechtigden
  r(`2.  VASTSTELLEN AANTAL STEMGERECHTIGDEN LEDEN`);
  leeg();
  const st = blokken.stemgerechtigden || {};
  if (st.type === "tweede") {
    r(`Tijdens een tweede reglementaire vergadering zoals hier is bedoeld kunnen er, ongeacht het aantal aanwezige stemmen, rechtsgeldige besluiten worden genomen.`);
    leeg();
  }
  if (st.aanwezig || st.totaal) {
    r(`Aanwezig en/of vertegenwoordigd: ${st.aanwezig || "—"} stemmen${st.vertegenwoordigd ? ` (waarvan ${st.vertegenwoordigd} vertegenwoordigd)` : ""}. Totaal aantal stemmen: ${st.totaal || "—"}.`);
  }
  leeg();

  // 3. Notulen vorige vergadering
  r(`3.  VASTSTELLEN NOTULEN VORIGE VERGADERING${blokken.notulenVorig?.datum ? ` | ${blokken.notulenVorig.datum}` : ""}`);
  leeg();
  const nv = blokken.notulenVorig || {};
  if (nv.uitkomst === "vastgesteld") r(`De vergadering stelt de notulen van de vorige vergadering${nv.datum ? ` d.d. ${nv.datum}` : ""} vast.`);
  else if (nv.uitkomst === "aanpassingen") r(`De notulen van de vorige vergadering${nv.datum ? ` d.d. ${nv.datum}` : ""} worden na aanpassingen${nv.aanpassingen ? ` (${nv.aanpassingen})` : ""} vastgesteld.`);
  leeg();

  // 4. Onderhoud
  r(`4.  ONDERHOUD GEBOUW`);
  leeg();
  const on = blokken.onderhoud || {};

  // MJOP
  if (on.mjop === "aanwezig") {
    r(`De vereniging is in het bezit van een MJOP opgesteld door ${on.mjopNaam || "[NAAM]"}${on.mjopDatum ? ` d.d. ${on.mjopDatum}` : ""}; status quo, leidraad herstel- en onderhoudswerkzaamheden, financiële consequenties en medebepalend maandbijdrage en mogelijk extra (eenmalige) bijdrage(n).`);
  } else if (on.mjop === "opdracht") {
    r(`De vergadering beslist met algemene stemmen een (actueel) MJOP te laten opstellen${on.mjopOpdracht ? ` door ${on.mjopOpdracht}` : ""}. De bestuurder zal namens de vereniging de opdracht hiertoe verstrekken.`);
  } else if (on.mjop === "uitgesteld") {
    r(`De vergadering beslist de keuze tot het laten opstellen van een MJOP opnieuw te bespreken tijdens de eerstvolgende reguliere vergadering.`);
  }
  leeg();

  // Offertes
  if (on.werkzaamheden || on.offerteSituatie) {
    r(`Bespreken en vaststellen | ${on.werkzaamheden || "[OMSCHRIJVING WERKZAAMHEDEN]"}`);
    leeg();
    if (on.offerteSituatie === "aanvragen") {
      r(`De bestuurder zal namens de vereniging een onderhoudspartij binnen haar netwerk het verzoek doen een opname te verrichten, en aansluitend op onderdelen te offreren.`);
    } else if (on.offerteSituatie === "keuze") {
      const gekozen = (on.offertes || []).find(o => o.gekozen);
      if (gekozen) {
        r(`De offerte van ${gekozen.partij || "[NAAM]"} ligt aan de vergadering voor. Na een constructief overleg met en tussen de leden, beslist de vergadering met algemene stemmen akkoord te gaan met de offerte van ${gekozen.partij || "[NAAM]"}${gekozen.bedrag ? ` ad. ${gekozen.bedrag}` : ""}. De bestuurder zal namens de vereniging de opdrachtverstrekking doen en haar nader informeren omtrent de planning.`);
      } else if ((on.offertes || []).length > 0) {
        r(`De volgende offertes liggen aan de vergadering voor:`);
        (on.offertes || []).forEach(o => { if (o.partij) r(`- ${o.partij}${o.bedrag ? `: ${o.bedrag}` : ""}`); });
        r(`De vergadering beslist welke offerte wordt geaccepteerd.`);
      }
    }
    leeg();
  }

  // Mandaat
  if (on.mandaat) {
    r(`De vergadering stelt het mandaat van de bestuurder vast (herhaling).`);
  }
  if (on.aanvullendMandaat) {
    r(`De vergadering mandateert Totaal VvE Beheer Den Haag en omstreken B.V. — eenmalig en welbepaald in deze specifieke situatie — tot het verstrekken van de opdracht aan ${on.mandaatPartij || "[NAAM ONDERHOUDSPARTIJ]"} met betrekking tot ${on.mandaatOmschrijving || "[OMSCHRIJVING]"}${on.mandaatBedrag ? `, tot ten hoogste ${on.mandaatBedrag} exclusief BTW` : ""}.`);
    leeg();
  }
  if (on.commissie) {
    r(`De interne commissie wordt vastgesteld (herhaling).`);
    leeg();
  }

  // 5. Financiën
  r(`5.  FINANCIËN | VERZEKERINGEN`);
  leeg();
  const fi = blokken.financien || {};

  if (fi.bijdrageKeuze === "verhogen") {
    r(`De vergadering beslist met algemene stemmen de (huidige) maandelijkse bijdrage ad. € ${fi.bijdrageHuidig || "[HUIDIG]"} per appartementsrecht per 1 ${fi.bijdrageDatum || "[DATUM]"} te verhogen naar € ${fi.bijdrageNieuw || "[NIEUW]"}.`);
    if ((fi.bijdragen || []).length > 0) {
      leeg();
      r(`Maandelijkse bijdragen | ${fi.bijdrageDatum || "[DATUM]"}`);
      fi.bijdragen.forEach((b, i) => {
        const einde = i === fi.bijdragen.length - 1 ? "." : ";";
        r(`Appartementsrecht nummer ${b.nummer || "—"} (breukdelen ${b.breukdelen || "—"})\t: € ${b.bedrag || "—"}${einde}`);
      });
    }
  } else if (fi.bijdrageKeuze === "handhaven") {
    r(`De vergadering beslist met algemene stemmen de (huidige) maandelijkse bijdrage(n) per appartementsrecht (vooralsnog) te handhaven.`);
  } else if (fi.bijdrageKeuze === "aanpassen") {
    r(`De vergadering beslist met algemene stemmen de maandelijkse bijdrage per appartementsrecht na rato van de breukdelen aan te passen.`);
    if ((fi.bijdragen || []).length > 0) {
      leeg();
      fi.bijdragen.forEach((b, i) => {
        const einde = i === fi.bijdragen.length - 1 ? "." : ";";
        r(`Appartementsrecht nummer ${b.nummer || "—"} (breukdelen ${b.breukdelen || "—"})\t: € ${b.bedrag || "—"}${einde}`);
      });
    }
  }
  leeg();

  if (fi.eenmalig && fi.eenmaligBedrag) {
    r(`De vergadering beslist met algemene stemmen akkoord te gaan met een extra eenmalige bijdrage ad. € ${fi.eenmaligBedrag} ter financiering van ${fi.eenmaligOmschrijving || "[OMSCHRIJVING]"}.`);
    leeg();
  }

  if (fi.jaarstukken === "vastgesteld") {
    r(`De vergadering stelt de jaarstukken ${fi.boekjaar || "[BOEKJAAR]"} vast.`);
    leeg();
  }

  if (fi.verzekeringUitbreiden) {
    r(`De vergadering beslist met algemene stemmen de huidige verzekeringsdekking(en) uit te breiden met een rechtsbijstandverzekering conform de door bestuurder verstrekte toelichting en prijsstelling. De bestuurder zal namens de vereniging de opdrachtverstrekking aan de verzekeraar (gevolmachtigde) doen.`);
    leeg();
  }
  if (fi.verzekeringOmzetten) {
    r(`De vergadering beslist met algemene stemmen de huidige verzekeringsdekking(en) onder te brengen bij ${fi.verzekeringNaar || "[VERZEKERAAR]"} conform de door bestuurder verstrekte toelichting en prijsstelling.`);
    leeg();
  }
  if (fi.abn) {
    r(`De vergadering beslist met algemene stemmen de bankrekening om te zetten naar ABN AMRO Bank.`);
    leeg();
  }
  if (fi.incasso) {
    r(`Het incassomandaat wordt vastgesteld (herhaling).`);
    leeg();
  }

  // Vrije agendapunten
  const vrijeMetTekst = vrij.filter(p => p.titel && p.output);
  if (vrijeMetTekst.length > 0) {
    vrijeMetTekst.forEach((p, i) => {
      r(`${6 + i}.  ${p.titel.toUpperCase()}`);
      leeg();
      r(p.output);
      leeg();
    });
  }

  // Rondvraag
  const rondvraagNummer = 6 + vrijeMetTekst.length;
  r(`${rondvraagNummer}.  RONDVRAAG`);
  leeg();
  const rv = blokken.rondvraag || {};
  if (rv.uitkomst === "geen") r(`Geen.`);
  else if (rv.uitkomst === "beantwoord") r(`De bestuurder beantwoordt de vragen naar tevredenheid van de eigenaars.`);
  else if (rv.uitkomst === "vrij" && rv.tekst) r(rv.tekst);
  leeg();

  // Sluiting
  const sluitingNummer = rondvraagNummer + 1;
  r(`${sluitingNummer}.  VASTSTELLEN NIEUWE VERGADERING | SLUITING`);
  leeg();
  const sl = blokken.sluiting || {};
  if (sl.datum) r(`De volgende vergadering wordt vastgesteld op ${sl.datum}${sl.locatie ? `, ${sl.locatie}` : ""}.`);
  r(`De vergadering wordt gesloten.`);

  return lijnen.join("\n");
}

// ── Vrij agendapunt met AI ─────────────────────────────────────────────────
function VrijPunt({ punt, onChange, onDelete, apiKey }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const genereer = async () => {
    if (!punt.omschrijving?.trim()) return;
    if (!apiKey) { setError("Geen API key beschikbaar."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 600,
          system: `Je schrijft notulentekst voor VvE-vergaderingen in de stijl van Totaal VvE Beheer Den Haag en omstreken B.V. 
Schrijfstijl: formeel, juridisch precies, zakelijk. Gebruik "De vergadering beslist met algemene stemmen..." of "De bestuurder zal namens de vereniging..." als standaard beginzin voor besluiten. 
Geef alleen de notulentekst terug, geen uitleg of opmaak. Maximaal 4 zinnen.`,
          messages: [{ role: "user", content: `Schrijf een notulentekst voor het volgende agendapunt: "${punt.titel || "Extra punt"}"\n\nWat is besproken/besloten: ${punt.omschrijving}` }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      onChange({ ...punt, output: data.content[0]?.text || "" });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#2D2D2D]">Extra agendapunt</p>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-sm">✕ verwijderen</button>
      </div>
      <Veld label="Titel agendapunt">
        <Inp value={punt.titel || ""} onChange={v => onChange({ ...punt, titel: v })} placeholder="bijv. Plaatsing zonnepanelen" />
      </Veld>
      <Veld label="Wat is er besproken / besloten?">
        <Txa value={punt.omschrijving || ""} onChange={v => onChange({ ...punt, omschrijving: v })} placeholder="Beschrijf kort de kern van de bespreking en het besluit…" rows={3} />
      </Veld>
      {apiKey ? (
        <button onClick={genereer} disabled={loading || !punt.omschrijving?.trim()}
          className="text-xs px-3 py-1.5 bg-[#991A21] hover:bg-[#7a1419] disabled:opacity-50 text-white rounded-lg font-semibold transition-colors">
          {loading ? "Genereren…" : "✦ Notulentekst genereren"}
        </button>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
          ✦ AI-generatie is nog niet beschikbaar — Anthropic API key niet ingesteld. De omschrijving wordt wel meegenomen in de notule.
        </div>
      )}
      {error && <p className="text-xs text-[#991A21]">{error}</p>}
      {punt.output && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Gegenereerde tekst — pas eventueel aan</p>
          <Txa value={punt.output} onChange={v => onChange({ ...punt, output: v })} rows={4} />
        </div>
      )}
    </div>
  );
}

// ── Hoofdcomponent ─────────────────────────────────────────────────────────
export default function NotulenAssistent({ onTerug }) {
  const [vergadering, setVergadering] = useState({ naam: "", datum: "", locatie: "" });
  const [actieveSectie, setActieveSectie] = useState("opening");
  const [blokken, setBlokken] = useState({
    opening: {}, stemgerechtigden: {}, notulenVorig: {},
    onderhoud: {}, financien: {}, rondvraag: { uitkomst: "geen" }, sluiting: {}
  });
  const [vrij, setVrij] = useState([]);
  const [output, setOutput] = useState("");
  const [gekopieerd, setGekopieerd] = useState(false);
  const [toonOutput, setToonOutput] = useState(false);

  // Controleer of Anthropic API beschikbaar is via Supabase Edge Function
  // (geen directe API key in frontend — loopt via de bestaande herschrijf-mail function structuur)
  const apiKey = null; // Wordt later gekoppeld zodra Edge Function beschikbaar is

  const updBlok = (sleutel, val) => setBlokken(b => ({ ...b, [sleutel]: val }));
  const addVrij = () => setVrij(v => [...v, { id: uid(), titel: "", omschrijving: "", output: "" }]);
  const updVrij = (id, val) => setVrij(v => v.map(p => p.id === id ? val : p));
  const delVrij = (id) => setVrij(v => v.filter(p => p.id !== id));

  const genereer = () => {
    const tekst = genereerTekst(vergadering, blokken, vrij);
    setOutput(tekst);
    setToonOutput(true);
  };

  const kopieer = () => {
    navigator.clipboard.writeText(output);
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  };

  const SECTIES = [
    { key: "opening", nr: "1", titel: "Opening | Mededelingen | Ingekomen stukken", comp: <BlokkOpening data={blokken.opening} onChange={v => updBlok("opening", v)} /> },
    { key: "stemgerechtigden", nr: "2", titel: "Vaststellen aantal stemgerechtigden", comp: <BlokkStemgerechtigden data={blokken.stemgerechtigden} onChange={v => updBlok("stemgerechtigden", v)} /> },
    { key: "notulenVorig", nr: "3", titel: "Vaststellen notulen vorige vergadering", comp: <BlokkNotulenVorig data={blokken.notulenVorig} onChange={v => updBlok("notulenVorig", v)} /> },
    { key: "onderhoud", nr: "4", titel: "Onderhoud gebouw", comp: <BlokkOnderhoud data={blokken.onderhoud} onChange={v => updBlok("onderhoud", v)} /> },
    { key: "financien", nr: "5", titel: "Financiën | Verzekeringen", comp: <BlokkFinancien data={blokken.financien} onChange={v => updBlok("financien", v)} /> },
    { key: "rondvraag", nr: "6", titel: "Rondvraag", comp: <BlokkRondvraag data={blokken.rondvraag} onChange={v => updBlok("rondvraag", v)} /> },
    { key: "sluiting", nr: "7", titel: "Vaststellen nieuwe vergadering | Sluiting", comp: <BlokkSluiting data={blokken.sluiting} onChange={v => updBlok("sluiting", v)} /> },
  ];

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>

      {/* Topbar */}
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center"><span className="text-white text-xs">📋</span></div>
            <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center"><span className="text-white text-xs">✍️</span></div>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">Notulen Assistent</span>
        </div>
        <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors">← Terug naar portaal</button>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-[1fr_1fr] gap-6">

          {/* ── LINKER KOLOM: invulformulier ── */}
          <div className="space-y-4">
            {/* Vergaderdetails */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vergaderdetails</p>
              <div className="grid grid-cols-1 gap-3">
                <Veld label="Naam vereniging" required><Inp value={vergadering.naam} onChange={v => setVergadering(d => ({ ...d, naam: v }))} placeholder="bijv. VvE Willem Pijperlaan 36-64" /></Veld>
                <div className="grid grid-cols-2 gap-3">
                  <Veld label="Datum vergadering" required><Inp value={vergadering.datum} onChange={v => setVergadering(d => ({ ...d, datum: v }))} placeholder="bijv. 12 mei 2026" /></Veld>
                  <Veld label="Locatie"><Inp value={vergadering.locatie} onChange={v => setVergadering(d => ({ ...d, locatie: v }))} placeholder="zaal, adres..." /></Veld>
                </div>
              </div>
            </div>

            {/* Vaste agendapunten */}
            <div className="space-y-2">
              {SECTIES.map(s => (
                <Sectie key={s.key} nummer={s.nr} titel={s.titel}
                  actief={actieveSectie === s.key}
                  onToggle={() => setActieveSectie(actieveSectie === s.key ? null : s.key)}>
                  {s.comp}
                </Sectie>
              ))}
            </div>

            {/* Extra agendapunten */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Extra agendapunten</p>
                <button onClick={addVrij} className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-medium transition-colors">+ Punt toevoegen</button>
              </div>
              {vrij.length === 0 && (
                <p className="text-xs text-gray-400 italic">Geen extra punten. Klik op '+ Punt toevoegen' voor niet-standaard agendapunten.</p>
              )}
              {vrij.map(p => (
                <VrijPunt key={p.id} punt={p} onChange={val => updVrij(p.id, val)} onDelete={() => delVrij(p.id)} apiKey={apiKey} />
              ))}
            </div>

            {/* Genereer knop */}
            <button onClick={genereer} className="w-full py-3 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
              Notule samenstellen →
            </button>
          </div>

          {/* ── RECHTER KOLOM: output ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col" style={{ minHeight: 600 }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Gegenereerde notule</p>
              {output && (
                <button onClick={kopieer}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${gekopieerd ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-gray-600 border-gray-200 hover:border-[#991A21] hover:text-[#991A21]"}`}>
                  {gekopieerd ? "✓ Gekopieerd!" : "Kopieer naar klembord"}
                </button>
              )}
            </div>
            {!output ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm font-semibold text-gray-500 mb-1">Vul de vergaderdetails in</p>
                  <p className="text-xs text-gray-400">en klik op 'Notule samenstellen'</p>
                </div>
              </div>
            ) : (
              <textarea
                value={output}
                onChange={e => setOutput(e.target.value)}
                className="flex-1 w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-4 py-3 text-xs text-[#2D2D2D] focus:outline-none resize-none font-mono leading-relaxed"
                style={{ minHeight: 500 }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
