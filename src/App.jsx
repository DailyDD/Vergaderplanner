import { useState, useEffect, useCallback } from "react";

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

// Beheerderlijst komt uit ACCOUNTS
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
  const d = new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function today() { return new Date().toISOString().slice(0,10); }
function monthKey(iso) { return iso ? iso.slice(0,7) : null; }
function isInVakantie(iso, vakanties) {
  return vakanties.some(v => v.van && v.tot && iso >= v.van && iso <= v.tot);
}
function inviteWarning(iso) {
  if (!iso) return false;
  const diff = (new Date(iso+"T00:00:00") - new Date()) / 86400000;
  return diff >= 0 && diff < INVITE_DAYS;
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

// ── Import line parser ────────────────────────────────────────────
// Handles: "VvE naam\t16-4-2026\t15.00 uur"  or plain "VvE naam"
function parseImportLine(line) {
  // Split on tab first, fallback to 2+ spaces
  const parts = line.includes("\t")
    ? line.split("\t").map(p => p.trim())
    : line.split(/\s{2,}/).map(p => p.trim());

  const naam = parts[0]?.trim();
  if (!naam) return null;

  let datum1 = "";
  if (parts[1]) {
    // Parse d-m-yyyy or dd-mm-yyyy
    const match = parts[1].match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      datum1 = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }
  }

  return { naam, datum1 };
}

