import React, { useState } from "react";
import { BlokkOpening, BlokkStemgerechtigden, BlokkMededelingen, BlokkCommissies, BlokkNotulenVorig, BlokkOnderhoud, BlokkFinancien, BlokkRondvraag, BlokkSluiting, Sectie, Inp, Txa, Sel, Veld, Chk, RadioOptie, CSS_FONT, ROOD, SUPABASE_URL, SUPABASE_ANON, nu, uid } from "./NotulenAssistent_deel1";
import Presentie, { berekenStemmen } from "./NotulenAssistent_presentie";
import { exportNotuleWord } from "./NotulenAssistent_export";
import Acties from "./NotulenAssistent_acties";

// ── Tekstgeneratie op basis van ingevulde data ─────────────────────────────
// De agenda volgt de vaste 8-punts indeling van Totaal VvE Beheer. De nummering
// wordt dynamisch opgebouwd (kop()), zodat extra agendapunten vanzelf meetellen
// en er nooit een hardgecodeerd nummer scheef kan lopen.
function genereerTekst(vergadering, blokken, vrij, owners = []) {
  const lijnen = [];
  const r = (t) => lijnen.push(t);
  const leeg = () => lijnen.push("");

  let nr = 0;
  const kop = (titel) => {
    if (lijnen.length && lijnen[lijnen.length - 1] !== "") leeg();
    r(`${++nr}.  ${titel}`);
    leeg();
  };

  // Extra agendapunt: besproken + besluit + uitkomst stemming (zonder AI).
  const STEM_TEKST = {
    algemeen: "Aangenomen met algemene stemmen.",
    meerderheid: "Aangenomen met meerderheid van stemmen",
    verworpen: "Niet aangenomen",
    aangehouden: "Aangehouden; het voorstel wordt niet in stemming gebracht.",
  };
  const heeftInhoud = (p) => p.titel && p.titel.trim() && ((p.besproken || "").trim() || (p.besluit || "").trim());
  const vrijePunten = (plaats) => (vrij || []).filter(p => heeftInhoud(p) && (p.plaats || "financien") === plaats);
  const vrijBlok = (p) => {
    kop(p.titel.trim().toUpperCase());
    if ((p.besproken || "").trim()) r(p.besproken.trim());
    if ((p.besluit || "").trim()) {
      if ((p.besproken || "").trim()) leeg();
      r(`Besluit: ${p.besluit.trim()}`);
      const u = p.uitkomst || "algemeen";
      let regel = STEM_TEKST[u] || STEM_TEKST.algemeen;
      const { voor, tegen, onthouding } = p;
      const heeftTelling = [voor, tegen, onthouding].some(x => x !== undefined && x !== "" && x !== null);
      if ((u === "meerderheid" || u === "verworpen") && heeftTelling) {
        regel += ` (${voor || 0} voor, ${tegen || 0} tegen, ${onthouding || 0} onthouding)`;
      }
      if (u === "meerderheid" || u === "verworpen") regel += ".";
      r(regel);
    }
    leeg();
  };

  r(`NOTULEN VERGADERING`);
  r(`Vereniging : ${vergadering.naam || "[NAAM VERENIGING]"}`);
  r(`Datum      : ${vergadering.datum || "[DATUM]"}`);
  r(`Locatie    : ${vergadering.locatie || "[LOCATIE]"}`);
  leeg();
  r(`─────────────────────────────────────────────────────────`);
  leeg();

  // 1. Opening | Mededelingen | Ingekomen stukken (incl. vaststellen stemgerechtigden)
  kop(`OPENING | MEDEDELINGEN | INGEKOMEN STUKKEN`);
  const op = blokken.opening || {};
  if (op.voorzitter) r(`De vergadering wordt geopend door de voorzitter, ${op.voorzitter}.`);
  if (vergadering.naam) r(`Totaal VvE Beheer Den Haag en omstreken B.V. is aangenomen als bestuurder van ${vergadering.naam}; een formaliteit.`);
  if (op.avg === "akkoord") r(`De vergadering gaat akkoord met het delen van persoonsgegevens conform de AVG.`);
  if (op.email === "akkoord") r(`De vergadering stemt in met verzending van correspondentie per e-mail en het delen van contactgegevens van eigenaren onderling (Cc).`);

  // Vaststellen aantal stemgerechtigden — onderdeel van agendapunt 1.
  // Is de presentietabel ingevuld, dan wordt de stemmen-passage daaruit
  // opgebouwd. Is die leeg, dan val terug op de handmatige velden.
  const st = blokken.stemgerechtigden || {};
  const stem = berekenStemmen(owners);
  const heeftStemInfo = stem.aantal > 0 || st.aanwezig || st.totaal || st.type === "tweede";
  if (heeftStemInfo) {
    leeg();
    if (st.type === "tweede") {
      r(`Tijdens een tweede reglementaire vergadering zoals hier is bedoeld kunnen er, ongeacht het aantal aanwezige stemmen, rechtsgeldige besluiten worden genomen.`);
      leeg();
    }
    if (stem.aantal > 0) {
      r(`Er zijn in totaal ${stem.totaal} stemmen. Ter vergadering zijn ${stem.vertegenwoordigd} stemmen aanwezig of vertegenwoordigd${stem.volmacht ? ` (waarvan ${stem.volmacht} bij volmacht)` : ""}, ofwel ${stem.pct}% van het totaal aantal stemmen.`);
    } else if (st.aanwezig || st.totaal) {
      r(`Aanwezig en/of vertegenwoordigd: ${st.aanwezig || "—"} stemmen${st.vertegenwoordigd ? ` (waarvan ${st.vertegenwoordigd} vertegenwoordigd)` : ""}. Totaal aantal stemmen: ${st.totaal || "—"}.`);
    }
  }
  leeg();

  // 2. Algemene mededelingen van de bestuurder (administrateur)
  kop(`ALGEMENE MEDEDELINGEN VAN DE BESTUURDER (ADMINISTRATEUR)`);
  const md = blokken.mededelingen || {};
  if (md.totaalPortaal) r(`De bestuurder licht het gebruik van het Totaal Portaal toe, waaronder het (digitaal) indienen van reparatiemeldingen door de eigenaars.`);
  if (md.extra && md.extra.trim()) {
    md.extra.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(regel => r(regel));
  }

  // 3. Vaststellen Raad van Toezicht | Technische commissie | Kascommissie
  kop(`VASTSTELLEN RAAD VAN TOEZICHT | TECHNISCHE COMMISSIE | KASCOMMISSIE`);
  const co = blokken.commissies || {};
  const commissieRegel = (d, naam) => {
    const status = d && d.status;
    if (!status || status === "niet") return;
    const namen = ((d && d.namen) || "").trim();
    if (status === "herkozen") r(`De ${naam} wordt herkozen in de huidige samenstelling${namen ? `: ${namen}` : ""}.`);
    else if (status === "nieuw") r(`Tot leden van de ${naam} worden gekozen: ${namen || "[NAMEN]"}.`);
    else if (status === "vacature") r(`De ${naam} kent op dit moment geen leden; de vergadering roept eigenaars op zich kandidaat te stellen.`);
  };
  commissieRegel(co.rvt, "Raad van Toezicht");
  commissieRegel(co.tc, "Technische commissie");
  commissieRegel(co.kc, "Kascommissie");

  // 4. Vaststellen notulen vorige vergadering
  kop(`VASTSTELLEN NOTULEN VORIGE VERGADERING${blokken.notulenVorig?.datum ? ` | ${blokken.notulenVorig.datum}` : ""}`);
  const nv = blokken.notulenVorig || {};
  if (nv.uitkomst === "vastgesteld") r(`De vergadering stelt de notulen van de vorige vergadering${nv.datum ? ` d.d. ${nv.datum}` : ""} vast.`);
  else if (nv.uitkomst === "aanpassingen") r(`De notulen van de vorige vergadering${nv.datum ? ` d.d. ${nv.datum}` : ""} worden na aanpassingen${nv.aanpassingen ? ` (${nv.aanpassingen})` : ""} vastgesteld.`);
  leeg();

  // 5. Onderhoud gebouw
  kop(`ONDERHOUD GEBOUW`);
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

  // Extra agendapunten die de beheerder na Onderhoud heeft geplaatst
  vrijePunten("onderhoud").forEach(vrijBlok);

  // 6. Financiën | Verzekeringen
  kop(`FINANCIËN | VERZEKERINGEN`);
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

  // Extra agendapunten die na Financiën zijn geplaatst (standaard)
  vrijePunten("financien").forEach(vrijBlok);

  // Rondvraag
  kop(`RONDVRAAG`);
  const rv = blokken.rondvraag || {};
  if (rv.uitkomst === "geen") r(`Geen.`);
  else if (rv.uitkomst === "beantwoord") r(`De bestuurder beantwoordt de vragen naar tevredenheid van de eigenaars.`);
  else if (rv.uitkomst === "vrij" && rv.tekst) r(rv.tekst);
  leeg();

  // Sluiting
  kop(`VASTSTELLEN NIEUWE VERGADERING | SLUITING`);
  const sl = blokken.sluiting || {};
  if (sl.datum) r(`De volgende vergadering wordt vastgesteld op ${sl.datum}${sl.locatie ? `, ${sl.locatie}` : ""}.`);
  r(`De vergadering wordt gesloten.`);

  return lijnen.join("\n");
}

