import { useState, useEffect, useCallback, useRef } from "react";

// ── Config ───────────────────────────────────────────────────────
const INVITE_DAYS = 21;
const NL_MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const NL_MONTHS_FULL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
const NL_DAYS = ["Zo","Ma","Di","Wo","Do","Vr","Za"];
const WORK_DAYS_DEFAULT = [false, true, true, true, true, true, false];

// ── Accounts ─────────────────────────────────────────────────────
const ACCOUNTS = [
  { naam: "Jeffrey",   wachtwoord: "kp4mR9",    rol: "beheerder" },
  { naam: "Daley",     wachtwoord: "xT7nL2",    rol: "beheerder" },
  { naam: "Jan-Jaap",  wachtwoord: "bW3qZ8",    rol: "beheerder" },
  { naam: "Tahir",     wachtwoord: "mF6vD1",    rol: "beheerder" },
  { naam: "Diana",     wachtwoord: "yH9cJ5",    rol: "beheerder" },
  { naam: "Fred",      wachtwoord: "rS2pK7",    rol: "beheerder" },
  { naam: "Laura",     wachtwoord: "nG8tX3",    rol: "beheerder" },
  { naam: "Isaac",     wachtwoord: "wQ5hM4",    rol: "beheerder" },
  { naam: "Kelvin",    wachtwoord: "dB1fN6",    rol: "beheerder" },
  { naam: "Martijn",   wachtwoord: "zU7wR9",    rol: "beheerder" },
  { naam: "Bryan",     wachtwoord: "cE4sV2",    rol: "beheerder" },
  { naam: "Alwart",    wachtwoord: "jL3kP8",    rol: "beheerder" },
  { naam: "Radjesh",   wachtwoord: "oT6mY1",    rol: "beheerder" },
  { naam: "Rob",       wachtwoord: "hA9nQ5",    rol: "beheerder" },
  { naam: "Jaap",      wachtwoord: "gX2bF7",    rol: "beheerder" },
  { naam: "Vinny",     wachtwoord: "uD5cW3",    rol: "beheerder" },
  { naam: "Brian",     wachtwoord: "vJ8zH4",    rol: "beheerder" },
  { naam: "Pascalle",  wachtwoord: "iK1rS6",    rol: "beheerder" },
  { naam: "Joerie",    wachtwoord: "lM4tB9",    rol: "beheerder" },
  { naam: "Jasper",    wachtwoord: "eN7xC2",    rol: "beheerder" },
  { naam: "Frank",     wachtwoord: "pR3dU8",    rol: "beheerder" },
  { naam: "Janette",   wachtwoord: "qW6yA5",    rol: "beheerder" },
  { naam: "Admin",     wachtwoord: "totaal2025", rol: "admin"     },
];

function findAccount(naam, wachtwoord) {
  return ACCOUNTS.find(a =>
    a.naam.toLowerCase() === naam.trim().toLowerCase() &&
    a.wachtwoord === wachtwoord.trim()
  );
}

// ── Supabase client ──────────────────────────────────────────────
const SUPABASE_URL = "https://nuipelnbbhvnotxpyxdj.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51aXBlbG5iYmh2bm90eHB5eGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk3MjcsImV4cCI6MjA5MDkwNTcyN30.Y9CoxrTN3X49miiRjp3ieZmamcbKp_y9YK9RLKIc68s";

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Supabase fout: ${err}`); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadData(beheerder) {
  try {
    const rows = await sbFetch(`beheerder_data?beheerder=eq.${encodeURIComponent(beheerder)}&select=vves,vakanties,werkdagen`);
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    const seenIds = new Set();
    let repaired = false;
    const vves = (row.vves||[]).map(v => {
      if (!v.id || seenIds.has(v.id)) {
        repaired = true;
        const newId = `${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
        seenIds.add(newId);
        return { ...v, id: newId };
      }
      seenIds.add(v.id);
      return v;
    });
    const fixed = { vves, vakanties: row.vakanties||[], werkdagen: row.werkdagen||WORK_DAYS_DEFAULT };
    if (repaired) await saveData(beheerder, fixed);
    return fixed;
  } catch(e) { console.error("loadData", e); return null; }
}

async function saveData(beheerder, data) {
  try {
    const payload = {
      beheerder,
      vves: data.vves||[],
      vakanties: data.vakanties||[],
      werkdagen: data.werkdagen||WORK_DAYS_DEFAULT
    };
    await sbFetch(`beheerder_data?beheerder=eq.${encodeURIComponent(beheerder)}`, {
      method: "DELETE",
      headers: { "Prefer": "" }
    });
    await sbFetch(`beheerder_data`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch(e) { console.error("saveData", e); }
}

async function loadAllData(beheerderList) {
  try {
    const rows = await sbFetch(`beheerder_data?select=beheerder,vves,vakanties,werkdagen`);
    if (!rows) return {};
    const result = {};
    for (const naam of beheerderList) {
      const row = rows.find(r => r.beheerder === naam);
      if (row) result[naam] = { vves: row.vves||[], vakanties: row.vakanties||[], werkdagen: row.werkdagen||WORK_DAYS_DEFAULT };
    }
    return result;
  } catch(e) { console.error("loadAllData", e); return {}; }
}

function getBeheerderList() {
  return ACCOUNTS.filter(a => a.rol === "beheerder").map(a => a.naam);
}

// ── Date helpers ─────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso+"T00:00:00");
  return `${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(iso, n) {
  if (!iso) return "";
  const d = new Date(iso+"T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function today() { return new Date().toISOString().slice(0,10); }
function monthKey(iso) { return iso ? iso.slice(0,7) : null; }
function isInVakantie(iso, vakanties) {
  return vakanties.some(v => v.van && v.tot && iso >= v.van && iso <= v.tot);
}
function spreadScore(vves) {
  const counts = {};
  vves.forEach(m => {
    const k = monthKey(m.datum1); if (k) counts[k] = (counts[k]||0)+1;
    const k2 = monthKey(m.datum2); if (k2) counts[k2] = (counts[k2]||0)+1;
  });
  return counts;
}
function defaultData() { return { vves: [], vakanties: [], werkdagen: WORK_DAYS_DEFAULT }; }
let _idCounter = 0;
function newVve(naam, datum1 = "") {
  _idCounter++;
  return { id: `${Date.now()}_${_idCounter}_${Math.random().toString(36).slice(2,7)}`, naam, datum1, datum2:"", notitie:"" };
}

// ── FIX 4: isAfgerond helper ─────────────────────────────────────
// Een VvE is afgerond als vergadering 1 heeft plaatsgevonden
// én er geen 2e nodig is, of de 2e ook heeft plaatsgevonden.
function isAfgerond(vve) {
  return !!vve.vergaderd1 && (!vve.needs2e || !!vve.vergaderd2);
}

// ── Import line parser ────────────────────────────────────────────
function parseImportLine(line) {
  const parts = line.includes("\t")
    ? line.split("\t").map(p => p.trim())
    : line.split(/\s{2,}/).map(p => p.trim());
  const naam = parts[0]?.trim();
  if (!naam) return null;
  let datum1 = "";
  if (parts[1]) {
    const match = parts[1].match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      datum1 = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }
  }
  return { naam, datum1 };
}

// ── Auto-planner ─────────────────────────────────────────────────
function generatePlanning(vves, vakanties, werkdagen) {
  const year = new Date().getFullYear();
  const ongepland = vves.filter(v => !v.datum1);
  if (ongepland.length === 0) return vves;
  const validDates = [];
  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(`${year}-12-31T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const iso = d.toISOString().slice(0,10);
    const dow = d.getDay();
    if (!werkdagen[dow]) continue;
    if (isInVakantie(iso, vakanties)) continue;
    validDates.push(iso);
  }
  if (validDates.length === 0) return vves;
  const alreadyPlanned = {};
  vves.filter(v => v.datum1).forEach(v => {
    alreadyPlanned[v.datum1] = (alreadyPlanned[v.datum1]||0)+1;
  });
  function closestValidDate(target) {
    if (!target) return null;
    const adjusted = `${year}-${target.slice(5)}`;
    if (validDates.includes(adjusted)) return adjusted;
    for (let delta = 1; delta <= 30; delta++) {
      const fwd = addDays(adjusted, delta);
      const bwd = addDays(adjusted, -delta);
      if (validDates.includes(fwd)) return fwd;
      if (validDates.includes(bwd)) return bwd;
    }
    return null;
  }
  const total = ongepland.length;
  const step = Math.max(1, Math.floor(validDates.length / total));
  const assignments = [];
  ongepland.forEach((vve, i) => {
    if (vve.voorkeurVolgendjaar) {
      const preferred = closestValidDate(vve.voorkeurVolgendjaar);
      if (preferred) {
        assignments.push({ id: vve.id, datum: preferred });
        alreadyPlanned[preferred] = (alreadyPlanned[preferred]||0)+1;
        return;
      }
    }
    const idealIdx = Math.min(Math.round(i * (validDates.length / total)), validDates.length - 1);
    const windowStart = Math.max(0, idealIdx - Math.floor(step/2));
    const windowEnd = Math.min(validDates.length-1, idealIdx + Math.floor(step/2));
    let bestIdx = idealIdx;
    let bestLoad = Infinity;
    for (let j = windowStart; j <= windowEnd; j++) {
      const load = (alreadyPlanned[validDates[j]]||0) + assignments.filter(a=>a.datum===validDates[j]).length;
      if (load < bestLoad) { bestLoad = load; bestIdx = j; }
    }
    assignments.push({ id: vve.id, datum: validDates[bestIdx] });
  });
  return vves.map(v => {
    if (v.datum1) return v;
    const match = assignments.find(a => a.id === v.id);
    return match ? { ...v, datum1: match.datum } : v;
  });
}

// ── Shared UI ────────────────────────────────────────────────────
function Badge({ color, children }) {
  const c = {
    green:"bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
    orange:"bg-amber-900/40 text-amber-300 border border-amber-700/40",
    red:"bg-red-900/40 text-red-300 border border-red-700/40",
    blue:"bg-sky-900/40 text-sky-300 border border-sky-700/40",
    gray:"bg-zinc-800 text-zinc-400 border border-zinc-700",
  };
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${c[color]||c.gray}`}>{children}</span>;
}

function MonthBar({ counts, vakanties }) {
  const year = new Date().getFullYear();
  const max = Math.max(...Object.values(counts),1);
  return (
    <div className="grid grid-cols-12 gap-1">
      {NL_MONTHS.map((m,i) => {
        const key = `${year}-${String(i+1).padStart(2,"0")}`;
        const count = counts[key]||0;
        const pct = Math.round((count/max)*100);
        const inVak = vakanties.some(v => {
          if (!v.van||!v.tot) return false;
          const ms=`${year}-${String(i+1).padStart(2,"0")}-01`;
          const me=`${year}-${String(i+1).padStart(2,"0")}-28`;
          return ms<=v.tot && me>=v.van;
        });
        const color = count===0?"#27272a":count>=8?"#dc2626":count>=5?"#d97706":"#059669";
        return (
          <div key={m} className="flex flex-col items-center gap-1">
            <div className="w-full rounded-sm overflow-hidden bg-zinc-800 h-16 flex items-end relative">
              {inVak && <div className="absolute inset-0 opacity-20 bg-amber-400 pointer-events-none"/>}
              <div className="w-full transition-all duration-500 rounded-sm" style={{height:`${Math.max(pct,count>0?8:0)}%`,backgroundColor:color}}/>
            </div>
            <span className="text-[9px] text-zinc-500 font-mono uppercase">{m}</span>
            <span className="text-[10px] font-mono" style={{color:count===0?"#52525b":color}}>{count||"·"}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Invite status helper ─────────────────────────────────────────
function inviteStatus(datum, uitgenodigd) {
  if (!datum) return "none";
  if (uitgenodigd) return "confirmed";
  const deadline = addDays(datum, -INVITE_DAYS);
  const t = today();
  if (datum < t) return "overdue";
  if (deadline < t) return "overdue";
  if (deadline <= addDays(t, 5)) return "warning";
  return "ok";
}

// ── Checkbox ─────────────────────────────────────────────────────
function Checkbox({ checked, disabled, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group shrink-0" onClick={e=>e.stopPropagation()}>
      <div
        onClick={()=>!disabled && onChange(!checked)}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
          ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
          ${checked ? "bg-emerald-600 border-emerald-600" : "border-zinc-600 hover:border-zinc-400"}`}
      >
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <span className={`text-xs transition-colors ${disabled ? "text-zinc-700" : "text-zinc-400 group-hover:text-zinc-300"}`}>{label}</span>
    </label>
  );
}