// ── Auto-planner ─────────────────────────────────────────────────
// Distributes ongeplande VvE's evenly across the year on valid workdays
// Respects voorkeurVolgendjaar — plans on or near that date if set
function generatePlanning(vves, vakanties, werkdagen) {
  const year = new Date().getFullYear();
  const ongepland = vves.filter(v => !v.datum1);
  if (ongepland.length === 0) return vves;

  // Build list of all valid dates this year
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

  // Find closest valid date to a target date
  function closestValidDate(target) {
    if (!target) return null;
    // Adjust year to current year
    const adjusted = `${year}-${target.slice(5)}`;
    if (validDates.includes(adjusted)) return adjusted;
    // Search outward ±30 days
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
    // If voorkeurVolgendjaar is set, try to use that date
    if (vve.voorkeurVolgendjaar) {
      const preferred = closestValidDate(vve.voorkeurVolgendjaar);
      if (preferred) {
        assignments.push({ id: vve.id, datum: preferred });
        alreadyPlanned[preferred] = (alreadyPlanned[preferred]||0)+1;
        return;
      }
    }
    // Otherwise spread evenly
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
// Returns: 'none' | 'ok' | 'warning' | 'overdue' | 'confirmed'
function inviteStatus(datum, uitgenodigd) {
  if (!datum) return "none";
  if (uitgenodigd) return "confirmed";
  const deadline = addDays(datum, -INVITE_DAYS);
  const t = today();
  if (datum < t) return "overdue";           // vergadering al voorbij, nooit uitgenodigd
  if (deadline < t) return "overdue";        // deadline verlopen
  if (deadline <= addDays(t, 5)) return "warning"; // deadline binnen 5 dagen
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
function VveRow({ vve, vakanties, onUpdate, onDelete, onAdd2nd }) {
  const [expanded, setExpanded] = useState(false);

  const inVak1 = vve.datum1 && isInVakantie(vve.datum1, vakanties);
  const inVak2 = vve.datum2 && isInVakantie(vve.datum2, vakanties);
  const vergaderd1 = !!vve.vergaderd1;
  const vergaderd2 = !!vve.vergaderd2;
  const uitgenodigd1 = !!vve.uitgenodigd1;
  const uitgenodigd2 = !!vve.uitgenodigd2;
  const afgerond = vergaderd1 && (!vve.needs2e || vergaderd2);

  const inv1 = inviteStatus(vve.datum1, uitgenodigd1);
  const inv2 = inviteStatus(vve.datum2, uitgenodigd2);

  // Invite status badge config
  const invBadge = (status, which) => {
    if (status === "none") return null;
    if (status === "confirmed") return <Badge color="green">✉ Uitgenodigd</Badge>;
    if (status === "overdue") return <Badge color="red">✉ Uitnodiging te laat ({which})</Badge>;
    if (status === "warning") return <Badge color="orange">✉ Uitnodigen ({which})</Badge>;
    return null;
  };

  // Dot color — worst state wins
  const dotColor = afgerond ? "bg-emerald-500"
    : vergaderd1 ? "bg-sky-500"
    : inv1 === "overdue" || inv2 === "overdue" ? "bg-red-500"
    : inv1 === "warning" || inv2 === "warning" ? "bg-amber-400"
    : vve.datum1 ? "bg-zinc-500"
    : "bg-zinc-700";

  // When datum changes, reset uitgenodigd for that vergadering
  const updateDatum1 = (val) => onUpdate({ ...vve, datum1: val, uitgenodigd1: false });
  const updateDatum2 = (val) => onUpdate({ ...vve, datum2: val, uitgenodigd2: false });

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${afgerond ? "border-emerald-900/50 bg-emerald-950/10" : "border-zinc-800"}`}>
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

          {/* 2e vergadering — alleen zichtbaar als needs2e aangevinkt */}
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
  // Show Mon-Sun order for display but store as Sun=0
  const displayOrder = [1,2,3,4,5,6,0]; // ma,di,wo,do,vr,za,zo
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

// ── Admin stats ──────────────────────────────────────────────────
function calcStats(data) {
  if (!data) return null;
  const vves = data.vves||[];
  const vakanties = data.vakanties||[];
  const total = vves.length;
  const afgerond = vves.filter(v => v.vergaderd1 && (!v.needs2e || v.vergaderd2)).length;
  const uitgenodigd = vves.filter(v => (v.uitgenodigd1 || v.uitgenodigd2) && !(v.vergaderd1 && (!v.needs2e || v.vergaderd2))).length;
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
function AdminDashboard({ beheerderList, onBack, onSaveBeheerderData }) {
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [herindelenVan, setHerindelenVan] = useState(null); // naam van beheerder
  const [herindelenVve, setHerindelenVve] = useState(null); // vve object
  const [herindelenNaar, setHerindelenNaar] = useState("");
  const [herindelenMsg, setHerindelenMsg] = useState("");

  // On-track: % of year elapsed vs avg % afgerond across all beheerders
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

  const verwijderBeheerder = async (naam) => {
    if (!window.confirm(`Beheerder "${naam}" verwijderen? De VvE-data blijft bewaard in de opslag maar is niet meer toegankelijk via de app.`)) return;
    // We can only remove from the list display; accounts are hardcoded
    setAllData(prev => { const d = {...prev}; delete d[naam]; return d; });
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
  const totaalAfgerond = allVves.filter(v => v.vergaderd1 && (!v.needs2e || v.vergaderd2)).length;
  const totaalUitgenodigd = allVves.filter(v => (v.uitgenodigd1 || v.uitgenodigd2) && !(v.vergaderd1 && (!v.needs2e || v.vergaderd2))).length;
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

        {/* On-track indicator */}
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

                      {/* Herindelen */}
                      <div className="border-t border-zinc-800/60 pt-3 mt-2">
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">VvE herindelen naar andere beheerder</p>
                        {herindelenVan === naam && herindelenVve ? (
                          <div className="flex gap-2 items-center flex-wrap">
                            <span className="text-xs text-zinc-400 shrink-0">"{herindelenVve.naam}" →</span>
                            <select
                              value={herindelenNaar}
                              onChange={e=>setHerindelenNaar(e.target.value)}
                              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                            >
                              <option value="">Kies beheerder…</option>
                              {beheerderList.filter(n=>n!==naam).map(n=><option key={n} value={n}>{n}</option>)}
                            </select>
                            <button onClick={()=>herindelen(herindelenVve, naam, herindelenNaar)} disabled={!herindelenNaar} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-200 text-xs rounded transition-colors">Verplaats</button>
                            <button onClick={()=>{setHerindelenVve(null);setHerindelenVan(null);}} className="text-xs text-zinc-500 hover:text-zinc-400">Annuleer</button>
                          </div>
                        ) : (
                          <select
                            value=""
                            onChange={e=>{
                              const vve = (allData[naam]?.vves||[]).find(v=>v.id===e.target.value);
                              if (vve) { setHerindelenVve(vve); setHerindelenVan(naam); setHerindelenNaar(""); }
                            }}
                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-400 focus:outline-none"
                          >
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
  const deleteVve = async (id) => await persist({ ...data, vves: data.vves.filter(v=>v.id!==id) });
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
  const handleAdminLogin = () => {}; // handled via handleLogin now
  const [hideAfgerond, setHideAfgerond] = useState(false);
  const [selectie, setSelectie] = useState(new Set());

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
    setSelectie(new Set());
  };

  // Planning
  const handleGeneratePlanning = () => {
    const proposed = generatePlanning(data.vves, data.vakanties, data.werkdagen || WORK_DAYS_DEFAULT);
    setPlanningPreview(proposed);
  };
  const handleConfirmPlanning = async () => {
    await persist({ ...data, vves: planningPreview });
    setPlanningPreview(null);
  };
  const handleRejectPlanning = () => setPlanningPreview(null);

  const werkdagen = data.werkdagen || WORK_DAYS_DEFAULT;
  const counts = spreadScore(planningPreview || data.vves);
  const ongepland = data.vves.filter(v=>!v.datum1).length;
  const uitgenodigd = data.vves.filter(v=> (v.uitgenodigd1 || v.uitgenodigd2) && !( v.vergaderd1 && (!v.needs2e || v.vergaderd2))).length;
  const afgerond = data.vves.filter(v=> v.vergaderd1 && (!v.needs2e || v.vergaderd2)).length;
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

  // Urgent items for notification panel
  const urgentItems = data.vves.flatMap(v => {
    const items = [];
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    const sE = inviteStatus(v.datumExtra, v.uitgenodigdExtra);
    if (!v.vergaderd1 && (s1==="warning"||s1==="overdue"))
      items.push({ id: v.id+"_u1", naam: v.naam, type: s1==="overdue"?"overdue":"warning", datum: v.datum1, deadline: addDays(v.datum1,-INVITE_DAYS) });
    if (v.needs2e && v.datum2 && !v.vergaderd2 && (s2==="warning"||s2==="overdue"))
      items.push({ id: v.id+"_u2", naam: v.naam, type: s2==="overdue"?"overdue":"warning", datum: v.datum2, deadline: addDays(v.datum2,-INVITE_DAYS), is2e: true });
    if (v.extraVergadering && v.datumExtra && !v.vergaderdExtra && (sE==="warning"||sE==="overdue"))
      items.push({ id: v.id+"_uE", naam: v.naam, type: sE==="overdue"?"overdue":"warning", datum: v.datumExtra, deadline: addDays(v.datumExtra,-INVITE_DAYS), isExtra: true });
    if (v.datum1 && v.datum1 < today() && !v.needs2e && !v.vergaderd1)
      items.push({ id: v.id+"_2e", naam: v.naam, type: "geen2e", datum: v.datum1 });
    return items;
  });

  // On-track estimate: % afgerond vs % of year elapsed
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const yearPct = Math.round(((now - yearStart) / (yearEnd - yearStart)) * 100);
  const afgerondPct = data.vves.length === 0 ? 0 : Math.round((afgerond / data.vves.length) * 100);
  const onTrackDiff = afgerondPct - yearPct; // positive = ahead, negative = behind

  const filtered = (planningPreview||data.vves)
    .filter(v => v.naam.toLowerCase().includes(search.toLowerCase()))
    .filter(v => hideAfgerond ? !(v.vergaderd1 && (!v.needs2e || v.vergaderd2)) : true)
    .slice()
    .sort((a,b) => {
      // Gebruik de laatste relevante datum: datumExtra > datum2 > datum1
      const sortDatum = (v) => v.datumExtra || v.datum2 || v.datum1 || "";
      const da = sortDatum(a);
      const db = sortDatum(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });

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
            <input
              autoFocus
              value={loginNaam}
              onChange={e=>{ setLoginNaam(e.target.value); setLoginError(""); }}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="Jouw naam"
              className={`w-full bg-zinc-800 border rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none ${loginError?"border-red-700":"border-zinc-700 focus:border-zinc-600"}`}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Wachtwoord</label>
            <input
              type="password"
              value={loginPw}
              onChange={e=>{ setLoginPw(e.target.value); setLoginError(""); }}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="Wachtwoord"
              className={`w-full bg-zinc-800 border rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none ${loginError?"border-red-700":"border-zinc-700 focus:border-zinc-600"}`}
            />
          </div>
          {loginError && <p className="text-xs text-red-400">{loginError}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-zinc-200 text-sm font-medium rounded-lg transition-colors mt-1"
          >
            {loading ? "Laden…" : "Inloggen →"}
          </button>
        </div>
      </div>
    </div>
  );

  // Main screen
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🏢</span>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">VvE Vergaderplanner</h1>
            <p className="text-xs text-zinc-500">{beheerder}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={()=>{ setScreen("login"); setLoginNaam(""); setLoginPw(""); }} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Uitloggen</button>
          {saving && <span className="text-[10px] text-zinc-600 animate-pulse">Opslaan…</span>}
        </div>
      </div>

      <div className="border-b border-zinc-800 px-6 py-3 flex gap-6">
        <div className="text-center"><div className="text-lg font-mono font-bold text-zinc-100">{data.vves.length}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">VvE's</div></div>
        <div className="text-center"><div className="text-lg font-mono font-bold text-emerald-400">{afgerond}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Afgerond</div></div>
        <div className="text-center"><div className="text-lg font-mono font-bold text-sky-400">{uitgenodigd}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Uitgenodigd</div></div>
        <div className="text-center"><div className="text-lg font-mono font-bold text-zinc-500">{nietUitgenodigd}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Niet uitgenodigd</div></div>
        {metWaarschuwing>0 && <div className="text-center"><div className="text-lg font-mono font-bold text-red-400">{metWaarschuwing}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Uitnodiging!</div></div>}
        {inVakantie>0 && <div className="text-center"><div className="text-lg font-mono font-bold text-amber-400">{inVakantie}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">In vakantie</div></div>}
      </div>

      <div className="border-b border-zinc-800 px-6 flex gap-1">
        {[["vergaderingen","Vergaderingen"],["overzicht","Spreiding"],["vakantie","Vakantie"],["instellingen","Instellingen"]].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} className={`px-4 py-3 text-sm transition-colors border-b-2 -mb-px ${tab===key?"border-zinc-400 text-zinc-100":"border-transparent text-zinc-500 hover:text-zinc-400"}`}>{label}</button>
        ))}
      </div>

      <div className="p-6 max-w-4xl mx-auto">

        {/* ── VERGADERINGEN ── */}
        {tab==="vergaderingen" && (
          <div className="space-y-4">

            {/* Notification panel */}
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
                      <span className="font-medium">{item.naam}</span>
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
              <input value={newVveName} onChange={e=>setNewVveName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVve()} placeholder="VvE naam toevoegen…" className="flex-1 min-w-48 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"/>
              <button onClick={addVve} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors">+</button>
              <button onClick={()=>setShowImport(i=>!i)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm rounded-lg transition-colors whitespace-nowrap">Bulk import</button>
              {ongepland > 0 && !planningPreview && (
                <button onClick={handleGeneratePlanning} className="px-4 py-2 bg-sky-900/60 hover:bg-sky-800/60 border border-sky-800/60 text-sky-300 text-sm rounded-lg transition-colors whitespace-nowrap">
                  ✦ Stel planning voor ({ongepland} ongepland)
                </button>
              )}
            </div>

            {showImport && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                <p className="text-xs text-zinc-500">Plak VvE-namen, één per regel. Datum en tijd worden automatisch herkend als je ze tab-gescheiden aanlevert (naam ⇥ d-m-jjjj ⇥ tijd).</p>
                <textarea rows={6} value={importText} onChange={e=>setImportText(e.target.value)} placeholder={"Zwolsestraat 253\t16-4-2026\t15.00\nTak van Poortvlietstraat 9 AB\t1-6-2026\t15:00 uur\n..."} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none resize-none font-mono"/>
                <div className="flex gap-2">
                  <button onClick={handleImport} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition-colors">Importeer</button>
                  <button onClick={()=>setShowImport(false)} className="text-sm text-zinc-500 hover:text-zinc-400">Annuleer</button>
                </div>
              </div>
            )}

            {/* Search + hide toggle */}
            {/* Search + hide toggle + selecteer alles */}
            <div className="flex gap-3 items-center flex-wrap">
              {data.vves.length>5 && <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek VvE…" className="flex-1 min-w-40 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"/>}
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
                {data.vves.length===0 ? "Nog geen VvE's. Voeg er een toe." : hideAfgerond && afgerond===data.vves.length ? "Alle VvE's zijn afgerond. 🎉" : "Geen resultaten."}
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
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SPREIDING ── */}
        {tab==="overzicht" && (
          <div className="space-y-6">

            {/* Progress scorecard */}
            {data.vves.length > 0 && (() => {
              const total = data.vves.length;
              const pctAfgerond = Math.round((afgerond / total) * 100);
              const pctUitgenodigd = Math.round((uitgenodigd / total) * 100);
              const pctNiet = 100 - pctAfgerond - pctUitgenodigd;

              // SVG donut
              const R = 54; const C = 2 * Math.PI * R;
              const dasAfgerond = (pctAfgerond / 100) * C;
              const dasUitgenodigd = (pctUitgenodigd / 100) * C;
              const offsetAfgerond = 0;
              const offsetUitgenodigd = dasAfgerond;
              const offsetNiet = dasAfgerond + dasUitgenodigd;

              const label = pctAfgerond === 100 ? "Alles afgerond! 🎉"
                : pctAfgerond >= 75 ? "Bijna klaar"
                : pctAfgerond >= 50 ? "Op de helft"
                : pctAfgerond >= 25 ? "Goed op weg"
                : "Net begonnen";

              return (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-6">Voortgang {new Date().getFullYear()}</h2>
                  <div className="flex items-center gap-8">
                    {/* Donut */}
                    <div className="relative shrink-0">
                      <svg width="140" height="140" viewBox="0 0 140 140">
                        {/* Background ring */}
                        <circle cx="70" cy="70" r={R} fill="none" stroke="#27272a" strokeWidth="14"/>
                        {/* Niet uitgenodigd — render first (bottom layer) */}
                        {pctNiet > 0 && (
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#3f3f46" strokeWidth="14"
                            strokeDasharray={`${(pctNiet/100)*C} ${C}`}
                            strokeDashoffset={-offsetNiet}
                            transform="rotate(-90 70 70)" strokeLinecap="butt"/>
                        )}
                        {/* Uitgenodigd */}
                        {pctUitgenodigd > 0 && (
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#0ea5e9" strokeWidth="14"
                            strokeDasharray={`${dasUitgenodigd} ${C}`}
                            strokeDashoffset={-offsetUitgenodigd}
                            transform="rotate(-90 70 70)" strokeLinecap="butt"/>
                        )}
                        {/* Afgerond — on top */}
                        {pctAfgerond > 0 && (
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#10b981" strokeWidth="14"
                            strokeDasharray={`${dasAfgerond} ${C}`}
                            strokeDashoffset={0}
                            transform="rotate(-90 70 70)" strokeLinecap="butt"/>
                        )}
                        {/* Centre text */}
                        <text x="70" y="65" textAnchor="middle" fill="#f4f4f5" fontSize="22" fontWeight="700" fontFamily="monospace">{pctAfgerond}%</text>
                        <text x="70" y="82" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">afgerond</text>
                      </svg>
                    </div>

                    {/* Stats */}
                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-base font-semibold text-zinc-200">{label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{afgerond} van {total} vergaderingen volledig afgerond</p>
                      </div>
                      <div className="space-y-2.5">
                        {[
                          ["Afgerond", afgerond, total, "#10b981", "bg-emerald-500"],
                          ["Uitgenodigd", uitgenodigd, total, "#0ea5e9", "bg-sky-500"],
                          ["Niet uitgenodigd", nietUitgenodigd, total, "#52525b", "bg-zinc-600"],
                        ].map(([lbl, val, tot, , barColor]) => (
                          <div key={lbl}>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs text-zinc-400">{lbl}</span>
                              <span className="text-xs font-mono text-zinc-400">{val} <span className="text-zinc-600">/ {tot}</span></span>
                            </div>
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{width:`${tot===0?0:Math.round((val/tot)*100)}%`}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Month chart */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Vergaderingen per maand — {new Date().getFullYear()}</h2>
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
                const year=new Date().getFullYear();
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
                  return werkdagen[dow] ? (
                    <span key={dow} className="text-[10px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded font-mono">{labels[i]}</span>
                  ) : null;
                })}
                {[1,2,3,4,5,6,0].filter(dow=>werkdagen[dow]).length===0 && (
                  <span className="text-xs text-red-400">⚠ Geen werkdagen geselecteerd — auto-planning werkt niet.</span>
                )}
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
