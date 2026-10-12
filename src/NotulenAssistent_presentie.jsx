import React from "react";
import { Inp } from "./NotulenAssistent_deel1";

// Statusopties voor een appartementsrecht tijdens de vergadering.
export const PRESENTIE_STATUS = [
  ["aanwezig", "Aanwezig"],
  ["volmacht", "Vertegenwoordigd (volmacht)"],
  ["afwezig", "Afwezig"],
];

export function nieuweEigenaar(extra = {}) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    recht: "",
    naam: "",
    stemmen: 1,
    status: "aanwezig",
    gemachtigde: "",
    ...extra,
  };
}

// Telt stemrechten op. Aanwezig + volmacht = ter vergadering vertegenwoordigd.
// Negatieve of niet-numerieke waarden tellen als 0, zodat een typefout de
// optelling niet stilletjes verpest.
export function berekenStemmen(owners = []) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  let totaal = 0, aanwezig = 0, volmacht = 0, afwezig = 0;
  for (const o of owners) {
    const s = n(o.stemmen);
    totaal += s;
    if (o.status === "aanwezig") aanwezig += s;
    else if (o.status === "volmacht") volmacht += s;
    else afwezig += s;
  }
  const vertegenwoordigd = aanwezig + volmacht;
  const pct = totaal === 0 ? 0 : Math.round((vertegenwoordigd / totaal) * 100);
  return { totaal, aanwezig, volmacht, afwezig, vertegenwoordigd, pct, aantal: owners.length };
}

export default function Presentie({ owners, onChange }) {
  const stats = berekenStemmen(owners);
  const upd = (id, veld, waarde) =>
    onChange(owners.map((o) => (o.id === id ? { ...o, [veld]: waarde } : o)));
  const add = () => onChange([...owners, nieuweEigenaar()]);
  const del = (id) => onChange(owners.filter((o) => o.id !== id));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Leg per appartementsrecht het stemrecht en de aanwezigheid vast. Deze gegevens vullen automatisch
        de passage “Vaststellen aantal stemgerechtigden” in de notule. Gebruik de stemrechten uit de
        splitsingsakte; stemrechten en breukdelen zijn niet automatisch hetzelfde.
      </p>

      {/* Samenvatting */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Totaal stemmen", stats.totaal, "#2D2D2D"],
          ["Vertegenwoordigd", stats.vertegenwoordigd, "#991A21"],
          ["Vertegenwoordiging", `${stats.pct}%`, "#2D6A4F"],
        ].map(([label, val, kleur]) => (
          <div key={label} className="bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-lg font-bold tabular-nums" style={{ color: kleur }}>{val}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Eigenaars */}
      {owners.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Nog geen appartementsrechten. Klik op ‘+ Appartementsrecht’ om te beginnen.
        </p>
      ) : (
        <div className="space-y-2">
          {owners.map((o) => (
            <div key={o.id} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-white">
              <div className="flex gap-2 items-center">
                <div className="w-24 shrink-0">
                  <Inp value={o.recht} onChange={(v) => upd(o.id, "recht", v)} placeholder="Recht nr." />
                </div>
                <div className="flex-1">
                  <Inp value={o.naam} onChange={(v) => upd(o.id, "naam", v)} placeholder="Eigenaar" />
                </div>
                <button
                  onClick={() => del(o.id)}
                  className="text-gray-400 hover:text-[#991A21] text-sm px-1 shrink-0"
                  aria-label="Verwijder appartementsrecht"
                >✕</button>
              </div>
              <div className="flex gap-2 items-center">
                <div className="w-16 shrink-0">
                  <Inp type="number" value={o.stemmen} onChange={(v) => upd(o.id, "stemmen", v)} />
                </div>
                <select
                  value={o.status}
                  onChange={(e) => upd(o.id, "status", e.target.value)}
                  className="flex-1 bg-[#FAF7F2] border border-gray-200 rounded-lg px-2 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"
                >
                  {PRESENTIE_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {o.status === "volmacht" && (
                <Inp
                  value={o.gemachtigde}
                  onChange={(v) => upd(o.id, "gemachtigde", v)}
                  placeholder="Gemachtigde (naam)"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={add}
        className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-medium transition-colors"
      >
        + Appartementsrecht
      </button>

      {stats.volmacht > 0 && (
        <p className="text-[11px] text-gray-500 leading-snug">
          Let op: controleer of de volmachten geldig en toegestaan zijn volgens de splitsingsakte en het reglement.
          Deze module toetst dat niet.
        </p>
      )}
    </div>
  );
}
