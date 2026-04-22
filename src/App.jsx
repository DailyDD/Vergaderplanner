import { useState, useEffect, useCallback, useRef } from "react";

// ── Huisstijl Totaal VvE Beheer ──────────────────────────────────
// Primair: #991A21 (donkerrood), Antraciet: #2D2D2D, Achtergrond: #F2EFEC
const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

// ── Config ───────────────────────────────────────────────────────
const INVITE_DAYS = 21;
const NL_MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const NL_MONTHS_FULL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
const NL_DAYS = ["Zo","Ma","Di","Wo","Do","Vr","Za"];
const WORK_DAYS_DEFAULT = [false, true, true, true, true, true, false];


// ── Supabase client ──────────────────────────────────────────────
const SUPABASE_URL = "https://nuipelnbbhvnotxpyxdj.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51aXBlbG5iYmh2bm90eHB5eGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk3MjcsImV4cCI6MjA5MDkwNTcyN30.Y9CoxrTN3X49miiRjp3ieZmamcbKp_y9YK9RLKIc68s";

// Houdt het huidige access token bij na inloggen
let _accessToken = null;

function getAuthHeaders() {
  return {
    "apikey": SUPABASE_ANON,
    "Authorization": `Bearer ${_accessToken || SUPABASE_ANON}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

// ── Supabase Auth ────────────────────────────────────────────────
async function signIn(email, wachtwoord) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: wachtwoord }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Inloggen mislukt");
  _accessToken = data.access_token;
  return data;
}

async function signOut() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${_accessToken}` },
    });
  } catch(e) { console.error("signOut", e); }
  _accessToken = null;
}

async function getUserRole() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?select=naam,rol`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Rol ophalen mislukt");
  const rows = await res.json();
  if (!rows[0]) return null;
  // Sla laatste login op
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Prefer": "" },
      body: JSON.stringify({ laatste_login: new Date().toISOString() }),
    });
  } catch(e) { console.error("laatste_login opslaan mislukt", e); }
  return rows[0];
}

async function loadAllRoles() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?select=naam,rol,laatste_login`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch(e) { console.error("loadAllRoles", e); return []; }
}

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
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