// ── Extra agendapunt (zonder AI) ───────────────────────────────────────────
// Vast stramien: titel, wat is besproken, wat is besloten, uitkomst van de stemming.
function VrijPunt({ punt, onChange, onDelete }) {
  const set = (veld, val) => onChange({ ...punt, [veld]: val });
  const uitkomst = punt.uitkomst || "algemeen";
  const toonTelling = uitkomst === "meerderheid" || uitkomst === "verworpen";
  const heeftBesluit = !!(punt.besluit || "").trim();
  const onvolledig = !(punt.titel || "").trim() && ((punt.besproken || "").trim() || heeftBesluit);

  return (
    <div className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#2D2D2D]">Extra agendapunt</p>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-sm">✕ verwijderen</button>
      </div>
      <div className="grid grid-cols-[1fr_190px] gap-3">
        <Veld label="Titel agendapunt" required>
          <Inp value={punt.titel || ""} onChange={v => set("titel", v)} placeholder="bijv. Plaatsing zonnepanelen" />
        </Veld>
        <Veld label="Plaats in agenda" hint="Waar dit punt in de notule komt. Rondvraag en Sluiting blijven altijd aan het eind.">
          <Sel value={punt.plaats || "financien"} onChange={v => set("plaats", v)}>
            <option value="onderhoud">Na Onderhoud gebouw</option>
            <option value="financien">Na Financiën</option>
          </Sel>
        </Veld>
      </div>
      {onvolledig && <p className="text-xs text-[#991A21]">Zonder titel komt dit punt niet in de notule.</p>}
      <Veld label="Wat is er besproken?">
        <Txa value={punt.besproken || ""} onChange={v => set("besproken", v)} placeholder="Kern van de bespreking. Deze tekst komt letterlijk in de notule, pas hem dus zelf aan." rows={3} />
      </Veld>
      <Veld label="Wat is er besloten?" hint="Laat leeg als er geen besluit is genomen. Schrijf het besluit als zin, zonder de stemuitkomst: die kies je hieronder.">
        <Txa value={punt.besluit || ""} onChange={v => set("besluit", v)} placeholder="bijv. De vergadering stemt in met plaatsing van zonnepanelen op het dak, mits…" rows={2} />
      </Veld>
      {heeftBesluit && (
        <div className="space-y-2">
          <Veld label="Uitkomst stemming">
            <Sel value={uitkomst} onChange={v => set("uitkomst", v)}>
              <option value="algemeen">Aangenomen met algemene stemmen</option>
              <option value="meerderheid">Aangenomen met meerderheid van stemmen</option>
              <option value="verworpen">Niet aangenomen</option>
              <option value="aangehouden">Aangehouden</option>
            </Sel>
          </Veld>
          {toonTelling && (
            <div className="grid grid-cols-3 gap-3">
              <Veld label="Voor"><Inp type="number" value={punt.voor ?? ""} onChange={v => set("voor", v)} placeholder="0" /></Veld>
              <Veld label="Tegen"><Inp type="number" value={punt.tegen ?? ""} onChange={v => set("tegen", v)} placeholder="0" /></Veld>
              <Veld label="Onthouding"><Inp type="number" value={punt.onthouding ?? ""} onChange={v => set("onthouding", v)} placeholder="0" /></Veld>
            </div>
          )}
          <p className="text-[11px] text-gray-500 leading-snug">
            Controleer zelf of het besluit geldig is genomen volgens de splitsingsakte en het reglement. Deze module toetst dat niet.
          </p>
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
    opening: {}, stemgerechtigden: {}, mededelingen: {}, commissies: {}, notulenVorig: {},
    onderhoud: {}, financien: {}, rondvraag: { uitkomst: "geen" }, sluiting: {}
  });
  const [vrij, setVrij] = useState([]);
  const [owners, setOwners] = useState([]);            // ← presentie & volmachten
  const [tab, setTab] = useState("notule");             // "notule" | "acties"
  const [output, setOutput] = useState("");
  const [gekopieerd, setGekopieerd] = useState(false);
  const [toonOutput, setToonOutput] = useState(false);


  const updBlok = (sleutel, val) => setBlokken(b => ({ ...b, [sleutel]: val }));
  const addVrij = () => setVrij(v => [...v, { id: uid(), titel: "", besproken: "", besluit: "", uitkomst: "algemeen", plaats: "financien" }]);
  const updVrij = (id, val) => setVrij(v => v.map(p => p.id === id ? val : p));
  const delVrij = (id) => setVrij(v => v.filter(p => p.id !== id));

  const genereer = () => {
    const tekst = genereerTekst(vergadering, blokken, vrij, owners);
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
    { key: "stemgerechtigden", nr: "1", titel: "Stemgerechtigden (onderdeel van punt 1)", comp: <BlokkStemgerechtigden data={blokken.stemgerechtigden} onChange={v => updBlok("stemgerechtigden", v)} /> },
    { key: "mededelingen", nr: "2", titel: "Algemene mededelingen bestuurder", comp: <BlokkMededelingen data={blokken.mededelingen} onChange={v => updBlok("mededelingen", v)} /> },
    { key: "commissies", nr: "3", titel: "Raad van Toezicht | Technische commissie | Kascommissie", comp: <BlokkCommissies data={blokken.commissies} onChange={v => updBlok("commissies", v)} /> },
    { key: "notulenVorig", nr: "4", titel: "Vaststellen notulen vorige vergadering", comp: <BlokkNotulenVorig data={blokken.notulenVorig} onChange={v => updBlok("notulenVorig", v)} /> },
    { key: "onderhoud", nr: "5", titel: "Onderhoud gebouw", comp: <BlokkOnderhoud data={blokken.onderhoud} onChange={v => updBlok("onderhoud", v)} /> },
    { key: "financien", nr: "6", titel: "Financiën | Verzekeringen", comp: <BlokkFinancien data={blokken.financien} onChange={v => updBlok("financien", v)} /> },
    { key: "rondvraag", nr: "7", titel: "Rondvraag", comp: <BlokkRondvraag data={blokken.rondvraag} onChange={v => updBlok("rondvraag", v)} /> },
    { key: "sluiting", nr: "8", titel: "Vaststellen nieuwe vergadering | Sluiting", comp: <BlokkSluiting data={blokken.sluiting} onChange={v => updBlok("sluiting", v)} /> },
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
        <div className="flex items-center gap-2">
          <button onClick={() => exportNotuleWord(output, vergadering)} disabled={!output}
            className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] hover:border-[#991A21] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            ↓ Word (.doc)
          </button>
          <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors">← Terug naar portaal</button>
        </div>
      </div>

      {/* Tabbladen */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-1">
        {[["notule", "Notule"], ["acties", "Acties & besluiten"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-xs font-semibold px-4 py-2.5 border-b-2 transition-colors ${tab === k ? "border-[#991A21] text-[#991A21]" : "border-transparent text-gray-500 hover:text-[#2D2D2D]"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "acties" && (
        <div className="p-6 max-w-3xl mx-auto">
          <Acties vergaderingNaam={vergadering.naam} />
        </div>
      )}

      <div className={`p-6 max-w-6xl mx-auto ${tab === "notule" ? "" : "hidden"}`}>
        <div className="grid grid-cols-[1fr_1fr] gap-6">

          {/* ── LINKER KOLOM: invulformulier ── */}
          <div className="space-y-4">
            {/* Vergaderdetails */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vergaderdetails</p>
              <div className="grid grid-cols-1 gap-3">
                <Veld label="Naam vereniging" required hint="Officiële naam van de VvE zoals in de splitsingsakte."><Inp value={vergadering.naam} onChange={v => setVergadering(d => ({ ...d, naam: v }))} placeholder="bijv. VvE Willem Pijperlaan 36-64" /></Veld>
                <div className="grid grid-cols-2 gap-3">
                  <Veld label="Datum vergadering" required hint="Vergaderdatum. Controleer bij een tweede reglementaire vergadering de oproeptermijn."><Inp value={vergadering.datum} onChange={v => setVergadering(d => ({ ...d, datum: v }))} placeholder="bijv. 12 mei 2026" /></Veld>
                  <Veld label="Locatie" hint="Vergaderlocatie of digitale vergaderomgeving."><Inp value={vergadering.locatie} onChange={v => setVergadering(d => ({ ...d, locatie: v }))} placeholder="zaal, adres..." /></Veld>
                </div>
              </div>
            </div>

            {/* Presentie & volmachten */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Presentie &amp; volmachten</p>
              <Presentie owners={owners} onChange={setOwners} />
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
                <VrijPunt key={p.id} punt={p} onChange={val => updVrij(p.id, val)} onDelete={() => delVrij(p.id)} />
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
