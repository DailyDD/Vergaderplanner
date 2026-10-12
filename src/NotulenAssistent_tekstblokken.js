// TVB-tekstbibliotheek voor de Notulen Assistent.
//
// Bron: "Concept - tekstblokken - 2026 MJS.docx". De formuleringen zijn de vaste
// teksten van Totaal VvE Beheer en zijn zoveel mogelijk letterlijk overgenomen.
// Afwijkingen ten opzichte van het Word-bestand (bewust, controleer ze):
//  - "2026" is vervangen door het invulveld [JAAR], zodat het jaartal niet elk jaar
//    met de hand aangepast hoeft te worden;
//  - VvE-specifieke details uit het voorbeeld (eigenaarnummers, dakterras, kozijnen
//    van één bepaald complex) zijn vervangen door invulvelden;
//  - kleine letters "naam", "dag maand jaar" e.d. zijn omgezet naar invulvelden;
//  - de tabellen met bijdragen per appartementsrecht zitten hier NIET in (zie ontwerp).
//
// Invulvelden staan tussen vierkante haken in hoofdletters, bijvoorbeeld [NAAM].
// Hetzelfde veld dat meerdere keren voorkomt in een blok wordt één keer gevraagd.
//
// Velden per blok:
//  id            unieke sleutel
//  agendapunt    waar het blok bij hoort (zie AGENDAPUNTEN)
//  titel         korte naam in de keuzelijst
//  tekst         de notuletekst (meerdere alinea's gescheiden door een lege regel)
//  optioneel     true = in het voorbeeld aangemerkt als optioneel / evt. te gebruiken
//  altijdMet     id van een blok dat bij dit blok altijd meegenomen moet worden
//  staatInApp    true = deze situatie genereert de app al via de vaste invulvelden
//  letOp         waarschuwing die de beheerder bij het kiezen te zien krijgt

export const AGENDAPUNTEN = {
  stemgerechtigden: "Vaststellen aantal stemgerechtigden",
  onderhoud: "Onderhoud gebouw",
  mandaat: "Mandaat bestuurder",
  financien: "Financiën",
  verzekeringen: "Verzekeringen",
  rondvraag: "Rondvraag",
};

