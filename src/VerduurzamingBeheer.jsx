import React, { useState, useEffect, useRef } from "react";

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

// ── Supabase config (zelfde patroon als App.jsx) ──────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TOKEN_KEY = "vve_access_token";

function getAuthHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${token || SUPABASE_ANON}`,
    "Content-Type": "application/json",
  };
}

async function vdFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase fout: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Data helpers ──────────────────────────────────────────────────
const VD_TABLE = "verduurzaming_data";

async function vdLoad() {
  try {
    const rows = await vdFetch(`${VD_TABLE}?select=id,data&order=created_at.desc`);
    if (!rows || !rows.length) return [];
    return rows.map((r) => ({ id: r.id, ...r.data }));
  } catch {
    try {
      const r = localStorage.getItem("vd_data_v1");
      return r ? JSON.parse(r) : [];
    } catch {
      return [];
    }
  }
}

async function vdSave(record) {
  try {
    const existing = await vdFetch(`${VD_TABLE}?id=eq.${record.id}&select=id`);
    if (existing && existing.length) {
      await vdFetch(`${VD_TABLE}?id=eq.${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: record }),
      });
    } else {
      await vdFetch(VD_TABLE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ id: record.id, data: record }),
      });
    }
    try {
      const all = JSON.parse(localStorage.getItem("vd_data_v1") || "[]");
      const idx = all.findIndex((r) => r.id === record.id);
      if (idx >= 0) all[idx] = record;
      else all.unshift(record);
      localStorage.setItem("vd_data_v1", JSON.stringify(all));
    } catch {}
  } catch {
    try {
      const all = JSON.parse(localStorage.getItem("vd_data_v1") || "[]");
      const idx = all.findIndex((r) => r.id === record.id);
      if (idx >= 0) all[idx] = record;
      else all.unshift(record);
      localStorage.setItem("vd_data_v1", JSON.stringify(all));
    } catch {}
  }
}

async function vdDelete(id) {
  try {
    await vdFetch(`${VD_TABLE}?id=eq.${id}`, { method: "DELETE" });
  } catch {}
  try {
    const all = JSON.parse(localStorage.getItem("vd_data_v1") || "[]");
    localStorage.setItem("vd_data_v1", JSON.stringify(all.filter((r) => r.id !== id)));
  } catch {}
}