// ── VvE Row ──────────────────────────────────────────────────────
function VveRow({ vve, vakanties, onUpdate, onDelete, onAdd2nd, forceOpen, onForceOpenHandled }) {
  const [expanded, setExpanded] = useState(false);

  // FIX 3: wanneer forceOpen=true, klap open en scroll
  const rowRef = useRef(null);
  useEffect(() => {
    if (forceOpen) {
      setExpanded(true);
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      onForceOpenHandled?.();
    }
  }, [forceOpen]);

  const inVak1 = vve.datum1 && isInVakantie(vve.datum1, vakanties);
  const inVak2 = vve.datum2 && isInVakantie(vve.datum2, vakanties);
  const vergaderd1 = !!vve.vergaderd1;
  const vergaderd2 = !!vve.vergaderd2;
  const uitgenodigd1 = !!vve.uitgenodigd1;
  const uitgenodigd2 = !!vve.uitgenodigd2;
  // FIX 4: gebruik isAfgerond helper
  const afgerond = isAfgerond(vve);

  const inv1 = inviteStatus(vve.datum1, uitgenodigd1);
  const inv2 = inviteStatus(vve.datum2, uitgenodigd2);

  const invBadge = (status, which) => {
    if (status === "none") return null;
    if (status === "confirmed") return <Badge color="green">✉ Uitgenodigd</Badge>;
    if (status === "overdue") return <Badge color="red">✉ Uitnodiging te laat ({which})</Badge>;
    if (status === "warning") return <Badge color="orange">✉ Uitnodigen ({which})</Badge>;
    return null;
  };

  const dotColor = afgerond ? "bg-emerald-500"
    : vergaderd1 ? "bg-sky-500"
    : inv1 === "overdue" || inv2 === "overdue" ? "bg-red-500"
    : inv1 === "warning" || inv2 === "warning" ? "bg-amber-400"
    : vve.datum1 ? "bg-zinc-500"
    : "bg-zinc-700";

  const updateDatum1 = (val) => onUpdate({ ...vve, datum1: val, uitgenodigd1: false });
  const updateDatum2 = (val) => onUpdate({ ...vve, datum2: val, uitgenodigd2: false });

  return (
    <div ref={rowRef} className={`border rounded-lg overflow-hidden transition-colors ${afgerond ? "border-emerald-900/50 bg-emerald-950/10" : "border-zinc-800"}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors" onClick={()=>setExpanded(e=>!e)}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium truncate ${afgerond ? "text-emerald-300" : "text-zinc-200"}`}>{vve.naam}</span>
            {afgerond && <Badge color="green">✓ Afgerond</Badge>}
            {afgerond && vve.voorkeurVolgendjaar && <Badge color="blue">📅 {new Date().getFullYear()+1} gepland</Badge>}
            {!afgerond && vergaderd1 && vve.datum2 && !vergaderd2 && <Badge color="blue">1e ✓ · 2e loopt</Badge>}
            {!vve.datum1 && !afgerond && <Badge color="gray">Niet gepland</Badge>}
            {inVak1 && !vergaderd1 && <Badge color="orange">Vakantieperiode</Badge>}
            {inVak2 && !vergaderd2 && <Badge color="orange">2e in vakantie</Badge>}
            {!vergaderd1 && invBadge(inv1, "1e")}
            {!vergaderd2 && vve.datum2 && invBadge(inv2, "2e")}
          </div>
          <div className="flex gap-4 mt-0.5 flex-wrap">
            {vve.datum1 && (
              <span className="text-xs text-zinc-500">
                1e: <span className={vergaderd1 ? "text-emerald-600 line-through" : "text-zinc-400"}>{fmtDate(vve.datum1)}</span>
                {!uitgenodigd1 && !vergaderd1 && <span className="text-zinc-600 ml-1">· uitnodigen uiterlijk {fmtDate(addDays(vve.datum1, -INVITE_DAYS))}</span>}
                {uitgenodigd1 && !vergaderd1 && <span className="text-emerald-700 ml-1">· uitnodiging verstuurd</span>}
                {vergaderd1 && <span className="text-emerald-700 ml-1">· heeft plaatsgevonden</span>}
              </span>
            )}
            {vve.datum2 && (
              <span className="text-xs text-zinc-500">
                2e: <span className={vergaderd2 ? "text-emerald-600 line-through" : "text-zinc-400"}>{fmtDate(vve.datum2)}</span>
                {!uitgenodigd2 && !vergaderd2 && <span className="text-zinc-600 ml-1">· uitnodigen uiterlijk {fmtDate(addDays(vve.datum2, -INVITE_DAYS))}</span>}
                {uitgenodigd2 && !vergaderd2 && <span className="text-emerald-700 ml-1">· uitnodiging verstuurd</span>}
                {vergaderd2 && <span className="text-emerald-700 ml-1">· heeft plaatsgevonden</span>}
              </span>
            )}
          </div>
        </div>
        <span className="text-zinc-600 text-xs">{expanded?"▲":"▼"}</span>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800/60 px-4 py-4 bg-zinc-900/60 space-y-5">

          {/* 1e vergadering */}
          <div className="space-y-2">
            <span className="text-xs text-zinc-400 font-medium">1e vergadering</span>
            <input type="date" value={vve.datum1} onChange={e=>updateDatum1(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"/>
            {vve.datum1 && (
              <div className={`rounded-lg px-3 py-2.5 border ${
                inv1==="overdue" ? "border-red-900/50 bg-red-950/20" :
                inv1==="warning" ? "border-amber-900/50 bg-amber-950/20" :
                inv1==="confirmed" ? "border-emerald-900/40 bg-emerald-950/10" :
                "border-zinc-700/50 bg-zinc-800/40"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${
                    inv1==="overdue" ? "text-red-400" :
                    inv1==="warning" ? "text-amber-400" :
                    inv1==="confirmed" ? "text-emerald-400" : "text-zinc-400"}`}>
                    {inv1==="confirmed" ? "✉ Uitnodiging verstuurd" :
                     inv1==="overdue" ? "✉ Uitnodigingstermijn verlopen" :
                     inv1==="warning" ? `✉ Uitnodigen vóór ${fmtDate(addDays(vve.datum1,-INVITE_DAYS))}` :
                     `✉ Uitnodigen uiterlijk ${fmtDate(addDays(vve.datum1,-INVITE_DAYS))}`}
                  </span>
                  <Checkbox checked={uitgenodigd1} disabled={false}
                    onChange={v=>onUpdate({...vve, uitgenodigd1: v})}
                    label="Uitnodiging verstuurd"/>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <Checkbox checked={vergaderd1} disabled={false}
                onChange={v=>onUpdate({...vve, vergaderd1: v})}
                label="Vergadering heeft plaatsgevonden"/>
              <Checkbox checked={!!vve.needs2e} disabled={false}
                onChange={v=>onUpdate({...vve, needs2e: v, datum2: v ? vve.datum2 : "", uitgenodigd2: false, vergaderd2: false})}
                label="2e reglementaire vergadering nodig"/>
            </div>
            {vergaderd1 && !vve.needs2e && (
              <div className="border border-emerald-900/40 bg-emerald-950/10 rounded-lg px-3 py-2.5 space-y-1.5">
                <label className="text-xs text-emerald-400 font-medium block">📅 Voorkeursdatum volgend jaar</label>
                <p className="text-[10px] text-zinc-500">Optioneel — wordt meegenomen in de auto-planning voor {new Date().getFullYear() + 1}.</p>
                <input
                  type="date"
                  value={vve.voorkeurVolgendjaar || ""}
                  onChange={e => onUpdate({ ...vve, voorkeurVolgendjaar: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600"
                />
                {vve.voorkeurVolgendjaar && (
                  <p className="text-[10px] text-emerald-600">✓ Voorkeur opgeslagen: {fmtDate(vve.voorkeurVolgendjaar)}</p>
                )}
              </div>
            )}
          </div>

          {/* 2e vergadering */}
          {vve.needs2e && (
            <div className="space-y-2 border-t border-zinc-800/40 pt-4">
              <span className="text-xs text-zinc-400 font-medium">2e reglementaire vergadering</span>
              <div className="flex gap-2">
                <input type="date" value={vve.datum2||""} onChange={e=>updateDatum2(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"/>
                {vve.datum1 && !vve.datum2 && (
                  <button onClick={()=>onAdd2nd(vve)} className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-3 rounded transition-colors whitespace-nowrap">+3w</button>
                )}
              </div>
              {vve.datum2 && (
                <div className={`rounded-lg px-3 py-2.5 border ${
                  inv2==="overdue" ? "border-red-900/50 bg-red-950/20" :
                  inv2==="warning" ? "border-amber-900/50 bg-amber-950/20" :
                  inv2==="confirmed" ? "border-emerald-900/40 bg-emerald-950/10" :
                  "border-zinc-700/50 bg-zinc-800/40"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${
                      inv2==="overdue" ? "text-red-400" :
                      inv2==="warning" ? "text-amber-400" :
                      inv2==="confirmed" ? "text-emerald-400" : "text-zinc-400"}`}>
                      {inv2==="confirmed" ? "✉ Uitnodiging verstuurd" :
                       inv2==="overdue" ? "✉ Uitnodigingstermijn verlopen" :
                       inv2==="warning" ? `✉ Uitnodigen vóór ${fmtDate(addDays(vve.datum2,-INVITE_DAYS))}` :
                       `✉ Uitnodigen uiterlijk ${fmtDate(addDays(vve.datum2,-INVITE_DAYS))}`}
                    </span>
                    <Checkbox checked={uitgenodigd2} disabled={false}
                      onChange={v=>onUpdate({...vve, uitgenodigd2: v})}
                      label="Uitnodiging verstuurd"/>
                  </div>
                </div>
              )}
              {vve.datum2 && (
                <div className="flex items-center pt-1">
                  <Checkbox checked={vergaderd2} disabled={false}
                    onChange={v=>onUpdate({...vve, vergaderd2: v})}
                    label="Vergadering heeft plaatsgevonden"/>
                </div>
              )}
              {vergaderd2 && (
                <div className="border border-emerald-900/40 bg-emerald-950/10 rounded-lg px-3 py-2.5 space-y-1.5">
                  <label className="text-xs text-emerald-400 font-medium block">📅 Voorkeursdatum volgend jaar</label>
                  <p className="text-[10px] text-zinc-500">Optioneel — wordt meegenomen in de auto-planning voor {new Date().getFullYear() + 1}.</p>
                  <input
                    type="date"
                    value={vve.voorkeurVolgendjaar || ""}
                    onChange={e => onUpdate({ ...vve, voorkeurVolgendjaar: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600"
                  />
                  {vve.voorkeurVolgendjaar && (
                    <p className="text-[10px] text-emerald-600">✓ Voorkeur opgeslagen: {fmtDate(vve.voorkeurVolgendjaar)}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Notitie</label>
            <input type="text" value={vve.notitie||""} onChange={e=>onUpdate({...vve,notitie:e.target.value})}
              placeholder="Bijv. altijd dinsdag…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"/>
          </div>

          {/* Extra vergadering */}
          <div className="space-y-2 border-t border-zinc-800/40 pt-4">
            <Checkbox checked={!!vve.extraVergadering} disabled={false}
              onChange={v=>onUpdate({...vve, extraVergadering: v, datumExtra: v ? vve.datumExtra : "", uitgenodigdExtra: false, vergaderdExtra: false})}
              label="Extra vergadering"/>
            {vve.extraVergadering && (
              <div className="space-y-2 pl-1">
                <input type="date" value={vve.datumExtra||""}
                  onChange={e=>onUpdate({...vve, datumExtra: e.target.value, uitgenodigdExtra: false})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"/>
                {vve.datumExtra && (
                  <div className={`rounded-lg px-3 py-2.5 border ${
                    inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="overdue" ? "border-red-900/50 bg-red-950/20" :
                    inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="warning" ? "border-amber-900/50 bg-amber-950/20" :
                    inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="confirmed" ? "border-emerald-900/40 bg-emerald-950/10" :
                    "border-zinc-700/50 bg-zinc-800/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${
                        inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="overdue" ? "text-red-400" :
                        inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="warning" ? "text-amber-400" :
                        inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="confirmed" ? "text-emerald-400" : "text-zinc-400"}`}>
                        {inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="confirmed" ? "✉ Uitnodiging verstuurd" :
                         inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="overdue" ? "✉ Uitnodigingstermijn verlopen" :
                         inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="warning" ? `✉ Uitnodigen vóór ${fmtDate(addDays(vve.datumExtra,-INVITE_DAYS))}` :
                         `✉ Uitnodigen uiterlijk ${fmtDate(addDays(vve.datumExtra,-INVITE_DAYS))}`}
                      </span>
                      <Checkbox checked={!!vve.uitgenodigdExtra} disabled={false}
                        onChange={v=>onUpdate({...vve, uitgenodigdExtra: v})}
                        label="Uitnodiging verstuurd"/>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-1">
                  <Checkbox checked={!!vve.uitgenodigdExtra} disabled={false}
                    onChange={v=>onUpdate({...vve, uitgenodigdExtra: v})}
                    label="Uitnodiging verstuurd"/>
                  <Checkbox checked={!!vve.vergaderdExtra} disabled={false}
                    onChange={v=>onUpdate({...vve, vergaderdExtra: v})}
                    label="Vergadering heeft plaatsgevonden"/>
                </div>
              </div>
            )}
          </div>

          {/* Kosten reminder */}
          {(vve.needs2e || vve.extraVergadering) && (
            <p className="text-[10px] text-amber-600/80 border-t border-zinc-800/40 pt-3">
              💡 Vergeet niet de kosten in rekening te brengen
              {vve.needs2e && vve.extraVergadering ? " voor de 2e reglementaire vergadering en de extra vergadering." :
               vve.needs2e ? " voor de 2e reglementaire vergadering." :
               " voor de extra vergadering."}
            </p>
          )}

          <div className="flex justify-end">
            <button onClick={()=>onDelete(vve.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors">Verwijder VvE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Werkdagen selector ───────────────────────────────────────────
function WerkdagenSelector({ werkdagen, onChange }) {
  const displayOrder = [1,2,3,4,5,6,0];
  const displayLabels = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
  return (
    <div className="flex gap-2">
      {displayOrder.map((dow, i) => (
        <button
          key={dow}
          onClick={() => {
            const updated = [...werkdagen];
            updated[dow] = !updated[dow];
            onChange(updated);
          }}
          className={`w-9 h-9 rounded-lg text-xs font-medium transition-all ${werkdagen[dow] ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}
        >
          {displayLabels[i]}
        </button>
      ))}
    </div>
  );
}

// ── Heatmap Kalender ─────────────────────────────────────────────
function HeatmapKalender({ vves }) {
  const year = new Date().getFullYear();
  const todayIso = new Date().toISOString().slice(0,10);
  const NL_MONTHS_HM = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
  const DOW_LABELS = ["Ma","Di","Wo","Do","Vr","Za","Zo"];

  const dagMap = {};
  vves.forEach(v => {
    [v.datum1, v.datum2, v.datumExtra].filter(Boolean).forEach(d => {
      if (d.startsWith(String(year))) {
        if (!dagMap[d]) dagMap[d] = [];
        dagMap[d].push(v.naam);
      }
    });
  });

  const allCounts = Object.values(dagMap).map(a => a.length);
  const totalVergaderingen = allCounts.reduce((s,n) => s+n, 0);

  const maandCounts = {};
  Object.keys(dagMap).forEach(d => {
    const m = parseInt(d.slice(5,7)) - 1;
    maandCounts[m] = (maandCounts[m]||0) + dagMap[d].length;
  });
  const busyEntry = Object.entries(maandCounts).sort((a,b) => b[1]-a[1])[0];
  const druksteMaand = busyEntry ? NL_MONTHS_HM[parseInt(busyEntry[0])].slice(0,3) + ` (${busyEntry[1]})` : "—";
  const todayCount = dagMap[todayIso]?.length || 0;

  function cellClass(count) {
    if (!count) return "bg-zinc-800";
    if (count === 1) return "bg-green-800";
    if (count === 2) return "bg-green-600";
    if (count <= 3) return "bg-amber-500";
    return "bg-red-500";
  }

  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Totaal dit jaar", totalVergaderingen, "vergaderingen"],
          ["Drukste maand", druksteMaand, ""],
          ["Vandaag", todayCount || "—", todayCount ? "ingepland" : "vrij"],
          ["Gem. per maand", Math.round(totalVergaderingen/12), "vergaderingen"],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xl font-mono font-bold text-zinc-100">{value}</p>
            {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Minder</span>
        {["bg-zinc-800","bg-green-800","bg-green-600","bg-amber-500","bg-red-500"].map((c,i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${c}`}/>
        ))}
        <span>Meer</span>
        <span className="ml-3 text-zinc-600">Weekend = gedempt</span>
      </div>

      <div className="grid grid-cols-4 gap-5">
        {NL_MONTHS_HM.map((maand, m) => {
          const daysInMonth = new Date(year, m+1, 0).getDate();
          const firstDow = new Date(year, m, 1).getDay();
          const offset = firstDow === 0 ? 6 : firstDow - 1;
          return (
            <div key={m}>
              <p className="text-xs font-medium text-zinc-400 mb-1.5">{maand}</p>
              <div className="grid grid-cols-7 gap-0.5">
                {DOW_LABELS.map(d => (
                  <div key={d} className="text-center text-[8px] text-zinc-600 pb-0.5">{d[0]}</div>
                ))}
                {Array.from({length: offset}).map((_,i) => <div key={`e${i}`}/>)}
                {Array.from({length: daysInMonth}).map((_, i) => {
                  const day = i + 1;
                  const iso = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const names = dagMap[iso] || [];
                  const count = names.length;
                  const dow = new Date(year, m, day).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = iso === todayIso;
                  return (
                    <div
                      key={day}
                      className={`aspect-square rounded-sm cursor-default transition-transform hover:scale-125 hover:z-10 relative ${cellClass(count)} ${isWeekend ? "opacity-30" : ""} ${isToday ? "ring-1 ring-white ring-offset-1 ring-offset-zinc-950" : ""}`}
                      onMouseEnter={e => { if (count > 0) setTooltip({ iso, names, x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 pointer-events-none shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="font-medium text-zinc-100 mb-1">{fmtDate(tooltip.iso)}</p>
          <p className="text-zinc-400">{tooltip.names.length} vergadering{tooltip.names.length > 1 ? "en" : ""}</p>
          <p className="text-zinc-500 mt-0.5">{tooltip.names.slice(0,3).join(", ")}{tooltip.names.length > 3 ? ` +${tooltip.names.length-3}` : ""}</p>
        </div>
      )}
    </div>
  );
}

// ── Admin stats ──────────────────────────────────────────────────
function calcStats(data) {
  if (!data) return null;
  const vves = data.vves||[];
  const vakanties = data.vakanties||[];
  const total = vves.length;
  // FIX 4 in admin too
  const afgerond = vves.filter(v => isAfgerond(v)).length;
  const uitgenodigd = vves.filter(v => (v.uitgenodigd1 || v.uitgenodigd2) && !isAfgerond(v)).length;
  const nietUitgenodigd = total - uitgenodigd - afgerond;
  const uitnodigingUrgent = vves.filter(v => {
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    return (!v.vergaderd1 && (s1==="warning"||s1==="overdue")) ||
           (!v.vergaderd2 && (s2==="warning"||s2==="overdue"));
  }).length;
  const voorbijZonder2e = vves.filter(v=>v.datum1&&v.datum1<today()&&!v.datum2&&!v.vergaderd1).length;
  const inVakantie = vves.filter(v=>(v.datum1&&isInVakantie(v.datum1,vakanties))||(v.datum2&&isInVakantie(v.datum2,vakanties))).length;
  const pctAfgerond = total===0?0:Math.round((afgerond/total)*100);
  const pctUitgenodigd = total===0?0:Math.round((uitgenodigd/total)*100);
  const year = new Date().getFullYear();
  const q4 = vves.filter(v=>{ const k=monthKey(v.datum1); return k&&k>=`${year}-10`; }).length;
  return { total, afgerond, uitgenodigd, nietUitgenodigd, uitnodigingUrgent, inVakantie, voorbijZonder2e, pctAfgerond, pctUitgenodigd, q4 };
}
function riskLevel(stats) {
  if (!stats||stats.total===0) return "gray";
  if (stats.uitnodigingUrgent>0||stats.voorbijZonder2e>2) return "red";
  if (stats.pctAfgerond<40||stats.q4>20||stats.inVakantie>0) return "orange";
  if (stats.pctAfgerond<70) return "blue";
  return "green";
}

// ── Admin Dashboard ──────────────────────────────────────────────
function AdminDashboard({ beheerderList, onBack }) {
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [herindelenVan, setHerindelenVan] = useState(null);
  const [herindelenVve, setHerindelenVve] = useState(null);
  const [herindelenNaar, setHerindelenNaar] = useState("");
  const [herindelenMsg, setHerindelenMsg] = useState("");

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const yearPct = Math.round(((now - yearStart) / (yearEnd - yearStart)) * 100);

  const herindelen = async (vve, vanNaam, naarNaam) => {
    if (!naarNaam || naarNaam === vanNaam) return;
    const vanData = allData[vanNaam];
    const naarData = allData[naarNaam] || defaultData();
    if (!vanData) return;
    const updatedVan = { ...vanData, vves: vanData.vves.filter(v => v.id !== vve.id) };
    const updatedNaar = { ...naarData, vves: [...(naarData.vves||[]), vve] };
    await saveData(vanNaam, updatedVan);
    await saveData(naarNaam, updatedNaar);
    setAllData(prev => ({ ...prev, [vanNaam]: updatedVan, [naarNaam]: updatedNaar }));
    setHerindelenVve(null); setHerindelenVan(null); setHerindelenNaar("");
    setHerindelenMsg(`${vve.naam} verplaatst naar ${naarNaam}.`);
    setTimeout(() => setHerindelenMsg(""), 3000);
  };

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const result = await loadAllData(beheerderList);
      setAllData(result);
      setLoading(false);
    }
    fetchAll();
  }, [beheerderList]);

  const allVves = Object.values(allData).flatMap(d=>d?.vves||[]);
  const totaalAfgerond = allVves.filter(v => isAfgerond(v)).length;
  const totaalUitgenodigd = allVves.filter(v => (v.uitgenodigd1 || v.uitgenodigd2) && !isAfgerond(v)).length;
  const totaalNietUitgenodigd = allVves.length - totaalUitgenodigd - totaalAfgerond;
  const totaalUitnodiging = allVves.filter(v => {
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    return (!v.vergaderd1 && (s1==="warning"||s1==="overdue")) ||
           (!v.vergaderd2 && v.datum2 && (s2==="warning"||s2==="overdue"));
  }).length;
  const globalCounts = spreadScore(allVves);
  const riskBorder = { red:"border-red-800/60 bg-red-950/20", orange:"border-amber-800/50 bg-amber-950/10", blue:"border-sky-800/40 bg-sky-950/10", green:"border-zinc-800 bg-zinc-900", gray:"border-zinc-800 bg-zinc-900" };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛡️</span>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Admin Dashboard</h1>
            <p className="text-xs text-zinc-500">Overzicht alle beheerders — {new Date().getFullYear()}</p>
          </div>
        </div>
        <button onClick={onBack} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">← Terug</button>
      </div>
      <div className="border-b border-zinc-800 px-6 py-4 grid grid-cols-4 gap-3">
        {[
          [allVves.length, "Totaal VvE's", "text-zinc-100", false],
          [totaalAfgerond, "Afgerond", "text-emerald-400", false],
          [totaalUitgenodigd, "Uitgenodigd", "text-sky-400", false],
          [totaalUitnodiging, "Uitnodiging urgent", totaalUitnodiging>0?"text-red-400":"text-zinc-600", totaalUitnodiging>0],
        ].map(([val,label,color,ring])=>(
          <div key={label} className={`bg-zinc-900 rounded-lg p-3 text-center ${ring?"ring-1 ring-red-700/50":""}`}>
            <div className={`text-2xl font-mono font-bold ${color}`}>{val}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {allVves.length > 0 && (() => {
          const avgAfgerondPct = Math.round((totaalAfgerond / allVves.length) * 100);
          const diff = avgAfgerondPct - yearPct;
          const color = diff >= 0 ? "emerald" : diff >= -10 ? "amber" : "red";
          const label = diff >= 5 ? "Voorloopt op schema" : diff >= -5 ? "Loopt op schema" : diff >= -15 ? "Loopt licht achter" : "Loopt achter op schema";
          return (
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${color==="emerald"?"border-emerald-800/50 bg-emerald-950/20":color==="amber"?"border-amber-800/50 bg-amber-950/20":"border-red-800/50 bg-red-950/20"}`}>
              <div className={`text-2xl font-mono font-bold ${color==="emerald"?"text-emerald-400":color==="amber"?"text-amber-400":"text-red-400"}`}>{avgAfgerondPct}%</div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${color==="emerald"?"text-emerald-300":color==="amber"?"text-amber-300":"text-red-300"}`}>{label}</span>
                  <span className="text-xs text-zinc-500">{yearPct}% van het jaar verstreken</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full ${color==="emerald"?"bg-emerald-600":color==="amber"?"bg-amber-500":"bg-red-600"}`} style={{width:`${avgAfgerondPct}%`}}/>
                  <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-400/60" style={{left:`${yearPct}%`}}/>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">Streepje = huidig punt in het jaar · Balk = % afgerond</p>
              </div>
            </div>
          );
        })()}

        {herindelenMsg && <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-4 py-2 text-xs text-emerald-300">{herindelenMsg}</div>}

        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Totale spreiding alle beheerders</h2>
          <MonthBar counts={globalCounts} vakanties={[]}/>
        </div>
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Status per beheerder</h2>
          {loading && <p className="text-sm text-zinc-600">Laden…</p>}
          <div className="space-y-3">
            {beheerderList.map(naam => {
              const stats = calcStats(allData[naam]);
              const risk = riskLevel(stats);
              const isOpen = expanded===naam;
              return (
                <div key={naam} className={`rounded-xl border overflow-hidden ${riskBorder[risk]}`}>
                  <div className="px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={()=>setExpanded(isOpen?null:naam)}>
                    <div className="flex items-center gap-4">
                      <div className="w-36 shrink-0"><span className="text-sm font-semibold text-zinc-200">{naam}</span></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-zinc-500">{stats?.afgerond||0} afgerond · {stats?.uitgenodigd||0} uitgenodigd / {stats?.total||0}</span>
                          <span className="text-[10px] font-mono text-zinc-400">{stats?.pctAfgerond||0}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                          <div className="h-full transition-all duration-700 bg-emerald-600" style={{width:`${stats?.pctAfgerond||0}%`}}/>
                          <div className="h-full transition-all duration-700 bg-sky-600" style={{width:`${stats?.pctUitgenodigd||0}%`}}/>
                        </div>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[9px] text-emerald-700">■ Afgerond</span>
                          <span className="text-[9px] text-sky-700">■ Uitgenodigd</span>
                          <span className="text-[9px] text-zinc-700">■ Niet uitgenodigd</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end w-56 shrink-0">
                        {stats?.nietUitgenodigd>0 && <Badge color="gray">{stats.nietUitgenodigd} niet uitgenodigd</Badge>}
                        {stats?.uitgenodigd>0 && !stats?.uitnodigingUrgent && <Badge color="blue">{stats.uitgenodigd} uitgenodigd</Badge>}
                        {stats?.uitnodigingUrgent>0 && <Badge color="red">⚠ {stats.uitnodigingUrgent} uitnodiging</Badge>}
                        {stats?.voorbijZonder2e>0 && <Badge color="orange">{stats.voorbijZonder2e} geen 2e</Badge>}
                        {stats?.inVakantie>0 && <Badge color="orange">{stats.inVakantie} vakantie</Badge>}
                        {stats?.q4>15 && <Badge color="orange">Q4: {stats.q4}</Badge>}
                        {risk==="green"&&stats?.total>0 && <Badge color="green">Op schema</Badge>}
                        {(!stats||stats.total===0) && <Badge color="gray">Geen data</Badge>}
                      </div>
                      <span className="text-zinc-600 text-xs ml-1">{isOpen?"▲":"▼"}</span>
                    </div>
                  </div>
                  {isOpen && stats && (
                    <div className="border-t border-zinc-800/60 px-5 py-4 space-y-4 bg-zinc-950/40">
                      <div>
                        <p className="text-[10px] text-zinc-600 mb-2 uppercase tracking-wide">Spreiding {naam}</p>
                        <MonthBar counts={spreadScore(allData[naam]?.vves||[])} vakanties={allData[naam]?.vakanties||[]}/>
                      </div>
                      {(stats.uitnodigingUrgent>0||stats.voorbijZonder2e>0||stats.nietUitgenodigd>0) && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Aandachtspunten</p>
                          {(allData[naam]?.vves||[]).filter(v => {
                            const s = inviteStatus(v.datum1, v.uitgenodigd1);
                            return !v.vergaderd1 && (s==="warning"||s==="overdue");
                          }).map(v=>(
                            <div key={v.id} className="flex items-center gap-2 text-xs text-red-300 bg-red-950/20 border border-red-900/30 rounded px-3 py-1.5">
                              <span>✉</span><span className="font-medium">{v.naam}</span>
                              <span className="text-red-500">— uitnodigen vóór {fmtDate(addDays(v.datum1,-INVITE_DAYS))}</span>
                            </div>
                          ))}
                          {(allData[naam]?.vves||[]).filter(v=>v.datum1&&v.datum1<today()&&!v.datum2&&!v.vergaderd1).map(v=>(
                            <div key={v.id} className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/20 border border-amber-900/30 rounded px-3 py-1.5">
                              <span>↩</span><span className="font-medium">{v.naam}</span><span className="text-amber-500">— 1e voorbij, geen 2e gepland</span>
                            </div>
                          ))}
                          {(allData[naam]?.vves||[]).filter(v=>!v.uitgenodigd1&&!v.uitgenodigd2&&!v.vergaderd1).slice(0,5).map(v=>(
                            <div key={v.id} className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5">
                              <span className="text-zinc-600">·</span><span className="font-medium">{v.naam}</span><span className="text-zinc-600">— nog niet uitgenodigd</span>
                            </div>
                          ))}
                          {stats.nietUitgenodigd>5 && <p className="text-[10px] text-zinc-600 pl-3">… en {stats.nietUitgenodigd-5} andere niet-uitgenodigde VvE's</p>}
                        </div>
                      )}
                      {risk==="green" && <p className="text-xs text-emerald-500">✓ Alles op schema. Geen actie vereist.</p>}
                      <div className="border-t border-zinc-800/60 pt-3 mt-2">
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">VvE herindelen naar andere beheerder</p>
                        {herindelenVan === naam && herindelenVve ? (
                          <div className="flex gap-2 items-center flex-wrap">
                            <span className="text-xs text-zinc-400 shrink-0">"{herindelenVve.naam}" →</span>
                            <select value={herindelenNaar} onChange={e=>setHerindelenNaar(e.target.value)}
                              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none">
                              <option value="">Kies beheerder…</option>
                              {beheerderList.filter(n=>n!==naam).map(n=><option key={n} value={n}>{n}</option>)}
                            </select>
                            <button onClick={()=>herindelen(herindelenVve, naam, herindelenNaar)} disabled={!herindelenNaar} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-200 text-xs rounded transition-colors">Verplaats</button>
                            <button onClick={()=>{setHerindelenVve(null);setHerindelenVan(null);}} className="text-xs text-zinc-500 hover:text-zinc-400">Annuleer</button>
                          </div>
                        ) : (
                          <select value="" onChange={e=>{
                            const vve = (allData[naam]?.vves||[]).find(v=>v.id===e.target.value);
                            if (vve) { setHerindelenVve(vve); setHerindelenVan(naam); setHerindelenNaar(""); }
                          }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-400 focus:outline-none">
                            <option value="">Selecteer VvE om te herindelen…</option>
                            {(allData[naam]?.vves||[]).map(v=><option key={v.id} value={v.id}>{v.naam}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login");
  const [beheerder, setBeheerder] = useState("");
  const [beheerderList] = useState(getBeheerderList());
  const [data, setData] = useState(defaultData());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("vergaderingen");
  const [newVveName, setNewVveName] = useState("");
  const [search, setSearch] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [loginNaam, setLoginNaam] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [planningPreview, setPlanningPreview] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("vve-theme");
    return saved ? saved === "dark" : true;
  });

  // FIX 1: gesorteerde volgorde staat los van data
  // We bewaren een gesorteerde ID-volgorde en passen die toe bij weergave
  const [sortedOrder, setSortedOrder] = useState(null); // null = nog niet gesorteerd
  // FIX 3: welke VvE moet geforceerd opengaan
  const [forceOpenId, setForceOpenId] = useState(null);
  // FIX 2: maandfilter
  const [filterJaar2027, setFilterJaar2027] = useState(false);
  const [geselecteerdeFilterMaanden, setGeselecteerdeFilterMaanden] = useState(new Set());

  const toggleTheme = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem("vve-theme", next ? "dark" : "light");
      return next;
    });
  };

  const t = {
    bg:        darkMode ? "bg-zinc-950"    : "bg-gray-50",
    bgCard:    darkMode ? "bg-zinc-900"    : "bg-white",
    bgInput:   darkMode ? "bg-zinc-800"    : "bg-gray-100",
    bgHover:   darkMode ? "hover:bg-zinc-800/30" : "hover:bg-gray-50",
    border:    darkMode ? "border-zinc-800" : "border-gray-200",
    borderIn:  darkMode ? "border-zinc-700" : "border-gray-300",
    text:      darkMode ? "text-zinc-200"  : "text-gray-800",
    textMuted: darkMode ? "text-zinc-500"  : "text-gray-500",
    textDim:   darkMode ? "text-zinc-600"  : "text-gray-400",
    textHead:  darkMode ? "text-zinc-100"  : "text-gray-900",
    textInput: darkMode ? "text-zinc-200"  : "text-gray-800",
    tabActive: darkMode ? "border-zinc-400 text-zinc-100" : "border-gray-700 text-gray-900",
    tabInact:  darkMode ? "border-transparent text-zinc-500 hover:text-zinc-400" : "border-transparent text-gray-500 hover:text-gray-700",
    btnSec:    darkMode ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-gray-200 hover:bg-gray-300 text-gray-700",
    rowBorder: darkMode ? "border-zinc-800" : "border-gray-200",
    expanded:  darkMode ? "border-zinc-800/60 bg-zinc-900/60" : "border-gray-200 bg-gray-50",
  };

  const handleLogin = async () => {
    const account = findAccount(loginNaam, loginPw);
    if (!account) { setLoginError("Naam of wachtwoord onjuist."); return; }
    if (account.rol === "admin") { setScreen("admin"); setLoginError(""); return; }
    setLoading(true);
    setBeheerder(account.naam);
    const d = await loadData(account.naam);
    setData(d || defaultData());
    setLoading(false);
    setScreen("main");
    setLoginError("");
  };

  const [saving, setSaving] = useState(false);

  const persist = useCallback(async (newData) => {
    setData(newData);
    setSaving(true);
    await saveData(beheerder, newData);
    setSaving(false);
  }, [beheerder]);

  const addVve = async () => {
    const naam = newVveName.trim(); if (!naam) return;
    await persist({ ...data, vves: [...data.vves, newVve(naam)] });
    setNewVveName("");
  };
  const updateVve = async (u) => await persist({ ...data, vves: data.vves.map(v=>v.id===u.id?u:v) });
  const deleteVve = async (id) => {
    await persist({ ...data, vves: data.vves.filter(v=>v.id!==id) });
    // remove from sorted order too
    setSortedOrder(prev => prev ? prev.filter(sid => sid !== id) : null);
  };
  const add2nd = async (vve) => await updateVve({ ...vve, datum2: addDays(vve.datum1, INVITE_DAYS+3) });
  const addVakantie = async () => await persist({ ...data, vakanties: [...data.vakanties, { id:Date.now().toString(), naam:"", van:"", tot:"" }] });
  const updateVakantie = async (v) => await persist({ ...data, vakanties: data.vakanties.map(x=>x.id===v.id?v:x) });
  const deleteVakantie = async (id) => await persist({ ...data, vakanties: data.vakanties.filter(v=>v.id!==id) });
  const updateWerkdagen = async (wd) => await persist({ ...data, werkdagen: wd });

  const handleImport = async () => {
    const lines = importText.split("\n").map(l => l.trim()).filter(Boolean);
    const existing = new Set(data.vves.map(v => v.naam.toLowerCase()));
    const nieuwen = lines
      .map(parseImportLine)
      .filter(p => p && !existing.has(p.naam.toLowerCase()))
      .map(p => newVve(p.naam, p.datum1));
    await persist({ ...data, vves: [...data.vves, ...nieuwen] });
    setImportText(""); setShowImport(false);
  };

  const [hideAfgerond, setHideAfgerond] = useState(false);
  const [selectie, setSelectie] = useState(new Set());

  // ── FIX 1 + 5: Sorteer functie ───────────────────────────────
  // VvE's zonder voorkeurVolgendjaar komen eerst, gesorteerd op datum1/datum2/datumExtra
  // VvE's met voorkeurVolgendjaar komen daarna, gesorteerd op voorkeurVolgendjaar
  const handleSorteer = () => {
    const vves = planningPreview || data.vves;
    const year = new Date().getFullYear();
    const nextYear = year + 1;

    // Splits in twee groepen
    const metVoorkeur = vves.filter(v => v.voorkeurVolgendjaar);
    const zonderVoorkeur = vves.filter(v => !v.voorkeurVolgendjaar);

    const sortDatum = (v) => v.datumExtra || v.datum2 || v.datum1 || "9999-99-99";

    zonderVoorkeur.sort((a, b) => sortDatum(a).localeCompare(sortDatum(b)));
    metVoorkeur.sort((a, b) => (a.voorkeurVolgendjaar || "").localeCompare(b.voorkeurVolgendjaar || ""));

    const gesorteerd = [...zonderVoorkeur, ...metVoorkeur];
    setSortedOrder(gesorteerd.map(v => v.id));
  };

  // Planning
  const handleGeneratePlanning = () => {
    const proposed = generatePlanning(data.vves, data.vakanties, data.werkdagen || WORK_DAYS_DEFAULT);
    setPlanningPreview(proposed);
  };
  const handleConfirmPlanning = async () => {
    await persist({ ...data, vves: planningPreview });
    setPlanningPreview(null);
    setSortedOrder(null); // reset sortering na nieuwe planning
  };
  const handleRejectPlanning = () => setPlanningPreview(null);

  const begroeting = () => {
    const uur = new Date().getHours();
    if (uur < 12) return "Goedemorgen";
    if (uur < 18) return "Goedemiddag";
    return "Goedenavond";
  };

  const aantalUitTeNodigen = data.vves.filter(v => {
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    const sE = inviteStatus(v.datumExtra, v.uitgenodigdExtra);
    return (!v.vergaderd1 && (s1==="warning"||s1==="overdue")) ||
           (v.needs2e && !v.vergaderd2 && (s2==="warning"||s2==="overdue")) ||
           (v.extraVergadering && !v.vergaderdExtra && (sE==="warning"||sE==="overdue"));
  }).length;

  const exportExcel = () => {
    const year = new Date().getFullYear();
    const rows = [["VvE", "1e vergadering", "Uitgenodigd 1e", "Vergaderd 1e", "2e reglementair", "2e vergadering", "Uitgenodigd 2e", "Vergaderd 2e", "Extra vergadering", "Extra datum", "Uitgenodigd extra", "Vergaderd extra", "Voorkeur volgend jaar", "Notitie"]];
    data.vves.forEach(v => {
      rows.push([
        v.naam, v.datum1 ? fmtDate(v.datum1) : "", v.uitgenodigd1 ? "Ja" : "Nee", v.vergaderd1 ? "Ja" : "Nee",
        v.needs2e ? "Ja" : "Nee", v.datum2 ? fmtDate(v.datum2) : "", v.uitgenodigd2 ? "Ja" : "Nee", v.vergaderd2 ? "Ja" : "Nee",
        v.extraVergadering ? "Ja" : "Nee", v.datumExtra ? fmtDate(v.datumExtra) : "", v.uitgenodigdExtra ? "Ja" : "Nee", v.vergaderdExtra ? "Ja" : "Nee",
        v.voorkeurVolgendjaar ? fmtDate(v.voorkeurVolgendjaar) : "", v.notitie || "",
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `VvE_Planning_${beheerder}_${year}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const year = new Date().getFullYear();
    let html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:20px}h1{font-size:16px;color:#991A21;margin-bottom:4px}h2{font-size:12px;color:#991A21;margin:16px 0 6px;border-bottom:1px solid #991A21;padding-bottom:2px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th{background:#991A21;color:white;padding:4px 6px;text-align:left;font-size:10px}td{padding:3px 6px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even) td{background:#faf7f7}.ok{color:#059669}.warn{color:#d97706}.sub{color:#888;font-size:9px}</style></head><body>`;
    html += `<h1>VvE Vergaderplanning ${year} — ${beheerder}</h1><p class="sub">Gegenereerd op ${fmtDate(new Date().toISOString().slice(0,10))}</p>`;
    NL_MONTHS_FULL.forEach((maand, mi) => {
      const key = `${year}-${String(mi+1).padStart(2,"0")}`;
      const vves = data.vves.filter(v => (v.datum1&&v.datum1.startsWith(key))||(v.datum2&&v.datum2.startsWith(key))||(v.datumExtra&&v.datumExtra.startsWith(key)));
      if (vves.length === 0) return;
      html += `<h2>${maand} (${vves.length})</h2><table><tr><th>VvE</th><th>Datum</th><th>Type</th><th>Status</th></tr>`;
      vves.forEach(v => {
        const rijen = [];
        if (v.datum1&&v.datum1.startsWith(key)) rijen.push({datum:v.datum1,type:"1e vergadering",status:v.vergaderd1?"Afgerond":v.uitgenodigd1?"Uitgenodigd":"Open"});
        if (v.datum2&&v.datum2.startsWith(key)) rijen.push({datum:v.datum2,type:"2e reglementair",status:v.vergaderd2?"Afgerond":v.uitgenodigd2?"Uitgenodigd":"Open"});
        if (v.datumExtra&&v.datumExtra.startsWith(key)) rijen.push({datum:v.datumExtra,type:"Extra",status:v.vergaderdExtra?"Afgerond":v.uitgenodigdExtra?"Uitgenodigd":"Open"});
        rijen.forEach(r => { html += `<tr><td>${v.naam}</td><td>${fmtDate(r.datum)}</td><td>${r.type}</td><td class="${r.status==="Afgerond"?"ok":r.status==="Uitgenodigd"?"warn":""}">${r.status}</td></tr>`; });
      });
      html += `</table>`;
    });
    html += `</body></html>`;
    const win = window.open("","_blank"); win.document.write(html); win.document.close(); win.print();
  };

  const werkdagen = data.werkdagen || WORK_DAYS_DEFAULT;
  const counts = spreadScore(planningPreview || data.vves);
  const ongepland = data.vves.filter(v=>!v.datum1).length;
  // FIX 4: gebruik isAfgerond
  const uitgenodigd = data.vves.filter(v=> (v.uitgenodigd1 || v.uitgenodigd2) && !isAfgerond(v)).length;
  const afgerond = data.vves.filter(v=> isAfgerond(v)).length;
  const nietUitgenodigd = data.vves.length - uitgenodigd - afgerond;
  const metWaarschuwing = data.vves.filter(v => {
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    const sE = inviteStatus(v.datumExtra, v.uitgenodigdExtra);
    return (!v.vergaderd1 && (s1==="warning"||s1==="overdue")) ||
           (v.needs2e && !v.vergaderd2 && v.datum2 && (s2==="warning"||s2==="overdue")) ||
           (v.extraVergadering && !v.vergaderdExtra && v.datumExtra && (sE==="warning"||sE==="overdue"));
  }).length;
  const inVakantie = data.vves.filter(v=>(v.datum1&&isInVakantie(v.datum1,data.vakanties))||(v.datum2&&isInVakantie(v.datum2,data.vakanties))).length;

  const urgentItems = data.vves.flatMap(v => {
    const items = [];
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    const sE = inviteStatus(v.datumExtra, v.uitgenodigdExtra);
    if (!v.vergaderd1 && (s1==="warning"||s1==="overdue"))
      items.push({ id: v.id+"_u1", vveId: v.id, naam: v.naam, type: s1==="overdue"?"overdue":"warning", datum: v.datum1, deadline: addDays(v.datum1,-INVITE_DAYS) });
    if (v.needs2e && v.datum2 && !v.vergaderd2 && (s2==="warning"||s2==="overdue"))
      items.push({ id: v.id+"_u2", vveId: v.id, naam: v.naam, type: s2==="overdue"?"overdue":"warning", datum: v.datum2, deadline: addDays(v.datum2,-INVITE_DAYS), is2e: true });
    if (v.extraVergadering && v.datumExtra && !v.vergaderdExtra && (sE==="warning"||sE==="overdue"))
      items.push({ id: v.id+"_uE", vveId: v.id, naam: v.naam, type: sE==="overdue"?"overdue":"warning", datum: v.datumExtra, deadline: addDays(v.datumExtra,-INVITE_DAYS), isExtra: true });
    if (v.datum1 && v.datum1 < today() && !v.needs2e && !v.vergaderd1)
      items.push({ id: v.id+"_2e", vveId: v.id, naam: v.naam, type: "geen2e", datum: v.datum1 });
    return items;
  });

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const yearPct = Math.round(((now - yearStart) / (yearEnd - yearStart)) * 100);
  const afgerondPct = data.vves.length === 0 ? 0 : Math.round((afgerond / data.vves.length) * 100);
  const onTrackDiff = afgerondPct - yearPct;

  // ── FIX 2: Maandfilter toggle ─────────────────────────────────
  const toggleFilterMaand = (key) => {
    setGeselecteerdeFilterMaanden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Bouw de gefilterde + gesorteerde lijst ───────────────────
  const bronVves = planningPreview || data.vves;

  // Stap 1: sorteer op basis van sortedOrder (of standaard volgorde)
  let ordered;
  if (sortedOrder) {
    const idMap = Object.fromEntries(bronVves.map(v => [v.id, v]));
    ordered = sortedOrder.map(id => idMap[id]).filter(Boolean);
    // nieuwe VvE's die nog niet in sortedOrder zitten, achteraan
    const inOrder = new Set(sortedOrder);
    const nieuwen = bronVves.filter(v => !inOrder.has(v.id));
    ordered = [...ordered, ...nieuwen];
  } else {
    ordered = [...bronVves];
  }

  // Stap 2: zoekfilter
  let filtered = ordered.filter(v => v.naam.toLowerCase().includes(search.toLowerCase()));

  // Stap 3: verberg afgerond (FIX 4)
  if (hideAfgerond) {
    filtered = filtered.filter(v => !isAfgerond(v));
  }

  // Stap 4: maandfilter (FIX 2)
  if (geselecteerdeFilterMaanden.size > 0) {
    filtered = filtered.filter(v => {
      const datums = [v.datum1, v.datum2, v.datumExtra, v.voorkeurVolgendjaar].filter(Boolean);
      return datums.some(d => geselecteerdeFilterMaanden.has(d.slice(0, 7)));
    });
  }

  const toggleSelectie = (id) => setSelectie(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selecteerAlles = () => setSelectie(new Set(filtered.map(v => v.id)));
  const deselecteerAlles = () => setSelectie(new Set());
  const verwijderSelectie = async () => {
    if (!window.confirm(`${selectie.size} VvE${selectie.size > 1 ? "'s" : ""} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    await persist({ ...data, vves: data.vves.filter(v => !selectie.has(v.id)) });
    setSortedOrder(prev => prev ? prev.filter(id => !selectie.has(id)) : null);
    setSelectie(new Set());
  };

  // ── FIX 2: maanden met VvE's (voor filter in zijbalk) ────────
  const year = new Date().getFullYear();
  const nextYear = year + 1;

  const maandenMetVves2026 = NL_MONTHS.map((m, i) => {
    const key = `${year}-${String(i+1).padStart(2,"0")}`;
    const count = bronVves.filter(v => [v.datum1, v.datum2, v.datumExtra].filter(Boolean).some(d => d.startsWith(key))).length;
    return { key, label: m, count };
  }).filter(m => m.count > 0);

  const maandenMetVves2027 = NL_MONTHS.map((m, i) => {
    const key = `${nextYear}-${String(i+1).padStart(2,"0")}`;
    const count = bronVves.filter(v => (v.voorkeurVolgendjaar || "").startsWith(key)).length;
    return { key, label: m, count };
  }).filter(m => m.count > 0);

  // ── Screens ──────────────────────────────────────────────────
  if (screen==="admin") return <AdminDashboard beheerderList={beheerderList} onBack={()=>{ setScreen("login"); setLoginNaam(""); setLoginPw(""); }}/>;

  if (screen==="login") return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 mb-4"><span className="text-xl">🏢</span></div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">VvE Vergaderplanner</h1>
          <p className="text-sm text-zinc-500 mt-1">Log in om door te gaan</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Naam</label>
            <input autoFocus value={loginNaam} onChange={e=>{ setLoginNaam(e.target.value); setLoginError(""); }} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Jouw naam"
              className={`w-full bg-zinc-800 border rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none ${loginError?"border-red-700":"border-zinc-700 focus:border-zinc-600"}`}/>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Wachtwoord</label>
            <input type="password" value={loginPw} onChange={e=>{ setLoginPw(e.target.value); setLoginError(""); }} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Wachtwoord"
              className={`w-full bg-zinc-800 border rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none ${loginError?"border-red-700":"border-zinc-700 focus:border-zinc-600"}`}/>
          </div>
          {loginError && <p className="text-xs text-red-400">{loginError}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-zinc-200 text-sm font-medium rounded-lg transition-colors mt-1">
            {loading ? "Laden…" : "Inloggen →"}
          </button>
        </div>
      </div>
    </div>
  );

  // Main screen
  return (
    <div className={`min-h-screen ${t.bg} ${t.text}`}>
      <div className={`border-b ${t.border} px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-lg">🏢</span>
          <div>
            <h1 className={`text-sm font-semibold ${t.textHead}`}>VvE Vergaderplanner</h1>
            <p className={`text-xs ${t.textMuted}`}>{beheerder}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className={`text-xs px-3 py-1.5 rounded-lg border ${t.border} ${t.btnSec} transition-colors`}>
            {darkMode ? "☀️ Licht" : "🌙 Donker"}
          </button>
          <button onClick={()=>{ setScreen("login"); setLoginNaam(""); setLoginPw(""); }} className={`text-xs ${t.textDim} hover:${t.textMuted} transition-colors`}>Uitloggen</button>
          {saving && <span className={`text-[10px] ${t.textDim} animate-pulse`}>Opslaan…</span>}
        </div>
      </div>

      <div className={`border-b ${t.border} px-6 py-3 flex gap-6`}>
        <div className="text-center"><div className={`text-lg font-mono font-bold ${t.textHead}`}>{data.vves.length}</div><div className={`text-[10px] ${t.textDim} uppercase tracking-wide`}>VvE's</div></div>
        <div className="text-center"><div className="text-lg font-mono font-bold text-emerald-500">{afgerond}</div><div className={`text-[10px] ${t.textDim} uppercase tracking-wide`}>Afgerond</div></div>
        <div className="text-center"><div className="text-lg font-mono font-bold text-sky-500">{uitgenodigd}</div><div className={`text-[10px] ${t.textDim} uppercase tracking-wide`}>Uitgenodigd</div></div>
        <div className="text-center"><div className={`text-lg font-mono font-bold ${t.textMuted}`}>{nietUitgenodigd}</div><div className={`text-[10px] ${t.textDim} uppercase tracking-wide`}>Niet uitgenodigd</div></div>
        {metWaarschuwing>0 && <div className="text-center"><div className="text-lg font-mono font-bold text-red-500">{metWaarschuwing}</div><div className={`text-[10px] ${t.textDim} uppercase tracking-wide`}>Uitnodiging!</div></div>}
        {inVakantie>0 && <div className="text-center"><div className="text-lg font-mono font-bold text-amber-500">{inVakantie}</div><div className={`text-[10px] ${t.textDim} uppercase tracking-wide`}>In vakantie</div></div>}
      </div>

      <div className={`border-b ${t.border} px-6 flex gap-1 items-center justify-between`}>
        <div className="flex gap-1">
          {[["vergaderingen","Vergaderingen"],["overzicht","Spreiding"],["kalender","Kalender"],["vakantie","Vakantie"],["instellingen","Instellingen"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} className={`px-4 py-3 text-sm transition-colors border-b-2 -mb-px ${tab===key ? t.tabActive : t.tabInact}`}>{label}</button>
          ))}
        </div>
        <div className="flex gap-2 pb-1">
          <button onClick={exportExcel} className={`text-xs px-3 py-1.5 ${t.btnSec} rounded-lg transition-colors`}>⬇ Excel</button>
          <button onClick={exportPDF} className={`text-xs px-3 py-1.5 ${t.btnSec} rounded-lg transition-colors`}>⬇ PDF</button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">

        {/* Begroeting */}
        {tab==="vergaderingen" && (
          <div className={`mb-4 px-4 py-3 ${t.bgCard} border ${t.border} rounded-xl flex items-center justify-between`}>
            <div>
              <p className="text-sm font-medium text-zinc-200">Hoi {beheerder}! 👋</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {aantalUitTeNodigen > 0
                  ? `Je hebt ${aantalUitTeNodigen} uitnodiging${aantalUitTeNodigen > 1 ? "en" : ""} te versturen.`
                  : afgerond === data.vves.length && data.vves.length > 0
                  ? "Alles is afgerond — geweldig werk! 🎉"
                  : `Je hebt nog ${data.vves.filter(v => !isAfgerond(v)).length} open vergaderingen.`}
              </p>
            </div>
            <span className="text-2xl">{aantalUitTeNodigen > 0 ? "📬" : afgerond === data.vves.length && data.vves.length > 0 ? "🏆" : "📋"}</span>
          </div>
        )}

        {/* ── VERGADERINGEN ── */}
        {tab==="vergaderingen" && (
          <div className="flex gap-5 items-start">

            {/* Voortgang zijbalk */}
            {data.vves.length > 0 && (() => {
              const total = data.vves.length;
              const pctAfgerond = Math.round((afgerond / total) * 100);
              const pctUitgenodigd = Math.round((uitgenodigd / total) * 100);
              const pctNiet = 100 - pctAfgerond - pctUitgenodigd;
              const R = 40; const C = 2 * Math.PI * R;
              const dasAfgerond = (pctAfgerond / 100) * C;
              const dasUitgenodigd = (pctUitgenodigd / 100) * C;
              const label = pctAfgerond === 100 ? "Alles afgerond! 🎉"
                : pctAfgerond >= 75 ? "Bijna klaar"
                : pctAfgerond >= 50 ? "Op de helft"
                : pctAfgerond >= 25 ? "Goed op weg"
                : "Net begonnen";
              return (
                <div className={`w-52 shrink-0 ${t.bgCard} border ${t.border} rounded-xl p-4 space-y-3 sticky top-4`}>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Voortgang {year}</p>
                  <div className="flex flex-col items-center gap-1">
                    <svg width="96" height="96" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r={R} fill="none" stroke="#27272a" strokeWidth="10"/>
                      {pctNiet > 0 && (
                        <circle cx="48" cy="48" r={R} fill="none" stroke="#3f3f46" strokeWidth="10"
                          strokeDasharray={`${(pctNiet/100)*C} ${C}`} strokeDashoffset={-(dasAfgerond+dasUitgenodigd)}
                          transform="rotate(-90 48 48)" strokeLinecap="butt"/>
                      )}
                      {pctUitgenodigd > 0 && (
                        <circle cx="48" cy="48" r={R} fill="none" stroke="#0ea5e9" strokeWidth="10"
                          strokeDasharray={`${dasUitgenodigd} ${C}`} strokeDashoffset={-dasAfgerond}
                          transform="rotate(-90 48 48)" strokeLinecap="butt"/>
                      )}
                      {pctAfgerond > 0 && (
                        <circle cx="48" cy="48" r={R} fill="none" stroke="#10b981" strokeWidth="10"
                          strokeDasharray={`${dasAfgerond} ${C}`} strokeDashoffset={0}
                          transform="rotate(-90 48 48)" strokeLinecap="butt"/>
                      )}
                      <text x="48" y="44" textAnchor="middle" fill="#f4f4f5" fontSize="18" fontWeight="700" fontFamily="monospace">{pctAfgerond}%</text>
                      <text x="48" y="57" textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="sans-serif">afgerond</text>
                    </svg>
                    <p className="text-sm font-semibold text-zinc-200 text-center">{label}</p>
                    <p className="text-[10px] text-zinc-500 text-center">{afgerond} van {total} vergaderingen volledig afgerond</p>
                  </div>
                  <div className="space-y-2 pt-1">
                    {[
                      ["Afgerond", afgerond, total, "bg-emerald-500"],
                      ["Uitgenodigd", uitgenodigd, total, "bg-sky-500"],
                      ["Niet uitgenodigd", nietUitgenodigd, total, "bg-zinc-600"],
                    ].map(([lbl, val, tot, barColor]) => (
                      <div key={lbl}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[10px] text-zinc-400">{lbl}</span>
                          <span className="text-[10px] font-mono text-zinc-400">{val} <span className="text-zinc-600">/ {tot}</span></span>
                        </div>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{width:`${tot===0?0:Math.round((val/tot)*100)}%`}}/>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Countdown naar jaareinde */}
                  {(() => {
                    const nu = new Date();
                    const jaareinde = new Date(nu.getFullYear(), 11, 31);
                    const dagenOver = Math.ceil((jaareinde - nu) / 86400000);
                    const opSchema = onTrackDiff >= -5;
                    return (
                      <div className="border-t border-zinc-800 pt-3 space-y-1">
                        <p className="text-[10px] text-zinc-500">
                          <span className="text-zinc-300 font-medium">Nog {dagenOver} dagen</span> tot eind {nu.getFullYear()}
                        </p>
                        <p className={`text-[10px] font-medium ${opSchema ? "text-emerald-400" : "text-amber-400"}`}>
                          {opSchema ? "✓ Je bent op schema" : "⚠ Je loopt achter op schema"}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Drukste maand */}
                  {(() => {
                    const nu = new Date();
                    const cnts = {};
                    data.vves.forEach(v => {
                      [v.datum1, v.datum2, v.datumExtra].forEach(d => {
                        if (d && d.startsWith(String(nu.getFullYear()))) {
                          const m = parseInt(d.slice(5,7)) - 1;
                          cnts[m] = (cnts[m] || 0) + 1;
                        }
                      });
                    });
                    const entries = Object.entries(cnts);
                    if (entries.length === 0) return null;
                    const [maandIdx, aantal] = entries.sort((a,b) => b[1]-a[1])[0];
                    return (
                      <div className="border-t border-zinc-800 pt-3">
                        <p className="text-[10px] text-zinc-500">
                          <span className="text-amber-400 font-medium">📅 {NL_MONTHS_FULL[parseInt(maandIdx)]}</span> wordt je drukste maand
                        </p>
                        <p className="text-[10px] text-zinc-600">{aantal} vergadering{aantal !== 1 ? "en" : ""} gepland</p>
                      </div>
                    );
                  })()}

                  {/* Week agenda */}
                  {(() => {
                    const nu = new Date();
                    const startWeek = new Date(nu);
                    startWeek.setDate(nu.getDate() - ((nu.getDay() + 6) % 7));
                    const eindWeek = new Date(startWeek); eindWeek.setDate(startWeek.getDate() + 6);
                    const isoStart = startWeek.toISOString().slice(0,10);
                    const isoEind = eindWeek.toISOString().slice(0,10);
                    const dezeWeek = data.vves.flatMap(v => {
                      const items = [];
                      if (v.datum1 && v.datum1 >= isoStart && v.datum1 <= isoEind) items.push({ naam: v.naam, datum: v.datum1, type: "1e" });
                      if (v.datum2 && v.datum2 >= isoStart && v.datum2 <= isoEind) items.push({ naam: v.naam, datum: v.datum2, type: "2e" });
                      if (v.datumExtra && v.datumExtra >= isoStart && v.datumExtra <= isoEind) items.push({ naam: v.naam, datum: v.datumExtra, type: "extra" });
                      return items;
                    }).sort((a,b) => a.datum.localeCompare(b.datum));
                    return (
                      <div className="border-t border-zinc-800 pt-3 space-y-2">
                        <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide">Deze week</p>
                        {dezeWeek.length === 0 ? (
                          <p className="text-[10px] text-zinc-600">Geen vergaderingen deze week.</p>
                        ) : (
                          dezeWeek.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-[9px] text-zinc-500 shrink-0 mt-0.5 w-12">{fmtDate(item.datum).slice(0,6)}</span>
                              <div className="min-w-0">
                                <p className="text-[10px] text-zinc-300 truncate">{item.naam}</p>
                                <p className="text-[9px] text-zinc-600">{item.type === "1e" ? "1e vergadering" : item.type === "2e" ? "2e reglementair" : "Extra"}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}

                  {/* ── FIX 2: Maandfilter ───────────────────── */}
                  {(maandenMetVves2026.length > 0 || maandenMetVves2027.length > 0) && (
                    <div className="border-t border-zinc-800 pt-3 space-y-2">
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide">Filter op maand</p>

                      {/* 2026 maanden */}
                      {maandenMetVves2026.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">{year}</p>
                          <div className="flex flex-wrap gap-1">
                            {maandenMetVves2026.map(({ key, label, count }) => {
                              const actief = geselecteerdeFilterMaanden.has(key);
                              return (
                                <button
                                  key={key}
                                  onClick={() => toggleFilterMaand(key)}
                                  className={`text-[10px] px-2 py-0.5 rounded font-mono transition-all ${
                                    actief
                                      ? "bg-sky-700 text-sky-100 border border-sky-600"
                                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500"
                                  }`}
                                >
                                  {label} <span className="opacity-60">({count})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 2027 toggle */}
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                          const next = !filterJaar2027;
                          setFilterJaar2027(next);
                          // verwijder 2027 maanden uit filter als we 2027 uitzetten
                          if (!next) {
                            setGeselecteerdeFilterMaanden(prev => {
                              const updated = new Set(prev);
                              maandenMetVves2027.forEach(m => updated.delete(m.key));
                              return updated;
                            });
                          }
                        }}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${filterJaar2027 ? "bg-emerald-600 border-emerald-600" : "border-zinc-600 hover:border-zinc-400"}`}>
                            {filterJaar2027 && <span className="text-white text-[9px] font-bold">✓</span>}
                          </div>
                          <span className="text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors">{nextYear} (voorkeursdatums)</span>
                        </label>

                        {filterJaar2027 && maandenMetVves2027.length > 0 && (
                          <div className="flex flex-wrap gap-1 pl-1">
                            {maandenMetVves2027.map(({ key, label, count }) => {
                              const actief = geselecteerdeFilterMaanden.has(key);
                              return (
                                <button
                                  key={key}
                                  onClick={() => toggleFilterMaand(key)}
                                  className={`text-[10px] px-2 py-0.5 rounded font-mono transition-all ${
                                    actief
                                      ? "bg-emerald-700 text-emerald-100 border border-emerald-600"
                                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500"
                                  }`}
                                >
                                  {label} <span className="opacity-60">({count})</span>
                                </button>
                              );
                            })}
                            {maandenMetVves2027.length === 0 && (
                              <p className="text-[10px] text-zinc-600">Nog geen voorkeursdatums ingevuld voor {nextYear}.</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Wis filter knop */}
                      {geselecteerdeFilterMaanden.size > 0 && (
                        <button
                          onClick={() => setGeselecteerdeFilterMaanden(new Set())}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline"
                        >
                          Wis filter ({geselecteerdeFilterMaanden.size} actief)
                        </button>
                      )}
                    </div>
                  )}

                </div>
              );
            })()}

            {/* VvE lijst */}
            <div className="flex-1 space-y-4">

              {/* Notification panel — FIX 3: klikbare naam */}
              {urgentItems.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">⚡ Actie vereist</p>
                  {urgentItems.map(item => (
                    <div key={item.id} className={`flex items-start gap-3 rounded-lg px-3 py-2 text-xs ${
                      item.type==="overdue" ? "bg-red-950/30 border border-red-900/40 text-red-300" :
                      item.type==="geen2e"  ? "bg-amber-950/30 border border-amber-900/40 text-amber-300" :
                      "bg-amber-950/20 border border-amber-900/30 text-amber-300"}`}>
                      <span className="shrink-0 mt-0.5">
                        {item.type==="overdue" ? "✉" : item.type==="geen2e" ? "↩" : "⏰"}
                      </span>
                      <div className="flex-1 min-w-0">
                        {/* FIX 3: klikbare naam → scroll + open VvE kaart */}
                        <button
                          onClick={() => {
                            setForceOpenId(item.vveId);
                            // zorg dat de VvE zichtbaar is (verberg afgerond uitzetten indien nodig)
                            const vve = data.vves.find(v => v.id === item.vveId);
                            if (vve && isAfgerond(vve) && hideAfgerond) setHideAfgerond(false);
                            // verwijder maandfilter als VvE erdoor gefilterd wordt
                            if (geselecteerdeFilterMaanden.size > 0) setGeselecteerdeFilterMaanden(new Set());
                          }}
                          className="font-medium underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          {item.naam}
                        </button>
                        {item.is2e && <span className="ml-1 opacity-60">(2e reglementaire vergadering)</span>}
                        {item.isExtra && <span className="ml-1 opacity-60">(extra vergadering)</span>}
                        <span className="ml-2 opacity-70">
                          {item.type==="overdue"  ? `— uitnodigingstermijn verlopen, vergadering ${fmtDate(item.datum)}` :
                           item.type==="geen2e"   ? `— 1e vergadering voorbij (${fmtDate(item.datum)}), geen 2e gepland` :
                           `— uitnodigen vóór ${fmtDate(item.deadline)} (vergadering ${fmtDate(item.datum)})`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Planning preview banner */}
              {planningPreview && (
                <div className="bg-sky-950/40 border border-sky-800/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-sky-300">Voorgestelde planning</p>
                      <p className="text-xs text-sky-500 mt-0.5">
                        {planningPreview.filter(v=>v.datum1).length - data.vves.filter(v=>v.datum1).length} VvE's automatisch ingepland. Controleer de datums en bevestig.
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={handleConfirmPlanning} className="px-4 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs rounded-lg transition-colors font-medium">Bevestigen</button>
                      <button onClick={handleRejectPlanning} className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">Annuleren</button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <p className="text-[10px] text-sky-600 mb-1.5 uppercase tracking-wide">Spreiding na planning</p>
                    <MonthBar counts={spreadScore(planningPreview)} vakanties={data.vakanties}/>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <input value={newVveName} onChange={e=>setNewVveName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVve()} placeholder="VvE naam toevoegen…"
                  className="flex-1 min-w-48 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"/>
                <button onClick={addVve} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors">+</button>
                <button onClick={()=>setShowImport(i=>!i)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm rounded-lg transition-colors whitespace-nowrap">Bulk import</button>
                {ongepland > 0 && !planningPreview && (
                  <button onClick={handleGeneratePlanning} className="px-4 py-2 bg-sky-900/60 hover:bg-sky-800/60 border border-sky-800/60 text-sky-300 text-sm rounded-lg transition-colors whitespace-nowrap">
                    ✦ Stel planning voor ({ongepland} ongepland)
                  </button>
                )}
                {/* FIX 1: Sorteerknop */}
                <button
                  onClick={handleSorteer}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors whitespace-nowrap"
                  title="Sorteer VvE's op vergaderdatum. VvE's met voorkeursdatum volgend jaar komen onderaan."
                >
                  ↕ Sorteer
                </button>
              </div>

              {showImport && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <p className="text-xs text-zinc-500">Plak VvE-namen, één per regel. Datum en tijd worden automatisch herkend als je ze tab-gescheiden aanlevert (naam ⇥ d-m-jjjj ⇥ tijd).</p>
                  <textarea rows={6} value={importText} onChange={e=>setImportText(e.target.value)}
                    placeholder={"Zwolsestraat 253\t16-4-2026\t15.00\nTak van Poortvlietstraat 9 AB\t1-6-2026\t15:00 uur\n..."}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none resize-none font-mono"/>
                  <div className="flex gap-2">
                    <button onClick={handleImport} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition-colors">Importeer</button>
                    <button onClick={()=>setShowImport(false)} className="text-sm text-zinc-500 hover:text-zinc-400">Annuleer</button>
                  </div>
                </div>
              )}

              {/* Search + hide toggle */}
              <div className="flex gap-3 items-center flex-wrap">
                {data.vves.length>5 && (
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek VvE…"
                    className="flex-1 min-w-40 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"/>
                )}
                <label className="flex items-center gap-2 cursor-pointer shrink-0 group" onClick={()=>setHideAfgerond(h=>!h)}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${hideAfgerond?"bg-emerald-600 border-emerald-600":"border-zinc-600 hover:border-zinc-400"}`}>
                    {hideAfgerond && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors whitespace-nowrap">
                    Verberg afgerond {afgerond > 0 && <span className="text-zinc-600">({afgerond})</span>}
                  </span>
                </label>
              </div>

              {/* Selectie toolbar */}
              {filtered.length > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer group" onClick={()=> selectie.size === filtered.length ? deselecteerAlles() : selecteerAlles()}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectie.size === filtered.length && filtered.length > 0 ? "bg-zinc-400 border-zinc-400" : selectie.size > 0 ? "bg-zinc-600 border-zinc-600" : "border-zinc-600 hover:border-zinc-400"}`}>
                      {selectie.size === filtered.length && filtered.length > 0 && <span className="text-zinc-900 text-xs font-bold">✓</span>}
                      {selectie.size > 0 && selectie.size < filtered.length && <span className="text-zinc-300 text-xs font-bold">−</span>}
                    </div>
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      {selectie.size === 0 ? "Selecteer alles" : selectie.size === filtered.length ? "Alles geselecteerd" : `${selectie.size} geselecteerd`}
                    </span>
                  </label>
                  {selectie.size > 0 && (
                    <button onClick={verwijderSelectie} className="ml-auto px-3 py-1 bg-red-900/50 hover:bg-red-800/60 border border-red-800/50 text-red-300 text-xs rounded-lg transition-colors">
                      Verwijder {selectie.size} VvE{selectie.size > 1 ? "'s" : ""}
                    </button>
                  )}
                </div>
              )}

              {loading && <p className="text-sm text-zinc-500">Laden…</p>}
              {!loading && filtered.length===0 && (
                <p className="text-sm text-zinc-600 text-center py-8">
                  {data.vves.length===0 ? "Nog geen VvE's. Voeg er een toe."
                    : hideAfgerond && afgerond===data.vves.length ? "Alle VvE's zijn afgerond. 🎉"
                    : geselecteerdeFilterMaanden.size > 0 ? "Geen VvE's gevonden voor de geselecteerde maanden."
                    : "Geen resultaten."}
                </p>
              )}

              <div className="space-y-2">
                {filtered.map(vve=>(
                  <div key={vve.id} className="flex items-center gap-2">
                    <div
                      onClick={()=>toggleSelectie(vve.id)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 ${selectie.has(vve.id)?"bg-zinc-400 border-zinc-400":"border-zinc-700 hover:border-zinc-500"}`}
                    >
                      {selectie.has(vve.id) && <span className="text-zinc-900 text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <VveRow
                        vve={vve}
                        vakanties={data.vakanties}
                        onUpdate={planningPreview ? (u) => setPlanningPreview(prev => prev.map(v=>v.id===u.id?u:v)) : updateVve}
                        onDelete={planningPreview ? ()=>{} : deleteVve}
                        onAdd2nd={planningPreview ? ()=>{} : add2nd}
                        forceOpen={forceOpenId === vve.id}
                        onForceOpenHandled={() => setForceOpenId(null)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SPREIDING ── */}
        {tab==="overzicht" && (
          <div className="space-y-6">
            {data.vves.length > 0 && (() => {
              const total = data.vves.length;
              const pctAfgerond = Math.round((afgerond / total) * 100);
              const pctUitgenodigd = Math.round((uitgenodigd / total) * 100);
              const pctNiet = 100 - pctAfgerond - pctUitgenodigd;
              const R = 54; const C = 2 * Math.PI * R;
              const dasAfgerond = (pctAfgerond / 100) * C;
              const dasUitgenodigd = (pctUitgenodigd / 100) * C;
              const label = pctAfgerond === 100 ? "Alles afgerond! 🎉" : pctAfgerond >= 75 ? "Bijna klaar" : pctAfgerond >= 50 ? "Op de helft" : pctAfgerond >= 25 ? "Goed op weg" : "Net begonnen";
              return (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-6">Voortgang {year}</h2>
                  <div className="flex items-center gap-8">
                    <div className="relative shrink-0">
                      <svg width="140" height="140" viewBox="0 0 140 140">
                        <circle cx="70" cy="70" r={R} fill="none" stroke="#27272a" strokeWidth="14"/>
                        {pctNiet > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#3f3f46" strokeWidth="14" strokeDasharray={`${(pctNiet/100)*C} ${C}`} strokeDashoffset={-(dasAfgerond+dasUitgenodigd)} transform="rotate(-90 70 70)" strokeLinecap="butt"/>}
                        {pctUitgenodigd > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#0ea5e9" strokeWidth="14" strokeDasharray={`${dasUitgenodigd} ${C}`} strokeDashoffset={-dasAfgerond} transform="rotate(-90 70 70)" strokeLinecap="butt"/>}
                        {pctAfgerond > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#10b981" strokeWidth="14" strokeDasharray={`${dasAfgerond} ${C}`} strokeDashoffset={0} transform="rotate(-90 70 70)" strokeLinecap="butt"/>}
                        <text x="70" y="65" textAnchor="middle" fill="#f4f4f5" fontSize="22" fontWeight="700" fontFamily="monospace">{pctAfgerond}%</text>
                        <text x="70" y="82" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">afgerond</text>
                      </svg>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-base font-semibold text-zinc-200">{label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{afgerond} van {total} vergaderingen volledig afgerond</p>
                      </div>
                      <div className="space-y-2.5">
                        {[["Afgerond",afgerond,total,"bg-emerald-500"],["Uitgenodigd",uitgenodigd,total,"bg-sky-500"],["Niet uitgenodigd",nietUitgenodigd,total,"bg-zinc-600"]].map(([lbl,val,tot,,barColor])=>(
                          <div key={lbl}>
                            <div className="flex justify-between mb-1"><span className="text-xs text-zinc-400">{lbl}</span><span className="text-xs font-mono text-zinc-400">{val} <span className="text-zinc-600">/ {tot}</span></span></div>
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{width:`${tot===0?0:Math.round((val/tot)*100)}%`}}/></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div>
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Vergaderingen per maand — {year}</h2>
              <p className="text-xs text-zinc-600 mb-4">Geel = vakantieperiode &nbsp;·&nbsp; Groen ≤4 &nbsp;·&nbsp; Oranje 5–7 &nbsp;·&nbsp; Rood ≥8</p>
              <MonthBar counts={counts} vakanties={data.vakanties}/>
            </div>
            {ongepland>0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Nog te plannen ({ongepland})</h3>
                <div className="grid grid-cols-2 gap-2">
                  {data.vves.filter(v=>!v.datum1).map(v=><div key={v.id} className="text-xs px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-400">{v.naam}</div>)}
                </div>
              </div>
            )}
            <div className="space-y-3">
              {NL_MONTHS_FULL.map((m,i)=>{
                const key=`${year}-${String(i+1).padStart(2,"0")}`;
                const vves=data.vves.filter(v=>monthKey(v.datum1)===key||monthKey(v.datum2)===key);
                if(vves.length===0) return null;
                return (
                  <div key={m}>
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{m} ({vves.length})</h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {vves.map(v=>(
                        <div key={v.id} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded flex justify-between">
                          <span className="text-zinc-400 truncate">{v.naam}</span>
                          <span className="text-zinc-600 ml-2 shrink-0">{monthKey(v.datum1)===key?fmtDate(v.datum1):fmtDate(v.datum2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── KALENDER ── */}
        {tab==="kalender" && (
          <div className="space-y-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-zinc-300">Jaarkalender {new Date().getFullYear()}</h2>
              <p className="text-xs text-zinc-600 mt-0.5">Elke cel is één dag. Kleur toont het aantal geplande vergaderingen. Hover voor details.</p>
            </div>
            <HeatmapKalender vves={data.vves}/>
          </div>
        )}

        {/* ── VAKANTIE ── */}
        {tab==="vakantie" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-300">Mijn vakantieperiodes</h2>
                <p className="text-xs text-zinc-600 mt-0.5">Vergaderingen in deze periodes worden gemarkeerd en overgeslagen bij auto-planning.</p>
              </div>
              <button onClick={addVakantie} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors">+ Toevoegen</button>
            </div>
            {data.vakanties.length===0 && <p className="text-sm text-zinc-600 text-center py-8">Nog geen vakantieperiodes ingesteld.</p>}
            <div className="space-y-3">
              {data.vakanties.map(v=>(
                <div key={v.id} className="border border-zinc-800 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Omschrijving</label>
                      <input value={v.naam} onChange={e=>updateVakantie({...v,naam:e.target.value})} placeholder="Bijv. Zomervakantie" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Van</label>
                      <input type="date" value={v.van} onChange={e=>updateVakantie({...v,van:e.target.value})} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Tot en met</label>
                      <input type="date" value={v.tot} onChange={e=>updateVakantie({...v,tot:e.target.value})} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"/>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    {v.van&&v.tot&&<span className="text-xs text-zinc-500">{fmtDate(v.van)} → {fmtDate(v.tot)}</span>}
                    <button onClick={()=>deleteVakantie(v.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors ml-auto">Verwijder</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INSTELLINGEN ── */}
        {tab==="instellingen" && (
          <div className="space-y-6 max-w-md">
            <div>
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Mijn werkdagen</h2>
              <p className="text-xs text-zinc-500 mb-4">De auto-planner plant geen vergaderingen op dagen dat je niet werkt.</p>
              <WerkdagenSelector werkdagen={werkdagen} onChange={updateWerkdagen}/>
              <div className="mt-3 flex flex-wrap gap-1">
                {[1,2,3,4,5,6,0].map((dow,i) => {
                  const labels=["Ma","Di","Wo","Do","Vr","Za","Zo"];
                  return werkdagen[dow] ? <span key={dow} className="text-[10px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded font-mono">{labels[i]}</span> : null;
                })}
                {[1,2,3,4,5,6,0].filter(dow=>werkdagen[dow]).length===0 && <span className="text-xs text-red-400">⚠ Geen werkdagen geselecteerd — auto-planning werkt niet.</span>}
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-6">
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Auto-planning</h2>
              <p className="text-xs text-zinc-500 mb-4">Verdeelt alle ongeplande VvE's gelijkmatig over het jaar. Slaat vakantieperiodes en niet-werkdagen over. Je kunt het voorstel bekijken en aanpassen vóór je bevestigt.</p>
              <button
                onClick={() => { setTab("vergaderingen"); handleGeneratePlanning(); }}
                disabled={ongepland===0}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${ongepland===0?"bg-zinc-800 text-zinc-600 cursor-not-allowed":"bg-sky-900/60 hover:bg-sky-800/60 border border-sky-800/60 text-sky-300"}`}
              >
                {ongepland===0 ? "Alle VvE's zijn al gepland" : `✦ Genereer planning voor ${ongepland} VvE's`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