// Beheerderlijst komt uit Supabase user_roles
const BEHEERDER_NAMEN = ["Jeffrey","Daley","Jan-Jaap","Tahir","Diana","Fred","Laura","Isaac","Kelvin","Martijn","Bryan","Alwart","Radjesh","Rob","Jaap","Vinny","Brian","Pascalle","Joerie","Jasper","Frank","Janette"];
function getBeheerderList() { return BEHEERDER_NAMEN; }

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
    green:"bg-emerald-50 text-emerald-700 border border-emerald-200",
    orange:"bg-orange-50 text-orange-700 border border-orange-200",
    red:"bg-red-50 text-[#991A21] border border-red-200",
    blue:"bg-blue-50 text-blue-700 border border-blue-200",
    gray:"bg-gray-100 text-gray-600 border border-gray-200",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c[color]||c.gray}`}>{children}</span>;
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
            <div className="w-full rounded-sm overflow-hidden bg-gray-100 h-16 flex items-end relative">
              {inVak && <div className="absolute inset-0 opacity-20 bg-amber-400 pointer-events-none"/>}
              <div className="w-full transition-all duration-500 rounded-sm" style={{height:`${Math.max(pct,count>0?8:0)}%`,backgroundColor:color}}/>
            </div>
            <span className="text-[9px] text-gray-400 font-mono uppercase">{m}</span>
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
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
          ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
          ${checked ? "bg-[#991A21] border-[#991A21]" : "border-gray-300 hover:border-[#991A21]"}`}
      >
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <span className={`text-xs transition-colors ${disabled ? "text-gray-300" : "text-gray-600 group-hover:text-[#2D2D2D]"}`}>{label}</span>
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
    : "bg-gray-300";

  const updateDatum1 = (val) => onUpdate({ ...vve, datum1: val, uitgenodigd1: false });
  const updateDatum2 = (val) => onUpdate({ ...vve, datum2: val, uitgenodigd2: false });

  return (
    <div ref={rowRef} className={`rounded-xl overflow-hidden transition-all shadow-sm ${afgerond ? "border-2 border-emerald-300 bg-emerald-50/30" : "border-2 border-gray-300 bg-white"}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={()=>setExpanded(e=>!e)}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold truncate ${afgerond ? "text-emerald-700" : "text-[#2D2D2D]"}`}>{vve.naam}</span>
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
              <span className="text-xs text-gray-500">
                1e: <span className={vergaderd1 ? "text-emerald-600 line-through" : "text-zinc-400"}>{fmtDate(vve.datum1)}</span>
                {!uitgenodigd1 && !vergaderd1 && <span className="text-zinc-600 ml-1">· uitnodigen uiterlijk {fmtDate(addDays(vve.datum1, -INVITE_DAYS))}</span>}
                {uitgenodigd1 && !vergaderd1 && <span className="text-emerald-700 ml-1">· uitnodiging verstuurd</span>}
                {vergaderd1 && <span className="text-emerald-700 ml-1">· heeft plaatsgevonden</span>}
              </span>
            )}
            {vve.datum2 && (
              <span className="text-xs text-gray-500">
                2e: <span className={vergaderd2 ? "text-emerald-600 line-through" : "text-zinc-400"}>{fmtDate(vve.datum2)}</span>
                {!uitgenodigd2 && !vergaderd2 && <span className="text-zinc-600 ml-1">· uitnodigen uiterlijk {fmtDate(addDays(vve.datum2, -INVITE_DAYS))}</span>}
                {uitgenodigd2 && !vergaderd2 && <span className="text-emerald-700 ml-1">· uitnodiging verstuurd</span>}
                {vergaderd2 && <span className="text-emerald-700 ml-1">· heeft plaatsgevonden</span>}
              </span>
            )}
          </div>
        </div>
        <span className="text-gray-400 text-xs">{expanded?"▲":"▼"}</span>
      </div>

      {expanded && (
        <div className="border-t-2 border-x-2 border-b-2 border-gray-300 px-4 py-4 bg-[#F2EFEC] space-y-5">

          {/* 1e vergadering */}
          <div className="space-y-2">
            <span className="text-xs text-zinc-400 font-medium">1e vergadering</span>
            <input type="date" value={vve.datum1} onChange={e=>updateDatum1(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"/>
            {vve.datum1 && (
              <div className={`rounded-lg px-3 py-2.5 border ${
                inv1==="overdue" ? "border-red-900/50 bg-red-950/20" :
                inv1==="warning" ? "border-amber-900/50 bg-amber-950/20" :
                inv1==="confirmed" ? "border-emerald-900/40 bg-emerald-950/10" :
                "border-gray-200 bg-gray-50"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${
                    inv1==="overdue" ? "text-[#991A21]" :
                    inv1==="warning" ? "text-amber-400" :
                    inv1==="confirmed" ? "text-emerald-600" : "text-zinc-400"}`}>
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
              <div className="border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2.5 space-y-1.5">
                <label className="text-xs text-emerald-700 font-semibold block">📅 Voorkeursdatum volgend jaar</label>
                <p className="text-[10px] text-gray-500">Optioneel — wordt meegenomen in de auto-planning voor {new Date().getFullYear() + 1}.</p>
                <input
                  type="date"
                  value={vve.voorkeurVolgendjaar || ""}
                  onChange={e => onUpdate({ ...vve, voorkeurVolgendjaar: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-emerald-600 transition-colors"
                />
                {vve.voorkeurVolgendjaar && (
                  <p className="text-[10px] text-emerald-700 font-medium">✓ Voorkeur opgeslagen: {fmtDate(vve.voorkeurVolgendjaar)}</p>
                )}
              </div>
            )}
          </div>

          {/* 2e vergadering */}
          {vve.needs2e && (
            <div className="space-y-2 border-t border-gray-200 pt-4">
              <span className="text-xs text-zinc-400 font-medium">2e reglementaire vergadering</span>
              <div className="flex gap-2">
                <input type="date" value={vve.datum2||""} onChange={e=>updateDatum2(e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"/>
                {vve.datum1 && !vve.datum2 && (
                  <button onClick={()=>onAdd2nd(vve)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors whitespace-nowrap">+3w</button>
                )}
              </div>
              {vve.datum2 && (
                <div className={`rounded-lg px-3 py-2.5 border ${
                  inv2==="overdue" ? "border-red-900/50 bg-red-950/20" :
                  inv2==="warning" ? "border-amber-900/50 bg-amber-950/20" :
                  inv2==="confirmed" ? "border-emerald-900/40 bg-emerald-950/10" :
                  "border-gray-200 bg-gray-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${
                      inv2==="overdue" ? "text-[#991A21]" :
                      inv2==="warning" ? "text-amber-400" :
                      inv2==="confirmed" ? "text-emerald-600" : "text-zinc-400"}`}>
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
                <div className="border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2.5 space-y-1.5">
                  <label className="text-xs text-emerald-700 font-semibold block">📅 Voorkeursdatum volgend jaar</label>
                  <p className="text-[10px] text-gray-500">Optioneel — wordt meegenomen in de auto-planning voor {new Date().getFullYear() + 1}.</p>
                  <input
                    type="date"
                    value={vve.voorkeurVolgendjaar || ""}
                    onChange={e => onUpdate({ ...vve, voorkeurVolgendjaar: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-emerald-600 transition-colors"
                  />
                  {vve.voorkeurVolgendjaar && (
                    <p className="text-[10px] text-emerald-700 font-medium">✓ Voorkeur opgeslagen: {fmtDate(vve.voorkeurVolgendjaar)}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Notitie</label>
            <input type="text" value={vve.notitie||""} onChange={e=>onUpdate({...vve,notitie:e.target.value})}
              placeholder="Bijv. altijd dinsdag…"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors"/>
            {vve.voorkeurVolgendjaar && vve.notitie && (
              <div className="mt-2 flex items-start gap-2 bg-amber-950/30 border border-amber-800/50 rounded-lg px-3 py-2">
                <span className="text-amber-400 shrink-0 mt-0.5">💡</span>
                <p className="text-xs text-amber-300"><span className="font-medium">Let op:</span> {vve.notitie}</p>
              </div>
            )}
          </div>

          {/* Extra vergadering */}
          <div className="space-y-2 border-t border-gray-200 pt-4">
            <Checkbox checked={!!vve.extraVergadering} disabled={false}
              onChange={v=>onUpdate({...vve, extraVergadering: v, datumExtra: v ? vve.datumExtra : "", uitgenodigdExtra: false, vergaderdExtra: false})}
              label="Extra vergadering"/>
            {vve.extraVergadering && (
              <div className="space-y-2 pl-1">
                <input type="date" value={vve.datumExtra||""}
                  onChange={e=>onUpdate({...vve, datumExtra: e.target.value, uitgenodigdExtra: false})}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"/>
                {vve.datumExtra && (
                  <div className={`rounded-lg px-3 py-2.5 border ${
                    inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="overdue" ? "border-red-900/50 bg-red-950/20" :
                    inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="warning" ? "border-amber-900/50 bg-amber-950/20" :
                    inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="confirmed" ? "border-emerald-900/40 bg-emerald-950/10" :
                    "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${
                        inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="overdue" ? "text-[#991A21]" :
                        inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="warning" ? "text-amber-400" :
                        inviteStatus(vve.datumExtra, vve.uitgenodigdExtra)==="confirmed" ? "text-emerald-600" : "text-zinc-400"}`}>
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
            <p className="text-[10px] text-orange-700 border-t border-gray-200 pt-3">
              💡 Vergeet niet de kosten in rekening te brengen
              {vve.needs2e && vve.extraVergadering ? " voor de 2e reglementaire vergadering en de extra vergadering." :
               vve.needs2e ? " voor de 2e reglementaire vergadering." :
               " voor de extra vergadering."}
            </p>
          )}

          <div className="flex justify-end">
            <button onClick={()=>onDelete(vve.id)} className="text-xs text-gray-400 hover:text-[#991A21] transition-colors">Verwijder VvE</button>
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
          className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${werkdagen[dow] ? "bg-[#991A21] text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:border-[#991A21]"}`}
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
function exportTotaalExcel(allData, beheerderList) {
  const year = new Date().getFullYear();
  const rows = [["Beheerder","VvE","1e vergadering","Uitgenodigd 1e","Vergaderd 1e","2e reglementair","2e vergadering","Uitgenodigd 2e","Vergaderd 2e","Extra vergadering","Extra datum","Voorkeur volgend jaar","Notitie","Status"]];
  for (const naam of beheerderList) {
    const vves = allData[naam]?.vves || [];
    for (const v of vves) {
      const afg = isAfgerond(v);
      const status = afg ? "Afgerond" : v.uitgenodigd1 ? "Uitgenodigd" : v.datum1 ? "Gepland" : "Niet gepland";
      rows.push([
        naam,
        v.naam,
        v.datum1 ? fmtDate(v.datum1) : "",
        v.uitgenodigd1 ? "Ja" : "Nee",
        v.vergaderd1 ? "Ja" : "Nee",
        v.needs2e ? "Ja" : "Nee",
        v.datum2 ? fmtDate(v.datum2) : "",
        v.uitgenodigd2 ? "Ja" : "Nee",
        v.vergaderd2 ? "Ja" : "Nee",
        v.extraVergadering ? "Ja" : "Nee",
        v.datumExtra ? fmtDate(v.datumExtra) : "",
        v.voorkeurVolgendjaar ? fmtDate(v.voorkeurVolgendjaar) : "",
        v.notitie || "",
        status,
      ]);
    }
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `VvE_Totaaloverzicht_${year}.csv`;
  a.click(); URL.revokeObjectURL(url);
}


// ── VvE Calculator ───────────────────────────────────────────────
const LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAb8AAAG/CAMAAAD/zSlAAAAA81BMVEX///+bHSEjHSEAAAD8//8nISH//f/n5+f9//2ZHiGIAACRAAC5t7iUAAAfGBiNAAAkIyEKAAA6Ojp7enqrqaofHhza2dpJSEf5+fmenZ7Rz9APAAUYERS/vb5DQkLz8vIxKinq0tKcGRvmx8jXsrHPqqufJiyBAADbv7/fvL/s4eEdFhvBkJOycXHIxsf78fKze3rcyMfJnp9oZ2eiQ0ORkJFWVFTBi4eXMzfAgYHLm5W0ZGWWAA4UExDBeXarV1e0VFuoPj6PJCShR02lVV6vcnqkABCaKTKfXmGwaHGdT0eDFhepZmKLDh7fyLugAACKNDUK/lRAAAAgAElEQVR4nO1dCXuiyNYmgiAq4i4qESWaGNe4RlvtTDozk567+878///XfKeq2FRKTTrpztjnfe6dNgoF1MvZaxEEBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCASC/w8A';

const CALC_S = {
  bordeaux: '#991A21', bordeauxDark: '#6B1217', bordeauxLight: '#F5E6E7',
  cream: '#FAF7F2', ink: '#1A1614', muted: '#8A7E7B', border: '#E5DEDA',
  green: '#2D6A4F', greenBg: '#EAF4EE', amber: '#92550A', amberBg: '#FEF3E2',
  redBg: '#FDEAEB', blue: '#1A4D7A', blueBg: '#EAF1F8',
};

const calcFmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const calcToday = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

let _calcId = 0;
const calcUid = () => ++_calcId;

function CalcSecTitle({ children }) {
  return (
    <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'#8A7E7B', marginBottom:10, marginTop:26, display:'flex', alignItems:'center', gap:8 }}>
      {children}<div style={{ flex:1, height:1, background:'#E5DEDA' }} />
    </div>
  );
}
function CalcCard({ header, children }) {
  return <div style={{ background:'#fff', border:'1px solid #E5DEDA', borderRadius:12, overflow:'hidden', marginBottom:14 }}>{header}{children}</div>;
}
function CalcCardHdr({ icon, bg, title, sub }) {
  return (
    <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5DEDA', display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ width:30, height:30, borderRadius:7, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{icon}</div>
      <div><div style={{ fontSize:13, fontWeight:600 }}>{title}</div><div style={{ fontSize:11, color:'#8A7E7B', marginTop:1 }}>{sub}</div></div>
    </div>
  );
}
function CalcField({ label, children }) {
  return <div style={{ marginBottom:4 }}><label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8A7E7B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>{label}</label>{children}</div>;
}
function CalcInp(props) {
  return <input {...props} style={{ width:'100%', padding:'8px 11px', border:'1.5px solid #E5DEDA', borderRadius:8, fontFamily:'monospace', fontSize:14, color:'#1A1614', background:'#FAF7F2', outline:'none' }}
    onFocus={e=>{e.target.style.borderColor='#991A21';e.target.style.background='#fff'}}
    onBlur={e=>{e.target.style.borderColor='#E5DEDA';e.target.style.background='#FAF7F2'}} />;
}
function CalcTag({ c, t, children }) {
  return <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:4, fontSize:11, fontWeight:500, background:c, color:t }}>{children}</span>;
}
function CalcMethodBlock({ tag, name, rows, total }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E5DEDA', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'12px 18px 10px', borderBottom:'1px solid #E5DEDA' }}>
        <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8A7E7B' }}>{tag}</div>
        <div style={{ fontFamily:'Georgia,serif', fontSize:15, color:'#1A1614', marginTop:2 }}>{name}</div>
      </div>
      {rows.map(([l,v],i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'7px 18px', borderBottom:'1px solid #E5DEDA', fontSize:13 }}>
          <span style={{ color:'#8A7E7B' }}>{l}</span><span style={{ fontFamily:'monospace', fontWeight:500 }}>{v}</span>
        </div>
      ))}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'10px 18px', fontSize:13 }}>
        <span style={{ color:'#8A7E7B' }}>Maandlasten VvE totaal</span>
        <span style={{ fontFamily:'Georgia,serif', fontSize:22, color:'#991A21' }}>{total}</span>
      </div>
    </div>
  );
}

function VveCalculator({ onTerug }) {
  const [complexNaam, setComplexNaam] = useState('');
  const [herbouwwaarde, setHerbouwwaarde] = useState('');
  const [mjopTotaal, setMjopTotaal] = useState('');
  const [planPeriode, setPlanPeriode] = useState('10');
  const [verzekering, setVerzekering] = useState('');
  const [administratie, setAdministratie] = useState('');
  const [overig, setOverig] = useState('');
  const [rows, setRows] = useState([
    { id: calcUid(), naam: '', teller: '', noemer: '' },
    { id: calcUid(), naam: '', teller: '', noemer: '' },
    { id: calcUid(), naam: '', teller: '', noemer: '' },
  ]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const formula = (() => {
    const t = parseFloat(mjopTotaal) || 0;
    const p = parseFloat(planPeriode) || 10;
    if (!t) return 'Jaarlijkse dotatie = Totale MJOP-kosten ÷ Planperiode';
    return calcFmt(t) + ' ÷ ' + p + ' jaar = ' + calcFmt(t / p) + ' jaarlijkse dotatie';
  })();

  const breukCheck = (() => {
    const filled = rows.filter(r => r.teller !== '' && r.noemer !== '' && parseFloat(r.noemer) > 0);
    if (!filled.length) return null;
    const total = filled.reduce((s, r) => s + parseFloat(r.teller) / parseFloat(r.noemer), 0);
    return { ok: Math.abs(total - 1) < 0.0011, pct: (total * 100).toFixed(3) };
  })();

  const addRow = () => setRows(p => [...p, { id: calcUid(), naam: '', teller: '', noemer: '' }]);
  const delRow = (id) => setRows(p => p.filter(r => r.id !== id));
  const updRow = (id, f, v) => setRows(p => p.map(r => r.id === id ? { ...r, [f]: v } : r));

  const bereken = () => {
    setError('');
    const hv = parseFloat(herbouwwaarde) || 0;
    const mt = parseFloat(mjopTotaal) || 0;
    const pp = parseFloat(planPeriode) || 10;
    const vz = parseFloat(verzekering) || 0;
    const ad = parseFloat(administratie) || 0;
    const ov = parseFloat(overig) || 0;
    const validRows = rows.filter(r => r.teller !== '' && r.noemer !== '' && parseFloat(r.noemer) > 0);
    if (!validRows.length) { setError('Voeg eerst eigenaren toe met breukdelen.'); return; }
    if (!hv && !mt) { setError('Vul minimaal de herbouwwaarde of MJOP-kosten in.'); return; }
    const dotatie = mt > 0 ? mt / pp : 0;
    const exploit = vz + ad + ov;
    const jaarMjop = dotatie + exploit;
    const mndMjop = jaarMjop / 12;
    const jaar05 = hv * 0.005;
    const jaarTot05 = jaar05 + exploit;
    const mnd05 = jaarTot05 / 12;
    const totalFrac = validRows.reduce((s, r) => s + parseFloat(r.teller) / parseFloat(r.noemer), 0);
    const eigenaren = validRows.map(r => {
      const frac = parseFloat(r.teller) / parseFloat(r.noemer);
      const aandeel = totalFrac > 0 ? frac / totalFrac : 0;
      return { naam: r.naam || ('App. ' + r.id), teller: r.teller, noemer: r.noemer, aandeel, bijdrMjop: mt > 0 ? aandeel * mndMjop : null, bijdr05: hv > 0 ? aandeel * mnd05 : null };
    });
    setResult({ complexNaam: complexNaam || 'Complex', mjopTotaal: mt, planPeriode: pp, dotatie, exploitatie: exploit, jaarMjop, mndMjop, hasMjop: mt > 0, herbouwwaarde: hv, jaar05, jaar05Totaal: jaarTot05, mnd05, has05: hv > 0, eigenaren });
    setTimeout(() => document.getElementById('calc-res-anker')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>
      {/* Topbar */}
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center"><span className="text-white text-xs">🏠</span></div>
            <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center"><span className="text-white text-xs">📋</span></div>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">VvE Calculator</span>
        </div>
        <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:text-[#991A21] transition-colors">
          ← Terug naar portaal
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 80px' }}>
        <CalcSecTitle>Stap 1 — Algemene gegevens</CalcSecTitle>
        <CalcCard header={<CalcCardHdr icon="🏢" bg={CALC_S.redBg} title="Complexgegevens" sub="Naam en herbouwwaarde" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px' }}>
            <CalcField label="Naam complex"><CalcInp placeholder="bijv. VvE Reinkenstraat 1–24" value={complexNaam} onChange={e=>setComplexNaam(e.target.value)} /></CalcField>
            <CalcField label="Herbouwwaarde (€)"><CalcInp type="number" placeholder="bijv. 2500000" value={herbouwwaarde} onChange={e=>setHerbouwwaarde(e.target.value)} /></CalcField>
          </div>
        </CalcCard>

        <CalcSecTitle>Stap 2 — MJOP gegevens</CalcSecTitle>
        <CalcCard header={<CalcCardHdr icon="📋" bg={CALC_S.amberBg} title="Meerjarenonderhoudsplan (MJOP)" sub="Totale kosten over de planperiode" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 0' }}>
            <CalcField label="Totale MJOP-kosten (€)"><CalcInp type="number" placeholder="bijv. 150000" value={mjopTotaal} onChange={e=>setMjopTotaal(e.target.value)} /></CalcField>
            <CalcField label="Planperiode (jaren)"><CalcInp type="number" placeholder="10" value={planPeriode} onChange={e=>setPlanPeriode(e.target.value)} /></CalcField>
          </div>
          <div style={{ margin:'10px 20px 18px', padding:'9px 13px', background:CALC_S.cream, border:'1px solid '+CALC_S.border, borderRadius:7, fontFamily:'monospace', fontSize:12, color:CALC_S.muted }}>{formula}</div>
        </CalcCard>

        <CalcSecTitle>Stap 3 — Overige exploitatiekosten (jaarlijks)</CalcSecTitle>
        <CalcCard header={<CalcCardHdr icon="💼" bg={CALC_S.blueBg} title="Exploitatiekosten" sub="Buiten het MJOP — optioneel maar van invloed op totale bijdrage" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, padding:'18px 20px' }}>
            <CalcField label="Opstalverzekering (€/jaar)"><CalcInp type="number" placeholder="bijv. 3200" value={verzekering} onChange={e=>setVerzekering(e.target.value)} /></CalcField>
            <CalcField label="Administratie/beheer (€/jaar)"><CalcInp type="number" placeholder="bijv. 2400" value={administratie} onChange={e=>setAdministratie(e.target.value)} /></CalcField>
            <CalcField label="Overig (€/jaar)"><CalcInp type="number" placeholder="bijv. 1800" value={overig} onChange={e=>setOverig(e.target.value)} /></CalcField>
          </div>
        </CalcCard>

        <CalcSecTitle>Stap 4 — Eigenaren &amp; breukdelen</CalcSecTitle>
        <CalcCard header={<CalcCardHdr icon="👥" bg={CALC_S.greenBg} title="Eigenaren" sub="Naam en breukdeel conform splitsingsakte" />}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:CALC_S.cream, borderBottom:'1px solid '+CALC_S.border }}>
                  {['#','Naam / appartement','Breukdeel teller','Breukdeel noemer',''].map((h,i)=>(
                    <th key={i} style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:CALC_S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:[36,null,150,150,44][i] }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={r.id} style={{ borderBottom: i < rows.length-1 ? '1px solid '+CALC_S.border : 'none' }}>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:11, color:CALC_S.muted, padding:'7px 8px' }}>{i+1}</td>
                    <td style={{ padding:'5px 6px' }}><CalcInp placeholder="bijv. App. 1 · De Vries" value={r.naam} onChange={e=>updRow(r.id,'naam',e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CalcInp type="number" placeholder="1" value={r.teller} onChange={e=>updRow(r.id,'teller',e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CalcInp type="number" placeholder="bijv. 100" value={r.noemer} onChange={e=>updRow(r.id,'noemer',e.target.value)} /></td>
                    <td style={{ padding:'5px 6px', textAlign:'center' }}>
                      <button onClick={()=>delRow(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:CALC_S.muted, padding:'2px 6px', borderRadius:4 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {breukCheck && (
            <div style={{ margin:'8px 20px 4px', padding:'6px 10px', borderRadius:6, fontSize:12, fontFamily:'monospace', background:breukCheck.ok?CALC_S.greenBg:CALC_S.amberBg, color:breukCheck.ok?CALC_S.green:CALC_S.amber }}>
              {breukCheck.ok ? '✓ Breukdelen correct — totaal 100%' : '⚠ Breukdelen tellen op tot '+breukCheck.pct+'% — controleer splitsingsakte'}
            </div>
          )}
          <button onClick={addRow} style={{ margin:'10px 20px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+CALC_S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:CALC_S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Eigenaar toevoegen
          </button>
        </CalcCard>

        {error && <div style={{ background:CALC_S.redBg, color:CALC_S.bordeaux, padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:10 }}>{error}</div>}

        <button onClick={bereken} style={{ width:'100%', padding:14, background:CALC_S.bordeaux, border:'none', borderRadius:12, fontFamily:'Georgia,serif', fontSize:17, color:'#fff', cursor:'pointer', marginTop:4 }}>
          Bereken maandelijkse bijdragen →
        </button>

        {result && (
          <div id="calc-res-anker">
            <CalcSecTitle style={{ marginTop:36 }}>Resultaat</CalcSecTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <CalcMethodBlock tag="Methode 1 — Wettelijke voorkeur" name="Op basis van MJOP" rows={[['Totale MJOP-kosten',calcFmt(result.mjopTotaal)],['Planperiode',result.planPeriode+' jaar'],['Jaarlijkse MJOP-dotatie',calcFmt(result.dotatie)],['Overige exploitatiekosten',calcFmt(result.exploitatie)],['Totale jaarlasten VvE',calcFmt(result.jaarMjop)]]} total={result.hasMjop?calcFmt(result.mndMjop):'—'} />
              <CalcMethodBlock tag="Methode 2 — Wettelijk minimum" name="0,5% van herbouwwaarde" rows={[['Herbouwwaarde',calcFmt(result.herbouwwaarde)],['0,5% jaarlijkse reservering',calcFmt(result.jaar05)],['Overige exploitatiekosten',calcFmt(result.exploitatie)],['Totale jaarlasten VvE',calcFmt(result.jaar05Totaal)],['Toelichting','Minimumeis bij geen/oud MJOP']]} total={result.has05?calcFmt(result.mnd05):'—'} />
            </div>
            <CalcCard header={<CalcCardHdr icon="🔢" bg={CALC_S.redBg} title="Maandelijkse bijdrage per eigenaar" sub="Verdeling naar rato breukdeel" />}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:CALC_S.cream, borderBottom:'1px solid '+CALC_S.border }}>
                      {['Eigenaar','Breukdeel','Aandeel %','Bijdrage MJOP/mnd','Bijdrage 0,5%/mnd','Verschil'].map((h,i)=>(
                        <th key={i} style={{ padding:'8px 12px', textAlign:i>1?'right':'left', fontSize:10, fontWeight:600, color:CALC_S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.eigenaren.map((e,i)=>{
                      const diff = e.bijdrMjop!==null&&e.bijdr05!==null?e.bijdrMjop-e.bijdr05:null;
                      let tag = null;
                      if (diff!==null) {
                        if (Math.abs(diff)<0.01) tag=<CalcTag c={CALC_S.blueBg} t={CALC_S.blue}>Gelijk</CalcTag>;
                        else if (diff>0) tag=<CalcTag c={CALC_S.amberBg} t={CALC_S.amber}>MJOP +{calcFmt(Math.abs(diff))}</CalcTag>;
                        else tag=<CalcTag c={CALC_S.greenBg} t={CALC_S.green}>MJOP −{calcFmt(Math.abs(diff))}</CalcTag>;
                      }
                      return (
                        <tr key={i} style={{ borderBottom:i<result.eigenaren.length-1?'1px solid '+CALC_S.border:'none' }}>
                          <td style={{ padding:'8px 12px',fontWeight:500,fontSize:13 }}>{e.naam}</td>
                          <td style={{ padding:'8px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right' }}>{e.teller}/{e.noemer}</td>
                          <td style={{ padding:'8px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                          <td style={{ padding:'8px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right' }}>{e.bijdrMjop!==null?calcFmt(e.bijdrMjop):'—'}</td>
                          <td style={{ padding:'8px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right' }}>{e.bijdr05!==null?calcFmt(e.bijdr05):'—'}</td>
                          <td style={{ padding:'8px 12px' }}>{tag||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot style={{ borderTop:'2px solid '+CALC_S.bordeaux }}>
                    <tr style={{ background:CALC_S.cream }}>
                      <td colSpan={2} style={{ padding:'9px 12px',fontSize:13,fontWeight:600,color:CALC_S.muted }}>Totaal VvE</td>
                      <td style={{ padding:'9px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,textAlign:'right' }}>100%</td>
                      <td style={{ padding:'9px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:CALC_S.bordeaux,textAlign:'right' }}>{result.hasMjop?calcFmt(result.eigenaren.reduce((s,e)=>s+(e.bijdrMjop||0),0)):'—'}</td>
                      <td style={{ padding:'9px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:CALC_S.bordeaux,textAlign:'right' }}>{result.has05?calcFmt(result.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)):'—'}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CalcCard>
          </div>
        )}
      </div>
    </div>
  );
}


function exportAdminPDF(allData, beheerderList) {
  const year = new Date().getFullYear();
  let html = `<html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:20px}
    h1{font-size:16px;color:#991A21;margin-bottom:4px}
    h2{font-size:12px;color:#991A21;margin:16px 0 6px;border-bottom:1px solid #991A21;padding-bottom:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{background:#991A21;color:white;padding:4px 8px;text-align:left;font-size:10px}
    td{padding:4px 8px;border-bottom:1px solid #eee}
    tr:nth-child(even) td{background:#faf7f7}
    .bar-wrap{background:#e5e7eb;border-radius:4px;height:8px;width:120px;display:inline-block;vertical-align:middle}
    .bar-fill{background:#059669;height:8px;border-radius:4px;display:block}
    .sub{color:#888;font-size:9px}
    @media print{body{margin:10px}}
  </style></head><body>`;
  html += `<h1>VvE Vergaderplanning ${year} — Beheerdersoverzicht</h1>`;
  html += `<p class="sub">Gegenereerd op ${fmtDate(new Date().toISOString().slice(0,10))}</p>`;
  html += `<table><tr><th>Beheerder</th><th>Totaal VvE's</th><th>Gepland</th><th>Uitgenodigd</th><th>Afgerond</th><th>Voortgang</th></tr>`;
  for (const naam of beheerderList) {
    const vves = allData[naam]?.vves || [];
    const total = vves.length;
    const gepland = vves.filter(v => v.datum1).length;
    const uitgenodigd = vves.filter(v => (v.uitgenodigd1 || v.uitgenodigd2) && !isAfgerond(v)).length;
    const afgerond = vves.filter(v => isAfgerond(v)).length;
    const pct = total === 0 ? 0 : Math.round((afgerond / total) * 100);
    html += `<tr>
      <td><strong>${naam}</strong></td>
      <td>${total}</td>
      <td>${gepland}</td>
      <td>${uitgenodigd}</td>
      <td>${afgerond}</td>
      <td>
        <span class="bar-wrap"><span class="bar-fill" style="width:${pct}%"></span></span>
        <span style="margin-left:6px;font-weight:bold">${pct}%</span>
      </td>
    </tr>`;
  }
  html += `</table></body></html>`;
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.print();
}

function AdminDashboard({ beheerderList, onBack }) {
  const [allData, setAllData] = useState({});
  const [allRoles, setAllRoles] = useState([]);
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
      const [result, roles] = await Promise.all([
        loadAllData(beheerderList),
        loadAllRoles(),
      ]);
      setAllData(result);
      setAllRoles(roles);
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
  const riskBorder = { red:"border-red-200 bg-red-50", orange:"border-amber-200 bg-amber-50", blue:"border-blue-200 bg-blue-50", green:"border-gray-200 bg-white", gray:"border-gray-200 bg-white" };

  return (
    <div className="min-h-screen bg-[#F2EFEC] text-[#2D2D2D]">
      <div className="border-b border-gray-200 px-6 py-3.5 flex items-center justify-between bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛡️</span>
          <div>
            <h1 className="text-sm font-bold text-[#2D2D2D]">Admin Dashboard</h1>
            <p className="text-xs text-gray-500">Overzicht alle beheerders — {new Date().getFullYear()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={()=>exportTotaalExcel(allData, beheerderList)} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border-2 border-gray-400 hover:border-[#991A21] text-gray-700 font-medium rounded-lg transition-colors">⬇ Excel</button>
          <button onClick={()=>exportAdminPDF(allData, beheerderList)} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border-2 border-gray-400 hover:border-[#991A21] text-gray-700 font-medium rounded-lg transition-colors">⬇ PDF</button>
          <button onClick={onBack} className="text-xs px-3 py-1.5 bg-white hover:bg-red-50 border-2 border-gray-300 hover:border-[#991A21] text-gray-600 hover:text-[#991A21] rounded-lg transition-colors font-medium">Uitloggen</button>
        </div>
      </div>
      <div className="border-b border-gray-200 px-6 py-4 grid grid-cols-4 gap-3 bg-white">
        {[
          [allVves.length, "Totaal VvE's", "text-[#2D2D2D]", false],
          [totaalAfgerond, "Afgerond", "text-emerald-600", false],
          [totaalUitgenodigd, "Uitgenodigd", "text-blue-600", false],
          [totaalUitnodiging, "Uitnodiging urgent", totaalUitnodiging>0?"text-[#991A21]":"text-gray-400", totaalUitnodiging>0],
        ].map(([val,label,color,ring])=>(
          <div key={label} className={`bg-white rounded-xl p-3 text-center border-2 shadow-sm ${ring?"border-[#991A21]":"border-gray-400"}`}>
            <div className={`text-2xl font-mono font-bold ${color}`}>{val}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex gap-6 items-start">

          {/* ── Leaderboard zijbalk ── */}
          <div className="w-52 shrink-0 sticky top-4 bg-white border-2 border-gray-400 rounded-xl p-4 space-y-3 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">🏆 Voortgang ranking</p>
            {(() => {
              const ranking = beheerderList
                .map(naam => {
                  const stats = calcStats(allData[naam]);
                  return { naam, pct: stats?.pctAfgerond || 0, afgerond: stats?.afgerond || 0, total: stats?.total || 0 };
                })
                .filter(r => r.total > 0)
                .sort((a, b) => b.pct - a.pct);

              if (ranking.length === 0) return <p className="text-[10px] text-gray-400">Nog geen data.</p>;

              const medals = ["🥇","🥈","🥉"];
              return (
                <div className="space-y-2">
                  {ranking.map((r, i) => {
                    const opSchema = r.pct >= yearPct - 5;
                    const kleur = i === 0 ? "text-amber-600" : i === 1 ? "text-gray-500" : i === 2 ? "text-amber-700" : "text-gray-400";
                    const barKleur = r.pct >= yearPct + 5 ? "bg-emerald-500" : r.pct >= yearPct - 5 ? "bg-sky-500" : "bg-red-500";
                    return (
                      <div key={r.naam} className={`rounded-lg p-2 ${i < 3 ? "bg-gray-50" : ""}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm shrink-0">{medals[i] || <span className="text-[10px] text-zinc-600 w-4 text-center">{i+1}</span>}</span>
                          <span className={`text-xs font-semibold truncate flex-1 ${kleur}`}>{r.naam}</span>
                          <span className={`text-[10px] font-mono shrink-0 ${kleur}`}>{r.pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                          <div className={`h-full rounded-full ${barKleur}`} style={{width:`${r.pct}%`}}/>
                          <div className="absolute top-0 bottom-0 w-px bg-gray-400/60" style={{left:`${yearPct}%`}}/>
                        </div>
                        <p className="text-[9px] text-gray-400 mt-0.5">{r.afgerond}/{r.total} afgerond</p>
                      </div>
                    );
                  })}
                  <div className="border-t border-gray-100 pt-2 mt-1">
                    <p className="text-[9px] text-gray-400">Streepje = {yearPct}% van jaar verstreken</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] text-emerald-500">■ Voor</span>
                      <span className="text-[9px] text-sky-500">■ Op schema</span>
                      <span className="text-[9px] text-red-500">■ Achter</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          {/* Inactieve beheerders */}
          {(() => {
            const nu = new Date();
            const inactief = allRoles.filter(r => {
              if (r.rol === "admin") return false;
              if (!r.laatste_login) return true;
              const diff = (nu - new Date(r.laatste_login)) / 86400000;
              return diff >= 10;
            }).sort((a, b) => {
              if (!a.laatste_login) return -1;
              if (!b.laatste_login) return 1;
              return new Date(a.laatste_login) - new Date(b.laatste_login);
            });
            if (inactief.length === 0) return null;
            return (
              <div className="bg-white border border-gray-200 border-l-4 border-l-[#991A21] rounded-xl p-4 space-y-2 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">⚠ Inactief ≥10 dagen</p>
                {inactief.map(r => {
                  const dagen = r.laatste_login
                    ? Math.floor((nu - new Date(r.laatste_login)) / 86400000)
                    : null;
                  return (
                    <div key={r.naam} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-[#2D2D2D] font-semibold">{r.naam}</span>
                      <span className="text-orange-600 font-mono font-semibold">
                        {dagen === null ? "Nooit ingelogd" : `${dagen}d geleden`}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </div>

          {/* ── Hoofdinhoud ── */}
          <div className="flex-1 space-y-6">
        {allVves.length > 0 && (() => {
          const avgAfgerondPct = Math.round((totaalAfgerond / allVves.length) * 100);
          const diff = avgAfgerondPct - yearPct;
          const color = diff >= 0 ? "emerald" : diff >= -10 ? "amber" : "red";
          const label = diff >= 5 ? "Voorloopt op schema" : diff >= -5 ? "Loopt op schema" : diff >= -15 ? "Loopt licht achter" : "Loopt achter op schema";
          return (
            <div className={`rounded-xl border p-4 flex items-center gap-4 shadow-sm ${color==="emerald"?"border-emerald-200 bg-emerald-50":color==="amber"?"border-amber-200 bg-amber-50":"border-red-200 bg-red-50"}`}>
              <div className={`text-2xl font-mono font-bold ${color==="emerald"?"text-emerald-600":color==="amber"?"text-amber-600":"text-red-600"}`}>{avgAfgerondPct}%</div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold ${color==="emerald"?"text-emerald-700":color==="amber"?"text-amber-700":"text-red-700"}`}>{label}</span>
                  <span className="text-xs text-gray-500">{yearPct}% van het jaar verstreken</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full ${color==="emerald"?"bg-emerald-600":color==="amber"?"bg-amber-500":"bg-red-600"}`} style={{width:`${avgAfgerondPct}%`}}/>
                  <div className="absolute top-0 bottom-0 w-0.5 bg-gray-500/50" style={{left:`${yearPct}%`}}/>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Streepje = huidig punt in het jaar · Balk = % afgerond</p>
              </div>
            </div>
          );
        })()}

        {herindelenMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs text-emerald-700 font-medium">{herindelenMsg}</div>}

        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h2 className="text-xs font-bold text-[#991A21] uppercase tracking-wider mb-3">Totale spreiding alle beheerders</h2>
          <MonthBar counts={globalCounts} vakanties={[]}/>
        </div>
        <div>
          <h2 className="text-xs font-bold text-[#991A21] uppercase tracking-wider mb-3">Status per beheerder</h2>
          {loading && <p className="text-sm text-zinc-600">Laden…</p>}
          <div className="space-y-3">
            {beheerderList.map(naam => {
              const stats = calcStats(allData[naam]);
              const risk = riskLevel(stats);
              const isOpen = expanded===naam;
              return (
                <div key={naam} className={`rounded-xl border overflow-hidden ${riskBorder[risk]}`}>
                  <div className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={()=>setExpanded(isOpen?null:naam)}>
                    <div className="flex items-center gap-4">
                      <div className="w-36 shrink-0"><span className="text-sm font-semibold text-[#2D2D2D]">{naam}</span></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-500">{stats?.afgerond||0} afgerond · {stats?.uitgenodigd||0} uitgenodigd / {stats?.total||0}</span>
                          <span className="text-[10px] font-mono text-gray-600 font-semibold">{stats?.pctAfgerond||0}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                          <div className="h-full transition-all duration-700 bg-emerald-600" style={{width:`${stats?.pctAfgerond||0}%`}}/>
                          <div className="h-full transition-all duration-700 bg-sky-600" style={{width:`${stats?.pctUitgenodigd||0}%`}}/>
                        </div>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[9px] text-emerald-700">■ Afgerond</span>
                          <span className="text-[9px] text-sky-700">■ Uitgenodigd</span>
                          <span className="text-[9px] text-gray-400">■ Niet uitgenodigd</span>
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
                    <div className="border-t border-gray-200 px-5 py-4 space-y-4 bg-[#F2EFEC]">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide font-semibold">Spreiding {naam}</p>
                        <MonthBar counts={spreadScore(allData[naam]?.vves||[])} vakanties={allData[naam]?.vakanties||[]}/>
                      </div>
                      {(stats.uitnodigingUrgent>0||stats.voorbijZonder2e>0||stats.nietUitgenodigd>0) && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Aandachtspunten</p>
                          {(allData[naam]?.vves||[]).filter(v => {
                            const s = inviteStatus(v.datum1, v.uitgenodigd1);
                            return !v.vergaderd1 && (s==="warning"||s==="overdue");
                          }).map(v=>(
                            <div key={v.id} className="flex items-center gap-2 text-xs text-[#991A21] bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                              <span>✉</span><span className="font-medium">{v.naam}</span>
                              <span className="text-red-500">— uitnodigen vóór {fmtDate(addDays(v.datum1,-INVITE_DAYS))}</span>
                            </div>
                          ))}
                          {(allData[naam]?.vves||[]).filter(v=>v.datum1&&v.datum1<today()&&!v.datum2&&!v.vergaderd1).map(v=>(
                            <div key={v.id} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                              <span>↩</span><span className="font-medium">{v.naam}</span><span className="text-amber-500">— 1e voorbij, geen 2e gepland</span>
                            </div>
                          ))}
                          {(allData[naam]?.vves||[]).filter(v=>!v.uitgenodigd1&&!v.uitgenodigd2&&!v.vergaderd1).slice(0,5).map(v=>(
                            <div key={v.id} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                              <span className="text-gray-400">·</span><span className="font-medium">{v.naam}</span><span className="text-gray-400">— nog niet uitgenodigd</span>
                            </div>
                          ))}
                          {stats.nietUitgenodigd>5 && <p className="text-[10px] text-zinc-600 pl-3">… en {stats.nietUitgenodigd-5} andere niet-uitgenodigde VvE's</p>}
                        </div>
                      )}
                      {risk==="green" && <p className="text-xs text-emerald-700 font-medium">✓ Alles op schema. Geen actie vereist.</p>}
                      <div className="border-t border-gray-200 pt-3 mt-2">
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">VvE herindelen naar andere beheerder</p>
                        {herindelenVan === naam && herindelenVve ? (
                          <div className="flex gap-2 items-center flex-wrap">
                            <span className="text-xs text-zinc-400 shrink-0">"{herindelenVve.naam}" →</span>
                            <select value={herindelenNaar} onChange={e=>setHerindelenNaar(e.target.value)}
                              className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors">
                              <option value="">Kies beheerder…</option>
                              {beheerderList.filter(n=>n!==naam).map(n=><option key={n} value={n}>{n}</option>)}
                            </select>
                            <button onClick={()=>herindelen(herindelenVve, naam, herindelenNaar)} disabled={!herindelenNaar} className="px-3 py-1.5 bg-[#991A21] hover:bg-[#7a1419] disabled:opacity-40 text-white text-xs rounded-lg transition-colors">Verplaats</button>
                            <button onClick={()=>{setHerindelenVve(null);setHerindelenVan(null);}} className="text-xs text-zinc-500 hover:text-zinc-400">Annuleer</button>
                          </div>
                        ) : (
                          <select value="" onChange={e=>{
                            const vve = (allData[naam]?.vves||[]).find(v=>v.id===e.target.value);
                            if (vve) { setHerindelenVve(vve); setHerindelenVan(naam); setHerindelenNaar(""); }
                          }} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-500 focus:outline-none focus:border-[#991A21] transition-colors">
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
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login"); // login | portaal | vergaderingen | calculator | admin
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
  // FIX 1: gesorteerde volgorde staat los van data
  // We bewaren een gesorteerde ID-volgorde en passen die toe bij weergave
  const [sortedOrder, setSortedOrder] = useState(null); // null = nog niet gesorteerd
  // Jaarwisseling
  const [toonJaarwisselingPrompt, setToonJaarwisselingPrompt] = useState(false);
  // FIX 3: welke VvE moet geforceerd opengaan
  const [forceOpenId, setForceOpenId] = useState(null);
  // FIX 2: maandfilter
  const [filterJaar2027, setFilterJaar2027] = useState(false);
  const [geselecteerdeFilterMaanden, setGeselecteerdeFilterMaanden] = useState(new Set());

  const t = {
    bg:        "bg-[#F2EFEC]",
    bgCard:    "bg-white",
    bgInput:   "bg-gray-50",
    bgHover:   "hover:bg-[#F2EFEC]",
    border:    "border-gray-200",
    borderIn:  "border-gray-300",
    text:      "text-[#2D2D2D]",
    textMuted: "text-gray-500",
    textDim:   "text-gray-400",
    textHead:  "text-[#2D2D2D]",
    textInput: "text-[#2D2D2D]",
    tabActive: "border-[#991A21] text-[#991A21]",
    tabInact:  "border-transparent text-gray-500 hover:text-[#2D2D2D]",
    btnSec:    "bg-white hover:bg-gray-50 text-[#2D2D2D] border border-gray-200",
    rowBorder: "border-gray-200",
    expanded:  "border-gray-200 bg-[#F2EFEC]",
  };

  const handleLogin = async () => {
    if (!loginNaam.trim() || !loginPw.trim()) { setLoginError("Vul je e-mail en wachtwoord in."); return; }
    setLoading(true);
    setLoginError("");
    try {
      await signIn(loginNaam.trim(), loginPw.trim());
      const rol = await getUserRole();
      if (!rol) throw new Error("Geen rol gevonden voor dit account.");
      if (rol.rol === "admin") {
        setBeheerder("Admin");
        setLoading(false);
        setScreen("portaal");
        return;
      }
      setBeheerder(rol.naam);
      const d = await loadData(rol.naam);
      setData(d || defaultData());
      setScreen("portaal");
    } catch(e) {
      setLoginError(e.message === "Invalid login credentials" ? "E-mail of wachtwoord onjuist." : e.message);
    }
    setLoading(false);
  };

  const [saving, setSaving] = useState(false);

  const persist = useCallback(async (newData) => {
    setData(newData);
    setSaving(true);
    await saveData(beheerder, newData);
    setSaving(false);
  }, [beheerder]);

  // Jaarwisseling detectie: controleer of opgeslagen data nog van vorig jaar is
  useEffect(() => {
    if (screen !== "main" || !data.vves || data.vves.length === 0) return;
    const huidigJaar = new Date().getFullYear();
    const opslaanJaar = (() => {
      // Kijk naar het jaar van de meeste vergaderdatums
      const jaren = data.vves
        .map(v => v.datum1 || v.datum2 || "")
        .filter(Boolean)
        .map(d => parseInt(d.slice(0, 4)));
      if (jaren.length === 0) return huidigJaar;
      return Math.round(jaren.reduce((a, b) => a + b, 0) / jaren.length);
    })();
    if (opslaanJaar < huidigJaar) {
      setToonJaarwisselingPrompt(true);
    }
  }, [screen, beheerder]);

  const handleJaarwisselingBevestigen = async () => {
    const vernieuwd = data.vves.map(v => ({
      id: v.id,
      naam: v.naam,
      notitie: v.notitie || "",
      datum1: v.voorkeurVolgendjaar || "",
      datum2: "",
      datumExtra: "",
      uitgenodigd1: false,
      uitgenodigd2: false,
      uitgenodigdExtra: false,
      vergaderd1: false,
      vergaderd2: false,
      vergaderdExtra: false,
      needs2e: false,
      extraVergadering: false,
      voorkeurVolgendjaar: "",
    }));
    await persist({ ...data, vves: vernieuwd });
    setSortedOrder(null);
    setToonJaarwisselingPrompt(false);
  };

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
  if (screen==="admin") return <AdminDashboard beheerderList={beheerderList} onBack={()=>setScreen("portaal")}/>;
  if (screen==="calculator") return <VveCalculator onTerug={()=>setScreen("portaal")}/>;

  if (screen==="login") return (
    <div className="min-h-screen grid grid-cols-2">
      <style>{CSS_FONT}</style>
      {/* Links — merkpaneel */}
      <div className="bg-[#2D2D2D] flex flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#991A21] rounded-full opacity-10 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#991A21] rounded-full opacity-8 translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-10 h-10 bg-[#991A21] rounded-md flex items-center justify-center">
                  <span className="text-white text-lg">🏠</span>
                </div>
                <div className="w-10 h-10 bg-[#2D2D2D] rounded-md flex items-center justify-center">
                  <span className="text-white text-lg">📋</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-[#2D2D2D] leading-tight">Totaal VvE Beheer</p>
                <p className="text-xs text-gray-500">Den Haag en omstreken B.V.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-3">
              <p className="text-white text-sm font-bold mb-1">📅 Vergaderplanner</p>
              <p className="text-gray-400 text-xs leading-relaxed">Plan en beheer alle VvE-vergaderingen, uitnodigingen en voortgang.</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-3">
              <p className="text-white text-sm font-bold mb-1">🧮 VvE Calculator</p>
              <p className="text-gray-400 text-xs leading-relaxed">Bereken maandelijkse bijdragen en reservefondsen conform art. 5:126 BW.</p>
            </div>
          </div>
        </div>
      </div>
      {/* Rechts — loginformulier */}
      <div className="bg-[#F2EFEC] flex flex-col justify-center px-16 py-12">
        <div className="max-w-sm w-full mx-auto">
          <h1 className="text-2xl font-bold text-[#2D2D2D] mb-1">Welkom terug</h1>
          <p className="text-sm text-gray-500 mb-8">Log in met je account om door te gaan</p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">E-mailadres</label>
              <input autoFocus value={loginNaam} onChange={e=>{ setLoginNaam(e.target.value); setLoginError(""); }} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="naam@vveplanner.nl"
                className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none transition-colors ${loginError?"border-[#991A21]":"border-gray-200 focus:border-[#991A21]"}`}/>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Wachtwoord</label>
              <input type="password" value={loginPw} onChange={e=>{ setLoginPw(e.target.value); setLoginError(""); }} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••"
                className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none transition-colors ${loginError?"border-[#991A21]":"border-gray-200 focus:border-[#991A21]"}`}/>
            </div>
            {loginError && <p className="text-xs text-[#991A21] font-medium">{loginError}</p>}
            <button onClick={handleLogin} disabled={loading}
              className="w-full py-3 bg-[#991A21] hover:bg-[#7a1419] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-red-900/20 mt-2">
              {loading ? "Laden…" : "Inloggen →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Portaal screen ──────────────────────────────────────────
  if (screen==="portaal") {
    const isAdmin = beheerder === "Admin";
    // Recente activiteit: laatste 3 vergaderde VvE's
    const recenteActiviteit = (data.vves || [])
      .filter(v => v.vergaderd1 || v.vergaderd2 || v.uitgenodigd1)
      .slice(-3)
      .reverse()
      .map(v => ({
        naam: v.naam,
        tekst: v.vergaderd1 ? "vergadering afgerond" : v.uitgenodigd1 ? "uitnodiging verstuurd" : "bijgewerkt",
        kleur: v.vergaderd1 ? "#1a7a45" : v.uitgenodigd1 ? "#991A21" : "#1a4f7a",
      }));

    return (
      <div className="min-h-screen bg-[#F2EFEC]">
        <style>{CSS_FONT}</style>
        {/* Topbar */}
        <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center"><span className="text-white text-xs">🏠</span></div>
              <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center"><span className="text-white text-xs">📋</span></div>
            </div>
            <div className="w-px h-5 bg-gray-200" />
            <span className="text-sm font-bold text-[#2D2D2D]">Totaal VvE Beheer</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#991A21] rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{beheerder.charAt(0)}</span>
            </div>
            <span className="text-sm font-medium text-[#2D2D2D]">{beheerder}</span>
            <button onClick={async ()=>{ await signOut(); setScreen("login"); setLoginNaam(""); setLoginPw(""); setBeheerder(""); setData(defaultData()); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#991A21] hover:border-red-200 hover:bg-red-50 transition-colors">
              Uitloggen
            </button>
          </div>
        </div>

        <div className="p-8 max-w-4xl mx-auto">
          {/* Welkom */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#2D2D2D] mb-1">
              {(() => { const h = new Date().getHours(); return h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond"; })()} {beheerder}
            </h1>
            <p className="text-sm text-gray-500">Kies een tool om mee te beginnen</p>
          </div>

          {/* Tool tegels */}
          <div className="grid grid-cols-3 gap-5 mb-8">
            {/* Vergaderplanner */}
            <div
              onClick={()=>setScreen("main")}
              className="bg-white border-2 border-gray-200 hover:border-[#991A21] rounded-2xl p-6 cursor-pointer transition-all hover:shadow-md relative overflow-hidden group"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#991A21] rounded-t-2xl" />
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-2xl mb-4">📅</div>
              <h3 className="text-base font-bold text-[#2D2D2D] mb-2">Vergaderplanner</h3>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">Plan en beheer alle VvE-vergaderingen, uitnodigingen en voortgang.</p>
              <div className="flex items-center justify-between">
                {data.vves.length > 0
                  ? <span className="text-xs bg-red-50 text-[#991A21] px-2 py-1 rounded-full font-semibold border border-red-100">{data.vves.length} VvE's actief</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-semibold border border-gray-200">Openen</span>
                }
                <span className="text-[#991A21] font-bold group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>

            {/* VvE Calculator */}
            <div
              onClick={()=>setScreen("calculator")}
              className="bg-white border-2 border-gray-200 hover:border-[#2D2D2D] rounded-2xl p-6 cursor-pointer transition-all hover:shadow-md relative overflow-hidden group"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#2D2D2D] rounded-t-2xl" />
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl mb-4">🧮</div>
              <h3 className="text-base font-bold text-[#2D2D2D] mb-2">VvE Calculator</h3>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">Bereken bijdragen, reservefondsen en financiële overzichten.</p>
              <div className="flex items-center justify-between">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-semibold border border-gray-200">Beschikbaar</span>
                <span className="text-[#2D2D2D] font-bold group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>

            {/* Admin dashboard — alleen voor admin */}
            {isAdmin && (
              <div
                onClick={()=>setScreen("admin")}
                className="bg-white border-2 border-gray-200 hover:border-[#991A21] rounded-2xl p-6 cursor-pointer transition-all hover:shadow-md relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#991A21] rounded-t-2xl" />
                <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-2xl mb-4">🛡️</div>
                <h3 className="text-base font-bold text-[#2D2D2D] mb-2">Admin Dashboard</h3>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">Overzicht alle beheerders, voortgang en leaderboard.</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-red-50 text-[#991A21] px-2 py-1 rounded-full font-semibold border border-red-100">Beheerder</span>
                  <span className="text-[#991A21] font-bold group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            )}

            {/* Toekomstige tool placeholder */}
            {!isAdmin && (
              <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-6 opacity-50 relative overflow-hidden">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-2xl mb-4">＋</div>
                <h3 className="text-base font-bold text-gray-400 mb-2">Nieuwe tool</h3>
                <p className="text-xs text-gray-400 leading-relaxed">Toekomstige tools verschijnen hier automatisch.</p>
              </div>
            )}
          </div>

          {/* Recente activiteit */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Recente activiteit</p>
            {recenteActiviteit.length === 0 ? (
              <p className="text-sm text-gray-400">Nog geen activiteit. Open de vergaderplanner om te beginnen.</p>
            ) : (
              <div className="space-y-3">
                {recenteActiviteit.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{background: item.kleur}} />
                    <span className="font-medium text-[#2D2D2D]">{item.naam}</span>
                    <span className="text-gray-400">— {item.tekst}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main screen
  return (
    <div className={`min-h-screen ${t.bg} ${t.text}`}>
      <style>{CSS_FONT}</style>
      <div className={`border-b ${t.border} px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50`}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-[#991A21] rounded-md flex items-center justify-center"><span className="text-white text-xs">🏠</span></div>
            <div className="w-7 h-7 bg-[#2D2D2D] rounded-md flex items-center justify-center"><span className="text-white text-xs">📋</span></div>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <div>
            <h1 className="text-sm font-bold text-[#2D2D2D]">Vergaderplanner</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-[10px] text-gray-400 animate-pulse">Opslaan…</span>}
          <div className="w-8 h-8 bg-[#991A21] rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{beheerder.charAt(0)}</span>
          </div>
          <span className="text-sm font-medium text-[#2D2D2D]">{beheerder}</span>
          <button onClick={()=>setScreen("portaal")}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#991A21] hover:border-red-200 hover:bg-red-50 transition-colors">
            ← Portaal
          </button>
          <button onClick={async ()=>{ await signOut(); setScreen("login"); setLoginNaam(""); setLoginPw(""); setBeheerder(""); setData(defaultData()); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#991A21] hover:border-red-200 hover:bg-red-50 transition-colors">
            Uitloggen
          </button>
        </div>
      </div>

      <div className={`border-b ${t.border} px-6 flex bg-white`}>
        {[
          [data.vves.length, "VvE's", "text-[#2D2D2D]", "bg-[#2D2D2D]"],
          [afgerond, "Afgerond", "text-emerald-700", "bg-emerald-500"],
          [uitgenodigd, "Uitgenodigd", "text-blue-700", "bg-blue-500"],
          [nietUitgenodigd, "Niet uitgenodigd", "text-gray-500", "bg-gray-400"],
        ].map(([val, label, textClr, dotClr]) => (
          <div key={label} className="flex items-center gap-2.5 px-5 py-3.5 border-r border-gray-100">
            <div className={`w-2 h-2 rounded-full ${dotClr}`} />
            <div>
              <div className={`text-lg font-bold ${textClr}`}>{val}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</div>
            </div>
          </div>
        ))}
        {metWaarschuwing>0 && (
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-r border-gray-100">
            <div className="w-2 h-2 rounded-full bg-[#991A21]" />
            <div>
              <div className="text-lg font-bold text-[#991A21]">{metWaarschuwing}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Uitnodiging!</div>
            </div>
          </div>
        )}
        {inVakantie>0 && (
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <div>
              <div className="text-lg font-bold text-orange-600">{inVakantie}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">In vakantie</div>
            </div>
          </div>
        )}
      </div>

      <div className={`border-b ${t.border} px-6 flex gap-0 items-center justify-between bg-white`}>
        <div className="flex gap-0">
          {[["vergaderingen","Vergaderingen"],["overzicht","Spreiding"],["vakantie","Vakantie"],["instellingen","Instellingen"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} className={`px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab===key ? "border-[#991A21] text-[#991A21] font-semibold" : "border-transparent text-gray-500 hover:text-[#2D2D2D]"}`}>{label}</button>
          ))}
        </div>
        <div className="flex gap-2 pb-1">
          <button onClick={exportExcel} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-lg transition-colors">⬇ Excel</button>
          <button onClick={exportPDF} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-lg transition-colors">⬇ PDF</button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">

        {/* Jaarwisseling prompt */}
        {toonJaarwisselingPrompt && (
          <div className="mb-4 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🎉</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Nieuw jaar — planning vernieuwen?</p>
                <p className="text-xs text-amber-700 mt-1">
                  De planning bevat nog vergaderingen van vorig jaar. Je kunt het overzicht nu opschonen voor {new Date().getFullYear()}.
                  VvE's met een voorkeursdatum worden automatisch ingepland. Notities blijven bewaard.
                </p>
              </div>
            </div>
            <div className="bg-amber-100/50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-amber-700 font-semibold mb-1">Wat wordt gereset:</p>
              <p className="text-[10px] text-amber-700">Alle vergaderdatums, uitnodigingen, vergaderd-vinkjes, 2e reglementaire en extra vergaderingen.</p>
              <p className="text-[10px] text-amber-500 font-medium mt-1.5 mb-1">Wat blijft bewaard:</p>
              <p className="text-[10px] text-amber-700">VvE namen, notities, vakantieperiodes, werkdagen. Voorkeursdatums worden de nieuwe vergaderdatum.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleJaarwisselingBevestigen}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                ✓ Ja, vernieuw planning voor {new Date().getFullYear()}
              </button>
              <button
                onClick={() => setToonJaarwisselingPrompt(false)}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 text-sm rounded-lg transition-colors"
              >
                Niet nu
              </button>
            </div>
          </div>
        )}

        {/* Begroeting */}
        {tab==="vergaderingen" && (
          <div className={`mb-4 px-4 py-3 bg-white border-l-4 border-l-[#991A21] border border-gray-200 rounded-xl flex items-center justify-between shadow-sm`}>
            <div>
              <p className="text-sm font-semibold text-[#2D2D2D]">Hoi {beheerder}! 👋</p>
              <p className="text-xs text-gray-500 mt-0.5">
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
                <div className={"w-52 shrink-0 bg-white border border-gray-200 rounded-xl p-4 space-y-3 sticky top-4 shadow-sm"}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Voortgang {year}</p>
                  <div className="flex flex-col items-center gap-1">
                    <svg width="96" height="96" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r={R} fill="none" stroke="#F0EDE9" strokeWidth="10"/>
                      {pctNiet > 0 && (
                        <circle cx="48" cy="48" r={R} fill="none" stroke="#E8E4E0" strokeWidth="10"
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
                      <text x="48" y="44" textAnchor="middle" fill="#2D2D2D" fontSize="18" fontWeight="700" fontFamily="DM Sans, sans-serif">{pctAfgerond}%</text>
                      <text x="48" y="57" textAnchor="middle" fill="#8A8A8A" fontSize="8" fontFamily="DM Sans, sans-serif">afgerond</text>
                    </svg>
                    <p className="text-sm font-semibold text-[#2D2D2D] text-center">{label}</p>
                    <p className="text-[10px] text-gray-500 text-center">{afgerond} van {total} vergaderingen volledig afgerond</p>
                  </div>
                  <div className="space-y-2 pt-1">
                    {[
                      ["Afgerond", afgerond, total, "bg-emerald-500"],
                      ["Uitgenodigd", uitgenodigd, total, "bg-sky-500"],
                      ["Niet uitgenodigd", nietUitgenodigd, total, "bg-zinc-600"],
                    ].map(([lbl, val, tot, barColor]) => (
                      <div key={lbl}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[10px] text-gray-500">{lbl}</span>
                          <span className="text-[10px] font-mono text-gray-600 font-semibold">{val} <span className="text-gray-400">/ {tot}</span></span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
                      <div className="border-t border-gray-100 pt-3 space-y-1">
                        <p className="text-[10px] text-gray-500">
                          <span className="text-[#2D2D2D] font-semibold">Nog {dagenOver} dagen</span> tot eind {nu.getFullYear()}
                        </p>
                        <p className={`text-[10px] font-medium ${opSchema ? "text-emerald-600" : "text-amber-400"}`}>
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
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-[10px] text-gray-500">
                          <span className="text-amber-400 font-medium">📅 {NL_MONTHS_FULL[parseInt(maandIdx)]}</span> wordt je drukste maand
                        </p>
                        <p className="text-[10px] text-gray-400">{aantal} vergadering{aantal !== 1 ? "en" : ""} gepland</p>
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
                      <div className="border-t border-gray-100 pt-3 space-y-2">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Deze week</p>
                        {dezeWeek.length === 0 ? (
                          <p className="text-[10px] text-gray-400">Geen vergaderingen deze week.</p>
                        ) : (
                          dezeWeek.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-[9px] text-gray-400 shrink-0 mt-0.5 w-12">{fmtDate(item.datum).slice(0,6)}</span>
                              <div className="min-w-0">
                                <p className="text-[10px] text-[#2D2D2D] font-medium truncate">{item.naam}</p>
                                <p className="text-[9px] text-gray-400">{item.type === "1e" ? "1e vergadering" : item.type === "2e" ? "2e reglementair" : "Extra"}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}

                  {/* ── FIX 2: Maandfilter ───────────────────── */}
                  {(maandenMetVves2026.length > 0 || maandenMetVves2027.length > 0) && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Filter op maand</p>

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
                                      : "bg-gray-100 text-gray-600 border border-gray-200 hover:border-[#991A21]"
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
                                      : "bg-gray-100 text-gray-600 border border-gray-200 hover:border-[#991A21]"
                                  }`}
                                >
                                  {label} <span className="opacity-60">({count})</span>
                                </button>
                              );
                            })}
                            {maandenMetVves2027.length === 0 && (
                              <p className="text-[10px] text-gray-400">Nog geen voorkeursdatums ingevuld voor {nextYear}.</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Wis filter knop */}
                      {geselecteerdeFilterMaanden.size > 0 && (
                        <button
                          onClick={() => setGeselecteerdeFilterMaanden(new Set())}
                          className="text-[10px] text-gray-400 hover:text-[#991A21] transition-colors underline"
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
                <div className="bg-white border border-gray-200 border-l-4 border-l-[#991A21] rounded-xl p-4 space-y-2 shadow-sm">
                  <p className="text-xs font-bold text-[#991A21] uppercase tracking-wider mb-3">⚡ Actie vereist</p>
                  {urgentItems.map(item => (
                    <div key={item.id} className={`flex items-start gap-3 rounded-lg px-3 py-2 text-xs ${
                      item.type==="overdue" ? "bg-red-50 border border-red-300 text-red-900" :
                      item.type==="geen2e"  ? "bg-amber-50 border border-amber-300 text-amber-900" :
                      "bg-amber-50 border border-amber-300 text-amber-900"}`}>
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
                          className="font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity cursor-pointer text-inherit"
                        >
                          {item.naam}
                        </button>
                        {item.is2e && <span className="ml-1 opacity-80">(2e reglementaire vergadering)</span>}
                        {item.isExtra && <span className="ml-1 opacity-80">(extra vergadering)</span>}
                        <span className="ml-2 opacity-90">
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
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-blue-800">Voorgestelde planning</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        {planningPreview.filter(v=>v.datum1).length - data.vves.filter(v=>v.datum1).length} VvE's automatisch ingepland. Controleer de datums en bevestig.
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={handleConfirmPlanning} className="px-4 py-1.5 bg-[#991A21] hover:bg-[#7a1419] text-white text-xs rounded-lg transition-colors font-medium">Bevestigen</button>
                      <button onClick={handleRejectPlanning} className="px-4 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 text-xs rounded-lg transition-colors">Annuleren</button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <p className="text-[10px] text-blue-600 mb-1.5 uppercase tracking-wide font-semibold">Spreiding na planning</p>
                    <MonthBar counts={spreadScore(planningPreview)} vakanties={data.vakanties}/>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <input value={newVveName} onChange={e=>setNewVveName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVve()} placeholder="VvE naam toevoegen…"
                  className="flex-1 min-w-48 bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors"/>
                <button onClick={addVve} className="px-4 py-2 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">+</button>
                <button onClick={()=>setShowImport(i=>!i)} className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 text-sm border border-gray-200 rounded-xl transition-colors whitespace-nowrap">Bulk import</button>
                {ongepland > 0 && !planningPreview && (
                  <button onClick={handleGeneratePlanning} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm rounded-xl transition-colors whitespace-nowrap font-medium">
                    ✦ Stel planning voor ({ongepland} ongepland)
                  </button>
                )}
                {/* FIX 1: Sorteerknop */}
                <button
                  onClick={handleSorteer}
                  className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-xl transition-colors whitespace-nowrap"
                  title="Sorteer VvE's op vergaderdatum. VvE's met voorkeursdatum volgend jaar komen onderaan."
                >
                  ↕ Sorteer
                </button>
              </div>

              {showImport && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <p className="text-xs text-gray-500">Plak VvE-namen, één per regel. Datum en tijd worden automatisch herkend als je ze tab-gescheiden aanlevert (naam ⇥ d-m-jjjj ⇥ tijd).</p>
                  <textarea rows={6} value={importText} onChange={e=>setImportText(e.target.value)}
                    placeholder={"Zwolsestraat 253\t16-4-2026\t15.00\nTak van Poortvlietstraat 9 AB\t1-6-2026\t15:00 uur\n..."}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none resize-none font-mono focus:border-[#991A21] transition-colors"/>
                  <div className="flex gap-2">
                    <button onClick={handleImport} className="px-4 py-2 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm rounded-lg transition-colors font-medium">Importeer</button>
                    <button onClick={()=>setShowImport(false)} className="text-sm text-gray-400 hover:text-gray-600">Annuleer</button>
                  </div>
                </div>
              )}

              {/* Search + hide toggle */}
              <div className="flex gap-3 items-center flex-wrap">
                {data.vves.length>5 && (
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek VvE…"
                    className="flex-1 min-w-40 bg-white border-2 border-gray-200 rounded-xl px-4 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors"/>
                )}
                <label className="flex items-center gap-2 cursor-pointer shrink-0 group" onClick={()=>setHideAfgerond(h=>!h)}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${hideAfgerond?"bg-[#991A21] border-[#991A21]":"border-gray-300 hover:border-[#991A21]"}`}>
                    {hideAfgerond && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <span className="text-xs text-gray-600 group-hover:text-[#2D2D2D] transition-colors whitespace-nowrap">
                    Verberg afgerond {afgerond > 0 && <span className="text-gray-400">({afgerond})</span>}
                  </span>
                </label>
              </div>

              {/* Selectie toolbar */}
              {filtered.length > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm">
                  <label className="flex items-center gap-2 cursor-pointer group" onClick={()=> selectie.size === filtered.length ? deselecteerAlles() : selecteerAlles()}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectie.size === filtered.length && filtered.length > 0 ? "bg-[#991A21] border-[#991A21]" : selectie.size > 0 ? "bg-[#991A21]/60 border-[#991A21]/60" : "border-gray-300 hover:border-[#991A21]"}`}>
                      {selectie.size === filtered.length && filtered.length > 0 && <span className="text-white text-xs font-bold">✓</span>}
                      {selectie.size > 0 && selectie.size < filtered.length && <span className="text-zinc-300 text-xs font-bold">−</span>}
                    </div>
                    <span className="text-xs text-gray-600 group-hover:text-[#2D2D2D] transition-colors">
                      {selectie.size === 0 ? "Selecteer alles" : selectie.size === filtered.length ? "Alles geselecteerd" : `${selectie.size} geselecteerd`}
                    </span>
                  </label>
                  {selectie.size > 0 && (
                    <button onClick={verwijderSelectie} className="ml-auto px-3 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-[#991A21] text-xs rounded-lg transition-colors font-medium">
                      Verwijder {selectie.size} VvE{selectie.size > 1 ? "'s" : ""}
                    </button>
                  )}
                </div>
              )}

              {loading && <p className="text-sm text-zinc-500">Laden…</p>}
              {!loading && filtered.length===0 && (
                <p className="text-sm text-gray-400 text-center py-12">
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
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 ${selectie.has(vve.id)?"bg-[#991A21] border-[#991A21]":"border-gray-300 hover:border-[#991A21]"}`}
                    >
                      {selectie.has(vve.id) && <span className="text-white text-xs font-bold">✓</span>}
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
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6">Voortgang {year}</h2>
                  <div className="flex items-center gap-8">
                    <div className="relative shrink-0">
                      <svg width="140" height="140" viewBox="0 0 140 140">
                        <circle cx="70" cy="70" r={R} fill="none" stroke="#F0EDE9" strokeWidth="14"/>
                        {pctNiet > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#E8E4E0" strokeWidth="14" strokeDasharray={`${(pctNiet/100)*C} ${C}`} strokeDashoffset={-(dasAfgerond+dasUitgenodigd)} transform="rotate(-90 70 70)" strokeLinecap="butt"/>}
                        {pctUitgenodigd > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#0ea5e9" strokeWidth="14" strokeDasharray={`${dasUitgenodigd} ${C}`} strokeDashoffset={-dasAfgerond} transform="rotate(-90 70 70)" strokeLinecap="butt"/>}
                        {pctAfgerond > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#10b981" strokeWidth="14" strokeDasharray={`${dasAfgerond} ${C}`} strokeDashoffset={0} transform="rotate(-90 70 70)" strokeLinecap="butt"/>}
                        <text x="70" y="65" textAnchor="middle" fill="#2D2D2D" fontSize="22" fontWeight="700" fontFamily="DM Sans, sans-serif">{pctAfgerond}%</text>
                        <text x="70" y="82" textAnchor="middle" fill="#8A8A8A" fontSize="9" fontFamily="DM Sans, sans-serif">afgerond</text>
                      </svg>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-base font-semibold text-[#2D2D2D]">{label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{afgerond} van {total} vergaderingen volledig afgerond</p>
                      </div>
                      <div className="space-y-2.5">
                        {[["Afgerond",afgerond,total,"bg-emerald-500"],["Uitgenodigd",uitgenodigd,total,"bg-sky-500"],["Niet uitgenodigd",nietUitgenodigd,total,"bg-zinc-600"]].map(([lbl,val,tot,,barColor])=>(
                          <div key={lbl}>
                            <div className="flex justify-between mb-1"><span className="text-xs text-zinc-400">{lbl}</span><span className="text-xs font-mono text-zinc-400">{val} <span className="text-gray-400">/ {tot}</span></span></div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{width:`${tot===0?0:Math.round((val/tot)*100)}%`}}/></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div>
              <h2 className="text-sm font-semibold text-[#2D2D2D] mb-1">Vergaderingen per maand — {year}</h2>
              <p className="text-xs text-gray-500 mb-4">Geel = vakantieperiode &nbsp;·&nbsp; Groen ≤4 &nbsp;·&nbsp; Oranje 5–7 &nbsp;·&nbsp; Rood ≥8</p>
              <MonthBar counts={counts} vakanties={data.vakanties}/>
            </div>
            {ongepland>0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nog te plannen ({ongepland})</h3>
                <div className="grid grid-cols-2 gap-2">
                  {data.vves.filter(v=>!v.datum1).map(v=><div key={v.id} className="text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 shadow-sm">{v.naam}</div>)}
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
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{m} ({vves.length})</h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {vves.map(v=>(
                        <div key={v.id} className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg flex justify-between shadow-sm">
                          <span className="text-gray-700 truncate font-medium">{v.naam}</span>
                          <span className="text-gray-400 ml-2 shrink-0">{monthKey(v.datum1)===key?fmtDate(v.datum1):fmtDate(v.datum2)}</span>
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
                <h2 className="text-sm font-semibold text-[#2D2D2D]">Mijn vakantieperiodes</h2>
                <p className="text-xs text-gray-500 mt-0.5">Vergaderingen in deze periodes worden gemarkeerd en overgeslagen bij auto-planning.</p>
              </div>
              <button onClick={addVakantie} className="px-4 py-2 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">+ Toevoegen</button>
            </div>
            {data.vakanties.length===0 && <p className="text-sm text-gray-400 text-center py-12">Nog geen vakantieperiodes ingesteld.</p>}
            <div className="space-y-3">
              {data.vakanties.map(v=>(
                <div key={v.id} className="border border-gray-200 bg-white rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Omschrijving</label>
                      <input value={v.naam} onChange={e=>updateVakantie({...v,naam:e.target.value})} placeholder="Bijv. Zomervakantie" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none focus:border-[#991A21] transition-colors"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Van</label>
                      <input type="date" value={v.van} onChange={e=>updateVakantie({...v,van:e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Tot en met</label>
                      <input type="date" value={v.tot} onChange={e=>updateVakantie({...v,tot:e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"/>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    {v.van&&v.tot&&<span className="text-xs text-gray-500">{fmtDate(v.van)} → {fmtDate(v.tot)}</span>}
                    <button onClick={()=>deleteVakantie(v.id)} className="text-xs text-gray-400 hover:text-[#991A21] transition-colors ml-auto">Verwijder</button>
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
              <h2 className="text-sm font-semibold text-[#2D2D2D] mb-1">Mijn werkdagen</h2>
              <p className="text-xs text-gray-500 mb-4">De auto-planner plant geen vergaderingen op dagen dat je niet werkt.</p>
              <WerkdagenSelector werkdagen={werkdagen} onChange={updateWerkdagen}/>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[1,2,3,4,5,6,0].map((dow,i) => {
                  const labels=["Ma","Di","Wo","Do","Vr","Za","Zo"];
                  return werkdagen[dow] ? <span key={dow} className="text-[10px] bg-[#991A21]/10 text-[#991A21] px-2 py-0.5 rounded-full font-mono font-medium border border-[#991A21]/20">{labels[i]}</span> : null;
                })}
                {[1,2,3,4,5,6,0].filter(dow=>werkdagen[dow]).length===0 && <span className="text-xs text-[#991A21] font-medium">⚠ Geen werkdagen geselecteerd — auto-planning werkt niet.</span>}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-sm font-semibold text-[#2D2D2D] mb-1">Auto-planning</h2>
              <p className="text-xs text-gray-500 mb-4">Verdeelt alle ongeplande VvE's gelijkmatig over het jaar. Slaat vakantieperiodes en niet-werkdagen over. Je kunt het voorstel bekijken en aanpassen vóór je bevestigt.</p>
              <button
                onClick={() => { setTab("vergaderingen"); handleGeneratePlanning(); }}
                disabled={ongepland===0}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${ongepland===0?"bg-gray-100 text-gray-400 cursor-not-allowed":"bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700"}`}
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