export const TEKSTBLOKKEN = [
  // ── Vaststellen aantal stemgerechtigden ─────────────────────────────────
  {
    id: "tweede-reglementaire",
    agendapunt: "stemgerechtigden",
    titel: "Tweede reglementaire vergadering",
    tekst:
      "Tijdens een tweede reglementaire vergadering zoals hier is bedoeld kunnen er, ongeacht het aantal aanwezige stemmen, rechtsgeldige besluiten worden genomen.",
    letOp:
      "Gebruik dit alleen als de splitsingsakte of het reglement een tweede vergadering toestaat en de eerste vergadering conform de akte is uitgeschreven. De app toetst dat niet. In het voorbeeld heet de notule dan 'Notulen Tweede Reglementaire Vergadering' in plaats van 'Notulen Algemene Ledenvergadering'.",
  },

  // ── Onderhoud gebouw: MJOP ──────────────────────────────────────────────
  {
    id: "mjop-aanwezig",
    agendapunt: "onderhoud",
    titel: "MJOP aanwezig",
    staatInApp: true,
    tekst:
      "De vereniging in het bezit van een zogenoemd MJOP opgesteld door [NAAM] d.d. [DATUM]; status quo, leidraad herstel- en onderhoudswerkzaamheden, financiële consequenties en medebepalend maandbijdrage en mogelijk extra (eenmalige) bijdrage(n).",
  },
  {
    id: "mjop-niet-aanwezig",
    agendapunt: "onderhoud",
    titel: "MJOP niet aanwezig, later bespreken",
    staatInApp: true,
    tekst:
      "De vereniging is (nog) niet in het bezit van een zogenoemd MJOP; status quo, leidraad herstel- en onderhoudswerkzaamheden, financiële consequenties en medebepalend maandbijdrage en mogelijk extra (eenmalige) bijdrage(n). De vergadering beslist de keuze hiertoe (opnieuw) te bespreken tijdens de eerstvolgende reguliere vergadering.",
  },
  {
    id: "mjop-eerstelijnszorg",
    agendapunt: "onderhoud",
    titel: "Eigenaars dragen eerstelijns zorg (zonder MJOP)",
    optioneel: true,
    tekst:
      "Eigenaars dragen vooralsnog in onderlinge af- en overeenstemming eerstelijns zorg voor (inschatting) benodigde onderhoudswerkzaamheden.",
  },
  {
    id: "mjop-opdracht-naam",
    agendapunt: "onderhoud",
    titel: "Besluit MJOP laten opstellen door [partij]",
    staatInApp: true,
    tekst:
      "De vergadering beslist met algemene stemmen een MJOP te laten opstellen door [NAAM]. De bestuurder zal namens de vereniging de opdracht hiertoe verstrekken.",
  },
  {
    id: "mjop-opdracht-algemeen",
    agendapunt: "onderhoud",
    titel: "Besluit (actueel) MJOP laten opstellen",
    staatInApp: true,
    tekst:
      "De vergadering beslist met algemene stemmen een (actueel) MJOP te laten opstellen; status quo, leidraad herstel- en onderhoudswerkzaamheden, financiële consequenties en medebepalend maandbijdrage en mogelijk extra (eenmalige) bijdrage(n). De bestuurder zal namens de vereniging de opdracht hiertoe verstrekken.",
  },

  // ── Onderhoud gebouw: offertes en uitvoering ────────────────────────────
  {
    id: "offerte-aanvragen",
    agendapunt: "onderhoud",
    titel: "Offerte(s) aanvragen",
    staatInApp: true,
    tekst:
      "Het aanvragen van (een) offerte(s) | [OMSCHRIJVING WERKZAAMHEDEN]\n\nDe bestuurder zal namens de vereniging een onderhoudspartij binnen haar netwerk het verzoek doen een opname te verrichten, en aansluitend op onderdelen te offreren.",
  },
  {
    id: "offerte-onderdelen",
    agendapunt: "onderhoud",
    titel: "Samengevat: onderdelen I t/m III",
    optioneel: true,
    tekst:
      "Samengevat | Onderdelen\n\nOnderdeel I\n[INVULLING I].\n\nOnderdeel II\n[INVULLING II].\n\nOnderdeel III\n[INVULLING III].",
  },
  {
    id: "offerte-keuze",
    agendapunt: "onderhoud",
    titel: "Keuze uit de aanwezige offerte(s)",
    staatInApp: true,
    tekst:
      "Keuze maken uit de aanwezige offerte(s) | [OMSCHRIJVING WERKZAAMHEDEN]\n\nDe offerte van [NAAM] ligt aan de vergadering voor. Na een constructief overleg met en tussen de leden, beslist de vergadering met algemene stemmen akkoord te gaan met de offerte van [NAAM] met nummer [NUMMER] ad. € [BEDRAG]. De bestuurder zal namens de vereniging de opdrachtverstrekking doen en haar nader informeren omtrent de planning.",
  },
  {
    id: "controle-bouwkundige",
    agendapunt: "onderhoud",
    titel: "Controle werkzaamheden door bouwkundige",
    tekst:
      "Controle werkzaamheden in- of externe bouwkundige\n\nDe vergadering beslist met algemene stemmen akkoord te gaan met controle van de hierboven geaccordeerde werkzaamheden door [NAAM], alsook met de kosten ad. € [BEDRAG] die hiermee gemoeid zijn.",
    letOp:
      "In het voorbeeld staat bij de titel '(< - > € 50.000,00)': een grens waarboven controle gewenst is. Die keuze maak je zelf per VvE; de grens is niet in de tekst opgenomen.",
  },
  {
    id: "zonnepanelen",
    agendapunt: "onderhoud",
    titel: "Zonnepanelen (gebruik gemeenschappelijke gedeelten)",
    tekst:
      "Zonnepanelen\n\nDe vergadering beslist met algemene stemmen de eigenaars appartementsrechten toestemming te verlenen voor gebruikmaking van de gemeenschappelijke gedeelten voor plaatsing (individuele financiële verantwoordelijk) van zonnepanelen; te allen tijde voorafgaand door communicatie onderling in verband met de verdeling dak (een [CIJFER] delen), leverancier, voorwaarden, rekening en risico en dergelijke.",
    letOp:
      "In het voorbeeld staat 'individuele financiële verantwoordelijk' (zonder 'heid'). Dat is overgenomen zoals het staat; pas het in de notule aan als dat een tikfout is. In het voorbeeld is dit blok een alternatief voor 'Glasvezel'.",
  },
  {
    id: "vergaderbesluit-ramen-deuren",
    agendapunt: "onderhoud",
    titel: "Individuele verantwoordelijkheid: ramen, deuren, dakramen",
    altijdMet: "opmerking-akte",
    tekst:
      "De vergadering beslist met algemene stemmen dat de kosten van onderhoud, vervanging en soortgelijks van de raamkozijnen (incluis glas); achter- en voorzijde, die van de toegangsdeuren; voor- en achterzijde, alsook de dakramen vallen onder de individuele (financiële) verantwoordelijkheid van de eigenaars appartementsrechten.",
  },
  {
    id: "vergaderbesluit-dakkappellen",
    agendapunt: "onderhoud",
    titel: "Individuele verantwoordelijkheid: dakkappellen voorzijde",
    altijdMet: "opmerking-akte",
    tekst:
      "De vergadering beslist met algemene stemmen dat de kosten van onderhoud, vervanging en soortgelijks van de dakkappellen aan de voorzijde, vallen onder de individuele (financiële) verantwoordelijkheid van de eigenaars appartementsrechten.",
  },
  {
    id: "vergaderbesluit-deuren-kleur",
    agendapunt: "onderhoud",
    titel: "Toegangsdeuren gemeenschappelijk: gelijke kleurstelling",
    altijdMet: "opmerking-akte",
    tekst:
      "De vergadering beslist met algemene stemmen dat de (toegangs)deuren; gemeenschappelijke gedeelten, te allen tijde een gelijke kleurstelling moeten hebben; samenhang gebouw en omgeving. De vergadering beslist hieromtrent dan ook - als dit aan de orde is - in onderlinge af- en overeenstemming, en op basis van meerderheid van stemmen.",
  },
  {
    id: "vergaderbesluit-kozijnen-hangsluitwerk",
    agendapunt: "onderhoud",
    titel: "Individuele verantwoordelijkheid: kozijnen en hang- en sluitwerk",
    altijdMet: "opmerking-akte",
    tekst:
      "De vergadering beslist met algemene stemmen dat de kosten van onderhoud, vervanging en soortgelijks van de (raam)kozijnen (incluis glas); achter- en voorzijde, alsook het hang- en sluitwerk vallen onder de individuele (financiële) verantwoordelijkheid van de eigenaars appartementsrechten.",
  },
  {
    id: "vergaderbesluit-vrij",
    agendapunt: "onderhoud",
    titel: "Individuele verantwoordelijkheid: eigen omschrijving",
    altijdMet: "opmerking-akte",
    tekst:
      "De vergadering beslist met algemene stemmen dat [OMSCHRIJVING] vallen onder de individuele (financiële) verantwoordelijkheid van de eigenaars appartementsrechten.",
  },
  {
    id: "opmerking-akte",
    agendapunt: "onderhoud",
    titel: "Opmerking bestuurder: Akte van Splitsing is leidend",
    tekst:
      "Opmerking bestuurder\n\nDe bestuurder benadrukt dat de (notariële) Akte van Splitsing (Reglement) te allen tijde juridisch leidend is.",
    letOp: "Hoort volgens het voorbeeld altijd bij een besluit over individuele verantwoordelijkheid. Wordt automatisch meegenomen.",
  },

  // ── Onderhoud gebouw: aandachtsgebieden ─────────────────────────────────
  {
    id: "aandacht-akte-splitsing",
    agendapunt: "onderhoud",
    titel: "Aandachtsgebied: voortgang nieuwe Akte van Splitsing",
    optioneel: true,
    tekst:
      "De bestuurder zal, waar nodig, die eigenaar attenderen op het (nog) ondernemen van actie met betrekking tot de voortgang en (notariële) afronding van de nieuwe Akte van Splitsing; [ONDERWERPEN].",
    letOp: "In het voorbeeld stond hier een complex-specifieke opsomming (dakterras, kozijnen). Die is vervangen door het veld [ONDERWERPEN].",
  },
  {
    id: "aandacht-verbouwing",
    agendapunt: "onderhoud",
    titel: "Aandachtsgebied: eigenaar meldt interne verbouwing",
    optioneel: true,
    tekst:
      "Eigenaar nummer [EIGENAAR NR] meldt (kennisgeving) aan de overige eigenaars intern te gaan verbouwen; onder andere [WERKZAAMHEDEN]. Uiteraard zonder aantasting van de gemeenschappelijke gedeelten, en tracht de mogelijke (tijdelijke) overlast te beperken tot een minimum.",
  },
  {
    id: "aandacht-kozijnen",
    agendapunt: "onderhoud",
    titel: "Aandachtsgebied: eigenaar vervangt (raam)kozijnen",
    optioneel: true,
    tekst:
      "Eigenaar nummer [EIGENAAR NR] meldt (kennisgeving) aan de leden voornemens te zijn de (raam)kozijnen te vervangen.\n\nOpmerking bestuurder\n\nVervanging van de (raam)kozijnen brengt - zekerheidshalve - navraag door de betreffende eigenaar bij de Gemeente mee; beoordeling vergunningsplicht, en in z'n algemeenheid keuze voor gelijke materialen en kleurstellingen; vooraanzicht en samenhang gebouw.",
  },

  // ── Mandaat bestuurder ──────────────────────────────────────────────────
  {
    id: "mandaat-tvb-partij",
    agendapunt: "mandaat",
    titel: "Aanvullend mandaat: opdracht aan onderhoudspartij",
    staatInApp: true,
    tekst:
      "De vergadering mandateert Totaal VvE Beheer Den Haag en omstreken B.V. - eenmalig en welbepaald in deze specifieke situatie - tot het verstrekken van de opdracht aan [NAAM] met betrekking tot [OMSCHRIJVING].",
  },
  {
    id: "mandaat-bedrag",
    agendapunt: "mandaat",
    titel: "Aanvullend mandaat tot maximumbedrag",
    tekst:
      "De vergadering beslist met algemene stemmen tot een (eenmalig) aanvullend mandaat van (ten hoogste) € [BEDRAG] exclusief BTW; benodigde herstelwerkzaamheden [OMSCHRIJVING].",
  },
  {
    id: "mandaat-meerwerk",
    agendapunt: "mandaat",
    titel: "Aanvullend mandaat: meerwerk onderhoudspartij",
    tekst:
      "De vergadering mandateert - eenmalig en welbepaald in deze specifieke situatie - de bestuurder tot het verstrekken van de (aanvullende) opdracht aan [NAAM ONDERHOUDSPARTIJ] met betrekking tot het (eventuele) meerwerk; vanzelfsprekend binnen de financiële reserve en minimum saldo van de vereniging.",
  },
  {
    id: "mandaat-uitvoering-gevels",
    agendapunt: "mandaat",
    titel: "Uitvoering gevelwerkzaamheden (niet-gefaseerd)",
    optioneel: true,
    tekst:
      "Uitvoering van werkzaamheden (niet-gefaseerd) aan de gevels; achter-, zij- en voorkant tot ten hoogste de totaalprijs van de uiteindelijk gekozen uitvoerende partij.",
    letOp: "Dit is een zinsfragment zonder werkwoord. Gebruik het als aanvulling bij een mandaatbesluit.",
  },

  // ── Financiën ───────────────────────────────────────────────────────────
  {
    id: "bijdrage-verhogen",
    agendapunt: "financien",
    titel: "Maandelijkse bijdrage verhogen",
    staatInApp: true,
    tekst:
      "De vergadering beslist met algemene stemmen de (huidige) maandelijkse bijdrage ad. € [HUIDIG BEDRAG] per appartementsrecht per 1 [MAAND] [JAAR] te verhogen naar € [NIEUW BEDRAG].",
  },
  {
    id: "bijdrage-handhaven",
    agendapunt: "financien",
    titel: "Maandelijkse bijdrage handhaven",
    staatInApp: true,
    tekst:
      "De vergadering beslist met algemene stemmen de (huidige) maandelijkse bijdrage ad. € [HUIDIG BEDRAG] per appartementsrecht (vooralsnog) te handhaven.",
  },
  {
    id: "bijdrage-breukdelen-rekenregel",
    agendapunt: "financien",
    titel: "Bijdrage na rato van breukdelen (rekenregel 0,5% herbouwwaarde)",
    tekst:
      "De vergadering beslist met algemene stemmen de (huidige) maandelijkse bijdrage per appartementsrecht na rato van de breukdelen; conform 'rekenregel 0,5% herbouwwaarde', per 1 [MAAND] [JAAR] aan te passen.",
  },
  {
    id: "opmerking-rekenregel",
    agendapunt: "financien",
    titel: "Opmerking bestuurder: rekenregel 0,5% herbouwwaarde",
    tekst:
      "Opmerking bestuurder | 'Rekenregel 0,5% herbouwwaarde'\n\nHerbouwwaarde € [VERZEKERDE SOM] * 0,5% / 12 maakt € [BEDRAG] * breukdelen.",
  },
  {
    id: "bijdrage-handhaven-afwijking",
    agendapunt: "financien",
    titel: "Bijdrage handhaven, in afwijking van rekenregel en/of MJOP",
    tekst:
      "De vergadering beslist met algemene stemmen de (huidige) maandelijkse bijdrage(n) per appartementsrecht (vooralsnog) te handhaven; in afwijking van de 'rekenregel 0,5% van de herbouwwaarde' en/of het MJOP.",
  },
  {
    id: "bijdrage-breukdelen-mjop",
    agendapunt: "financien",
    titel: "Bijdrage na rato van breukdelen (reservering MJOP)",
    tekst:
      "De vergadering beslist met algemene stemmen de maandelijkse bijdrage per appartementsrecht na rato van de breukdelen; conform 'reservering MJOP', per 1 [MAAND] [JAAR] te hanteren.",
  },
  {
    id: "eenmalig-financiering",
    agendapunt: "financien",
    titel: "Extra eenmalige bijdrage ter financiering van",
    staatInApp: true,
    tekst:
      "De vergadering beslist met algemene stemmen akkoord te gaan met een extra eenmalige bijdrage ad. € [BEDRAG] ter financiering van [OMSCHRIJVING].",
  },
  {
    id: "eenmalig-mede-financiering",
    agendapunt: "financien",
    titel: "Extra eenmalige bijdrage ter (mede)financiering van",
    tekst:
      "De vergadering beslist met algemene stemmen akkoord te gaan met een extra eenmalige bijdrage ad. € [BEDRAG] ter (mede)financiering van [OMSCHRIJVING].",
  },
  {
    id: "belang-reservevorming",
    agendapunt: "financien",
    titel: "Belang reservevorming",
    optioneel: true,
    tekst:
      "Belang reservevorming\n\nDe bestuurder benadrukt het belang van (toename) reservevorming gelet op het beheer en bovenal (groot) onderhoud van de gemeenschappelijke gedeelten. Gelet op de huidige financiële status en vaste uitgaven zijn de eigenaars zich ervan bewust dat het - op enig moment - moeten doen van '(extra) eenmalige bijdrage(n)' (meer dan) aannemelijk is.",
  },

  // ── Verzekeringen ───────────────────────────────────────────────────────
  {
    id: "verzekering-rechtsbijstand-uitbreiden",
    agendapunt: "verzekeringen",
    titel: "Uitbreiden met rechtsbijstandverzekering",
    optioneel: true,
    staatInApp: true,
    tekst:
      "De vergadering beslist met algemene stemmen de huidige verzekeringsdekking(en) uit te breiden met een rechtsbijstandverzekering conform de door bestuurder verstrekte toelichting en prijsstelling. De bestuurder zal namens de vereniging de opdrachtverstrekking aan de verzekeraar (gevolmachtigde) doen.",
  },
  {
    id: "verzekering-rechtsbijstand-niet",
    agendapunt: "verzekeringen",
    titel: "Rechtsbijstandverzekering: niet uitbreiden",
    optioneel: true,
    tekst:
      "De bestuurder attendeert de vergadering op het belang van een verzekering voor rechtsbijstand. De vergadering beslist met algemene stemmen (vooralsnog) de huidige verzekeringsdekking(en) niet uit te breiden.",
  },
  {
    id: "verzekering-omzetten-evr",
    agendapunt: "verzekeringen",
    titel: "Omzetting verzekeringen naar Eijgendaal & van Romondt",
    optioneel: true,
    tekst:
      "De vergadering beslist met algemene stemmen de huidige verzekeringsdekking(en) onder te brengen bij Eijgendaal & van Romondt conform de door bestuurder verstrekte toelichting en prijsstelling. De bestuurder zal namens de vereniging de opdrachtverstrekking aan de verzekeraar (gevolmachtigde) doen, en (laten) zorgdragen voor royement en aanvang per gelijke datum bij de betreffende verzekeraars (gevolmachtigden).",
  },
  {
    id: "verzekering-niet-bij-evr",
    agendapunt: "verzekeringen",
    titel: "Verzekeringen niet bij Eijgendaal & van Romondt: handhaven",
    optioneel: true,
    tekst:
      "De huidige verzekeringen [VERZEKERINGEN] zijn ondergebracht bij [NAAM], in te zien via ons Totaal Portaal. De vergadering beslist met algemene stemmen vooralsnog voornoemde verzekeringsdekkingen aldaar te handhaven.",
  },

  // ── Rondvraag ───────────────────────────────────────────────────────────
  {
    id: "rondvraag-geen",
    agendapunt: "rondvraag",
    titel: "Rondvraag: geen vragen",
    staatInApp: true,
    tekst: "Géén.",
  },
  {
    id: "rondvraag-beantwoord",
    agendapunt: "rondvraag",
    titel: "Rondvraag: vragen beantwoord",
    staatInApp: true,
    tekst: "De bestuurder beantwoordt de vragen naar tevredenheid van de eigenaars.",
  },
];

