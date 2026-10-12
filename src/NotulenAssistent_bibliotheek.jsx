import React, { useState } from "react";
import { Inp, Sel, Veld, uid } from "./NotulenAssistent_deel1";
import {
  AGENDAPUNTEN, TEKSTBLOKKEN, blokVolgensId, veldenVan, vulIn, pasStemAan, bevatStemformulering,
} from "./NotulenAssistent_tekstblokken";

// Keuzescherm voor de TVB-tekstbibliotheek. Staat onder een agendapunt (Onderhoud,
// Financiën). De beheerder kiest een blok, vult de velden in en ziet direct de
// uiteindelijke tekst. Blokken die de app al via de vaste velden hierboven
// afhandelt (staatInApp) worden niet aangeboden, zodat er geen dubbele tekst ontstaat.

// Tekst van één gekozen blok, zoals die in de notule komt.
export function tekstVanKeuze(keuze) {
  const blok = blokVolgensId(keuze.blokId);
  if (!blok) return "";
  let t = vulIn(blok.tekst, keuze.waarden || {});
  if (bevatStemformulering(blok.tekst)) {
    t = pasStemAan(t, keuze.uitkomst || "algemeen", {
      voor: keuze.voor, tegen: keuze.tegen, onthouding: keuze.onthouding,
    });
  }
  return t;
}

function veldLabel(naam) {
  const s = naam.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Keuze({ keuze, onChange, onDelete }) {
  const blok = blokVolgensId(keuze.blokId);
  if (!blok) return null;
  const velden = veldenVan(blok.tekst);
  const setWaarde = (naam, v) => onChange({ ...keuze, waarden: { ...(keuze.waarden || {}), [naam]: v } });
  const heeftStem = bevatStemformulering(blok.tekst);
  const uitkomst = keuze.uitkomst || "algemeen";
  const extra = blok.altijdMet ? blokVolgensId(blok.altijdMet) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-[#2D2D2D]">{blok.titel}</p>
          {blok.optioneel && <p className="text-[10px] text-gray-400 mt-0.5">Optioneel blok in het TVB-voorbeeld</p>}
        </div>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-xs shrink-0">✕ verwijderen</button>
      </div>

      {blok.letOp && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-700 leading-snug">{blok.letOp}</div>
      )}

      {velden.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {velden.map((naam) => (
            <Veld key={naam} label={veldLabel(naam)}>
              <Inp value={(keuze.waarden || {})[naam] || ""} onChange={(v) => setWaarde(naam, v)} placeholder={`[${naam}]`} />
            </Veld>
          ))}
        </div>
      )}

      {heeftStem && (
        <div className="space-y-2">
          <Veld label="Stemming" hint="De tekst gaat uit van 'met algemene stemmen'. Is er niet unaniem gestemd, kies dan 'meerderheid': de zin wordt aangepast en de stemverhouding komt eronder. Bij een verworpen of aangehouden voorstel past deze tekst niet: gebruik dan een extra agendapunt.">
            <Sel value={uitkomst} onChange={(v) => onChange({ ...keuze, uitkomst: v })}>
              <option value="algemeen">Met algemene stemmen</option>
              <option value="meerderheid">Met meerderheid van stemmen</option>
            </Sel>
          </Veld>
          {uitkomst === "meerderheid" && (
            <div className="grid grid-cols-3 gap-3">
              <Veld label="Voor"><Inp type="number" value={keuze.voor ?? ""} onChange={(v) => onChange({ ...keuze, voor: v })} placeholder="0" /></Veld>
              <Veld label="Tegen"><Inp type="number" value={keuze.tegen ?? ""} onChange={(v) => onChange({ ...keuze, tegen: v })} placeholder="0" /></Veld>
              <Veld label="Onthouding"><Inp type="number" value={keuze.onthouding ?? ""} onChange={(v) => onChange({ ...keuze, onthouding: v })} placeholder="0" /></Veld>
            </div>
          )}
        </div>
      )}

      <div className="bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Zo komt het in de notule</p>
        <p className="text-xs text-[#2D2D2D] whitespace-pre-wrap leading-relaxed">{tekstVanKeuze(keuze)}</p>
        {extra && <p className="text-[10px] text-gray-400 mt-2">Hierna wordt automatisch ook toegevoegd: {extra.titel}.</p>}
      </div>
    </div>
  );
}

// agendapunten: lijst sleutels uit AGENDAPUNTEN die bij dit scherm horen.
export default function Bibliotheek({ agendapunten, keuzes, onChange }) {
  const [gekozenId, setGekozenId] = useState("");
  const beschikbaar = TEKSTBLOKKEN.filter((b) => agendapunten.includes(b.agendapunt) && !b.staatInApp);

  const voegToe = () => {
    if (!gekozenId) return;
    onChange([...keuzes, { id: uid(), blokId: gekozenId, waarden: {}, uitkomst: "algemeen", voor: "", tegen: "", onthouding: "" }]);
    setGekozenId("");
  };
  const upd = (id, nieuw) => onChange(keuzes.map((k) => (k.id === id ? nieuw : k)));
  const del = (id) => onChange(keuzes.filter((k) => k.id !== id));

  return (
    <div className="bg-[#FAF7F2] rounded-xl p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-[#2D2D2D]">TVB-tekstbibliotheek</p>
        <p className="text-[11px] text-gray-500 mt-0.5">Kies een vaste TVB-formulering, vul de velden in en de tekst komt onder dit agendapunt in de notule.</p>
      </div>

      {keuzes.map((k) => (
        <Keuze key={k.id} keuze={k} onChange={(n) => upd(k.id, n)} onDelete={() => del(k.id)} />
      ))}

      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <Sel value={gekozenId} onChange={setGekozenId}>
            <option value="">Kies een tekstblok…</option>
            {agendapunten.map((ap) => {
              const lijst = beschikbaar.filter((b) => b.agendapunt === ap);
              if (!lijst.length) return null;
              return (
                <optgroup key={ap} label={AGENDAPUNTEN[ap]}>
                  {lijst.map((b) => <option key={b.id} value={b.id}>{b.titel}</option>)}
                </optgroup>
              );
            })}
          </Sel>
        </div>
        <button onClick={voegToe} disabled={!gekozenId}
          className="text-xs px-3 py-2 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium transition-colors whitespace-nowrap">
          + Toevoegen
        </button>
      </div>
    </div>
  );
}