function vdLocalLoad() {
  try {
    const r = localStorage.getItem("vd_data_v1");
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nu() {
  return new Date().toISOString();
}

function datumNL(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dagenTot(iso) {
  if (!iso) return null;
  const diff = new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

function leegVve() {
  return {
    id: uid(),
    naam: "",
    adres: "",
    beheerder: "",
    typeEigendom: "volledig_bewoond",
    alvBesluit: false,
    alvDatum: "",
    aangemaakt: nu(),
    trajecten: [],
    communicatielog: [],
    audittrail: [],
  };
}

function leegTraject(type) {
  const base = { id: uid(), type, aangemaakt: nu() };
  if (type === "procesbegeleiding") {
    return {
      ...base,
      fonds: "onbekend",
      bedrag: "",
      overeenkomstGetekend: false,
      overeenkomstDatum: "",
      status: "lopend",
      gefactureerd: false,
    };
  }
  if (type === "subsidie") {
    return {
      ...base,
      begindatum: "",
      einddatum: "",
      voortgang: 0,
      status: "lopend",
      teFactureren: "",
      gefactureerd: false,
      factuurdatum: "",
      ontbrekendeDocs: "",
      instantie: "",
      opmerkingen: "",
    };
  }
  if (type === "isolatie") {
    return {
      ...base,
      aannemers: [{ id: uid(), naam: "", contactpersoon: "" }],
      werkzaamheden: "",
      offertes: [],
      geselecteerdeOfferte: "",
      vveAkkoord: false,
      vveAkkoordDatum: "",
      doorgestuurdGemeente: false,
      doorgestuurdDatum: "",
      inkooporderOntvangen: false,
      begeleidingsvergoeding: "",
      mailNodig: false,
      actiepunten: "",
    };
  }
  return base;
}

function leegOfferte() {
  return {
    id: uid(),
    aanvraagdatum: "",
    ontvangstdatum: "",
    offertenummer: "",
    bedrag: "",
    geldigTot: "",
  };
}

function leegLogRegel() {
  return {
    id: uid(),
    datum: new Date().toISOString().slice(0, 10),
    beheerder: "",
    partij: "",
    kanaal: "mail",
    omschrijving: "",
  };
}

// ── Constanten ────────────────────────────────────────────────────
const TRAJECTEN = {
  procesbegeleiding: "Procesbegeleiding leningaanvragen",
  subsidie: "Subsidieaanvragen",
  isolatie: "Gemeentelijke isolatieactie Den Haag",
};

const TYPE_EIGENDOM = {
  volledig_bewoond: "Volledig eigenaar bewoond",
  gedeeltelijk_verhuurd: "Gedeeltelijk verhuurd",
  volledig_verhuurd: "Volledig verhuurd",
};

const FONDS_OPTIES = [
  { value: "warmtefonds", label: "Warmtefonds" },
  { value: "duurzaamheidsfonds", label: "Duurzaamheidsfonds" },
  { value: "onbekend", label: "Nog niet bekend" },
];

const KANAAL_OPTIES = ["mail", "telefoon", "vergadering", "app", "anders"];

const ACTIETYPE_LABELS = {
  offerte_aanvragen: "Offerte aanvragen",
  offerte_doorsturen: "Offerte doorsturen naar gemeente",
  akkoord_ophalen: "Akkoord ophalen bij VvE",
  document_opvragen: "Document opvragen",
  factuur_versturen: "Factuur versturen",
  inkooporder_opvolgen: "Inkooporder opvolgen",
  traject_afronden: "Traject afronden",
};

// ── Kleine hulpcomponenten ────────────────────────────────────────
function Badge({ kleur, label }) {
  const kleuren = {
    rood: "bg-red-50 text-[#991A21] border-red-100",
    groen: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blauw: "bg-blue-50 text-blue-700 border-blue-200",
    oranje: "bg-amber-50 text-amber-700 border-amber-100",
    grijs: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${kleuren[kleur] || kleuren.grijs}`}>
      {label}
    </span>
  );
}

function Veld({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function Inp({ value, onChange, placeholder = "", type = "text", className = "" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors ${className}`}
    />
  );
}

function Sel({ value, onChange, children, className = "" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors ${className}`}
    >
      {children}
    </select>
  );
}

function Txa({ value, onChange, placeholder = "", rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[#FAF7F2] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors resize-none"
    />
  );
}

function Check({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          checked ? "bg-[#991A21] border-[#991A21]" : "bg-white border-gray-300"
        }`}
      >
        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
      </div>
      <span className="text-sm text-[#2D2D2D]">{label}</span>
    </label>
  );
}

function DeadlineBadge({ iso }) {
  const d = dagenTot(iso);
  if (d === null) return null;
  if (d < 0) return <Badge kleur="rood" label={`${Math.abs(d)}d overschreden`} />;
  if (d <= 7) return <Badge kleur="rood" label={`${d}d`} />;
  if (d <= 21) return <Badge kleur="oranje" label={`${d}d`} />;
  return <Badge kleur="groen" label={`${d}d`} />;
}

// ── Traject: Procesbegeleiding ────────────────────────────────────
function TrajectProcesbegeleiding({ traject, onChange }) {
  const u = (k, v) => onChange({ ...traject, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Fonds">
          <Sel value={traject.fonds} onChange={(v) => u("fonds", v)}>
            {FONDS_OPTIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Sel>
        </Veld>
        <Veld label="Bedrag procesbegeleiding (€)">
          <Inp value={traject.bedrag} onChange={(v) => u("bedrag", v)} placeholder="bijv. 1500" />
        </Veld>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Status">
          <Sel value={traject.status} onChange={(v) => u("status", v)}>
            <option value="lopend">Lopend</option>
            <option value="afgerond">Afgerond</option>
          </Sel>
        </Veld>
        <Veld label="Datum overeenkomst getekend">
          <Inp type="date" value={traject.overeenkomstDatum} onChange={(v) => u("overeenkomstDatum", v)} />
        </Veld>
      </div>
      <div className="flex gap-6 flex-wrap">
        <Check checked={traject.overeenkomstGetekend} onChange={(v) => u("overeenkomstGetekend", v)} label="Overeenkomst getekend door VvE" />
        <Check checked={traject.gefactureerd} onChange={(v) => u("gefactureerd", v)} label="Gefactureerd" />
      </div>
    </div>
  );
}

// ── Traject: Subsidie ─────────────────────────────────────────────
function TrajectSubsidie({ traject, onChange }) {
  const u = (k, v) => onChange({ ...traject, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Veld label="Begindatum">
          <Inp type="date" value={traject.begindatum} onChange={(v) => u("begindatum", v)} />
        </Veld>
        <Veld label="Einddatum / deadline">
          <Inp type="date" value={traject.einddatum} onChange={(v) => u("einddatum", v)} />
        </Veld>
        <Veld label="Instantie (bijv. RVO)">
          <Inp value={traject.instantie} onChange={(v) => u("instantie", v)} placeholder="RVO, gemeente..." />
        </Veld>
      </div>
      <Veld label={`Voortgang aanvraag: ${traject.voortgang}%`}>
        <input
          type="range" min="0" max="100" step="5"
          value={traject.voortgang}
          onChange={(e) => u("voortgang", parseInt(e.target.value))}
          className="w-full accent-[#991A21]"
        />
        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
          <div className="bg-[#991A21] h-1.5 rounded-full transition-all" style={{ width: `${traject.voortgang}%` }} />
        </div>
      </Veld>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Status">
          <Sel value={traject.status} onChange={(v) => u("status", v)}>
            <option value="lopend">Lopend</option>
            <option value="afgerond">Afgerond</option>
          </Sel>
        </Veld>
        <Veld label="Te factureren bedrag (€)">
          <Inp value={traject.teFactureren} onChange={(v) => u("teFactureren", v)} placeholder="bijv. 2500" />
        </Veld>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Factuurdatum">
          <Inp type="date" value={traject.factuurdatum} onChange={(v) => u("factuurdatum", v)} />
        </Veld>
        <div className="flex items-end pb-1">
          <Check checked={traject.gefactureerd} onChange={(v) => u("gefactureerd", v)} label="Gefactureerd" />
        </div>
      </div>
      <Veld label="Ontbrekende documenten">
        <Txa value={traject.ontbrekendeDocs} onChange={(v) => u("ontbrekendeDocs", v)} placeholder="bijv. staatsteunverklaring, verklaring verhuurder…" />
      </Veld>
      <Veld label="Opmerkingen / openstaande acties">
        <Txa value={traject.opmerkingen} onChange={(v) => u("opmerkingen", v)} placeholder="Overige acties en notities…" />
      </Veld>
    </div>
  );
}

// ── Traject: Isolatieactie ────────────────────────────────────────
function TrajectIsolatie({ traject, onChange }) {
  const u = (k, v) => onChange({ ...traject, [k]: v });

  const updateAannemer = (idx, veld, val) => {
    const arr = [...(traject.aannemers || [])];
    arr[idx] = { ...arr[idx], [veld]: val };
    u("aannemers", arr);
  };

  const addAannemer = () => u("aannemers", [...(traject.aannemers || []), { id: uid(), naam: "", contactpersoon: "" }]);
  const removeAannemer = (idx) => u("aannemers", (traject.aannemers || []).filter((_, i) => i !== idx));

  const updateOfferte = (idx, veld, val) => {
    const arr = [...(traject.offertes || [])];
    arr[idx] = { ...arr[idx], [veld]: val };
    u("offertes", arr);
  };

  const addOfferte = () => u("offertes", [...(traject.offertes || []), leegOfferte()]);
  const removeOfferte = (idx) => u("offertes", (traject.offertes || []).filter((_, i) => i !== idx));

  return (
    <div className="space-y-5">
      {/* Aannemers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Aannemers</label>
          <button onClick={addAannemer} className="text-[10px] text-[#991A21] hover:underline font-semibold">+ Aannemer toevoegen</button>
        </div>
        <div className="space-y-2">
          {(traject.aannemers || []).map((a, idx) => (
            <div key={a.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <Inp value={a.naam} onChange={(v) => updateAannemer(idx, "naam", v)} placeholder="Naam aannemer" />
              <Inp value={a.contactpersoon} onChange={(v) => updateAannemer(idx, "contactpersoon", v)} placeholder="Contactpersoon" />
              {(traject.aannemers || []).length > 1 && (
                <button onClick={() => removeAannemer(idx)} className="text-gray-400 hover:text-red-500 text-sm px-1">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Werkzaamheden */}
      <Veld label="Werkzaamheden">
        <Txa value={traject.werkzaamheden} onChange={(v) => u("werkzaamheden", v)} placeholder="Omschrijving van de uit te voeren werkzaamheden…" />
      </Veld>

      {/* Offertes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Offertes</label>
          <button onClick={addOfferte} className="text-[10px] text-[#991A21] hover:underline font-semibold">+ Offerte toevoegen</button>
        </div>
        {(traject.offertes || []).length === 0 && (
          <p className="text-xs text-gray-400 italic">Nog geen offertes toegevoegd.</p>
        )}
        {(traject.offertes || []).map((o, idx) => (
          <div key={o.id} className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-3 mb-2 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-[#2D2D2D]">Offerte {idx + 1}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="radio"
                    name={`geselecteerd-${traject.id}`}
                    checked={traject.geselecteerdeOfferte === o.id}
                    onChange={() => u("geselecteerdeOfferte", o.id)}
                    className="accent-[#991A21]"
                  />
                  Geselecteerd
                </label>
                <button onClick={() => removeOfferte(idx)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Aanvraagdatum</p>
                <Inp type="date" value={o.aanvraagdatum} onChange={(v) => updateOfferte(idx, "aanvraagdatum", v)} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Ontvangstdatum</p>
                <Inp type="date" value={o.ontvangstdatum} onChange={(v) => updateOfferte(idx, "ontvangstdatum", v)} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Offertenummer</p>
                <Inp value={o.offertenummer} onChange={(v) => updateOfferte(idx, "offertenummer", v)} placeholder="bijv. OFF-2025-001" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Bedrag (€)</p>
                <Inp value={o.bedrag} onChange={(v) => updateOfferte(idx, "bedrag", v)} placeholder="bijv. 12500" />
              </div>
              <div className="col-span-2">
                <p className="text-[10px] text-gray-400 mb-0.5">Geldig tot</p>
                <div className="flex items-center gap-2">
                  <Inp type="date" value={o.geldigTot} onChange={(v) => updateOfferte(idx, "geldigTot", v)} />
                  {o.geldigTot && <DeadlineBadge iso={o.geldigTot} />}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status velden */}
      <div className="grid grid-cols-2 gap-4">
        <Veld label="Datum VvE akkoord">
          <Inp type="date" value={traject.vveAkkoordDatum} onChange={(v) => u("vveAkkoordDatum", v)} />
        </Veld>
        <Veld label="Datum doorgestuurd gemeente">
          <Inp type="date" value={traject.doorgestuurdDatum} onChange={(v) => u("doorgestuurdDatum", v)} />
        </Veld>
      </div>
      <div className="flex gap-6 flex-wrap">
        <Check checked={traject.vveAkkoord} onChange={(v) => u("vveAkkoord", v)} label="VvE akkoord met offerte" />
        <Check checked={traject.doorgestuurdGemeente} onChange={(v) => u("doorgestuurdGemeente", v)} label="Doorgestuurd naar gemeente" />
        <Check checked={traject.inkooporderOntvangen} onChange={(v) => u("inkooporderOntvangen", v)} label="Inkooporder ontvangen" />
        <Check checked={traject.mailNodig} onChange={(v) => u("mailNodig", v)} label="Mail nog te sturen" />
      </div>
      <Veld label="Begeleidingsvergoeding (€)">
        <Inp value={traject.begeleidingsvergoeding} onChange={(v) => u("begeleidingsvergoeding", v)} placeholder="bijv. 500" />
      </Veld>
      <Veld label="Actiepunten">
        <Txa value={traject.actiepunten} onChange={(v) => u("actiepunten", v)} placeholder="Lopende acties en openstaande punten…" rows={4} />
      </Veld>
    </div>
  );
}

// ── VvE Kaart (detail) ────────────────────────────────────────────
function VveKaart({ vve, onUpdate, onDelete, openId, setOpenId, beheerderList, addAudit }) {
  const isOpen = openId === vve.id;
  const [actieveTab, setActieveTab] = useState("info");
  const [nieuweLog, setNieuweLog] = useState(leegLogRegel());
  const [logToevoegen, setLogToevoegen] = useState(false);

  const u = (k, v) => {
    const bijgewerkt = { ...vve, [k]: v };
    addAudit(bijgewerkt, k, vve[k], v);
    onUpdate(bijgewerkt);
  };

  const updateTraject = (t) => {
    const trajecten = vve.trajecten.map((x) => (x.id === t.id ? t : x));
    onUpdate({ ...vve, trajecten });
  };

  const addTraject = (type) => {
    const t = leegTraject(type);
    onUpdate({ ...vve, trajecten: [...vve.trajecten, t] });
  };

  const removeTraject = (tid) => {
    if (!confirm("Traject verwijderen?")) return;
    onUpdate({ ...vve, trajecten: vve.trajecten.filter((t) => t.id !== tid) });
  };

  const slaLogOp = () => {
    if (!nieuweLog.omschrijving.trim()) return;
    const log = [...(vve.communicatielog || []), { ...nieuweLog, id: uid() }];
    onUpdate({ ...vve, communicatielog: log });
    setNieuweLog(leegLogRegel());
    setLogToevoegen(false);
  };

  // Actieve trajecttypen
  const trajectTypen = vve.trajecten.map((t) => t.type);

  // Deadlines voor deze VvE
  const deadlines = [];
  if (vve.alvDatum) deadlines.push({ label: "ALV besluit", datum: vve.alvDatum });
  vve.trajecten.forEach((t) => {
    if (t.type === "subsidie" && t.einddatum) deadlines.push({ label: "Subsidie deadline", datum: t.einddatum });
    if (t.type === "isolatie") {
      (t.offertes || []).forEach((o) => {
        if (o.geldigTot) deadlines.push({ label: `Offerte ${o.offertenummer || ""}`, datum: o.geldigTot });
      });
    }
  });

  const urgentDeadline = deadlines.find((d) => {
    const dag = dagenTot(d.datum);
    return dag !== null && dag <= 14 && dag >= 0;
  });
  const overschreden = deadlines.some((d) => {
    const dag = dagenTot(d.datum);
    return dag !== null && dag < 0;
  });

  return (
    <div className={`bg-white border-2 rounded-xl transition-all ${overschreden ? "border-red-300" : urgentDeadline ? "border-amber-300" : isOpen ? "border-[#991A21]" : "border-gray-200"} shadow-sm`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        onClick={() => setOpenId(isOpen ? null : vve.id)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overschreden ? "bg-red-500" : urgentDeadline ? "bg-amber-400" : "bg-emerald-400"}`} />
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#2D2D2D] truncate">{vve.naam || <span className="text-gray-400 italic">Naamloos</span>}</p>
            <p className="text-xs text-gray-500 truncate">{vve.adres || "Geen adres"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {trajectTypen.includes("procesbegeleiding") && <Badge kleur="blauw" label="Lening" />}
          {trajectTypen.includes("subsidie") && <Badge kleur="groen" label="Subsidie" />}
          {trajectTypen.includes("isolatie") && <Badge kleur="oranje" label="Isolatie" />}
          {overschreden && <Badge kleur="rood" label="Deadline overschreden" />}
          {urgentDeadline && !overschreden && <Badge kleur="oranje" label="Deadline nadert" />}
          <span className="text-[#2D2D2D] text-sm font-bold ml-1">{isOpen ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Detail */}
      {isOpen && (
        <div className="border-t border-gray-100">
          {/* Tabs */}
          <div className="flex gap-0 border-b border-gray-100 px-5">
            {[
              { key: "info", label: "VvE info" },
              { key: "trajecten", label: `Trajecten (${vve.trajecten.length})` },
              { key: "log", label: `Communicatielog (${(vve.communicatielog || []).length})` },
              { key: "audit", label: "Audittrail" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActieveTab(tab.key)}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  actieveTab === tab.key
                    ? "border-[#991A21] text-[#991A21]"
                    : "border-transparent text-gray-500 hover:text-[#2D2D2D]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Tab: VvE info */}
            {actieveTab === "info" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Veld label="VvE naam">
                    <Inp value={vve.naam} onChange={(v) => u("naam", v)} placeholder="Naam van de VvE" />
                  </Veld>
                  <Veld label="Adres">
                    <Inp value={vve.adres} onChange={(v) => u("adres", v)} placeholder="Straat + nummer, plaats" />
                  </Veld>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Veld label="Beheerder">
                    <Sel value={vve.beheerder} onChange={(v) => u("beheerder", v)}>
                      <option value="">— Kies beheerder —</option>
                      {(beheerderList || []).map((n) => <option key={n} value={n}>{n}</option>)}
                    </Sel>
                  </Veld>
                  <Veld label="Type eigendom">
                    <Sel value={vve.typeEigendom} onChange={(v) => u("typeEigendom", v)}>
                      {Object.entries(TYPE_EIGENDOM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Sel>
                  </Veld>
                </div>
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div className="flex items-end gap-3">
                    <Check checked={vve.alvBesluit} onChange={(v) => u("alvBesluit", v)} label="ALV-besluit genomen" />
                  </div>
                  {vve.alvBesluit && (
                    <Veld label="Datum ALV-besluit">
                      <Inp type="date" value={vve.alvDatum} onChange={(v) => u("alvDatum", v)} />
                    </Veld>
                  )}
                </div>
                {/* Deadlines overzicht voor deze VvE */}
                {deadlines.length > 0 && (
                  <div className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Deadlines</p>
                    <div className="space-y-2">
                      {deadlines.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{d.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{datumNL(d.datum)}</span>
                            <DeadlineBadge iso={d.datum} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { if (confirm(`VvE "${vve.naam || "naamloos"}" definitief verwijderen?`)) onDelete(vve.id); }}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    VvE verwijderen
                  </button>
                </div>
              </div>
            )}

            {/* Tab: Trajecten */}
            {actieveTab === "trajecten" && (
              <div className="space-y-4">
                {vve.trajecten.length === 0 && (
                  <p className="text-xs text-gray-400 italic">Nog geen trajecten toegevoegd.</p>
                )}
                {vve.trajecten.map((t) => (
                  <div key={t.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <span className="text-sm font-bold text-[#2D2D2D]">{TRAJECTEN[t.type]}</span>
                      <div className="flex items-center gap-2">
                        {t.status === "afgerond" ? <Badge kleur="groen" label="Afgerond" /> : <Badge kleur="blauw" label="Lopend" />}
                        <button onClick={() => removeTraject(t.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">✕ verwijderen</button>
                      </div>
                    </div>
                    <div className="p-4">
                      {t.type === "procesbegeleiding" && <TrajectProcesbegeleiding traject={t} onChange={updateTraject} />}
                      {t.type === "subsidie" && <TrajectSubsidie traject={t} onChange={updateTraject} />}
                      {t.type === "isolatie" && <TrajectIsolatie traject={t} onChange={updateTraject} />}
                    </div>
                  </div>
                ))}

                {/* Traject toevoegen */}
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Traject toevoegen</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(TRAJECTEN).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => addTraject(key)}
                        className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-medium transition-colors"
                      >
                        + {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Communicatielog */}
            {actieveTab === "log" && (
              <div className="space-y-4">
                {/* Log toevoegen */}
                {logToevoegen ? (
                  <div className="bg-[#FAF7F2] border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-[#2D2D2D]">Nieuw logitem</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Veld label="Datum">
                        <Inp type="date" value={nieuweLog.datum} onChange={(v) => setNieuweLog({ ...nieuweLog, datum: v })} />
                      </Veld>
                      <Veld label="Beheerder">
                        <Sel value={nieuweLog.beheerder} onChange={(v) => setNieuweLog({ ...nieuweLog, beheerder: v })}>
                          <option value="">— kies —</option>
                          {(beheerderList || []).map((n) => <option key={n} value={n}>{n}</option>)}
                        </Sel>
                      </Veld>
                      <Veld label="Partij">
                        <Inp value={nieuweLog.partij} onChange={(v) => setNieuweLog({ ...nieuweLog, partij: v })} placeholder="eigenaar, aannemer, gemeente…" />
                      </Veld>
                      <Veld label="Kanaal">
                        <Sel value={nieuweLog.kanaal} onChange={(v) => setNieuweLog({ ...nieuweLog, kanaal: v })}>
                          {KANAAL_OPTIES.map((k) => <option key={k} value={k}>{k}</option>)}
                        </Sel>
                      </Veld>
                    </div>
                    <Veld label="Omschrijving">
                      <Txa value={nieuweLog.omschrijving} onChange={(v) => setNieuweLog({ ...nieuweLog, omschrijving: v })} placeholder="Wat is er besproken of afgesproken?" />
                    </Veld>
                    <div className="flex gap-2">
                      <button onClick={slaLogOp} className="text-xs px-4 py-2 bg-[#991A21] text-white rounded-lg font-semibold hover:bg-[#7a1419] transition-colors">Opslaan</button>
                      <button onClick={() => setLogToevoegen(false)} className="text-xs px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold hover:bg-gray-50 transition-colors">Annuleren</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setLogToevoegen(true)} className="text-xs px-3 py-1.5 bg-white border border-gray-200 hover:border-[#991A21] hover:text-[#991A21] rounded-lg font-medium transition-colors">
                    + Logitem toevoegen
                  </button>
                )}

                {/* Log lijst */}
                {(vve.communicatielog || []).length === 0 && !logToevoegen && (
                  <p className="text-xs text-gray-400 italic">Nog geen communicatie geregistreerd.</p>
                )}
                <div className="space-y-2">
                  {[...(vve.communicatielog || [])].reverse().map((l) => (
                    <div key={l.id} className="flex gap-3 text-xs border-l-2 border-gray-200 pl-3 py-1">
                      <div className="flex-shrink-0 text-gray-400 w-20">{datumNL(l.datum)}</div>
                      <div>
                        <span className="font-semibold text-[#2D2D2D]">{l.beheerder}</span>
                        {" · "}
                        <span className="text-gray-500">{l.partij}</span>
                        {" · "}
                        <span className="italic text-gray-400">{l.kanaal}</span>
                        <p className="text-gray-600 mt-0.5">{l.omschrijving}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Audittrail */}
            {actieveTab === "audit" && (
              <div className="space-y-1">
                {(vve.audittrail || []).length === 0 && (
                  <p className="text-xs text-gray-400 italic">Nog geen wijzigingen vastgelegd.</p>
                )}
                {[...(vve.audittrail || [])].reverse().map((a, i) => (
                  <div key={i} className="flex gap-3 text-xs border-l-2 border-gray-100 pl-3 py-1">
                    <span className="text-gray-400 flex-shrink-0 w-32">{new Date(a.tijdstip).toLocaleString("nl-NL")}</span>
                    <span className="font-semibold text-gray-600 w-20 flex-shrink-0">{a.beheerder || "—"}</span>
                    <span className="text-gray-500">{a.veld}: <span className="line-through text-red-400">{String(a.oud || "—").slice(0, 40)}</span> → <span className="text-emerald-600">{String(a.nieuw || "—").slice(0, 40)}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hoofd component ───────────────────────────────────────────────
export default function VerduurzamingBeheer({ onTerug, beheerder, beheerderList }) {
  const [vves, setVves] = useState(() => vdLocalLoad());
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoek, setZoek] = useState("");
  const [filterTraject, setFilterTraject] = useState("alle");
  const [filterBeheerder, setFilterBeheerder] = useState("alle");
  const [actieveHoofdTab, setActieveHoofdTab] = useState("vves");

  useEffect(() => {
    vdLoad().then((data) => {
      if (data && data.length) setVves(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addAudit = (vve, veld, oud, nieuw) => {
    if (String(oud) === String(nieuw)) return vve;
    const entry = { tijdstip: nu(), beheerder: beheerder || "onbekend", veld, oud, nieuw };
    return { ...vve, audittrail: [...(vve.audittrail || []), entry] };
  };

  const addVve = async () => {
    const n = leegVve();
    const updated = [n, ...vves];
    setVves(updated);
    await vdSave(n);
    setOpenId(n.id);
    setActieveHoofdTab("vves");
  };

  const updateVve = async (v) => {
    setVves((prev) => prev.map((x) => (x.id === v.id ? v : x)));
    await vdSave(v);
  };

  const deleteVve = async (id) => {
    setVves((prev) => prev.filter((x) => x.id !== id));
    await vdDelete(id);
    if (openId === id) setOpenId(null);
  };

  const handleAddAudit = (vve, veld, oud, nieuw) => {
    const bijgewerkt = addAudit(vve, veld, oud, nieuw);
    return bijgewerkt;
  };

  // Filter
  let zichtbaar = vves.filter((v) => {
    const mz = !zoek || (v.naam || "").toLowerCase().includes(zoek.toLowerCase()) || (v.adres || "").toLowerCase().includes(zoek.toLowerCase());
    const mt = filterTraject === "alle" || v.trajecten.some((t) => t.type === filterTraject);
    const mb = filterBeheerder === "alle" || v.beheerder === filterBeheerder;
    return mz && mt && mb;
  });

  // Stats
  const aantalActief = vves.filter((v) => v.trajecten.some((t) => t.status !== "afgerond")).length;
  const aantalDeadline = vves.filter((v) => {
    const deadlines = [];
    v.trajecten.forEach((t) => {
      if (t.type === "subsidie" && t.einddatum) deadlines.push(t.einddatum);
      (t.offertes || []).forEach((o) => { if (o.geldigTot) deadlines.push(o.geldigTot); });
    });
    return deadlines.some((d) => { const dag = dagenTot(d); return dag !== null && dag <= 14 && dag >= 0; });
  }).length;

  // Actielijst
  const acties = [];
  vves.forEach((v) => {
    v.trajecten.forEach((t) => {
      if (t.type === "isolatie") {
        if ((t.offertes || []).length === 0) acties.push({ vve: v.naam, beheerder: v.beheerder, type: "offerte_aanvragen", traject: "Isolatie" });
        if (t.offertes.length > 0 && !t.doorgestuurdGemeente) acties.push({ vve: v.naam, beheerder: v.beheerder, type: "offerte_doorsturen", traject: "Isolatie" });
        if (!t.vveAkkoord && t.offertes.length > 0) acties.push({ vve: v.naam, beheerder: v.beheerder, type: "akkoord_ophalen", traject: "Isolatie" });
        if (!t.inkooporderOntvangen && t.doorgestuurdGemeente) acties.push({ vve: v.naam, beheerder: v.beheerder, type: "inkooporder_opvolgen", traject: "Isolatie" });
      }
      if (t.type === "subsidie") {
        if (t.ontbrekendeDocs?.trim()) acties.push({ vve: v.naam, beheerder: v.beheerder, type: "document_opvragen", traject: "Subsidie", detail: t.ontbrekendeDocs });
        if (!t.gefactureerd && t.status === "afgerond") acties.push({ vve: v.naam, beheerder: v.beheerder, type: "factuur_versturen", traject: "Subsidie" });
      }
      if (t.type === "procesbegeleiding") {
        if (!t.gefactureerd && t.status === "afgerond") acties.push({ vve: v.naam, beheerder: v.beheerder, type: "factuur_versturen", traject: "Procesbegeleiding" });
      }
    });
  });

  // Financieel overzicht
  const financieel = { totaal: 0, gefactureerd: 0, open: 0, perTraject: {} };
  vves.forEach((v) => {
    v.trajecten.forEach((t) => {
      const bedrag = parseFloat(t.bedrag || t.teFactureren || 0) || 0;
      const vergoeding = parseFloat(t.begeleidingsvergoeding || 0) || 0;
      const totaalBedrag = bedrag + vergoeding;
      financieel.totaal += totaalBedrag;
      if (t.gefactureerd) financieel.gefactureerd += totaalBedrag;
      else financieel.open += totaalBedrag;
      if (!financieel.perTraject[t.type]) financieel.perTraject[t.type] = { totaal: 0, gefactureerd: 0, open: 0 };
      financieel.perTraject[t.type].totaal += totaalBedrag;
      if (t.gefactureerd) financieel.perTraject[t.type].gefactureerd += totaalBedrag;
      else financieel.perTraject[t.type].open += totaalBedrag;
    });
  });

  const euro = (n) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2EFEC] flex items-center justify-center">
        <style>{CSS_FONT}</style>
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#991A21] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Gegevens laden…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>

      {/* Topbar */}
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center">
              <span className="text-white text-xs">🌿</span>
            </div>
            <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center">
              <span className="text-white text-xs">📋</span>
            </div>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">Verduurzaming & Subsidies</span>
          {aantalDeadline > 0 && (
            <span className="text-[10px] bg-red-50 text-[#991A21] border border-red-100 px-2 py-0.5 rounded-full font-bold">
              {aantalDeadline} deadline{aantalDeadline > 1 ? "s" : ""} nadert
            </span>
          )}
        </div>
        <button
          onClick={onTerug}
          className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors"
        >
          ← Terug naar portaal
        </button>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Statistieken */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "VvE's totaal", val: vves.length, kleur: "#2D2D2D" },
            { label: "Actieve trajecten", val: aantalActief, kleur: "#1A4D7A" },
            { label: "Openstaande acties", val: acties.length, kleur: "#92400E" },
            { label: "Deadlines < 14 dagen", val: aantalDeadline, kleur: "#991A21" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
              <p className="text-3xl font-bold" style={{ color: s.kleur }}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Hoofd tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-6">
          {[
            { key: "vves", label: `VvE's (${vves.length})` },
            { key: "acties", label: `Actielijst (${acties.length})` },
            { key: "financieel", label: "Financieel overzicht" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActieveHoofdTab(tab.key)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                actieveHoofdTab === tab.key
                  ? "border-[#991A21] text-[#991A21]"
                  : "border-transparent text-gray-500 hover:text-[#2D2D2D]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: VvE's */}
        {actieveHoofdTab === "vves" && (
          <>
            {/* Zoek + filters */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <input
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Zoek op VvE naam of adres…"
                className="flex-1 min-w-48 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21] transition-colors"
              />
              <select
                value={filterTraject}
                onChange={(e) => setFilterTraject(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21] transition-colors"
              >
                <option value="alle">Alle trajecten</option>
                {Object.entries(TRAJECTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select
                value={filterBeheerder}
                onChange={(e) => setFilterBeheerder(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#991A21] transition-colors"
              >
                <option value="alle">Alle beheerders</option>
                {(beheerderList || []).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                onClick={addVve}
                className="px-4 py-2 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                + VvE toevoegen
              </button>
            </div>

            {/* VvE lijst */}
            {zichtbaar.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
                <p className="text-4xl mb-3">🌿</p>
                <p className="text-sm font-semibold text-[#2D2D2D] mb-1">
                  {vves.length === 0 ? "Nog geen VvE's toegevoegd" : "Geen resultaten gevonden"}
                </p>
                <p className="text-xs text-gray-500">
                  {vves.length === 0 ? "Klik op '+ VvE toevoegen' om te beginnen." : "Pas de zoek- of filterinstellingen aan."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {zichtbaar.map((v) => (
                  <VveKaart
                    key={v.id}
                    vve={v}
                    onUpdate={updateVve}
                    onDelete={deleteVve}
                    openId={openId}
                    setOpenId={setOpenId}
                    beheerderList={beheerderList}
                    addAudit={handleAddAudit}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab: Actielijst */}
        {actieveHoofdTab === "acties" && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {acties.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-sm font-semibold text-[#2D2D2D]">Geen openstaande acties</p>
                <p className="text-xs text-gray-500">Alle trajecten zijn bijgewerkt.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">VvE</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Beheerder</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Traject</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {acties.map((a, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-[#FAF7F2] transition-colors">
                      <td className="px-5 py-3 font-semibold text-[#2D2D2D]">{a.vve || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{a.beheerder || "—"}</td>
                      <td className="px-5 py-3"><Badge kleur={a.traject === "Isolatie" ? "oranje" : a.traject === "Subsidie" ? "groen" : "blauw"} label={a.traject} /></td>
                      <td className="px-5 py-3">
                        <div>
                          <span className="font-medium text-[#2D2D2D]">{ACTIETYPE_LABELS[a.type] || a.type}</span>
                          {a.detail && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{a.detail}</p>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab: Financieel */}
        {actieveHoofdTab === "financieel" && (
          <div className="space-y-4">
            {/* Totalen */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Totale omzet", val: financieel.totaal, kleur: "#2D2D2D" },
                { label: "Al gefactureerd", val: financieel.gefactureerd, kleur: "#065F46" },
                { label: "Nog te factureren", val: financieel.open, kleur: "#991A21" },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
                  <p className="text-2xl font-bold" style={{ color: s.kleur }}>{euro(s.val)}</p>
                </div>
              ))}
            </div>

            {/* Per traject */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Per traject</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Traject</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Totaal</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Gefactureerd</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(financieel.perTraject).map(([type, f]) => (
                    <tr key={type} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-[#2D2D2D]">{TRAJECTEN[type] || type}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{euro(f.totaal)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 font-medium">{euro(f.gefactureerd)}</td>
                      <td className="px-5 py-3 text-right text-[#991A21] font-medium">{euro(f.open)}</td>
                    </tr>
                  ))}
                  {Object.keys(financieel.perTraject).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-xs text-gray-400 italic">Nog geen financiële data beschikbaar.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