// ── Hulpfuncties ───────────────────────────────────────────────────────────

const VELD = /\[([A-Z][A-Z0-9 \-/]+)\]/g;

// Unieke invulvelden in een tekst, in volgorde van voorkomen.
export function veldenVan(tekst) {
  const gezien = [];
  for (const m of String(tekst || "").matchAll(VELD)) {
    if (!gezien.includes(m[1])) gezien.push(m[1]);
  }
  return gezien;
}

// Vult de ingevulde waarden in. Een leeg veld blijft als [VELD] staan, zodat in de
// notule zichtbaar blijft wat nog ontbreekt.
export function vulIn(tekst, waarden = {}) {
  return String(tekst || "").replace(VELD, (volledig, naam) => {
    const w = waarden[naam];
    return w && String(w).trim() ? String(w).trim() : volledig;
  });
}

// Alle ontbrekende velden in een (al ingevulde) tekst.
export function openVelden(tekst) {
  return veldenVan(tekst);
}

// Past de stemformulering aan. 'algemeen' laat de tekst ongemoeid. Bij 'meerderheid'
// wordt "met algemene stemmen" vervangen en de stemverhouding toegevoegd.
// Andere uitkomsten (verworpen, aangehouden) herschrijft deze functie bewust niet:
// dat moet de beheerder zelf in de tekst doen.
export function pasStemAan(tekst, uitkomst = "algemeen", stem = {}) {
  if (uitkomst !== "meerderheid") return String(tekst || "");
  let t = String(tekst || "").replace(/met algemene stemmen/g, "met meerderheid van stemmen");
  const { voor, tegen, onthouding } = stem;
  if ([voor, tegen, onthouding].some((x) => x !== undefined && x !== "" && x !== null)) {
    t += `\n\nStemverhouding: ${voor ?? "…"} voor, ${tegen ?? "…"} tegen, ${onthouding ?? "…"} onthouding.`;
  }
  return t;
}

export function bevatStemformulering(tekst) {
  return /met algemene stemmen/.test(String(tekst || ""));
}

export function blokVolgensId(id) {
  return TEKSTBLOKKEN.find((b) => b.id === id) || null;
}

export function blokkenVoor(agendapunt) {
  return TEKSTBLOKKEN.filter((b) => b.agendapunt === agendapunt);
}
