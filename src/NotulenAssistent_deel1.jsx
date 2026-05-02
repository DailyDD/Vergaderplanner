import React, { useState } from "react";

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

const ROOD = "#991A21";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Helpers ────────────────────────────────────────────────────────────────
function nu() { return new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── UI bouwstenen ──────────────────────────────────────────────────────────
function Inp({ value, onChange, placeholder = "", type = "text", className = "" }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={`w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors ${className}`} />;
}
function Txa({ value, onChange, placeholder = "", rows = 3 }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors resize-none" />;
}
function Sel({ value, onChange, children, className = "" }) {
  return <select value={value} onChange={e => onChange(e.target.value)}
    className={`w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors ${className}`}>{children}</select>;
}
function Veld({ label, children, required = false }) {
  return <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}{required && <span className="text-[#991A21] ml-0.5">*</span>}</label>{children}</div>;
}
function Chk({ checked, onChange, label }) {
  return <label className="flex items-center gap-2 cursor-pointer select-none">
    <div onClick={() => onChange(!checked)} className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${checked ? "bg-[#991A21] border-[#991A21]" : "bg-white border-gray-300"}`}>
      {checked && <span className="text-white text-[10px] font-bold">✓</span>}
    </div>
    <span className="text-sm text-[#2D2D2D]">{label}</span>
  </label>;
}
function Sectie({ nummer, titel, children, actief, onToggle }) {
  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${actief ? "border-[#991A21] shadow-sm" : "border-gray-200"}`}>
      <div onClick={onToggle} className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-[#FAF7F2] transition-colors">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${actief ? "bg-[#991A21] text-white" : "bg-gray-100 text-gray-500"}`}>{nummer}</div>
        <span className={`text-sm font-bold ${actief ? "text-[#991A21]" : "text-[#2D2D2D]"}`}>{titel}</span>
        <span className={`ml-auto text-gray-400 transition-transform text-sm ${actief ? "rotate-180" : ""}`}>▾</span>
      </div>
      {actief && <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">{children}</div>}
    </div>
  );
}
function RadioOptie({ actief, label, onClick }) {
  return <button type="button" onClick={onClick}
    className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${actief ? "bg-[#991A21] text-white border-[#991A21]" : "bg-white text-gray-600 border-gray-200 hover:border-[#991A21] hover:text-[#991A21]"}`}>
    {label}
  </button>;
}

// ── Vaste tekstblokken per agendapunt ──────────────────────────────────────

// Blok 1: Opening
function BlokkOpening({ data, onChange }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">De opening wordt automatisch opgenomen. Vul de basisgegevens in bij de vergaderdetails bovenaan.</p>
      <Veld label="Voorzitter vergadering">
        <Inp value={data.voorzitter || ""} onChange={v => onChange({ ...data, voorzitter: v })} placeholder="Naam voorzitter" />
      </Veld>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">AVG — Delen persoonsgegevens</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.avg === "akkoord"} label="Vergadering akkoord" onClick={() => onChange({ ...data, avg: "akkoord" })} />
          <RadioOptie actief={data.avg === "geen"} label="Niet besproken" onClick={() => onChange({ ...data, avg: "geen" })} />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Correspondentie per e-mail</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.email === "akkoord"} label="Akkoord" onClick={() => onChange({ ...data, email: "akkoord" })} />
          <RadioOptie actief={data.email === "niet"} label="Niet van toepassing" onClick={() => onChange({ ...data, email: "niet" })} />
        </div>
      </div>
    </div>
  );
}

// Blok 2: Stemgerechtigden
function BlokkStemgerechtigden({ data, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Type vergadering</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.type === "eerste"} label="Eerste vergadering" onClick={() => onChange({ ...data, type: "eerste" })} />
          <RadioOptie actief={data.type === "tweede"} label="Tweede reglementaire vergadering" onClick={() => onChange({ ...data, type: "tweede" })} />
        </div>
        {data.type === "tweede" && (
          <p className="text-xs text-gray-500 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Tijdens een tweede reglementaire vergadering kunnen ongeacht het aantal aanwezige stemmen rechtsgeldige besluiten worden genomen.
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Veld label="Aanwezig (stemmen)"><Inp type="number" value={data.aanwezig || ""} onChange={v => onChange({ ...data, aanwezig: v })} placeholder="0" /></Veld>
        <Veld label="Vertegenwoordigd"><Inp type="number" value={data.vertegenwoordigd || ""} onChange={v => onChange({ ...data, vertegenwoordigd: v })} /></Veld>
        <Veld label="Totaal stemmen"><Inp type="number" value={data.totaal || ""} onChange={v => onChange({ ...data, totaal: v })} placeholder="bijv. 10" /></Veld>
      </div>
    </div>
  );
}

// Blok 3: Notulen vorige vergadering
function BlokkNotulenVorig({ data, onChange }) {
  return (
    <div className="space-y-4">
      <Veld label="Datum vorige vergadering">
        <Inp value={data.datum || ""} onChange={v => onChange({ ...data, datum: v })} placeholder="bijv. 15 september 2025" />
      </Veld>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Uitkomst</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.uitkomst === "vastgesteld"} label="Vastgesteld" onClick={() => onChange({ ...data, uitkomst: "vastgesteld" })} />
          <RadioOptie actief={data.uitkomst === "aanpassingen"} label="Na aanpassingen vastgesteld" onClick={() => onChange({ ...data, uitkomst: "aanpassingen" })} />
        </div>
      </div>
      {data.uitkomst === "aanpassingen" && (
        <Veld label="Omschrijving aanpassingen">
          <Txa value={data.aanpassingen || ""} onChange={v => onChange({ ...data, aanpassingen: v })} placeholder="Welke aanpassingen zijn doorgevoerd?" rows={2} />
        </Veld>
      )}
    </div>
  );
}

// Blok 4: Onderhoud gebouw
function BlokkOnderhoud({ data, onChange }) {
  const updOfferte = (i, veld, val) => {
    const arr = [...(data.offertes || [])];
    arr[i] = { ...arr[i], [veld]: val };
    onChange({ ...data, offertes: arr });
  };
  const addOfferte = () => onChange({ ...data, offertes: [...(data.offertes || []), { id: uid(), partij: "", bedrag: "", gekozen: false }] });
  const delOfferte = i => { const arr = [...(data.offertes || [])]; arr.splice(i, 1); onChange({ ...data, offertes: arr }); };

  return (
    <div className="space-y-5">
      {/* MJOP */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">MJOP</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.mjop === "aanwezig"} label="VvE heeft MJOP" onClick={() => onChange({ ...data, mjop: "aanwezig" })} />
          <RadioOptie actief={data.mjop === "opdracht"} label="Besluit MJOP laten opstellen" onClick={() => onChange({ ...data, mjop: "opdracht" })} />
          <RadioOptie actief={data.mjop === "uitgesteld"} label="Bespreken volgende vergadering" onClick={() => onChange({ ...data, mjop: "uitgesteld" })} />
          <RadioOptie actief={data.mjop === "geen"} label="Niet van toepassing" onClick={() => onChange({ ...data, mjop: "geen" })} />
        </div>
        {data.mjop === "aanwezig" && (
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Opgesteld door"><Inp value={data.mjopNaam || ""} onChange={v => onChange({ ...data, mjopNaam: v })} placeholder="Naam partij" /></Veld>
            <Veld label="Datum MJOP"><Inp value={data.mjopDatum || ""} onChange={v => onChange({ ...data, mjopDatum: v })} placeholder="dag maand jaar" /></Veld>
          </div>
        )}
        {data.mjop === "opdracht" && (
          <Veld label="Opdracht aan"><Inp value={data.mjopOpdracht || ""} onChange={v => onChange({ ...data, mjopOpdracht: v })} placeholder="Naam partij" /></Veld>
        )}
      </div>

      {/* Offertes */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">Offertes werkzaamheden</p>
        <Veld label="Omschrijving werkzaamheden">
          <Inp value={data.werkzaamheden || ""} onChange={v => onChange({ ...data, werkzaamheden: v })} placeholder="bijv. schilderwerk gevels, dakonderhoud..." />
        </Veld>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Situatie offertes</p>
          <div className="flex gap-2 flex-wrap">
            <RadioOptie actief={data.offerteSituatie === "aanvragen"} label="Worden aangevraagd" onClick={() => onChange({ ...data, offerteSituatie: "aanvragen" })} />
            <RadioOptie actief={data.offerteSituatie === "keuze"} label="Keuze maken uit offertes" onClick={() => onChange({ ...data, offerteSituatie: "keuze" })} />
            <RadioOptie actief={data.offerteSituatie === "geen"} label="Niet van toepassing" onClick={() => onChange({ ...data, offerteSituatie: "geen" })} />
          </div>
        </div>
        {data.offerteSituatie === "keuze" && (
          <div className="space-y-2">
            {(data.offertes || []).map((o, i) => (
              <div key={o.id || i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                <Inp value={o.partij} onChange={v => updOfferte(i, "partij", v)} placeholder="Naam partij" />
                <Inp value={o.bedrag} onChange={v => updOfferte(i, "bedrag", v)} placeholder="€ bedrag" />
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                  <input type="radio" name="gekozenOfferte" checked={!!o.gekozen}
                    onChange={() => { const arr = (data.offertes || []).map((x, xi) => ({ ...x, gekozen: xi === i })); onChange({ ...data, offertes: arr }); }}
                    className="accent-[#991A21]" />
                  Gekozen
                </label>
                <button onClick={() => delOfferte(i)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
              </div>
            ))}
            <button onClick={addOfferte} className="text-xs text-[#991A21] hover:underline font-semibold">+ Offerte toevoegen</button>
          </div>
        )}
      </div>

      {/* Mandaat */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">Mandaat bestuurder</p>
        <Chk checked={!!data.mandaat} onChange={v => onChange({ ...data, mandaat: v })} label="Mandaat vastgesteld / herhaald" />
        <Chk checked={!!data.aanvullendMandaat} onChange={v => onChange({ ...data, aanvullendMandaat: v })} label="Aanvullend mandaat vastgesteld" />
        {data.aanvullendMandaat && (
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Partij"><Inp value={data.mandaatPartij || ""} onChange={v => onChange({ ...data, mandaatPartij: v })} placeholder="Naam onderhoudspartij" /></Veld>
            <Veld label="Bedrag (max)"><Inp value={data.mandaatBedrag || ""} onChange={v => onChange({ ...data, mandaatBedrag: v })} placeholder="€ bijv. 5.000" /></Veld>
            <Veld label="Omschrijving werkzaamheden" ><Inp value={data.mandaatOmschrijving || ""} onChange={v => onChange({ ...data, mandaatOmschrijving: v })} placeholder="omschrijving" /></Veld>
          </div>
        )}
        <Chk checked={!!data.commissie} onChange={v => onChange({ ...data, commissie: v })} label="Interne commissie vastgesteld / herhaald" />
      </div>
    </div>
  );
}

// Blok 5: Financiën & verzekeringen
function BlokkFinancien({ data, onChange }) {
  const updBijdrage = (i, veld, val) => {
    const arr = [...(data.bijdragen || [])];
    arr[i] = { ...arr[i], [veld]: val };
    onChange({ ...data, bijdragen: arr });
  };
  const addBijdrage = () => onChange({ ...data, bijdragen: [...(data.bijdragen || []), { id: uid(), nummer: "", breukdelen: "", bedrag: "" }] });
  const delBijdrage = i => { const arr = [...(data.bijdragen || [])]; arr.splice(i, 1); onChange({ ...data, bijdragen: arr }); };

  return (
    <div className="space-y-5">
      {/* Maandelijkse bijdrage */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">Maandelijkse bijdrage</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.bijdrageKeuze === "verhogen"} label="Verhogen" onClick={() => onChange({ ...data, bijdrageKeuze: "verhogen" })} />
          <RadioOptie actief={data.bijdrageKeuze === "handhaven"} label="Handhaven" onClick={() => onChange({ ...data, bijdrageKeuze: "handhaven" })} />
          <RadioOptie actief={data.bijdrageKeuze === "aanpassen"} label="Aanpassen o.b.v. breukdelen" onClick={() => onChange({ ...data, bijdrageKeuze: "aanpassen" })} />
        </div>
        {(data.bijdrageKeuze === "verhogen") && (
          <div className="grid grid-cols-3 gap-3">
            <Veld label="Huidig bedrag (€)"><Inp value={data.bijdrageHuidig || ""} onChange={v => onChange({ ...data, bijdrageHuidig: v })} placeholder="bijv. 75" /></Veld>
            <Veld label="Nieuw bedrag (€)"><Inp value={data.bijdrageNieuw || ""} onChange={v => onChange({ ...data, bijdrageNieuw: v })} placeholder="bijv. 100" /></Veld>
            <Veld label="Ingangsdatum"><Inp value={data.bijdrageDatum || ""} onChange={v => onChange({ ...data, bijdrageDatum: v })} placeholder="1 januari 2026" /></Veld>
          </div>
        )}
        {(data.bijdrageKeuze === "aanpassen" || data.bijdrageKeuze === "verhogen") && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Bijdragen per appartementsrecht</p>
              <button onClick={addBijdrage} className="text-xs text-[#991A21] hover:underline font-semibold">+ Toevoegen</button>
            </div>
            {(data.bijdragen || []).map((b, i) => (
              <div key={b.id || i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center mb-1.5">
                <Inp value={b.nummer} onChange={v => updBijdrage(i, "nummer", v)} placeholder="Recht nr." />
                <Inp value={b.breukdelen} onChange={v => updBijdrage(i, "breukdelen", v)} placeholder="Breukdelen" />
                <Inp value={b.bedrag} onChange={v => updBijdrage(i, "bedrag", v)} placeholder="€ bedrag" />
                <button onClick={() => delBijdrage(i)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Extra eenmalige bijdrage */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">Extra eenmalige bijdrage</p>
        <Chk checked={!!data.eenmalig} onChange={v => onChange({ ...data, eenmalig: v })} label="Extra eenmalige bijdrage vastgesteld" />
        {data.eenmalig && (
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Bedrag (€)"><Inp value={data.eenmaligBedrag || ""} onChange={v => onChange({ ...data, eenmaligBedrag: v })} placeholder="bijv. 500" /></Veld>
            <Veld label="Ter financiering van"><Inp value={data.eenmaligOmschrijving || ""} onChange={v => onChange({ ...data, eenmaligOmschrijving: v })} placeholder="omschrijving" /></Veld>
          </div>
        )}
      </div>

      {/* Jaarstukken */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">Jaarstukken</p>
        <div className="flex gap-2 flex-wrap">
          <RadioOptie actief={data.jaarstukken === "vastgesteld"} label="Vastgesteld" onClick={() => onChange({ ...data, jaarstukken: "vastgesteld" })} />
          <RadioOptie actief={data.jaarstukken === "uitgesteld"} label="Uitgesteld" onClick={() => onChange({ ...data, jaarstukken: "uitgesteld" })} />
          <RadioOptie actief={data.jaarstukken === "geen"} label="Niet besproken" onClick={() => onChange({ ...data, jaarstukken: "geen" })} />
        </div>
        {data.jaarstukken === "vastgesteld" && (
          <Veld label="Boekjaar"><Inp value={data.boekjaar || ""} onChange={v => onChange({ ...data, boekjaar: v })} placeholder="bijv. 2025" /></Veld>
        )}
      </div>

      {/* Verzekeringen */}
      <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[#2D2D2D]">Verzekeringen</p>
        <Chk checked={!!data.verzekeringUitbreiden} onChange={v => onChange({ ...data, verzekeringUitbreiden: v })} label="Uitbreiden met rechtsbijstandverzekering" />
        <Chk checked={!!data.verzekeringOmzetten} onChange={v => onChange({ ...data, verzekeringOmzetten: v })} label="Omzetting huidige verzekering(en)" />
        {data.verzekeringOmzetten && (
          <Veld label="Naar verzekeraar"><Inp value={data.verzekeringNaar || ""} onChange={v => onChange({ ...data, verzekeringNaar: v })} placeholder="bijv. Eijgendaal & van Romondt" /></Veld>
        )}
        <Chk checked={!!data.abn} onChange={v => onChange({ ...data, abn: v })} label="Omzetting naar ABN AMRO Bank" />
        <Chk checked={!!data.incasso} onChange={v => onChange({ ...data, incasso: v })} label="Incassomandaat vastgesteld / herhaald" />
      </div>
    </div>
  );
}

// Blok 6: Rondvraag
function BlokkRondvraag({ data, onChange }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <RadioOptie actief={data.uitkomst === "geen"} label="Geen vragen" onClick={() => onChange({ ...data, uitkomst: "geen" })} />
        <RadioOptie actief={data.uitkomst === "beantwoord"} label="Vragen beantwoord" onClick={() => onChange({ ...data, uitkomst: "beantwoord" })} />
        <RadioOptie actief={data.uitkomst === "vrij"} label="Vrije tekst" onClick={() => onChange({ ...data, uitkomst: "vrij" })} />
      </div>
      {data.uitkomst === "vrij" && (
        <Txa value={data.tekst || ""} onChange={v => onChange({ ...data, tekst: v })} placeholder="Omschrijf wat er besproken is tijdens de rondvraag…" rows={4} />
      )}
    </div>
  );
}

// Blok 7: Sluiting
function BlokkSluiting({ data, onChange }) {
  return (
    <div className="space-y-3">
      <Veld label="Datum volgende vergadering">
        <Inp value={data.datum || ""} onChange={v => onChange({ ...data, datum: v })} placeholder="bijv. 15 september 2026" />
      </Veld>
      <Veld label="Locatie volgende vergadering">
        <Inp value={data.locatie || ""} onChange={v => onChange({ ...data, locatie: v })} placeholder="optioneel" />
      </Veld>
    </div>
  );
}

export { BlokkOpening, BlokkStemgerechtigden, BlokkNotulenVorig, BlokkOnderhoud, BlokkFinancien, BlokkRondvraag, BlokkSluiting, Sectie, Inp, Txa, Sel, Veld, Chk, RadioOptie, CSS_FONT, ROOD, SUPABASE_URL, SUPABASE_ANON, nu, uid };
