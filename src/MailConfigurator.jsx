import React, { useState } from "react";

// Huisstijl font — zelfde patroon als App.jsx
const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

// Bouw de stijlinstructiestring op basis van geselecteerde opties
function bouwStijlInstructies(toon, stijl, lengte) {
  const instructies = [];
  if (toon === "informeel") instructies.push("Schrijf in een informele, toegankelijke toon");
  if (toon === "formeel") instructies.push("Schrijf in een formele, professionele toon");
  if (stijl === "zakelijk") instructies.push("Houd de tekst zakelijk en to-the-point");
  if (stijl === "vriendelijk") instructies.push("Gebruik een warme, vriendelijke schrijfstijl");
  if (stijl === "direct") instructies.push("Wees direct en vermijd omhaal van woorden");
  if (lengte === "kort") instructies.push("Houd de mail beknopt — maximaal 3 alinea's");
  if (lengte === "uitgebreid") instructies.push("Schrijf een uitgebreide, volledige reactie met toelichting waar nuttig");
  return instructies.join(". ");
}

// Radio-stijl optieknop — geselecteerd = bordeauxrode achtergrond
function StijlOptie({ actief, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
        actief
          ? "bg-[#991A21] text-white border-[#991A21]"
          : "bg-white text-gray-600 border-gray-200 hover:border-[#991A21] hover:text-[#991A21]"
      }`}
    >
      {label}
    </button>
  );
}

export default function MailConfigurator({ onTerug, beheerder }) {
  // State
  const [correspondentie, setCorrespondentie] = useState("");
  const [rauweReactie, setRauweReactie] = useState("");
  const [toon, setToon] = useState("informeel");
  const [stijl, setStijl] = useState("vriendelijk");
  const [lengte, setLengte] = useState("kort");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [regenereerInstructie, setRegenereerInstructie] = useState("");
  const [gekopieerd, setGekopieerd] = useState(false);

  // Genereer of regenereer de mail
  const genereer = async (isRegeneratie = false) => {
    // Clientside validatie
    if (!correspondentie.trim()) {
      setError("Plak eerst de inkomende correspondentie in.");
      return;
    }
    if (!rauweReactie.trim()) {
      setError("Vul eerst een ruwe reactie in voordat je genereert.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/herschrijf-mail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            correspondentie,
            rauweReactie,
            stijlInstructies: bouwStijlInstructies(toon, stijl, lengte),
            beheerderNaam: beheerder || "",
            regenereerInstructie: isRegeneratie ? regenereerInstructie || null : null,
            vorigeOutput: isRegeneratie ? output || null : null,
          }),
        }
      );

      if (!res.ok) {
        const foutTekst = await res.text();
        throw new Error(`API fout (${res.status}): ${foutTekst}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setOutput(data.result || "");
      setRegenereerInstructie("");
    } catch (e) {
      setError(e.message || "Er is een onbekende fout opgetreden.");
    } finally {
      setLoading(false);
    }
  };

  // Kopieer output naar klembord
  const kopieer = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>

      {/* Topbar — zelfde patroon als andere modules */}
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center">
              <span className="text-white text-xs">✉️</span>
            </div>
            <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center">
              <span className="text-white text-xs">📝</span>
            </div>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">E-mail Configurator</span>
        </div>
        <button
          onClick={onTerug}
          className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors"
        >
          ← Terug naar portaal
        </button>
      </div>

      {/* Hoofdinhoud — tweekoloms */}
      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-[2fr_3fr] gap-6">

          {/* ── LINKER KOLOM (40%) ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-5">

            {/* Inkomende correspondentie */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Inkomende correspondentie
              </label>
              <textarea
                value={correspondentie}
                onChange={(e) => setCorrespondentie(e.target.value)}
                placeholder="Plak hier de inkomende e-mail of brief…"
                rows={7}
                className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors resize-none"
              />
            </div>

            {/* Schrijfstijl opties */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                Schrijfstijl
              </label>
              <div className="space-y-3">
                {/* Toon */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Toon</p>
                  <div className="flex gap-2">
                    <StijlOptie actief={toon === "formeel"} label="Formeel" onClick={() => setToon("formeel")} />
                    <StijlOptie actief={toon === "informeel"} label="Informeel" onClick={() => setToon("informeel")} />
                  </div>
                </div>
                {/* Stijl */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Stijl</p>
                  <div className="flex gap-2 flex-wrap">
                    <StijlOptie actief={stijl === "zakelijk"} label="Zakelijk" onClick={() => setStijl("zakelijk")} />
                    <StijlOptie actief={stijl === "vriendelijk"} label="Vriendelijk" onClick={() => setStijl("vriendelijk")} />
                    <StijlOptie actief={stijl === "direct"} label="Direct" onClick={() => setStijl("direct")} />
                  </div>
                </div>
                {/* Lengte */}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Lengte</p>
                  <div className="flex gap-2">
                    <StijlOptie actief={lengte === "kort"} label="Kort" onClick={() => setLengte("kort")} />
                    <StijlOptie actief={lengte === "uitgebreid"} label="Uitgebreid" onClick={() => setLengte("uitgebreid")} />
                  </div>
                </div>
              </div>
            </div>

            {/* Ruwe reactie */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Jouw ruwe reactie
              </label>
              <textarea
                value={rauweReactie}
                onChange={(e) => setRauweReactie(e.target.value)}
                placeholder="Typ hier je ruwe reactie in eigen woorden…"
                rows={5}
                className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors resize-none"
              />
            </div>

            {/* Foutmelding */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-[#991A21] font-medium">
                {error}
              </div>
            )}

            {/* Genereer knop */}
            <button
              onClick={() => genereer(false)}
              disabled={loading || !rauweReactie.trim()}
              className="w-full py-3 bg-[#991A21] hover:bg-[#7a1419] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              {loading ? "Herschrijven…" : "Mail herschrijven →"}
            </button>
          </div>

          {/* ── RECHTER KOLOM (60%) ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4 flex flex-col">

            {/* Output label + kopieerknop */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Gegenereerde mail
              </label>
              {output && (
                <button
                  onClick={kopieer}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                    gekopieerd
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#991A21] hover:text-[#991A21]"
                  }`}
                >
                  {gekopieerd ? "✓ Gekopieerd!" : "Kopieer naar klembord"}
                </button>
              )}
            </div>

            {/* Output textarea */}
            <textarea
              readOnly
              value={output}
              placeholder="De herschreven mail verschijnt hier…"
              className="flex-1 w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none resize-none font-mono"
              style={{ minHeight: "300px" }}
            />

            {/* Regenereer sectie — alleen zichtbaar als er output is */}
            {output && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Aanvullende instructie
                </label>
                <textarea
                  value={regenereerInstructie}
                  onChange={(e) => setRegenereerInstructie(e.target.value)}
                  placeholder="Bijv. 'maak het iets formeler' of 'voeg toe dat we volgende week terugbellen'…"
                  rows={3}
                  className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors resize-none"
                />
                <button
                  onClick={() => genereer(true)}
                  disabled={loading}
                  className="w-full py-2.5 bg-[#2D2D2D] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {loading ? "Herschrijven…" : "Opnieuw genereren →"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
