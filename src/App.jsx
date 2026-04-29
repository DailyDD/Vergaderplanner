import { useState, useEffect, useCallback, useRef } from "react";

// ── Huisstijl Totaal VvE Beheer ──────────────────────────────────
// Primair: #991A21 (donkerrood), Antraciet: #2D2D2D, Achtergrond: #F2EFEC
const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }
.calc-inp { width:100%; padding:8px 11px; border:1.5px solid #E5DEDA; border-radius:8px; font-family:monospace !important; font-size:14px; color:#1A1614; background:#FAF7F2; outline:none; box-sizing:border-box; }
.calc-inp:focus { border-color:#991A21 !important; background:#fff !important; }`;

// ── Config ───────────────────────────────────────────────────────
const INVITE_DAYS = 21;
const NL_MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const NL_MONTHS_FULL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
const NL_DAYS = ["Zo","Ma","Di","Wo","Do","Vr","Za"];
const WORK_DAYS_DEFAULT = [false, true, true, true, true, true, false];


// ── Supabase client ──────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Token opslag — overleeft page refresh via sessionStorage
const TOKEN_KEY = "vve_access_token";
let _accessToken = sessionStorage.getItem(TOKEN_KEY) || null;

function setToken(token) {
  _accessToken = token;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

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
  setToken(data.access_token);
  return data;
}

async function signOut() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${_accessToken}` },
    });
  } catch(e) { console.error("signOut", e); }
  setToken(null);
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
    const encodedNaam = encodeURIComponent(rows[0].naam);
    await fetch(`${SUPABASE_URL}/rest/v1/user_roles?naam=eq.${encodedNaam}`, {
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
function VveRow({ vve, vakanties, onUpdate, onDelete, onAdd2nd, forceOpen, onForceOpenHandled, vveHeeftLod }) {
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
            {vveHeeftLod && vveHeeftLod(vve.naam) && (
              <span style={{fontSize:9,fontWeight:700,background:'#FDEAEB',color:'#991A21',padding:'1px 6px',borderRadius:8,border:'1px solid #fca5a5',whiteSpace:'nowrap',flexShrink:0}}>⚠ LOD</span>
            )}
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
const CALC_S = {
  bordeaux: '#991A21', bordeauxDark: '#6B1217', bordeauxLight: '#F5E6E7',
  cream: '#FAF7F2', ink: '#1A1614', muted: '#8A7E7B', border: '#E5DEDA',
  green: '#2D6A4F', greenBg: '#EAF4EE', amber: '#92550A', amberBg: '#FEF3E2',
  redBg: '#FDEAEB', blue: '#1A4D7A', blueBg: '#EAF1F8',
}
const calcFmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const calcToday = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
let _calcId = 0
const calcUid = () => ++_calcId

function calcBuildExploitatieRows(r) {
  const rows = []
  if (r.verzekering)   rows.push(['Opstalverzekering', calcFmt(r.verzekering)])
  if (r.administratie) rows.push(['Administratie/beheer', calcFmt(r.administratie)])
  if (r.bankkosten)    rows.push(['Bankkosten', calcFmt(r.bankkosten)])
  if (r.overig)        rows.push(['Overig', calcFmt(r.overig)])
  r.extraKosten.forEach(e => { if (e.bedrag) rows.push([e.naam || 'Extra post', calcFmt(e.bedrag)]) })
  return rows
}

function calcExportPDF(r) {
  const eigenRows = r.eigenaren.map((e, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#FAF7F2'
    const deltaStr = (nieuw, huidig) => {
      if (nieuw === null || huidig === null) return '—'
      const diff = nieuw - huidig
      const pct = (diff / huidig * 100)
      const sign = diff > 0.005 ? '+' : ''
      const color = diff < -0.005 ? '#2D6A4F' : diff > 0.005 ? '#C0392B' : '#1A4D7A'
      return '<span style="color:' + color + ';font-weight:600">' + sign + calcFmt(diff) + ' (' + sign + pct.toFixed(1) + '%)</span>'
    }
    return '<tr style="background:' + bg + '"><td>' + e.naam + '</td><td style="text-align:right">' + e.teller + '/' + e.noemer + '</td><td style="text-align:right">' + (e.aandeel * 100).toFixed(2) + '%</td><td style="text-align:right">' + (e.huidig !== null ? calcFmt(e.huidig) : '—') + '</td><td style="text-align:right">' + (e.bijdrMjop !== null ? calcFmt(e.bijdrMjop) : '—') + '</td><td>' + deltaStr(e.bijdrMjop, e.huidig) + '</td><td style="text-align:right">' + (e.bijdr05 !== null ? calcFmt(e.bijdr05) : '—') + '</td><td>' + deltaStr(e.bijdr05, e.huidig) + '</td></tr>'
  }).join('')
  const totMjop = r.hasMjop ? calcFmt(r.eigenaren.reduce((s, e) => s + (e.bijdrMjop || 0), 0)) : '—'
  const tot05 = r.has05 ? calcFmt(r.eigenaren.reduce((s, e) => s + (e.bijdr05 || 0), 0)) : '—'
  const rr = (l, v) => '<div class="rr"><span class="rl">' + l + '</span><span class="rv">' + v + '</span></div>'
  const rrB = (l, v) => '<div class="rr"><span class="rl">' + l + '</span><span class="rv big">' + v + '</span></div>'
  const exploRows = calcBuildExploitatieRows(r)
  const exploHTML = exploRows.map(([l, v]) => rr(l, v)).join('')
  const html = '<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><title>VvE Bijdrage – ' + r.complexNaam + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:#1A1614;font-size:10pt;background:#fff;padding:32px 40px}.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid #991A21;margin-bottom:22px}.hdr h1{font-family:"DM Serif Display",serif;font-size:18pt;color:#991A21;font-weight:400}.hdr .meta{font-size:9pt;color:#8A7E7B;margin-top:3px}.intro{background:#FAF7F2;border-left:4px solid #991A21;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:9pt;color:#8A7E7B}.intro strong{color:#1A1614;font-size:10pt}.sec{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8A7E7B;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5DEDA}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.block{border:1px solid #E5DEDA;border-radius:6px;overflow:hidden}.bh{background:#991A21;padding:8px 12px}.bh .tag{font-size:7.5pt;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.05em}.bh .name{font-family:"DM Serif Display",serif;font-size:13pt;color:#fff;font-weight:400}.rr{display:flex;justify-content:space-between;padding:5px 12px;border-bottom:1px solid #E5DEDA;font-size:9pt}.rr:last-child{border:none}.rl{color:#8A7E7B}.rv{font-weight:500}.rv.big{font-family:"DM Serif Display",serif;font-size:15pt;color:#991A21;font-weight:400}.subtotaal{background:#FAF7F2;font-weight:600}table{width:100%;border-collapse:collapse;font-size:9pt}thead tr{background:#991A21;color:#fff}thead th{padding:7px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}thead th:not(:first-child){text-align:right}tbody td{padding:6px 10px;border-bottom:1px solid #E5DEDA}tfoot td{padding:7px 10px;font-weight:600;color:#991A21;border-top:2px solid #991A21;background:#F5E6E7}.note{margin-top:24px;padding:12px 16px;background:#FAF7F2;border-left:4px solid #991A21;font-size:8.5pt;color:#8A7E7B;border-radius:4px}.footer{margin-top:20px;padding-top:8px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:7.5pt;color:#8A7E7B}.print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:#991A21;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:sans-serif}@media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
    + '<button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>'
    + '<div class="hdr"><div><h1>' + (r.alleenEenmalig ? 'Eenmalige Bijdrage Rapport' : 'Reservefonds Bijdrage Rapport') + '</h1><div class="meta">' + r.complexNaam + ' · Opgesteld op ' + calcToday() + '</div></div></div>'
    + '<div class="intro"><strong>' + r.complexNaam + '</strong><br>' + (r.alleenEenmalig ? 'Berekening eenmalige bijdragen per eigenaar — opgesteld ' + calcToday() + '.' : 'Berekening minimale maandelijkse bijdrage reservefonds conform art. 5:126 BW — opgesteld ' + calcToday() + '.') + '</div>'
    + (r.alleenEenmalig ? '' :
        '<div class="sec">Methode 1 — Op basis van MJOP (wettelijke voorkeur)</div>'
      + '<div class="grid2"><div class="block"><div class="bh"><div class="tag">MJOP berekening</div><div class="name">Jaarlijkse dotatie</div></div>'
      + rr('Totale MJOP-kosten', calcFmt(r.mjopTotaal)) + rr('Planperiode', r.planPeriode + ' jaar') + rr('Jaarlijkse MJOP-dotatie', calcFmt(r.dotatie))
      + '</div><div class="block"><div class="bh"><div class="tag">Totale jaarlasten VvE</div><div class="name">Uitgesplitst</div></div>'
      + rr('MJOP-dotatie', calcFmt(r.dotatie)) + exploHTML
      + '<div class="rr subtotaal"><span class="rl">Totale jaarlasten VvE</span><span class="rv">' + calcFmt(r.jaarMjop) + '</span></div>'
      + rrB('Maandlasten VvE totaal', r.hasMjop ? calcFmt(r.mndMjop) : '—') + '</div></div>'
      + '<div class="sec">Methode 2 — 0,5% van herbouwwaarde (wettelijk minimum)</div>'
      + '<div class="grid2"><div class="block"><div class="bh"><div class="tag">Herbouwwaarde</div><div class="name">0,5% reservering</div></div>'
      + rr('Herbouwwaarde', calcFmt(r.herbouwwaarde)) + rr('0,5% jaarlijkse reservering', calcFmt(r.jaar05)) + rr('Van toepassing bij', '<span style="font-style:italic">geen/oud MJOP</span>')
      + '</div><div class="block"><div class="bh"><div class="tag">Totale jaarlasten VvE</div><div class="name">Uitgesplitst</div></div>'
      + rr('0,5% reservering', calcFmt(r.jaar05)) + exploHTML
      + '<div class="rr subtotaal"><span class="rl">Totale jaarlasten VvE</span><span class="rv">' + calcFmt(r.jaar05Totaal) + '</span></div>'
      + rrB('Maandlasten VvE totaal', r.has05 ? calcFmt(r.mnd05) : '—') + '</div></div>'
      + '<div class="sec">Maandelijkse bijdrage per eigenaar</div>'
      + '<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Breukdeel</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Huidig/mnd</th><th style="text-align:right">MJOP/mnd</th><th>Δ MJOP</th><th style="text-align:right">0,5%/mnd</th><th>Δ 0,5%</th></tr></thead>'
      + '<tbody>' + eigenRows + '</tbody>'
      + '<tfoot><tr><td><strong>Totaal VvE</strong></td><td></td><td style="text-align:right">100%</td><td style="text-align:right">' + calcFmt(r.eigenaren.reduce((s,e)=>s+(e.huidig||0),0)) + '</td><td style="text-align:right">' + totMjop + '</td><td></td><td style="text-align:right">' + tot05 + '</td><td></td></tr></tfoot></table>'
    )
    + (r.eenmaligAan && r.eenmaligBerekend && r.eenmaligBerekend.length > 0 ? (
        '<div class="sec">Eenmalige bijdragen per eigenaar</div>'
        + r.eenmaligBerekend.map(item =>
            '<p style="font-size:9pt;font-weight:600;margin:10px 0 2px">' + item.omschrijving + ' — Offerte: ' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.offerte) + (item.totaleKorting > 0 ? ' — Netto: ' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.nettoOfferte) : '') + ' — Tekort: ' + (item.tekort > 0 ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) : '€ 0,00 (volledig gedekt)') + '</p>'
            + (item.tekort > 0 ? '<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Korting</th><th style="text-align:right">Eenmalige bijdrage</th></tr></thead><tbody>' + item.perEigenaar.map((e,i) => '<tr style="background:' + (i%2===0?'#fff':'#FAF7F2') + '"><td>' + e.naam + '</td><td style="text-align:right">' + (e.aandeel*100).toFixed(2) + '%</td><td style="text-align:right;color:#2D6A4F">' + (e.korting > 0 ? new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.korting) : '—') + '</td><td style="text-align:right;font-weight:600;color:#991A21">' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.bijdrage) + '</td></tr>').join('') + '</tbody><tfoot><tr><td colspan="3"><strong>Totaal tekort</strong></td><td style="text-align:right">' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) + '</td></tr></tfoot></table>' : '')
          ).join('')
      ) : '')
    + (r.alleenEenmalig ? '' : '<div class="note"><strong>Toelichting:</strong> Methode 1 (MJOP) verdient de voorkeur bij een actueel MJOP. Methode 2 (0,5%) is het wettelijk minimum conform art. 5:126 lid 3 BW (v.a. 1 jan 2021).</div>')
    + '<div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>' + calcToday() + '</span></div>'
    + '</body></html>'
  const w = window.open('', '_blank', 'width=1050,height=850')
  if (w) { w.document.write(html); w.document.close() }
  else alert('Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.')
}

// ── Calculator sub-componenten (buiten VveCalculator om re-mount te voorkomen) ──
function CInp(props) { return <input {...props} className="calc-inp" />; }
function CField({label, children}) {
  return <div style={{marginBottom:4}}><label style={{display:'block',fontSize:11,fontWeight:600,color:'#8A7E7B',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>{label}</label>{children}</div>;
}
function CCard({header, children}) {
  return <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,overflow:'hidden',marginBottom:14}}>{header}{children}</div>;
}
function CCardHdr({icon, bg, title, sub}) {
  return <div style={{padding:'14px 20px',borderBottom:'1px solid #E5DEDA',display:'flex',alignItems:'center',gap:10}}><div style={{width:30,height:30,borderRadius:7,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>{icon}</div><div><div style={{fontSize:13,fontWeight:600}}>{title}</div><div style={{fontSize:11,color:'#8A7E7B',marginTop:1}}>{sub}</div></div></div>;
}
function CTag({c,t,children}) {
  return <span style={{display:'inline-block',padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:500,background:c,color:t}}>{children}</span>;
}
function CMethodBlock({tag,name,rows:mrows,total}) {
  return (
    <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'12px 18px 10px',borderBottom:'1px solid #E5DEDA'}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:'#8A7E7B'}}>{tag}</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:15,color:'#1A1614',marginTop:2}}>{name}</div>
      </div>
      {mrows.map(([l,v],i) => (
        <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'7px 18px',borderBottom:'1px solid #E5DEDA',fontSize:13}}>
          <span style={{color:'#8A7E7B'}}>{l}</span><span style={{fontFamily:'monospace',fontWeight:500}}>{v}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'10px 18px',fontSize:13}}>
        <span style={{color:'#8A7E7B'}}>Maandlasten VvE totaal</span>
        <span style={{fontFamily:'Georgia,serif',fontSize:22,color:'#991A21'}}>{total}</span>
      </div>
    </div>
  );
}
function CSecTitle({children, style:st}) {
  return (
    <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#8A7E7B',marginBottom:10,marginTop:26,display:'flex',alignItems:'center',gap:8,...st}}>
      {children}<div style={{flex:1,height:1,background:'#E5DEDA'}} />
    </div>
  );
}

function VveCalculator({ onTerug }) {
  const S = CALC_S
  const fmt = calcFmt
  const uid = calcUid
  const [complexNaam,   setComplexNaam]   = useState('')
  const [herbouwwaarde, setHerbouwwaarde] = useState('')
  const [mjopTotaal,    setMjopTotaal]    = useState('')
  const [planPeriode,   setPlanPeriode]   = useState('10')
  const [verzekering,   setVerzekering]   = useState('')
  const [administratie, setAdministratie] = useState('')
  const [bankkosten,    setBankkosten]    = useState('')
  const [overig,        setOverig]        = useState('')
  const [extraKosten,   setExtraKosten]   = useState([])
  const [bulkTekst,         setBulkTekst]         = useState('')
  const [bulkOpen,          setBulkOpen]          = useState(false)
  const [bulkFout,          setBulkFout]          = useState('')
  const [bulkBijdrageTekst, setBulkBijdrageTekst] = useState('')
  const [bulkBijdrageOpen,  setBulkBijdrageOpen]  = useState(false)
  const [bulkBijdrageFout,  setBulkBijdrageFout]  = useState('')
  const [vasteNoemer,   setVasteNoemer]   = useState('')
  const [eenmaligAan,   setEenmaligAan]   = useState(false)
  const [eenmaligItems, setEenmaligItems] = useState([{ id: uid(), omschrijving: '', bedrag: '', reserveStand: '', buffer: '2500', kortingAan: false, kortingBedrag: '' }])
  const [rows, setRows] = useState([
    { id: uid(), naam: '', teller: '', huidig: '' },
    { id: uid(), naam: '', teller: '', huidig: '' },
    { id: uid(), naam: '', teller: '', huidig: '' },
  ])
  const [result, setResult] = useState(null)
  const [error,  setError]  = useState('')

  const addExtraKost = () => setExtraKosten(p => [...p, { id: uid(), naam: '', bedrag: '' }])
  const delExtraKost = (id) => setExtraKosten(p => p.filter(e => e.id !== id))
  const updExtraKost = (id, f, v) => setExtraKosten(p => p.map(e => e.id === id ? { ...e, [f]: v } : e))

  const formula = (() => {
    const t = parseFloat(mjopTotaal) || 0
    const p = parseFloat(planPeriode) || 10
    if (!t) return 'Jaarlijkse dotatie = Totale MJOP-kosten ÷ Planperiode'
    return fmt(t) + ' ÷ ' + p + ' jaar = ' + fmt(t / p) + ' jaarlijkse dotatie'
  })()

  const totalTeller = rows.reduce((s, r) => s + (parseFloat(r.teller) || 0), 0)
  const breukCheck = (() => {
    const filled = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0)
    if (!filled.length || totalTeller === 0) return null
    return { ok: true, totaal: totalTeller }
  })()

  const addRow = () => setRows(p => [...p, { id: uid(), naam: '', teller: '', huidig: '' }])
  const delRow = (id) => setRows(p => p.filter(r => r.id !== id))
  const updRow = (id, f, v) => setRows(p => p.map(r => r.id === id ? { ...r, [f]: v } : r))

  const parseBulk = () => {
    setBulkFout('')
    const skipPatterns = [
      /^Presentielijst/i, /^Locatie\s*:/i, /^Datum en tijd/i,
      /^Eigenaar\s+Adres/i, /^Powered by/i,
      /^Totaal VvE/i, /^Bezoekadres/i, /^Postadres/i,
      /^Volmerlaan/i, /^Postbus/i, /^info@totaal/i, /^KvK/i,
    ]
    const isPostcode = (s) => /^\d{4}\s*[A-Z]{2}/.test(s)
    const regels = bulkTekst.trim().split('\n').map(r => r.trim()).filter(r => r && !skipPatterns.some(p => p.test(r)))

    // Haal straat + huisnummer op — strip naam die er eventueel voor staat
    const SUFFIXEN = 'straat|laan|weg|plein|kade|dijk|gracht|singel|dreef|pad|steeg|hoek|markt|hof|allee|boulevard|park|ring'
    const extractAdres = (r) => {
      const s = r.replace(/,\s*$/, '').trim()
      const m = s.match(new RegExp(`([A-Z][a-zA-Z\\u00C0-\\u024F]*(?:${SUFFIXEN}))\\s+(\\d+[A-Za-z]?)$`, 'i'))
      if (m) return m[1] + ' ' + m[2]
      const fb = s.match(/([A-Z][a-zA-Z\u00C0-\u024F]+)\s+(\d+[A-Za-z]?)$/)
      return fb ? fb[1] + ' ' + fb[2] : null
    }

    // Breukdeel staat altijd NA het emailadres op de contactregel
    const extractBreukdeel = (rk) => {
      if (/@/.test(rk)) {
        const naEmail = rk.replace(/^.*@\S+\s*/, '')
        const getallen = [...naEmail.matchAll(/\b(\d{1,3})\b/g)].map(m => parseInt(m[1]))
        if (getallen.length >= 2) return getallen[getallen.length - 2]
        if (getallen.length === 1) return getallen[0]
      }
      if (/^\d{1,3}$/.test(rk.trim())) return parseInt(rk.trim())
      return null
    }

    const gevonden = []
    const seen = new Set()

    for (let i = 0; i < regels.length; i++) {
      if (!isPostcode(regels[i])) continue
      const adres = extractAdres(i > 0 ? regels[i - 1] : '')
      if (!adres || seen.has(adres)) continue
      seen.add(adres)

      let breukdeel = null
      for (let k = i + 1; k < Math.min(i + 10, regels.length); k++) {
        if (isPostcode(regels[k])) break
        breukdeel = extractBreukdeel(regels[k].trim())
        if (breukdeel) break
      }
      if (!breukdeel) continue

      const hnrNum = parseInt(adres.match(/(\d+)/)?.[1] || '0')
      const hnrLetter = (adres.match(/\d+([A-Za-z])/) || [])[1]?.toUpperCase() || ''
      gevonden.push({ naam: adres, breukdeel, hnrNum, hnrLetter })
    }

    if (!gevonden.length) { setBulkFout('Geen eigenaren herkend. Zorg dat je de volledige presentielijst plakt inclusief postcodes.'); return }
    gevonden.sort((a, b) => a.hnrNum - b.hnrNum || a.hnrLetter.localeCompare(b.hnrLetter))
    setRows(gevonden.map(e => ({ id: uid(), naam: e.naam, teller: String(e.breukdeel), huidig: '' })))
    setBulkOpen(false)
    setBulkTekst('')
  }

  const parseBulkBijdrage = () => {
    setBulkBijdrageFout('')
    const maanden = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
    const regels = bulkBijdrageTekst.trim().split('\n')
    const bijdragenMap = {}
    let huidigAdres = null
    let huidigBedragen = []
    const slaOp = () => {
      if (huidigAdres && huidigBedragen.length) {
        const nietNul = huidigBedragen.filter(b => b > 0)
        if (nietNul.length) {
          const teller = {}
          nietNul.forEach(b => { teller[b] = (teller[b] || 0) + 1 })
          const modus = Object.entries(teller).sort((a,b) => b[1]-a[1])[0][0]
          bijdragenMap[huidigAdres.toLowerCase()] = parseFloat(modus)
        }
      }
    }
    for (const regel of regels) {
      const eigenaarMatch = regel.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
      if (eigenaarMatch && !maanden.some(m => regel.toLowerCase().startsWith(m)) && !regel.startsWith('Maand') && !regel.startsWith('Te goed') && !regel.startsWith('Achterstand') && !regel.startsWith('Totalen') && !regel.startsWith('Extra')) {
        slaOp()
        huidigAdres = eigenaarMatch[2].trim()
        huidigBedragen = []
        continue
      }
      const maandMatch = regel.match(/^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+€\s+([\d\.]+,[\d]{2})/i)
      if (maandMatch) {
        const bedrag = parseFloat(maandMatch[2].replace(/\./g,'').replace(',','.'))
        if (bedrag > 0) huidigBedragen.push(bedrag)
      }
    }
    slaOp()
    if (!Object.keys(bijdragenMap).length) { setBulkBijdrageFout('Geen bijdragen herkend. Controleer het formaat.'); return }
    let gekoppeld = 0
    setRows(prev => prev.map(r => {
      const naamLower = r.naam.toLowerCase()
      for (const [adres, bedrag] of Object.entries(bijdragenMap)) {
        if (naamLower.includes(adres.toLowerCase())) { gekoppeld++; return { ...r, huidig: String(bedrag.toFixed(2)) } }
      }
      return r
    }))
    setRows(prev => prev.filter(r => { const h = parseFloat(r.huidig); return !isNaN(h) && h > 0 }))
    setBulkBijdrageOpen(false)
    setBulkBijdrageTekst('')
    if (gekoppeld === 0) setBulkBijdrageFout('Geen eigenaren gekoppeld. Importeer eerst eigenaren via bulk import.')
  }

  const bereken = () => {
    setError('')
    const hv = parseFloat(herbouwwaarde) || 0
    const mt = parseFloat(mjopTotaal) || 0
    const pp = parseFloat(planPeriode) || 10
    const vz = parseFloat(verzekering) || 0
    const ad = parseFloat(administratie) || 0
    const bk = parseFloat(bankkosten) || 0
    const ov = parseFloat(overig) || 0
    const extraTotaal = extraKosten.reduce((s, e) => s + (parseFloat(e.bedrag) || 0), 0)
    const validRows = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0)
    if (!validRows.length) { setError('Voeg eerst eigenaren toe met breukdelen.'); return }
    const alleenEenmalig = eenmaligAan && !hv && !mt
    if (!alleenEenmalig && !hv && !mt) { setError('Vul minimaal de herbouwwaarde of MJOP-kosten in.'); return }
    const dotatie   = mt > 0 ? mt / pp : 0
    const exploit   = vz + ad + bk + ov + extraTotaal
    const jaarMjop  = dotatie + exploit
    const mndMjop   = jaarMjop / 12
    const jaar05    = hv * 0.005
    const jaarTot05 = jaar05 + exploit
    const mnd05     = jaarTot05 / 12
    const noemer    = parseFloat(vasteNoemer) > 0 ? parseFloat(vasteNoemer) : validRows.reduce((s, r) => s + (parseFloat(r.teller) || 0), 0)
    const eigenaren = validRows.map(r => {
      const teller = parseFloat(r.teller) || 0
      const aandeel = noemer > 0 ? teller / noemer : 0
      const huidig = parseFloat(r.huidig) || null
      return { naam: r.naam || ('App. ' + r.id), teller: r.teller, noemer, aandeel, huidig, bijdrMjop: mt > 0 ? aandeel * mndMjop : null, bijdr05: hv > 0 ? aandeel * mnd05 : null }
    })
    const somHuidig = validRows.reduce((s, r) => s + (parseFloat(r.huidig) || 0), 0)
    const jaarResHuidig = somHuidig > 0 ? (somHuidig * 12) - exploit : null
    const jaarResMjop   = mt > 0 ? (mndMjop * 12) - exploit : null
    const jaarRes05     = hv > 0 ? (mnd05   * 12) - exploit : null
    const aantalEigenaren = eigenaren.length
    const eenmaligBerekend = eenmaligAan ? eenmaligItems.map(item => {
      const offerte = parseFloat(item.bedrag) || 0
      const reserve = parseFloat(item.reserveStand) || 0
      const buffer = parseFloat(item.buffer) >= 0 ? parseFloat(item.buffer) : 2500
      const kortingPerEigenaar = item.kortingAan ? (parseFloat(item.kortingBedrag) || 0) : 0
      const totaleKorting = kortingPerEigenaar * aantalEigenaren
      const nettoOfferte = Math.max(0, offerte - totaleKorting)
      const beschikbaar = Math.max(0, reserve - buffer)
      const tekort = Math.max(0, nettoOfferte - beschikbaar)
      const perEigenaar = noemer > 0 ? eigenaren.map(e => ({ naam: e.naam, aandeel: e.aandeel, korting: kortingPerEigenaar, bijdrage: tekort > 0 ? e.aandeel * tekort : 0 })) : []
      return { omschrijving: item.omschrijving || 'Eenmalige bijdrage', offerte, nettoOfferte, totaleKorting, kortingPerEigenaar, reserve, buffer, beschikbaar, tekort, perEigenaar }
    }) : []
    setResult({
      complexNaam: complexNaam || 'Complex', mjopTotaal: mt, planPeriode: pp, dotatie,
      verzekering: vz, administratie: ad, bankkosten: bk, overig: ov,
      extraKosten: extraKosten.map(e => ({ naam: e.naam, bedrag: parseFloat(e.bedrag) || 0 })),
      exploitatie: exploit, jaarMjop, mndMjop, hasMjop: mt > 0,
      herbouwwaarde: hv, jaar05, jaar05Totaal: jaarTot05, mnd05, has05: hv > 0, eigenaren,
      jaarResHuidig, jaarResMjop, jaarRes05, eenmaligAan, alleenEenmalig, eenmaligBerekend
    })
    setTimeout(() => document.getElementById('calc-res-anker')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }



  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>
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
        <CSecTitle>Stap 1 — Algemene gegevens</CSecTitle>
        <CCard header={<CCardHdr icon="🏢" bg={S.redBg} title="Complexgegevens" sub="Naam en herbouwwaarde" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px' }}>
            <CField label="Naam complex"><CInp placeholder="bijv. VvE Reinkenstraat 1–24" value={complexNaam} onChange={e => setComplexNaam(e.target.value)} /></CField>
            <CField label="Herbouwwaarde (€)"><CInp type="number" placeholder="bijv. 2500000" value={herbouwwaarde} onChange={e => setHerbouwwaarde(e.target.value)} /></CField>
          </div>
        </CCard>

        <CSecTitle>Stap 2 — MJOP gegevens</CSecTitle>
        <CCard header={<CCardHdr icon="📋" bg={S.amberBg} title="Meerjarenonderhoudsplan (MJOP)" sub="Totale kosten over de planperiode" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 0' }}>
            <CField label="Totale MJOP-kosten (€)"><CInp type="number" placeholder="bijv. 150000" value={mjopTotaal} onChange={e => setMjopTotaal(e.target.value)} /></CField>
            <CField label="Planperiode (jaren)"><CInp type="number" placeholder="10" value={planPeriode} onChange={e => setPlanPeriode(e.target.value)} /></CField>
          </div>
          <div style={{ margin:'10px 20px 18px', padding:'9px 13px', background:S.cream, border:'1px solid '+S.border, borderRadius:7, fontFamily:'monospace', fontSize:12, color:S.muted }}>{formula}</div>
        </CCard>

        <CSecTitle>Stap 3 — Overige exploitatiekosten (jaarlijks)</CSecTitle>
        <CCard header={<CCardHdr icon="💼" bg={S.blueBg} title="Exploitatiekosten" sub="Buiten het MJOP — worden per post getoond in het rapport" />}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 20px 14px' }}>
            <CField label="Opstalverzekering (€/jaar)"><CInp type="number" placeholder="bijv. 3200" value={verzekering} onChange={e => setVerzekering(e.target.value)} /></CField>
            <CField label="Administratie/beheer (€/jaar)"><CInp type="number" placeholder="bijv. 2400" value={administratie} onChange={e => setAdministratie(e.target.value)} /></CField>
            <CField label="Bankkosten (€/jaar)"><CInp type="number" placeholder="bijv. 250" value={bankkosten} onChange={e => setBankkosten(e.target.value)} /></CField>
            <CField label="Overig (€/jaar)"><CInp type="number" placeholder="bijv. 800" value={overig} onChange={e => setOverig(e.target.value)} /></CField>
          </div>
          {extraKosten.length > 0 && (
            <div style={{ padding:'0 20px 8px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Extra kostenposten</div>
              {extraKosten.map(e => (
                <div key={e.id} style={{ display:'grid', gridTemplateColumns:'1fr 180px 36px', gap:8, marginBottom:8, alignItems:'center' }}>
                  <CInp placeholder="Naam kostenpost (bijv. Liftonderhoud)" value={e.naam} onChange={v => updExtraKost(e.id, 'naam', v.target.value)} />
                  <CInp type="number" placeholder="€/jaar" value={e.bedrag} onChange={v => updExtraKost(e.id, 'bedrag', v.target.value)} />
                  <button onClick={() => delExtraKost(e.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'6px', borderRadius:4, textAlign:'center' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addExtraKost} style={{ margin:'4px 20px 14px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Extra kostenpost toevoegen
          </button>
        </CCard>

        <CSecTitle>Stap 4 — Eigenaren &amp; breukdelen</CSecTitle>
        <CCard header={<CCardHdr icon="👥" bg={S.greenBg} title="Eigenaren" sub="Naam en breukdeel conform splitsingsakte" />}>
          <div style={{ padding:'12px 20px 0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <button onClick={() => setBulkOpen(p => !p)} style={{ padding:'8px 16px', background:bulkOpen?S.bordeaux:'#fff', border:'1.5px solid '+S.bordeaux, borderRadius:8, fontFamily:'inherit', fontSize:13, color:bulkOpen?'#fff':S.bordeaux, cursor:'pointer', fontWeight:500 }}>
                {bulkOpen ? '× Sluiten' : '↑ Bulk importeren via tekst'}
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <label style={{ fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>Totaal breukdelen (noemer)</label>
                <input type="number" placeholder="bijv. 5250" value={vasteNoemer} onChange={e => setVasteNoemer(e.target.value)}
                  style={{ width:120, padding:'7px 10px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:S.cream, outline:'none' }}
                  
                />
              </div>
            </div>
            {bulkOpen && (
              <div style={{ background:S.cream, border:'1px solid '+S.border, borderRadius:10, padding:16, marginTop:10, marginBottom:12 }}>
                <div style={{ fontSize:12, color:S.muted, marginBottom:8 }}>Plak hieronder de presentielijst of eigenaarstekst. De tool haalt naam, adres en breukdeel er automatisch uit.</div>
                <textarea value={bulkTekst} onChange={e => setBulkTekst(e.target.value)} placeholder="Plak hier de presentielijst of eigenaarstekst..."
                  style={{ width:'100%', minHeight:140, padding:'10px 12px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:12, color:S.ink, background:'#fff', outline:'none', resize:'vertical' }} />
                {bulkFout && <div style={{ color:S.bordeaux, fontSize:12, marginTop:6 }}>⚠ {bulkFout}</div>}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
                  <button onClick={parseBulk} style={{ padding:'9px 20px', background:S.bordeaux, border:'none', borderRadius:8, fontFamily:'inherit', fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken →</button>
                  <span style={{ fontSize:11, color:S.muted }}>Bestaande eigenaren worden vervangen</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:S.cream, borderBottom:'1px solid '+S.border }}>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:36 }}>#</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Naam / appartement</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:150 }}>Breukdeel teller</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', width:220 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      Huidige bijdrage (€/mnd)
                      <button onClick={() => setBulkBijdrageOpen(p => !p)} style={{ padding:'2px 8px', background:bulkBijdrageOpen?S.bordeaux:'#fff', border:'1px solid '+S.bordeaux, borderRadius:5, fontSize:10, color:bulkBijdrageOpen?'#fff':S.bordeaux, cursor:'pointer', fontWeight:600 }}>
                        {bulkBijdrageOpen ? '× sluiten' : '↑ bulk'}
                      </button>
                    </div>
                  </th>
                  <th style={{ padding:'8px 10px', width:44 }}></th>
                </tr>
              </thead>
              {bulkBijdrageOpen && (
                <tbody>
                  <tr>
                    <td colSpan={5} style={{ padding:'12px 16px', background:S.cream }}>
                      <div style={{ fontSize:12, color:S.muted, marginBottom:8 }}>Plak het overzicht ledenbijdragen. De tool pakt het vaakst voorkomende bedrag per eigenaar.</div>
                      <textarea value={bulkBijdrageTekst} onChange={e => setBulkBijdrageTekst(e.target.value)} placeholder="Plak hier het overzicht ledenbijdragen..."
                        style={{ width:'100%', minHeight:120, padding:'8px 10px', border:'1.5px solid '+S.border, borderRadius:7, fontFamily:'monospace', fontSize:12, color:S.ink, background:'#fff', outline:'none', resize:'vertical' }} />
                      {bulkBijdrageFout && <div style={{ color:S.bordeaux, fontSize:12, marginTop:4 }}>⚠ {bulkBijdrageFout}</div>}
                      <button onClick={parseBulkBijdrage} style={{ marginTop:8, padding:'8px 18px', background:S.bordeaux, border:'none', borderRadius:7, fontFamily:'inherit', fontSize:13, color:'#fff', cursor:'pointer', fontWeight:500 }}>Verwerken →</button>
                    </td>
                  </tr>
                </tbody>
              )}
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid '+S.border : 'none' }}>
                    <td style={{ textAlign:'center', fontFamily:'monospace', fontSize:11, color:S.muted, padding:'7px 8px' }}>{i + 1}</td>
                    <td style={{ padding:'5px 6px' }}><CInp placeholder="bijv. App. 1 · De Vries" value={r.naam} onChange={e => updRow(r.id, 'naam', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 45" value={r.teller} onChange={e => updRow(r.id, 'teller', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px' }}><CInp type="number" placeholder="bijv. 125" value={r.huidig} onChange={e => updRow(r.id, 'huidig', e.target.value)} /></td>
                    <td style={{ padding:'5px 6px', textAlign:'center' }}>
                      <button onClick={() => delRow(r.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'2px 6px', borderRadius:4 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {breukCheck && (
            <div style={{ margin:'8px 20px 4px', padding:'6px 10px', borderRadius:6, fontSize:12, fontFamily:'monospace', background:parseFloat(vasteNoemer)>0?S.greenBg:S.amberBg, color:parseFloat(vasteNoemer)>0?S.green:S.amber }}>
              {parseFloat(vasteNoemer) > 0 ? '✓ Som tellers: ' + totalTeller + ' — noemer vastgesteld op ' + vasteNoemer : '⚠ Som tellers: ' + totalTeller + ' — vul het totaal breukdelen in voor de juiste noemer'}
            </div>
          )}
          <button onClick={addRow} style={{ margin:'10px 20px', padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'calc(100% - 40px)' }}>
            + Eigenaar toevoegen
          </button>
        </CCard>

        <div style={{ marginTop:4, marginBottom:4 }}>
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'12px 16px', background:'#fff', border:'1px solid '+S.border, borderRadius:12, userSelect:'none' }}>
            <input type="checkbox" checked={eenmaligAan} onChange={e => setEenmaligAan(e.target.checked)} style={{ width:16, height:16, accentColor:S.bordeaux, cursor:'pointer' }} />
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:S.ink }}>Eenmalige bijdrage berekenen</div>
              <div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Verdeel offertebedragen over eigenaren op basis van breukdeel</div>
            </div>
          </label>
          {eenmaligAan && (
            <div style={{ background:'#fff', border:'1px solid '+S.border, borderRadius:12, overflow:'hidden', marginTop:8 }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid '+S.border, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:7, background:S.amberBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>💶</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Eenmalige bijdragen</div>
                  <div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Elke offerte heeft een eigen reservestand, buffer en eventuele gemeentelijke korting</div>
                </div>
              </div>
              <div style={{ padding:'16px 20px' }}>
                {eenmaligItems.map((item, i) => {
                  const reserveVal = parseFloat(item.reserveStand) || 0
                  const bufferVal = parseFloat(item.buffer) >= 0 ? parseFloat(item.buffer) : 2500
                  const beschikbaar = Math.max(0, reserveVal - bufferVal)
                  const kortingPE = item.kortingAan ? (parseFloat(item.kortingBedrag) || 0) : 0
                  const aantalEig = rows.filter(r => r.teller !== '' && parseFloat(r.teller) > 0).length
                  const totKorting = kortingPE * aantalEig
                  const nettoOfferte = Math.max(0, (parseFloat(item.bedrag) || 0) - totKorting)
                  const tekort = Math.max(0, nettoOfferte - beschikbaar)
                  return (
                    <div key={item.id} style={{ border:'1px solid '+S.border, borderRadius:10, padding:'14px 16px', marginBottom:12, background:S.cream, position:'relative' }}>
                      {eenmaligItems.length > 1 && (
                        <button onClick={() => setEenmaligItems(p => p.filter(x => x.id !== item.id))} style={{ position:'absolute', top:10, right:10, background:'none', border:'none', cursor:'pointer', fontSize:16, color:S.muted, padding:'2px 6px', borderRadius:4 }}>×</button>
                      )}
                      <div style={{ fontSize:11, fontWeight:700, color:S.bordeaux, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Offerte {i + 1}</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 180px', gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Omschrijving</label>
                          <input type="text" placeholder="bijv. Dakvervanging offerte Kees BV" value={item.omschrijving}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, omschrijving: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Offertebedrag (€)</label>
                          <input type="number" placeholder="bijv. 24000" value={item.bedrag}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, bedrag: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Huidige stand reservefonds (€)</label>
                          <input type="number" placeholder="bijv. 18500" value={item.reserveStand}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, reserveStand: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Buffer in reserve (€)</label>
                          <input type="number" placeholder="bijv. 2500" value={item.buffer}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, buffer: e.target.value} : x))}
                            style={{ width:'100%', padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                        </div>
                      </div>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:item.kortingAan?8:0 }}>
                        <input type="checkbox" checked={item.kortingAan}
                          onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, kortingAan: e.target.checked} : x))}
                          style={{ width:14, height:14, accentColor:S.bordeaux, cursor:'pointer' }} />
                        <span style={{ fontSize:12, fontWeight:600, color:S.ink }}>Gemeentelijke korting</span>
                      </label>
                      {item.kortingAan && (
                        <div style={{ marginBottom:8 }}>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Korting per eigenaar (€)</label>
                          <input type="number" placeholder="bijv. 1000" value={item.kortingBedrag}
                            onChange={e => setEenmaligItems(p => p.map(x => x.id === item.id ? {...x, kortingBedrag: e.target.value} : x))}
                            style={{ width:200, padding:'8px 11px', border:'1.5px solid '+S.border, borderRadius:8, fontFamily:'monospace', fontSize:13, color:S.ink, background:'#fff', outline:'none' }}
                             />
                          {kortingPE > 0 && aantalEig > 0 && (
                            <div style={{ fontSize:12, color:S.muted, marginTop:4, fontFamily:'monospace' }}>Totale korting: {kortingPE} × {aantalEig} eigenaren = {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(totKorting)}</div>
                          )}
                        </div>
                      )}
                      {(reserveVal > 0 || parseFloat(item.bedrag) > 0) && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:tekort>0?S.redBg:S.greenBg, borderRadius:7, fontSize:12, fontFamily:'monospace', color:tekort>0?S.bordeaux:S.green }}>
                          {item.kortingAan && totKorting > 0 && <div>Offerte na korting: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(nettoOfferte)}</div>}
                          <div>Beschikbaar uit reserve: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(beschikbaar)} (na buffer {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(bufferVal)})</div>
                          <div style={{ fontWeight:700, marginTop:2 }}>{tekort > 0 ? '⚠ Tekort: ' + new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(tekort) : '✓ Volledig gedekt door reserve'}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button onClick={() => setEenmaligItems(p => [...p, { id: uid(), omschrijving:'', bedrag:'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }])}
                  style={{ padding:'8px 14px', background:'#fff', border:'1.5px dashed '+S.border, borderRadius:8, fontFamily:'inherit', fontSize:13, color:S.muted, cursor:'pointer', width:'100%' }}>
                  + Offerte toevoegen
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ background:S.redBg, color:S.bordeaux, padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:10 }}>{error}</div>}

        <button onClick={bereken} style={{ width:'100%', padding:14, background:S.bordeaux, border:'none', borderRadius:12, fontFamily:'Georgia,serif', fontSize:17, color:'#fff', cursor:'pointer', marginTop:4 }}>
          Bereken maandelijkse bijdragen →
        </button>

        {result && (
          <div id="calc-res-anker">
            <CSecTitle style={{ marginTop:36 }}>Resultaat</CSecTitle>
            <button onClick={() => calcExportPDF(result)} style={{ width:'100%', padding:'11px 16px', background:'#fff', border:'1.5px solid '+S.bordeaux, borderRadius:10, fontFamily:'inherit', fontSize:14, color:S.bordeaux, cursor:'pointer', fontWeight:500, marginBottom:14 }}>
              🖨 Exporteer als PDF / Afdrukken
            </button>
            {!result.alleenEenmalig && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                  <CMethodBlock tag="Methode 1 — Wettelijke voorkeur" name="Op basis van MJOP"
                    rows={[['Totale MJOP-kosten',fmt(result.mjopTotaal)],['Planperiode',result.planPeriode+' jaar'],['Jaarlijkse MJOP-dotatie',fmt(result.dotatie)],...calcBuildExploitatieRows(result),['Totale jaarlasten VvE',fmt(result.jaarMjop)]]}
                    total={result.hasMjop ? fmt(result.mndMjop) : '—'} />
                  <CMethodBlock tag="Methode 2 — Wettelijk minimum" name="0,5% van herbouwwaarde"
                    rows={[['Herbouwwaarde',fmt(result.herbouwwaarde)],['0,5% jaarlijkse reservering',fmt(result.jaar05)],...calcBuildExploitatieRows(result),['Totale jaarlasten VvE',fmt(result.jaar05Totaal)],['Toelichting','Minimumeis bij geen/oud MJOP']]}
                    total={result.has05 ? fmt(result.mnd05) : '—'} />
                </div>
                <CCard header={<CCardHdr icon="🔢" bg={S.redBg} title="Maandelijkse bijdrage per eigenaar" sub="Verdeling naar rato breukdeel" />}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:S.cream, borderBottom:'1px solid '+S.border }}>
                          {['Eigenaar','Breukdeel','Aandeel %','Huidig/mnd','MJOP/mnd','Δ MJOP','0,5%/mnd','Δ 0,5%'].map((h,i) => (
                            <th key={i} style={{ padding:'8px 10px', textAlign:i>1?'right':'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.eigenaren.map((e, i) => {
                          const diffMjop = e.huidig!==null&&e.bijdrMjop!==null?e.bijdrMjop-e.huidig:null
                          const diff05   = e.huidig!==null&&e.bijdr05!==null?e.bijdr05-e.huidig:null
                          const pctMjop  = e.huidig&&diffMjop!==null?(diffMjop/e.huidig*100):null
                          const pct05    = e.huidig&&diff05!==null?(diff05/e.huidig*100):null
                          const deltaTag = (diff, pct) => {
                            if (diff===null) return <span style={{color:S.muted}}>—</span>
                            const pos = diff > 0.005; const neg = diff < -0.005
                            const color = neg?S.green:pos?'#C0392B':S.blue
                            const bg    = neg?S.greenBg:pos?'#FDEAEB':S.blueBg
                            const sign  = pos?'+':''
                            return <CTag c={bg} t={color}>{sign}{fmt(diff)} ({sign}{pct.toFixed(1)}%)</CTag>
                          }
                          return (
                            <tr key={i} style={{ borderBottom:i<result.eigenaren.length-1?'1px solid '+S.border:'none' }}>
                              <td style={{ padding:'8px 10px',fontWeight:500,fontSize:12 }}>{e.naam}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.teller}/{e.noemer}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.huidig!==null?fmt(e.huidig):<span style={{color:S.muted}}>—</span>}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.bijdrMjop!==null?fmt(e.bijdrMjop):'—'}</td>
                              <td style={{ padding:'8px 10px' }}>{deltaTag(diffMjop,pctMjop)}</td>
                              <td style={{ padding:'8px 10px',fontFamily:'monospace',fontSize:12,textAlign:'right' }}>{e.bijdr05!==null?fmt(e.bijdr05):'—'}</td>
                              <td style={{ padding:'8px 10px' }}>{deltaTag(diff05,pct05)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot style={{ borderTop:'2px solid '+S.bordeaux }}>
                        <tr style={{ background:S.cream }}>
                          <td colSpan={2} style={{ padding:'9px 10px',fontSize:13,fontWeight:600,color:S.muted }}>Totaal VvE</td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,textAlign:'right' }}>100%</td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{fmt(result.eigenaren.reduce((s,e)=>s+(e.huidig||0),0))}</td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{result.hasMjop?fmt(result.eigenaren.reduce((s,e)=>s+(e.bijdrMjop||0),0)):'—'}</td>
                          <td></td>
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{result.has05?fmt(result.eigenaren.reduce((s,e)=>s+(e.bijdr05||0),0)):'—'}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CCard>
                <div style={{ marginTop:16 }}>
                  <CSecTitle>Jaarlijkse reservering voor onderhoud — VvE totaal</CSecTitle>
                  <div style={{ background:'#fff', border:'1px solid #E5DEDA', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5DEDA', display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:30, height:30, borderRadius:7, background:'#EAF4EE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>💰</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>Reservering = (totale maandelijkse bijdragen × 12) − exploitatiekosten</div>
                        <div style={{ fontSize:11, color:'#8A7E7B', marginTop:1 }}>Wat de VvE per jaar spaart voor onderhoud na aftrek van vaste lasten</div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
                      {[
                        { label:'Huidig', sub:'Op basis van huidige bijdragen', value:result.jaarResHuidig, active:result.jaarResHuidig!==null },
                        { label:'Op basis van MJOP', sub:'Nieuwe bijdrage methode 1', value:result.jaarResMjop, active:result.hasMjop },
                        { label:'Op basis van 0,5%', sub:'Nieuwe bijdrage methode 2', value:result.jaarRes05, active:result.has05 },
                      ].map((item, i) => (
                        <div key={i} style={{ padding:'20px 24px', borderRight:i<2?'1px solid #E5DEDA':'none' }}>
                          <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'#8A7E7B', marginBottom:4 }}>{item.label}</div>
                          <div style={{ fontSize:11, color:'#8A7E7B', marginBottom:12 }}>{item.sub}</div>
                          {item.active ? (
                            <div style={{ fontFamily:'Georgia,serif', fontSize:26, color:item.value>=0?'#2D6A4F':'#C0392B', fontWeight:400 }}>
                              {fmt(item.value)}<div style={{ fontSize:11, fontFamily:'DM Sans,sans-serif', color:'#8A7E7B', marginTop:4 }}>per jaar</div>
                            </div>
                          ) : <div style={{ fontSize:14, color:'#8A7E7B' }}>—</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {result.eenmaligAan && result.eenmaligBerekend && result.eenmaligBerekend.length > 0 && (
              <div style={{ marginTop:16 }}>
                <CSecTitle>Eenmalige bijdragen per eigenaar</CSecTitle>
                <div style={{ background:'#fff', border:'1px solid '+S.border, borderRadius:12, overflow:'hidden', marginBottom:14 }}>
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid '+S.border, display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:7, background:S.amberBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>💶</div>
                    <div><div style={{ fontSize:13, fontWeight:600 }}>Verdeling eenmalige bijdragen</div><div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Elke offerte is onafhankelijk berekend</div></div>
                  </div>
                  {result.eenmaligBerekend.map((item, idx) => (
                    <div key={idx} style={{ borderBottom:idx<result.eenmaligBerekend.length-1?'1px solid '+S.border:'none' }}>
                      <div style={{ padding:'12px 20px', background:S.cream, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                        <div>
                          <span style={{ fontWeight:600, fontSize:13 }}>{item.omschrijving}</span>
                          <span style={{ fontSize:12, color:S.muted, marginLeft:12 }}>Offerte: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.offerte)}</span>
                          {item.totaleKorting > 0 && <span style={{ fontSize:12, color:S.green, marginLeft:8 }}>− {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.totaleKorting)} korting</span>}
                        </div>
                        <span style={{ fontFamily:'Georgia,serif', fontSize:18, color:item.tekort>0?S.bordeaux:S.green }}>
                          {item.tekort > 0 ? 'Tekort: '+new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort) : '✓ Volledig gedekt'}
                        </span>
                      </div>
                      <div style={{ padding:'6px 20px', background:'#fff', borderBottom:'1px solid '+S.border, fontSize:11, color:S.muted, fontFamily:'monospace' }}>
                        Reserve: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.reserve)} — buffer: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.buffer)} — beschikbaar: {new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.beschikbaar)}
                      </div>
                      {item.tekort > 0 && (
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead><tr style={{ background:'#FAF7F2', borderBottom:'1px solid '+S.border }}>
                              {['Eigenaar','Aandeel %','Korting','Eenmalige bijdrage'].map((h,i) => (
                                <th key={i} style={{ padding:'7px 12px', textAlign:i>0?'right':'left', fontSize:10, fontWeight:600, color:S.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {item.perEigenaar.map((e, i) => (
                                <tr key={i} style={{ borderBottom:i<item.perEigenaar.length-1?'1px solid '+S.border:'none', background:i%2===0?'#fff':'#FAF7F2' }}>
                                  <td style={{ padding:'7px 12px',fontSize:13,fontWeight:500 }}>{e.naam}</td>
                                  <td style={{ padding:'7px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right' }}>{(e.aandeel*100).toFixed(2)}%</td>
                                  <td style={{ padding:'7px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right',color:e.korting>0?S.green:S.muted }}>{e.korting>0?new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.korting):'—'}</td>
                                  <td style={{ padding:'7px 12px',fontFamily:'monospace',fontSize:13,textAlign:'right',color:S.bordeaux,fontWeight:600 }}>{new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(e.bijdrage)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot style={{ borderTop:'2px solid '+S.bordeaux }}>
                              <tr style={{ background:'#F5E6E7' }}>
                                <td colSpan={3} style={{ padding:'8px 12px',fontSize:13,fontWeight:600,color:S.muted }}>Totaal tekort</td>
                                <td style={{ padding:'8px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:S.bordeaux,textAlign:'right' }}>{new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(item.tekort)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ padding:'10px 20px', background:'#FEF3E2', borderTop:'1px solid '+S.border, fontSize:11, color:S.amber }}>
                    ⚠ De buffer blijft altijd in het reservefonds als veiligheidsmarge voor onvoorziene kosten.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ── LOD Beheer ───────────────────────────────────────────────────

let _lodId = 0;
const lodUid = () => 'lod_' + (++_lodId) + '_' + Date.now();

const LOD_ROOD     = '#991A21';
const LOD_ROOD_BG  = '#FDEAEB';
const LOD_ROOD_DRK = '#7a1419';

const LOD_STATUS = {
  nieuw:            { label: 'Nieuw ontvangen',         color: '#1A4D7A', bg: '#EAF1F8', dot: '#1A4D7A' },
  in_behandeling:   { label: 'In behandeling',           color: LOD_ROOD,  bg: LOD_ROOD_BG, dot: LOD_ROOD },
  offertes_afwacht: { label: 'Offerte in afwachting',    color: '#92400E', bg: '#FEF3E2', dot: '#B45309' },
  offertes_lopen:   { label: 'Offertes lopen',           color: '#5B3FA6', bg: '#F3EFFD', dot: '#7C3AED' },
  vve_afwachting:   { label: 'In afwachting van VvE',    color: '#065F46', bg: '#D1FAE5', dot: '#059669' },
  vve_akkoord:      { label: 'VvE akkoord',              color: '#2D6A4F', bg: '#EAF4EE', dot: '#2D6A4F' },
  opdracht_uit:     { label: 'Opdracht verstrekt',       color: '#1E3A5F', bg: '#DBEAFE', dot: '#1E40AF' },
  afgerond:         { label: 'Afgerond',                 color: '#374151', bg: '#F3F4F6', dot: '#6B7280' },
  overschreden:     { label: 'Deadline overschreden',    color: LOD_ROOD,  bg: LOD_ROOD_BG, dot: LOD_ROOD },
};

// Supabase opslag voor LOD data
const LOD_TABLE = 'lod_data';

async function lodSupaLoad() {
  try {
    const rows = await sbFetch(`${LOD_TABLE}?select=id,data&order=created_at.desc`);
    if (!rows || !rows.length) return [];
    return rows.map(r => ({ id: r.id, ...r.data }));
  } catch {
    // Fallback naar localStorage als tabel nog niet bestaat
    try { const r = localStorage.getItem('lod_data_v3'); return r ? JSON.parse(r) : []; } catch { return []; }
  }
}

async function lodSupaSave(lod) {
  try {
    const existing = await sbFetch(`${LOD_TABLE}?id=eq.${lod.id}&select=id`);
    if (existing && existing.length) {
      await sbFetch(`${LOD_TABLE}?id=eq.${lod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: lod })
      });
    } else {
      await sbFetch(LOD_TABLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: lod.id, data: lod })
      });
    }
    // Ook lokaal opslaan als backup
    try {
      const all = JSON.parse(localStorage.getItem('lod_data_v3')||'[]');
      const idx = all.findIndex(l=>l.id===lod.id);
      if (idx>=0) all[idx]=lod; else all.unshift(lod);
      localStorage.setItem('lod_data_v3', JSON.stringify(all));
    } catch {}
  } catch {
    // Fallback naar localStorage
    try {
      const all = JSON.parse(localStorage.getItem('lod_data_v3')||'[]');
      const idx = all.findIndex(l=>l.id===lod.id);
      if (idx>=0) all[idx]=lod; else all.unshift(lod);
      localStorage.setItem('lod_data_v3', JSON.stringify(all));
    } catch {}
  }
}

async function lodSupaDelete(id) {
  try {
    await sbFetch(`${LOD_TABLE}?id=eq.${id}`, { method: 'DELETE' });
    try {
      const all = JSON.parse(localStorage.getItem('lod_data_v3')||'[]');
      localStorage.setItem('lod_data_v3', JSON.stringify(all.filter(l=>l.id!==id)));
    } catch {}
  } catch {
    try {
      const all = JSON.parse(localStorage.getItem('lod_data_v3')||'[]');
      localStorage.setItem('lod_data_v3', JSON.stringify(all.filter(l=>l.id!==id)));
    } catch {}
  }
}

function lodLocalLoad() {
  try { const r = localStorage.getItem('lod_data_v3'); return r ? JSON.parse(r) : []; } catch { return []; }
}

function lodDagenTot(deadline) {
  if (!deadline) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((new Date(deadline) - now) / 86400000);
}
function lodDeadlineKleur(dagen) {
  if (dagen===null) return '';
  if (dagen<0) return 'text-red-600 font-bold';
  if (dagen<=14) return 'text-red-500 font-semibold';
  if (dagen<=30) return 'text-red-400 font-semibold';
  return 'text-gray-600';
}
function lodFmt(n) {
  if (!n||isNaN(n)) return '-';
  return '€ '+Number(n).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function lodNow() { return new Date().toISOString(); }
function lodFmtDt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

// Auto-status op basis van offerte vinkjes
function berekenAutoStatus(lod) {
  const s = lod.status;
  if (s==='afgerond'||s==='overschreden') return s;
  const ofs = lod.offertes||[];
  if (ofs.some(o=>o.opdrachtAfgerond))     return 'opdracht_uit'; // afgerond valt nog onder opdracht_uit status
  if (ofs.some(o=>o.opdracht))             return 'opdracht_uit';
  if (ofs.some(o=>o.vveAkkoord))           return 'vve_akkoord';
  if (ofs.some(o=>o.vveVoorlegd))          return 'vve_afwachting';
  // Offertes lopen: alleen als ALLE aangevraagde offertes ontvangen zijn
  const aangevraagd = ofs.filter(o=>o.aangevraagd);
  const allemaalOntvangen = aangevraagd.length > 0 && aangevraagd.every(o=>o.ontvangen);
  if (allemaalOntvangen)                   return 'offertes_lopen';
  // Offerte in afwachting: minstens 1 aangevraagd maar nog niet allemaal ontvangen
  if (aangevraagd.some(o=>!o.ontvangen))   return 'offertes_afwacht';
  if (aangevraagd.length > 0)              return 'in_behandeling';
  return 'nieuw';
}

function LodStatusBadge({ status }) {
  const s = LOD_STATUS[status]||LOD_STATUS.nieuw;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:20,background:s.bg,color:s.color,fontSize:11,fontWeight:600}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,display:'inline-block'}} />
      {s.label}
    </span>
  );
}

function buildTijdlijn(lod) {
  const events = [];
  const add = (ts,tekst,kleur) => { if(ts) events.push({ts,tekst,kleur}); };
  add(lod.tijdlijn?.vveGenotificeerd,          'VvE in kennis gesteld',                '#1A4D7A');
  add(lod.tijdlijn?.vergaderingUitgeschreven,  'Vergadering uitgeschreven',            LOD_ROOD);
  (lod.offertes||[]).forEach(o=>{
    add(o.tijdlijn?.aangevraagd,`Offerte aangevraagd bij ${o.partij||'onbekend'}`,    '#1A4D7A');
    add(o.tijdlijn?.ontvangen,  `Offerte ontvangen van ${o.partij||'onbekend'}`,      '#5B3FA6');
    add(o.tijdlijn?.vveVoorlegd,`Offerte voorgelegd aan VvE (${o.partij||'onbekend'})`,'#92400E');
    add(o.tijdlijn?.vveAkkoord, `VvE akkoord op offerte ${o.partij||'onbekend'}`,     '#2D6A4F');
    add(o.tijdlijn?.opdracht,         `Opdracht verstrekt aan ${o.partij||'onbekend'}`,  '#1E3A5F');
    add(o.tijdlijn?.opdrachtAfgerond, `Opdracht afgerond door ${o.partij||'onbekend'}`,   '#2D6A4F');
  });
  add(lod.tijdlijn?.uitstelAangevraagd,'Uitstel aangevraagd bij gemeente',             '#92400E');
  add(lod.tijdlijn?.uitstelGoedgekeurd,'Uitstel goedgekeurd door gemeente',             '#2D6A4F');
  add(lod.tijdlijn?.gemeenteBevestigd,'Gemeente bevestigd / gereed gemeld',            '#2D6A4F');
  add(lod.tijdlijn?.afgerond,         'LOD afgerond',                                  '#374151');
  return events.sort((a,b)=>new Date(a.ts)-new Date(b.ts));
}

// Voortgangsstappen voor de voortgangsbalk
function lodVoortgang(lod) {
  const ofs = lod.offertes||[];
  const aangevraagd = ofs.filter(o=>o.aangevraagd);
  const allemaalOntvangen = aangevraagd.length > 0 && aangevraagd.every(o=>o.ontvangen);
  const allemaalAfgerond = ofs.length > 0 && ofs.filter(o=>o.opdracht).every(o=>o.opdrachtAfgerond);
  return [
    { lbl:'VvE in kennis gesteld',        ok: !!lod.vveGenotificeerd },
    { lbl:'Offertes aangevraagd',         ok: ofs.some(o=>o.aangevraagd) },
    { lbl:'Alle offertes ontvangen',      ok: allemaalOntvangen },
    { lbl:'Aan VvE voorgelegd/vergaderd', ok: ofs.some(o=>o.vveVoorlegd) || !!lod.vergaderingUitgeschreven },
    { lbl:'VvE akkoord',                  ok: ofs.some(o=>o.vveAkkoord) },
    { lbl:'Opdracht verstrekt',           ok: ofs.some(o=>o.opdracht) },
    { lbl:'Opdracht afgerond',            ok: ofs.some(o=>o.opdrachtAfgerond) },
    { lbl:'Afronding gemeld gemeente',    ok: !!lod.gemeenteBevestigd },
  ];
}

function LodVoortgangBalk({ lod }) {
  const stappen = lodVoortgang(lod);
  const gedaan  = stappen.filter(s=>s.ok).length;
  const pct     = Math.round(gedaan/stappen.length*100);
  return (
    <div style={{minWidth:160,maxWidth:200}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <span style={{fontSize:10,fontWeight:600,color:'#8A7E7B',textTransform:'uppercase',letterSpacing:'0.05em'}}>Voortgang</span>
        <span style={{fontSize:11,fontWeight:700,color:pct===100?'#2D6A4F':LOD_ROOD}}>{pct}%</span>
      </div>
      <div style={{height:6,background:'#F3F4F6',borderRadius:3,overflow:'hidden',marginBottom:5}}>
        <div style={{height:'100%',width:pct+'%',background:pct===100?'#2D6A4F':LOD_ROOD,borderRadius:3,transition:'width .3s'}} />
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {stappen.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:9,color:s.ok?'#2D6A4F':'#9CA3AF'}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:s.ok?'#2D6A4F':'#E5DEDA',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:7,color:'#fff',flexShrink:0}}>{s.ok?'✓':''}</span>
            {s.lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

// PDF export voor LOD + eenmalige bijdrage resultaat
function lodExportPDF(lod, eenmaligResult) {
  const tijdlijn  = buildTijdlijn(lod);
  const dagen     = lodDagenTot(lod.deadlineAlgemeen);
  const statusLbl = (LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).label;
  const stappen   = lodVoortgang(lod);
  const gedaan    = stappen.filter(s=>s.ok).length;

  const offerteRijen = (lod.offertes||[]).map((o,i)=>`
    <tr style="background:${i%2===0?'#fff':'#FAF7F2'}">
      <td>${o.partij||'-'}</td><td style="text-align:right">${lodFmt(o.bedrag)}</td>
      <td style="text-align:center">${o.aangevraagd?'✓':''}</td>
      <td style="text-align:center">${o.ontvangen?'✓':''}</td>
      <td style="text-align:center">${o.vveVoorlegd?'✓':''}</td>
      <td style="text-align:center">${o.vveAkkoord?'✓':''}</td>
      <td style="text-align:center">${o.opdracht?'✓':''}</td>
    </tr>`).join('');

  const puntenRijen = (lod.onderdelen||[]).map((o,i)=>`
    <tr style="background:${i%2===0?'#fff':'#FAF7F2'}"><td>${i+1}</td><td>${o.omschrijving||'-'}</td></tr>`).join('');

  const tijdlijnRijen = tijdlijn.map(e=>`
    <tr><td style="white-space:nowrap;color:#8A7E7B">${lodFmtDt(e.ts)}</td><td style="color:${e.kleur};font-weight:500">${e.tekst}</td></tr>`).join('');

  const voortgangRijen = stappen.map(s=>`
    <tr><td style="color:${s.ok?'#2D6A4F':'#9CA3AF'}">${s.ok?'✓':'○'} ${s.lbl}</td></tr>`).join('');

  let eenmaligHTML = '';
  if (eenmaligResult && eenmaligResult.length) {
    eenmaligHTML = '<div class="sec">Eenmalige bijdragen per eigenaar</div>';
    eenmaligResult.forEach(item => {
      eenmaligHTML += `<p style="font-size:9pt;font-weight:600;margin:10px 0 4px">${item.omschrijving} — Offerte: ${lodFmt(item.offerte)}${item.totaleKorting>0?' — Netto: '+lodFmt(item.nettoOfferte):''} — ${item.tekort>0?'Tekort: '+lodFmt(item.tekort):'Volledig gedekt'}</p>`;
      eenmaligHTML += `<p style="font-size:8pt;color:#8A7E7B;margin-bottom:6px">Reserve: ${lodFmt(item.reserve)} — buffer: ${lodFmt(item.buffer)} — beschikbaar: ${lodFmt(item.beschikbaar)}</p>`;
      if (item.tekort>0 && item.perEigenaar.length) {
        eenmaligHTML += `<table><thead><tr><th>Eigenaar</th><th style="text-align:right">Aandeel</th><th style="text-align:right">Korting</th><th style="text-align:right">Bijdrage</th></tr></thead><tbody>`;
        item.perEigenaar.forEach((e,i)=>{
          eenmaligHTML += `<tr style="background:${i%2===0?'#fff':'#FAF7F2'}"><td>${e.naam}</td><td style="text-align:right">${(e.aandeel*100).toFixed(2)}%</td><td style="text-align:right;color:#2D6A4F">${e.korting>0?lodFmt(e.korting):'—'}</td><td style="text-align:right;font-weight:600;color:#991A21">${lodFmt(e.bijdrage)}</td></tr>`;
        });
        eenmaligHTML += `</tbody><tfoot><tr><td colspan="3"><strong>Totaal tekort</strong></td><td style="text-align:right">${lodFmt(item.tekort)}</td></tr></tfoot></table>`;
      }
    });
  }

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
    <title>LOD Dossier - ${lod.vveNaam||'onbekend'}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:#1A1614;font-size:10pt;background:#fff;padding:32px 40px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid #991A21;margin-bottom:22px}
    .hdr h1{font-family:"DM Serif Display",serif;font-size:18pt;color:#991A21;font-weight:400}.hdr .meta{font-size:9pt;color:#8A7E7B;margin-top:3px}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:9pt;font-weight:600;background:#FDEAEB;color:#991A21}
    .sec{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8A7E7B;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5DEDA}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px}
    .info-block{background:#FAF7F2;border-left:3px solid #991A21;padding:10px 14px;border-radius:4px}
    .info-label{font-size:8pt;color:#8A7E7B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
    .info-val{font-size:10pt;font-weight:600;color:#1A1614}
    table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:14px}
    thead tr{background:#991A21;color:#fff}thead th{padding:7px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    tbody td{padding:6px 10px;border-bottom:1px solid #E5DEDA}
    tfoot td{padding:7px 10px;font-weight:600;color:#991A21;border-top:2px solid #991A21;background:#FDEAEB}
    .voortgang-ok{color:#2D6A4F}.voortgang-nok{color:#9CA3AF}
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:7.5pt;color:#8A7E7B}
    .print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:#991A21;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer}
    @media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>
    <div class="hdr">
      <div><h1>LOD Dossier</h1><div class="meta">${lod.vveNaam||'onbekend'} · Ref: ${lod.gemeenteReferentie||'-'} · Opgesteld op ${new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'})}</div></div>
      <div style="text-align:right"><span class="badge">${statusLbl}</span><div style="font-size:9pt;color:#8A7E7B;margin-top:4px">Voortgang: ${gedaan}/${stappen.length} stappen</div></div>
    </div>
    <div class="grid2">
      <div class="info-block"><div class="info-label">VvE</div><div class="info-val">${lod.vveNaam||'-'}</div></div>
      <div class="info-block"><div class="info-label">Behandelend beheerder</div><div class="info-val">${lod.behandelaar||'-'}</div></div>
      <div class="info-block"><div class="info-label">Gemeente referentie</div><div class="info-val">${lod.gemeenteReferentie||'-'}</div></div>
      <div class="info-block"><div class="info-label">Contactpersoon gemeente</div><div class="info-val">${lod.contactpersoon||'-'} ${lod.contactGemeente?'· '+lod.contactGemeente:''}</div></div>
      <div class="info-block"><div class="info-label">Ontvangstdatum</div><div class="info-val">${lod.ontvangstdatum?new Date(lod.ontvangstdatum).toLocaleDateString('nl-NL'):'-'}</div></div>
      <div class="info-block"><div class="info-label">Algehele deadline</div><div class="info-val" style="color:${dagen!==null&&dagen<0?'#991A21':'inherit'}">${lod.deadlineAlgemeen?new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL'):'-'}${dagen!==null?' ('+Math.abs(dagen)+(dagen<0?' dagen over':' dagen')+')':''}</div></div>
      <div class="info-block"><div class="info-label">Max. boete totaal</div><div class="info-val">${lodFmt(lod.boeteMax)}</div></div>
    </div>
    ${lod.notitie?`<div style="margin-bottom:10px;padding:10px 14px;background:#FAF7F2;border-radius:6px;font-size:9pt"><strong>Notitie:</strong> ${lod.notitie}</div>`:''}
    ${lod.uitstelAangevraagd?`<div style="margin-bottom:16px;padding:10px 14px;background:#FEF3E2;border-left:3px solid #B45309;border-radius:6px;font-size:9pt"><strong style="color:#92400E">Uitstel aangevraagd${lod.uitstelTot?' t/m '+new Date(lod.uitstelTot).toLocaleDateString('nl-NL'):''}</strong>${lod.uitstelReden?' — '+lod.uitstelReden:''}</div>`:''}
    <div class="sec">Voortgang</div>
    <table style="width:auto"><tbody>${voortgangRijen}</tbody></table>
    <div class="sec">Onderhoudspunten</div>
    <table><thead><tr><th>#</th><th>Omschrijving</th></tr></thead><tbody>${puntenRijen||'<tr><td colspan=2 style="color:#8A7E7B">Geen onderhoudspunten</td></tr>'}</tbody></table>
    <div class="sec">Offertes</div>
    <table><thead><tr><th>Partij</th><th style="text-align:right">Bedrag</th><th style="text-align:center">Aangevraagd</th><th style="text-align:center">Ontvangen</th><th style="text-align:center">VvE voorgelegd</th><th style="text-align:center">VvE akkoord</th><th style="text-align:center">Opdracht</th></tr></thead><tbody>${offerteRijen||'<tr><td colspan=7 style="color:#8A7E7B">Geen offertes</td></tr>'}</tbody></table>
    ${eenmaligHTML}
    <div class="sec">Tijdlijn dossier</div>
    <table><thead><tr><th>Datum en tijd</th><th>Actie</th></tr></thead><tbody>${tijdlijnRijen||'<tr><td colspan=2 style="color:#8A7E7B">Geen tijdlijn</td></tr>'}</tbody></table>
    <div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>Last onder Dwangsom module</span></div>
    </body></html>`;

  const w = window.open('','_blank','width=1050,height=850');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Pop-up geblokkeerd.');
}

// ── Eenmalige bijdrage tab ────────────────────────────────────────
function LodEenmaligTab({ lod, onUpdate }) {
  const S   = CALC_S;
  const fmt = calcFmt;

  // Offertedata overnemen uit het Offertes tabblad
  const [items, setItems] = useState(() => {
    const bestaand = lod.eenmaligItems||[];
    const offertes = (lod.offertes||[]).filter(o=>o.partij||o.bedrag);
    if (!bestaand.length && offertes.length) {
      return offertes.map(o=>({ id:calcUid(), omschrijving:o.partij||'Offerte', bedrag:o.bedrag||'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }));
    }
    return bestaand.length ? bestaand : [{ id:calcUid(), omschrijving:'', bedrag:'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' }];
  });
  const [eigRows, setEigRows] = useState(()=>lod.eenmaligEigenaren||[{id:calcUid(),naam:'',teller:''},{id:calcUid(),naam:'',teller:''}]);
  const [vasteNoemer, setVasteNoemer] = useState(lod.eenmaligNoemer||'');
  const [result, setResult] = useState(null);

  // Sync offertes als ze veranderen
  const syncOffertes = () => {
    const offertes = (lod.offertes||[]).filter(o=>o.partij||o.bedrag);
    if (!offertes.length) return;
    const synced = offertes.map(o=>{
      const bestaand = items.find(i=>i.omschrijving===o.partij||i.id===o.id);
      return bestaand ? { ...bestaand, omschrijving:o.partij||bestaand.omschrijving, bedrag:o.bedrag||bestaand.bedrag } : { id:calcUid(), omschrijving:o.partij||'', bedrag:o.bedrag||'', reserveStand:'', buffer:'2500', kortingAan:false, kortingBedrag:'' };
    });
    setItems(synced);
    onUpdate({...lod, eenmaligItems:synced});
  };

  const save = (patch) => onUpdate({...lod,...patch});

  const bereken = () => {
    const noemer = parseFloat(vasteNoemer)>0?parseFloat(vasteNoemer):eigRows.reduce((s,r)=>s+(parseFloat(r.teller)||0),0);
    const validRows = eigRows.filter(r=>r.teller!==''&&parseFloat(r.teller)>0);
    if (!validRows.length) return;
    const aantalEig = validRows.length;
    const eigenaren = validRows.map(r=>({ naam:r.naam||'Eigenaar', teller:r.teller, noemer, aandeel:noemer>0?(parseFloat(r.teller)||0)/noemer:0 }));
    const berekend = items.map(item=>{
      const offerte   = parseFloat(item.bedrag)||0;
      const reserve   = parseFloat(item.reserveStand)||0;
      const buffer    = parseFloat(item.buffer)>=0?parseFloat(item.buffer):2500;
      const kortingPE = item.kortingAan?(parseFloat(item.kortingBedrag)||0):0;
      const totaleKorting = kortingPE*aantalEig;
      const nettoOfferte  = Math.max(0,offerte-totaleKorting);
      const beschikbaar   = Math.max(0,reserve-buffer);
      const tekort        = Math.max(0,nettoOfferte-beschikbaar);
      const perEigenaar   = eigenaren.map(e=>({naam:e.naam,aandeel:e.aandeel,korting:kortingPE,bijdrage:tekort>0?e.aandeel*tekort:0}));
      return {omschrijving:item.omschrijving||'Offerte',offerte,nettoOfferte,totaleKorting,reserve,buffer,beschikbaar,tekort,perEigenaar};
    });
    setResult(berekend);
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <p style={{fontSize:12,color:CALC_S.muted}}>Bereken de eenmalige bijdrage per eigenaar. Offertedata is overgenomen uit het Offertes tabblad.</p>
        <button onClick={syncOffertes} style={{padding:'5px 12px',background:'#fff',border:`1px solid ${LOD_ROOD}`,borderRadius:7,fontSize:11,color:LOD_ROOD,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
          Offertes syncen
        </button>
      </div>

      {/* Eigenaren */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#2D2D2D',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
          Eigenaren &amp; breukdelen
          <div style={{flex:1,height:1,background:'#E5DEDA'}} />
          <label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,display:'flex',alignItems:'center',gap:6}}>
            Noemer: <input type="number" value={vasteNoemer} onChange={e=>{setVasteNoemer(e.target.value);save({eenmaligNoemer:e.target.value})}} placeholder="totaal" className="calc-inp" style={{width:80,fontSize:12}} />
          </label>
        </div>
        {eigRows.map((r,i)=>(
          <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',gap:8,marginBottom:6,alignItems:'center'}}>
            <input value={r.naam} onChange={e=>{const nr=[...eigRows];nr[i]={...nr[i],naam:e.target.value};setEigRows(nr);save({eenmaligEigenaren:nr})}} placeholder="Naam eigenaar / appartement" className="calc-inp" style={{fontSize:12}} />
            <input type="number" value={r.teller} onChange={e=>{const nr=[...eigRows];nr[i]={...nr[i],teller:e.target.value};setEigRows(nr);save({eenmaligEigenaren:nr})}} placeholder="Teller" className="calc-inp" style={{fontSize:12}} />
            <button onClick={()=>{const nr=eigRows.filter((_,j)=>j!==i);setEigRows(nr);save({eenmaligEigenaren:nr})}} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:CALC_S.muted}}>×</button>
          </div>
        ))}
        <button onClick={()=>{const nr=[...eigRows,{id:calcUid(),naam:'',teller:''}];setEigRows(nr);save({eenmaligEigenaren:nr})}} style={{width:'100%',padding:'7px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:12,color:CALC_S.muted,cursor:'pointer'}}>+ Eigenaar toevoegen</button>
      </div>

      {/* Offertes */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#2D2D2D',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
          Offerte(s) <div style={{flex:1,height:1,background:'#E5DEDA'}} />
        </div>
        {items.map((item,i)=>(
          <div key={item.id} style={{background:'#FAF7F2',border:'1px solid #E5DEDA',borderRadius:10,padding:'12px 14px',marginBottom:8,position:'relative'}}>
            {items.length>1&&<button onClick={()=>{const ni=items.filter((_,j)=>j!==i);setItems(ni);save({eenmaligItems:ni})}} style={{position:'absolute',top:8,right:10,background:'none',border:'none',cursor:'pointer',fontSize:16,color:CALC_S.muted}}>×</button>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 160px',gap:10,marginBottom:8}}>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Omschrijving / partij</label>
                <input value={item.omschrijving} onChange={e=>{const ni=[...items];ni[i]={...ni[i],omschrijving:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. Bouwbedrijf Jansen" className="calc-inp" style={{fontSize:12}} /></div>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Offertebedrag (€)</label>
                <input type="number" value={item.bedrag} onChange={e=>{const ni=[...items];ni[i]={...ni[i],bedrag:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 38000" className="calc-inp" style={{fontSize:12}} /></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8}}>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Stand reservefonds (€)</label>
                <input type="number" value={item.reserveStand} onChange={e=>{const ni=[...items];ni[i]={...ni[i],reserveStand:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 12000" className="calc-inp" style={{fontSize:12}} /></div>
              <div><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Buffer (€)</label>
                <input type="number" value={item.buffer} onChange={e=>{const ni=[...items];ni[i]={...ni[i],buffer:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="2500" className="calc-inp" style={{fontSize:12}} /></div>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12,fontWeight:600,color:CALC_S.ink}}>
              <input type="checkbox" checked={!!item.kortingAan} onChange={e=>{const ni=[...items];ni[i]={...ni[i],kortingAan:e.target.checked};setItems(ni);save({eenmaligItems:ni})}} style={{width:13,height:13,accentColor:LOD_ROOD,cursor:'pointer'}} />
              Gemeentelijke korting
            </label>
            {item.kortingAan&&<div style={{marginTop:6}}><label style={{fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:3}}>Korting per eigenaar (€)</label>
              <input type="number" value={item.kortingBedrag} onChange={e=>{const ni=[...items];ni[i]={...ni[i],kortingBedrag:e.target.value};setItems(ni);save({eenmaligItems:ni})}} placeholder="bijv. 1000" className="calc-inp" style={{width:160,fontSize:12}} /></div>}
          </div>
        ))}
        <button onClick={()=>{const ni=[...items,{id:calcUid(),omschrijving:'',bedrag:'',reserveStand:'',buffer:'2500',kortingAan:false,kortingBedrag:''}];setItems(ni);save({eenmaligItems:ni})}} style={{width:'100%',padding:'7px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:12,color:CALC_S.muted,cursor:'pointer',marginBottom:10}}>+ Offerte toevoegen</button>
      </div>

      <button onClick={bereken} style={{width:'100%',padding:12,background:LOD_ROOD,border:'none',borderRadius:10,fontFamily:'Georgia,serif',fontSize:15,color:'#fff',cursor:'pointer'}}>
        Bereken eenmalige bijdragen →
      </button>

      {result && (
        <>
          <button onClick={()=>lodExportPDF(lod, result)} style={{width:'100%',marginTop:10,padding:'9px',background:'#fff',border:`1.5px solid ${LOD_ROOD}`,borderRadius:8,fontFamily:'inherit',fontSize:13,color:LOD_ROOD,cursor:'pointer',fontWeight:500}}>
            PDF rapport exporteren (incl. berekening)
          </button>
          {result.map((item,idx)=>(
            <div key={idx} style={{marginTop:12,background:'#fff',border:'1px solid #E5DEDA',borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 14px',background:'#FAF7F2',borderBottom:'1px solid #E5DEDA',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontWeight:600,fontSize:13}}>{item.omschrijving}</span>
                <span style={{fontFamily:'Georgia,serif',fontSize:16,color:item.tekort>0?LOD_ROOD:'#2D6A4F'}}>{item.tekort>0?'Tekort: '+fmt(item.tekort):'Volledig gedekt'}</span>
              </div>
              <div style={{padding:'5px 14px',fontSize:11,color:CALC_S.muted,fontFamily:'monospace',borderBottom:'1px solid #E5DEDA'}}>
                Reserve: {fmt(item.reserve)} — buffer: {fmt(item.buffer)} — beschikbaar: {fmt(item.beschikbaar)}
              </div>
              {item.tekort>0&&(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#FAF7F2',borderBottom:'1px solid #E5DEDA'}}>
                    {['Eigenaar','Aandeel','Korting','Bijdrage'].map((h,i)=>(
                      <th key={i} style={{padding:'6px 12px',textAlign:i>0?'right':'left',fontSize:10,fontWeight:600,color:CALC_S.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{item.perEigenaar.map((e,i)=>(
                    <tr key={i} style={{borderBottom:i<item.perEigenaar.length-1?'1px solid #E5DEDA':'none',background:i%2===0?'#fff':'#FAF7F2'}}>
                      <td style={{padding:'6px 12px',fontSize:12,fontWeight:500}}>{e.naam}</td>
                      <td style={{padding:'6px 12px',fontFamily:'monospace',fontSize:12,textAlign:'right'}}>{(e.aandeel*100).toFixed(2)}%</td>
                      <td style={{padding:'6px 12px',fontFamily:'monospace',fontSize:12,textAlign:'right',color:e.korting>0?'#2D6A4F':CALC_S.muted}}>{e.korting>0?fmt(e.korting):'—'}</td>
                      <td style={{padding:'6px 12px',fontFamily:'monospace',fontSize:12,textAlign:'right',color:LOD_ROOD,fontWeight:600}}>{fmt(e.bijdrage)}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot style={{borderTop:`2px solid ${LOD_ROOD}`}}>
                    <tr style={{background:LOD_ROOD_BG}}>
                      <td colSpan={3} style={{padding:'7px 12px',fontSize:12,fontWeight:600,color:CALC_S.muted}}>Totaal tekort</td>
                      <td style={{padding:'7px 12px',fontFamily:'monospace',fontSize:13,fontWeight:600,color:LOD_ROOD,textAlign:'right'}}>{fmt(item.tekort)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── LodKaart ─────────────────────────────────────────────────────
function LodKaart({ lod, onUpdate, onDelete, openId, setOpenId, beheerderList }) {
  const S = CALC_S;
  const open = openId===lod.id;
  const dagen = lodDagenTot(lod.deadlineAlgemeen);
  const [tabKaart, setTabKaart] = useState('details');

  const update = (changes) => {
    const updated = {...lod,...changes};
    if (!['afgerond','overschreden'].includes(updated.status)||changes.offertes!==undefined) {
      if (changes.offertes!==undefined) {
        updated.status = berekenAutoStatus(updated);
      }
    }
    onUpdate(updated);
  };

  const toggleCheck = (field, tlKey, value) => {
    const tl = {...(lod.tijdlijn||{})};
    if (value&&!tl[tlKey]) tl[tlKey] = lodNow();
    else if (!value) delete tl[tlKey];
    update({[field]:value, tijdlijn:tl});
  };

  const updateOfferte = (idx, changes) => {
    const offertes = [...(lod.offertes||[])];
    offertes[idx] = {...offertes[idx],...changes};
    update({offertes});
  };

  const toggleOfferteCheck = (idx, field, tlKey, value) => {
    const offertes = [...(lod.offertes||[])];
    const tl = {...(offertes[idx].tijdlijn||{})};
    if (value&&!tl[tlKey]) tl[tlKey] = lodNow();
    else if (!value) delete tl[tlKey];
    offertes[idx] = {...offertes[idx],[field]:value,tijdlijn:tl};
    update({offertes});
  };

  const addOfferte  = () => update({offertes:[...(lod.offertes||[]),{id:lodUid(),partij:'',bedrag:'',aangevraagd:false,ontvangen:false,vveVoorlegd:false,vveAkkoord:false,opdracht:false,tijdlijn:{}}]});
  const delOfferte  = (idx) => {const o=[...(lod.offertes||[])];o.splice(idx,1);update({offertes:o});};
  const addOnderdeel= () => update({onderdelen:[...(lod.onderdelen||[]),{id:lodUid(),omschrijving:''}]});
  const delOnderdeel= (idx) => {const o=[...(lod.onderdelen||[])];o.splice(idx,1);update({onderdelen:o});};
  const updOnderdeel= (idx,val) => {const o=[...(lod.onderdelen||[])];o[idx]={...o[idx],omschrijving:val};update({onderdelen:o});};

  const markeerAfgerond = () => {
    const tl = {...(lod.tijdlijn||{}),afgerond:lodNow(),gemeenteBevestigd:lodNow()};
    onUpdate({...lod,status:'afgerond',gemeenteBevestigd:true,tijdlijn:tl});
    setOpenId(null);
  };

  const tijdlijn = buildTijdlijn(lod);
  const cardBorder = lod.status==='afgerond'?'#D1D5DB':open?LOD_ROOD:'#E5E0DB';

  return (
    <div style={{background:lod.status==='afgerond'?'#FAFAFA':'#fff',border:`1.5px solid ${cardBorder}`,borderRadius:12,overflow:'hidden',marginBottom:10,boxShadow:open?`0 2px 12px rgba(153,26,33,.08)`:'none',transition:'all .2s',opacity:lod.status==='afgerond'?.7:1}}>
      {/* Header */}
      <div onClick={()=>setOpenId(open?null:lod.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',userSelect:'none'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:14,color:'#2D2D2D'}}>{lod.vveNaam||<span style={{color:'#aaa',fontStyle:'italic'}}>VvE naam</span>}</span>
            <LodStatusBadge status={lod.status||'nieuw'} />
            {lod.behandelaar&&<span style={{fontSize:10,color:'#8A7E7B',background:'#F3F4F6',padding:'2px 7px',borderRadius:8}}>{lod.behandelaar}</span>}

            {lod.uitstelAangevraagd&&(
              <span style={{fontSize:10,fontWeight:600,background:lod.uitstelGoedgekeurd?'#EAF4EE':'#FEF3E2',color:lod.uitstelGoedgekeurd?'#2D6A4F':'#92400E',padding:'2px 7px',borderRadius:10,border:`1px solid ${lod.uitstelGoedgekeurd?'#6EE7B7':'#FDE68A'}`}}>
                {lod.uitstelGoedgekeurd?'Uitstel goedgekeurd':'Uitstel aangevraagd'}{lod.uitstelTot&&lod.uitstelGoedgekeurd?' t/m '+new Date(lod.uitstelTot).toLocaleDateString('nl-NL'):''}
              </span>
            )}
            {lod.status!=='afgerond'&&dagen!==null&&dagen<0&&!lod.uitstelAangevraagd&&(
              <span style={{fontSize:10,fontWeight:600,background:LOD_ROOD_BG,color:LOD_ROOD,padding:'2px 7px',borderRadius:10}}>Deadline voorbij</span>
            )}
          </div>
          <div style={{display:'flex',gap:12,marginTop:4,flexWrap:'wrap'}}>
            {lod.gemeenteReferentie&&<span style={{fontSize:11,color:'#8A7E7B'}}>Ref: {lod.gemeenteReferentie}</span>}
            {lod.ontvangstdatum&&<span style={{fontSize:11,color:'#8A7E7B'}}>Ontvangen: {new Date(lod.ontvangstdatum).toLocaleDateString('nl-NL')}</span>}
            {lod.deadlineAlgemeen&&(
              <span style={{fontSize:11}} className={lod.status==='afgerond'?'text-gray-400':lodDeadlineKleur(dagen)}>
                Deadline: {new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL')}
                {lod.status==='afgerond'&&lod.tijdlijn?.afgerond&&(
                  <span style={{marginLeft:8,color:'#2D6A4F',fontWeight:600}}>
                    Afgerond: {new Date(lod.tijdlijn.afgerond).toLocaleDateString('nl-NL')}
                  </span>
                )}
              </span>
            )}
            {lod.boeteMax&&<span style={{fontSize:11,color:LOD_ROOD,fontWeight:600}}>Max. boete: {lodFmt(lod.boeteMax)}</span>}
          </div>
        </div>
        {/* Voortgangsbalk rechts */}
        <div onClick={e=>e.stopPropagation()}>
          <LodVoortgangBalk lod={lod} />
        </div>
        <span style={{fontSize:14,color:'#8A7E7B',transform:open?'rotate(180deg)':'none',transition:'transform .2s'}}>▾</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{borderTop:'1.5px solid #E5E0DB',background:'#FDFCFB'}}>
          {/* Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid #E5DEDA',background:'#fff',paddingLeft:16,overflowX:'auto'}}>
            {[['details','Gegevens'],['onderdelen','Onderhoudspunten'],['offertes','Offertes'],['tijdlijn','Tijdlijn'],['eenmalig','Eenmalige bijdrage']].map(([key,lbl])=>(
              <button key={key} onClick={()=>setTabKaart(key)}
                style={{padding:'9px 14px',border:'none',borderBottom:`2px solid ${tabKaart===key?LOD_ROOD:'transparent'}`,background:'transparent',fontSize:12,fontWeight:tabKaart===key?600:400,color:tabKaart===key?LOD_ROOD:'#6B7280',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>
                {lbl}
              </button>
            ))}
          </div>

          <div style={{padding:'16px'}}>
            {/* TAB: Gegevens */}
            {tabKaart==='details'&&(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>
                  {[
                    ['VvE naam','text','vveNaam','bijv. VvE Reinkenstraat 1-24'],
                    ['Gemeente referentie','text','gemeenteReferentie','bijv. LOD-2026-04821'],
                    ['Status','select','status',null],
                    ['Ontvangstdatum LOD','date','ontvangstdatum',null],
                    ['Algehele deadline gemeente','date','deadlineAlgemeen',null],
                    ['Max. boete totaal (€)','number','boeteMax','bijv. 25000'],
                    ['Contactpersoon gemeente','text','contactpersoon','bijv. dhr. J. de Vries'],
                    ['Tel. / e-mail gemeente','text','contactGemeente','bijv. 070-123 4567'],
                  ].map(([label,type,field,placeholder])=>(
                    <div key={field}>
                      <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>{label}</label>
                      {type==='select'?(
                        <select value={lod[field]||'nieuw'} onChange={e=>update({[field]:e.target.value})} className="calc-inp" style={{fontSize:13,cursor:'pointer'}}>
                          {Object.entries(LOD_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ):(
                        <input type={type} value={lod[field]||''} onChange={e=>update({[field]:e.target.value})} placeholder={placeholder||''} className="calc-inp" style={{fontSize:13}} />
                      )}
                    </div>
                  ))}
                  <div>
                    <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Behandelend beheerder</label>
                    <select value={lod.behandelaar||''} onChange={e=>update({behandelaar:e.target.value})} className="calc-inp" style={{fontSize:13,cursor:'pointer'}}>
                      <option value="">— Selecteer beheerder —</option>
                      {(beheerderList||[]).map(naam=><option key={naam} value={naam}>{naam}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Voortgang LOD</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                    {[
                      ['vveGenotificeerd','vveGenotificeerd','VvE in kennis gesteld'],
                      ['vergaderingUitgeschreven','vergaderingUitgeschreven','Vergadering uitgeschreven'],
                      ['gemeenteBevestigd','gemeenteBevestigd','Afronding gemeld gemeente'],
                    ].map(([field,tlKey,lbl])=>(
                      <label key={field} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'8px 10px',background:lod[field]?'#EAF1F8':'#fff',border:`1.5px solid ${lod[field]?'#1A4D7A':'#E5DEDA'}`,borderRadius:8,fontSize:11,fontWeight:600,color:lod[field]?'#1A4D7A':'#8A7E7B',userSelect:'none',transition:'all .15s'}}>
                        <input type="checkbox" checked={!!lod[field]} onChange={e=>toggleCheck(field,tlKey,e.target.checked)} style={{width:13,height:13,accentColor:'#1A4D7A',cursor:'pointer'}} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Interne notitie</label>
                  <textarea value={lod.notitie||''} onChange={e=>update({notitie:e.target.value})} placeholder="Bijzonderheden, afspraken, opmerkingen..."
                    style={{width:'100%',minHeight:70,padding:'8px 11px',border:'1.5px solid #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:12,color:'#1A1614',background:'#FAF7F2',outline:'none',resize:'vertical'}} />
                </div>

                {/* Uitstel aangevraagd — verborgen als afgerond */}
                {lod.status !== 'afgerond' && <div style={{marginBottom:14,padding:'12px 14px',background:lod.uitstelAangevraagd?'#FEF3E2':'#FAF7F2',border:`1.5px solid ${lod.uitstelAangevraagd?'#B45309':'#E5DEDA'}`,borderRadius:10,transition:'all .2s'}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
                    <div style={{width:18,height:18,borderRadius:5,background:lod.uitstelAangevraagd?'#B45309':'transparent',border:`2px solid ${lod.uitstelAangevraagd?'#B45309':'#9CA3AF'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                      {lod.uitstelAangevraagd&&<span style={{color:'#fff',fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                    </div>
                    <input type="checkbox" checked={!!lod.uitstelAangevraagd} onChange={e=>{
                      const tl = {...(lod.tijdlijn||{})};
                      if (e.target.checked && !tl.uitstelAangevraagd) tl.uitstelAangevraagd = lodNow();
                      else if (!e.target.checked) { delete tl.uitstelAangevraagd; delete tl.uitstelGoedgekeurd; }
                      update({uitstelAangevraagd:e.target.checked, uitstelGoedgekeurd: e.target.checked ? lod.uitstelGoedgekeurd : false, tijdlijn:tl});
                    }} style={{display:'none'}} />
                    <span style={{fontSize:13,fontWeight:600,color:lod.uitstelAangevraagd?'#92400E':'#374151'}}>Uitstel aangevraagd</span>
                    {lod.uitstelAangevraagd&&lod.uitstelTot&&(
                      <span style={{marginLeft:'auto',fontSize:11,fontWeight:600,color:'#92400E',fontFamily:'monospace'}}>
                        t/m {new Date(lod.uitstelTot).toLocaleDateString('nl-NL')}
                      </span>
                    )}
                  </label>
                  {lod.uitstelAangevraagd&&(
                    <div style={{marginTop:10}}>
                      {/* Uitstel goedgekeurd vinkje */}
                      <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:lod.uitstelGoedgekeurd?'#EAF4EE':'#fff',border:`1.5px solid ${lod.uitstelGoedgekeurd?'#2D6A4F':'#E5DEDA'}`,borderRadius:8,marginBottom:10,userSelect:'none',transition:'all .15s'}}>
                        <div style={{width:16,height:16,borderRadius:4,background:lod.uitstelGoedgekeurd?'#2D6A4F':'transparent',border:`2px solid ${lod.uitstelGoedgekeurd?'#2D6A4F':'#9CA3AF'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {lod.uitstelGoedgekeurd&&<span style={{color:'#fff',fontSize:10,fontWeight:700,lineHeight:1}}>✓</span>}
                        </div>
                        <input type="checkbox" checked={!!lod.uitstelGoedgekeurd} onChange={e=>{
                          const tl = {...(lod.tijdlijn||{})};
                          if (e.target.checked && !tl.uitstelGoedgekeurd) tl.uitstelGoedgekeurd = lodNow();
                          else if (!e.target.checked) delete tl.uitstelGoedgekeurd;
                          update({uitstelGoedgekeurd:e.target.checked, tijdlijn:tl});
                        }} style={{display:'none'}} />
                        <span style={{fontSize:12,fontWeight:600,color:lod.uitstelGoedgekeurd?'#2D6A4F':'#374151'}}>Uitstel goedgekeurd door gemeente</span>
                      </label>
                      {/* Datum + reden alleen tonen als goedgekeurd */}
                      {lod.uitstelGoedgekeurd&&(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                          <div>
                            <label style={{fontSize:10,fontWeight:600,color:'#2D6A4F',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Uitstel tot wanneer</label>
                            <input type="date" value={lod.uitstelTot||''} onChange={e=>update({uitstelTot:e.target.value})}
                              className="calc-inp" style={{fontSize:13,borderColor:'#6EE7B7'}} />
                          </div>
                          <div>
                            <label style={{fontSize:10,fontWeight:600,color:'#2D6A4F',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Reden uitstel</label>
                            <input value={lod.uitstelReden||''} onChange={e=>update({uitstelReden:e.target.value})}
                              placeholder="bijv. gemeentelijke goedkeuring ontvangen"
                              className="calc-inp" style={{fontSize:12,borderColor:'#6EE7B7'}} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>}

                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:12,borderTop:'1px solid #E5DEDA'}}>
                  <button onClick={()=>{if(window.confirm('LOD verwijderen?'))onDelete()}} style={{padding:'7px 14px',background:'#fff',border:'1.5px solid #fca5a5',borderRadius:8,fontSize:12,color:LOD_ROOD,cursor:'pointer',fontFamily:'inherit'}}>
                    LOD verwijderen
                  </button>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>lodExportPDF(lod,null)} style={{padding:'7px 14px',background:'#fff',border:`1.5px solid ${LOD_ROOD}`,borderRadius:8,fontSize:12,color:LOD_ROOD,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>
                      PDF rapport
                    </button>
                    {lod.status!=='afgerond'?(
                      <button onClick={markeerAfgerond} style={{padding:'7px 18px',background:'#2D6A4F',border:'none',borderRadius:8,fontSize:12,color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                        LOD afgerond
                      </button>
                    ):(
                      <button onClick={()=>{
                        const tl = {...(lod.tijdlijn||{})};
                        delete tl.afgerond;
                        onUpdate({...lod,status:'opdracht_uit',gemeenteBevestigd:false,tijdlijn:tl});
                      }} style={{padding:'7px 18px',background:'#fff',border:'1.5px solid #1A4D7A',borderRadius:8,fontSize:12,color:'#1A4D7A',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                        LOD heropenen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Onderhoudspunten */}
            {tabKaart==='onderdelen'&&(
              <div>
                <p style={{fontSize:12,color:S.muted,marginBottom:12}}>Beschrijf de onderhoudspunten zoals benoemd in de LOD.</p>
                {(lod.onderdelen||[]).length===0&&<div style={{textAlign:'center',padding:'30px',color:'#9CA3AF',fontSize:13}}>Nog geen onderhoudspunten toegevoegd.</div>}
                {(lod.onderdelen||[]).map((o,i)=>(
                  <div key={o.id||i} style={{display:'grid',gridTemplateColumns:'28px 1fr 36px',gap:8,alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:S.muted,textAlign:'center'}}>{i+1}</span>
                    <input value={o.omschrijving||''} onChange={e=>updOnderdeel(i,e.target.value)} placeholder={`Onderhoudspunt ${i+1} — bijv. Herstel gevelmetselwerk`} className="calc-inp" style={{fontSize:13}} />
                    <button onClick={()=>delOnderdeel(i)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:S.muted,padding:'4px 8px'}}>×</button>
                  </div>
                ))}
                <button onClick={addOnderdeel} style={{width:'100%',padding:'9px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:13,color:'#8A7E7B',cursor:'pointer',marginTop:4}}>
                  + Onderhoudspunt toevoegen
                </button>
              </div>
            )}

            {/* TAB: Offertes */}
            {tabKaart==='offertes'&&(
              <div>
                <p style={{fontSize:12,color:S.muted,marginBottom:12}}>Registreer per partij de offerte. De status van de LOD wordt automatisch bijgewerkt.</p>
                {(lod.offertes||[]).length===0&&<div style={{textAlign:'center',padding:'30px',color:'#9CA3AF',fontSize:13}}>Nog geen offertes geregistreerd.</div>}
                {(lod.offertes||[]).map((o,i)=>(
                  <div key={o.id||i} style={{background:'#FAF7F2',border:'1px solid #E5DEDA',borderRadius:10,padding:'14px',marginBottom:10}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,marginBottom:10,alignItems:'end'}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Partij / aannemer</label>
                        <input value={o.partij||''} onChange={e=>updateOfferte(i,{partij:e.target.value})} placeholder="bijv. Bouwbedrijf Jansen" className="calc-inp" style={{fontSize:13}} />
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>Totaalprijs offerte (€)</label>
                        <input type="number" value={o.bedrag||''} onChange={e=>updateOfferte(i,{bedrag:e.target.value})} placeholder="bijv. 42000" className="calc-inp" style={{fontSize:13}} />
                      </div>
                      <button onClick={()=>delOfferte(i)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:S.muted,padding:'8px'}}>×</button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                      {[
                        ['aangevraagd','aangevraagd','Offerte aangevraagd'],
                        ['ontvangen','ontvangen','Offerte ontvangen'],
                        ['vveVoorlegd','vveVoorlegd','Aan VvE voorgelegd'],
                        ['vveAkkoord','vveAkkoord','VvE akkoord'],
                        ['opdracht','opdracht','Opdracht verstrekt'],
                        ['opdrachtAfgerond','opdrachtAfgerond','Opdracht afgerond'],
                      ].map(([field,tlKey,lbl])=>(
                        <label key={field} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',padding:'7px 8px',background:o[field]?'#EAF4EE':'#fff',border:`1.5px solid ${o[field]?'#2D6A4F':'#E5DEDA'}`,borderRadius:7,fontSize:10,fontWeight:600,color:o[field]?'#2D6A4F':'#8A7E7B',userSelect:'none',transition:'all .15s'}}>
                          <input type="checkbox" checked={!!o[field]} onChange={e=>toggleOfferteCheck(i,field,tlKey,e.target.checked)} style={{width:12,height:12,accentColor:'#2D6A4F',cursor:'pointer'}} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    {o.ontvangen&&o.bedrag&&<div style={{marginTop:8,padding:'5px 9px',background:'#EAF4EE',borderRadius:6,fontSize:11,color:'#2D6A4F',fontFamily:'monospace'}}>Offertebedrag: {lodFmt(o.bedrag)}</div>}
                  </div>
                ))}
                <button onClick={addOfferte} style={{width:'100%',padding:'9px',background:'#fff',border:'1.5px dashed #E5DEDA',borderRadius:8,fontFamily:'inherit',fontSize:13,color:'#8A7E7B',cursor:'pointer',marginTop:4}}>
                  + Partij / offerte toevoegen
                </button>
              </div>
            )}

            {/* TAB: Tijdlijn */}
            {tabKaart==='tijdlijn'&&(
              <div>
                {tijdlijn.length===0?(
                  <div style={{textAlign:'center',padding:'30px',color:'#9CA3AF',fontSize:13}}>Nog geen acties. Vink stappen aan om de tijdlijn op te bouwen.</div>
                ):(
                  <div style={{position:'relative',paddingLeft:24}}>
                    <div style={{position:'absolute',left:7,top:0,bottom:0,width:2,background:'#E5DEDA',borderRadius:2}} />
                    {tijdlijn.map((e,i)=>(
                      <div key={i} style={{position:'relative',marginBottom:16}}>
                        <div style={{position:'absolute',left:-20,top:3,width:10,height:10,borderRadius:'50%',background:e.kleur,border:'2px solid #fff',boxShadow:`0 0 0 2px ${e.kleur}`}} />
                        <div style={{fontSize:11,color:'#8A7E7B',marginBottom:2}}>{lodFmtDt(e.ts)}</div>
                        <div style={{fontSize:13,fontWeight:600,color:e.kleur}}>{e.tekst}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Eenmalige bijdrage */}
            {tabKaart==='eenmalig'&&<LodEenmaligTab lod={lod} onUpdate={onUpdate} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kalender view ────────────────────────────────────────────────
function LodKalender({ lods }) {
  const now = new Date();
  const [jaar, setJaar] = useState(now.getFullYear());
  const maandNamen = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
  const events = [];
  lods.filter(l=>l.status!=='afgerond').forEach(l=>{
    if (l.deadlineAlgemeen) {
      const d = new Date(l.deadlineAlgemeen);
      if (d.getFullYear()===jaar) events.push({maand:d.getMonth(),dag:d.getDate(),naam:l.vveNaam||'Naamloos',dagen:lodDagenTot(l.deadlineAlgemeen)});
    }
  });
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={()=>setJaar(j=>j-1)} style={{padding:'6px 14px',border:'1px solid #E5DEDA',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:13}}>← {jaar-1}</button>
        <span style={{fontSize:16,fontWeight:700,color:'#2D2D2D'}}>{jaar}</span>
        <button onClick={()=>setJaar(j=>j+1)} style={{padding:'6px 14px',border:'1px solid #E5DEDA',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:13}}>{jaar+1} →</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        {maandNamen.map((naam,mi)=>{
          const me = events.filter(e=>e.maand===mi);
          const isHuidig = mi===now.getMonth()&&jaar===now.getFullYear();
          return (
            <div key={mi} style={{background:'#fff',border:`1.5px solid ${isHuidig?LOD_ROOD:'#E5DEDA'}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'8px 12px',background:isHuidig?LOD_ROOD_BG:'#FAF7F2',borderBottom:'1px solid #E5DEDA',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:700,color:isHuidig?LOD_ROOD:'#374151'}}>{naam}</span>
                {me.length>0&&<span style={{fontSize:10,fontWeight:600,background:LOD_ROOD_BG,color:LOD_ROOD,padding:'1px 6px',borderRadius:8}}>{me.length}</span>}
              </div>
              <div style={{padding:'8px 10px',minHeight:60}}>
                {me.length===0?<span style={{fontSize:10,color:'#D1D5DB'}}>Geen deadlines</span>:
                  me.map((e,i)=>(
                    <div key={i} style={{marginBottom:5,padding:'4px 7px',background:e.dagen<0?LOD_ROOD_BG:e.dagen<=14?'#FEF3E2':'#EAF1F8',borderRadius:6,borderLeft:`3px solid ${e.dagen<0?LOD_ROOD:e.dagen<=14?'#B45309':'#1A4D7A'}`}}>
                      <div style={{fontSize:10,fontWeight:600,color:e.dagen<0?LOD_ROOD:e.dagen<=14?'#92400E':'#1A4D7A'}}>{e.naam}</div>
                      <div style={{fontSize:9,color:'#8A7E7B'}}>{e.dag} {naam.toLowerCase()} · {e.dagen<0?Math.abs(e.dagen)+'d over':e.dagen===0?'vandaag':e.dagen+'d'}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function exportTotaalLodPDF(lods) {
  const actief = lods.filter(l=>l.status!=='afgerond');
  const nu = new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});

  const rijen = actief.map((lod,i) => {
    const dagen  = lodDagenTot(lod.deadlineAlgemeen);
    const status = (LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).label;
    const stappen = lodVoortgang(lod);
    const gedaan  = stappen.filter(s=>s.ok).length;
    const pct     = Math.round(gedaan/stappen.length*100);
    const aantalOf = (lod.offertes||[]).filter(o=>o.aangevraagd).length;
    const deadlineKleur = dagen===null?'#374151':dagen<0?'#991A21':dagen<=14?'#D97706':'#374151';
    return `<tr style="background:${i%2===0?'#fff':'#FAF7F2'}">
      <td style="font-weight:600">${lod.vveNaam||'-'}</td>
      <td>${lod.gemeenteReferentie||'-'}</td>
      <td>${lod.behandelaar||'-'}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:8pt;font-weight:600;background:${(LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).bg};color:${(LOD_STATUS[lod.status||'nieuw']||LOD_STATUS.nieuw).color}">${status}</span></td>
      <td style="text-align:center;color:${deadlineKleur};font-weight:${dagen!==null&&dagen<=14?'600':'400'}">${lod.deadlineAlgemeen?new Date(lod.deadlineAlgemeen).toLocaleDateString('nl-NL'):'-'}${dagen!==null?' ('+Math.abs(dagen)+(dagen<0?'d over':' d')+')':''}</td>
      <td style="text-align:right;color:#991A21;font-weight:600">${lodFmt(lod.boeteMax)}</td>
      <td style="text-align:center">${aantalOf}</td>
      <td style="text-align:center">
        <div style="display:flex;align-items:center;gap:6px;justify-content:center">
          <div style="width:60px;height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct===100?'#2D6A4F':'#991A21'};border-radius:3px"></div>
          </div>
          <span style="font-size:8pt;font-weight:600;color:${pct===100?'#2D6A4F':'#991A21'}">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const totaalBoete = actief.reduce((s,l)=>s+(parseFloat(l.boeteMax)||0),0);
  const overschreden = actief.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0;}).length;
  const urgent = actief.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d>=0&&d<=14;}).length;

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
    <title>LOD Totaaloverzicht - ${nu}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",Arial,sans-serif;color:#1A1614;font-size:10pt;background:#fff;padding:32px 40px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px solid #991A21;margin-bottom:22px}
    .hdr h1{font-family:"DM Serif Display",serif;font-size:18pt;color:#991A21;font-weight:400}.hdr .meta{font-size:9pt;color:#8A7E7B;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
    .stat{background:#FAF7F2;border-left:3px solid #991A21;padding:10px 14px;border-radius:4px}
    .stat-num{font-family:"DM Serif Display",serif;font-size:22pt;color:#991A21;font-weight:400}
    .stat-lbl{font-size:8pt;color:#8A7E7B;text-transform:uppercase;letter-spacing:.05em}
    table{width:100%;border-collapse:collapse;font-size:9pt}
    thead tr{background:#991A21;color:#fff}thead th{padding:8px 10px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    tbody td{padding:7px 10px;border-bottom:1px solid #E5DEDA}
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid #E5DEDA;display:flex;justify-content:space-between;font-size:7.5pt;color:#8A7E7B}
    .print-btn{position:fixed;top:18px;right:18px;padding:9px 18px;background:#991A21;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer}
    @media print{.print-btn{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Afdrukken / PDF</button>
    <div class="hdr"><div><h1>LOD Totaaloverzicht</h1><div class="meta">Alle actieve LOD dossiers · Opgesteld op ${nu}</div></div></div>
    <div class="stats">
      <div class="stat"><div class="stat-num">${actief.length}</div><div class="stat-lbl">Actieve LODs</div></div>
      <div class="stat"><div class="stat-num" style="color:#D97706">${urgent}</div><div class="stat-lbl">Urgent (≤14 dagen)</div></div>
      <div class="stat"><div class="stat-num">${overschreden}</div><div class="stat-lbl">Deadline voorbij</div></div>
      <div class="stat"><div class="stat-num" style="font-size:16pt">${lodFmt(totaalBoete)}</div><div class="stat-lbl">Totaal boeterisico</div></div>
    </div>
    <table><thead><tr>
      <th>VvE</th><th>Ref. gemeente</th><th>Behandelaar</th><th>Status</th>
      <th>Deadline</th><th style="text-align:right">Max. boete</th>
      <th style="text-align:center">Offertes</th><th style="text-align:center">Voortgang</th>
    </tr></thead>
    <tbody>${rijen||'<tr><td colspan=8 style="color:#8A7E7B;text-align:center;padding:20px">Geen actieve LODs</td></tr>'}</tbody></table>
    <div class="footer"><span>Totaal VvE Beheer Den Haag en omstreken B.V. · Rijswijk</span><span>Last onder Dwangsom module</span></div>
    </body></html>`;

  const w = window.open('','_blank','width=1200,height=850');
  if (w) { w.document.write(html); w.document.close(); }
  else alert('Pop-up geblokkeerd.');
}

// ── LodBeheer ─────────────────────────────────────────────────────
function LodBeheer({ onTerug, beheerderList }) {
  const [lods, setLods] = useState(()=>lodLocalLoad());
  const [openId, setOpenId] = useState(null);
  const [zoek, setZoek] = useState('');
  const [filterStatus, setFilterStatus] = useState('alle');
  const [tabHoofd, setTabHoofd] = useState('lods');
  const [loading, setLoading] = useState(true);
  const [hideAfgerond, setHideAfgerond] = useState(false);
  const [filterMaand, setFilterMaand] = useState(null); // 0-11 of null

  // Laad uit Supabase bij mount
  useState(()=>{
    setTimeout(()=>{
      lodSupaLoad().then(data=>{
        if (data && data.length) setLods(data);
        setLoading(false);
      }).catch(()=>setLoading(false));
    },0);
  });

  const saveAndSet = async (nl) => {
    setLods(nl);
    // Sla alleen de gewijzigde LOD op
  };

  const addLod = async () => {
    const n = {id:lodUid(),vveNaam:'',gemeenteReferentie:'',status:'nieuw',behandelaar:'',
      ontvangstdatum:new Date().toISOString().slice(0,10),deadlineAlgemeen:'',boeteMax:'',
      notitie:'',contactpersoon:'',contactGemeente:'',
      vveGenotificeerd:false,vergaderingUitgeschreven:false,gemeenteBevestigd:false,
      onderdelen:[],offertes:[],tijdlijn:{ontvangen:lodNow()}};
    const updated = [n,...lods];
    setLods(updated);
    await lodSupaSave(n);
    setOpenId(n.id);
    setTabHoofd('lods');
  };

  const updateLod = async (u) => {
    setLods(prev=>prev.map(l=>l.id===u.id?u:l));
    await lodSupaSave(u);
  };

  const deleteLod = async (id) => {
    setLods(prev=>prev.filter(l=>l.id!==id));
    await lodSupaDelete(id);
  };

  // Stats
  const actief       = lods.filter(l=>l.status!=='afgerond');
  const ofwacht      = lods.filter(l=>l.status==='offertes_afwacht');
  const vveAfwacht   = lods.filter(l=>l.status==='vve_afwachting');
  const urgent       = lods.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<=14&&d>=0&&l.status!=='afgerond';});
  const overschreden = lods.filter(l=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0&&l.status!=='afgerond';});
  const totaalBoete  = actief.reduce((s,l)=>s+(parseFloat(l.boeteMax)||0),0);

  const statFilters = [
    {key:'alle',           label:"Alle LOD's",            val:lods.length,           tc:'#2D2D2D',dc:'#2D2D2D'},
    {key:'actief',         label:'Actief',                val:actief.length,          tc:'#1A4D7A',dc:'#1A4D7A'},
    {key:'offertes_afwacht',label:'Offerte in afwachting',val:ofwacht.length,         tc:'#92400E',dc:'#B45309'},
    {key:'vve_afwachting', label:'In afwachting van VvE', val:vveAfwacht.length,      tc:'#065F46',dc:'#059669'},
    {key:'urgent',         label:'Urgent',                val:urgent.length,          tc:LOD_ROOD, dc:LOD_ROOD},
    {key:'overschreden',   label:'Overschreden',          val:overschreden.length,    tc:LOD_ROOD, dc:LOD_ROOD},
  ];

  // Filterlijst zijbalk: exclusief 'in_behandeling' en 'offertes_lopen'
  const filterLijstStatussen = Object.entries(LOD_STATUS).filter(([k])=>k!=='in_behandeling'&&k!=='offertes_lopen');
  const uitstelLods = lods.filter(l=>!!l.uitstelAangevraagd);

  let zichtbaar = lods.filter(l=>{
    const mz = !zoek||(l.vveNaam||'').toLowerCase().includes(zoek.toLowerCase())||(l.gemeenteReferentie||'').toLowerCase().includes(zoek.toLowerCase());
    let ms = true;
    if (filterStatus==='actief')         ms=l.status!=='afgerond';
    else if (filterStatus==='urgent')    ms=(()=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<=14&&d>=0&&l.status!=='afgerond';})();
    else if (filterStatus==='overschreden') ms=(()=>{const d=lodDagenTot(l.deadlineAlgemeen);return d!==null&&d<0&&l.status!=='afgerond';})();
    else if (filterStatus==='uitstel')   ms=!!l.uitstelAangevraagd;
    else if (filterStatus!=='alle')      ms=l.status===filterStatus;
    // Verberg afgerond
    if (hideAfgerond && l.status==='afgerond') return false;
    // Maandfilter op deadline
    if (filterMaand!==null && l.deadlineAlgemeen) {
      const d = new Date(l.deadlineAlgemeen);
      if (d.getMonth()!==filterMaand) return false;
    } else if (filterMaand!==null && !l.deadlineAlgemeen) return false;
    return mz&&ms;
  });

  if (loading) return (
    <div className="min-h-screen bg-[#F2EFEC] flex items-center justify-center">
      <style>{CSS_FONT}</style>
      <div style={{textAlign:'center',color:'#8A7E7B'}}>
        <div style={{fontSize:24,marginBottom:8}}>⏳</div>
        <div style={{fontSize:14}}>LOD data laden...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>
      {/* Topbar */}
      <div className="border-b border-gray-200 px-6 h-14 flex items-center justify-between bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div style={{width:28,height:28,background:LOD_ROOD,borderRadius:6}} />
            <div style={{width:28,height:28,background:'#2D2D2D',borderRadius:6}} />
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-bold text-[#2D2D2D]">LOD Beheer</span>
          <span className="text-xs text-gray-400">Last onder Dwangsom module</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addLod} style={{fontSize:12,padding:'6px 14px',background:LOD_ROOD,color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
            + Nieuwe LOD
          </button>
          <button onClick={()=>exportTotaalLodPDF(lods)} style={{fontSize:12,padding:'6px 14px',background:'#fff',color:LOD_ROOD,border:`1.5px solid ${LOD_ROOD}`,borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>
            Totaaloverzicht PDF
          </button>
          <button onClick={onTerug} className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-gray-600 transition-colors">
            ← Terug naar portaal
          </button>
        </div>
      </div>

      {/* Stats balk — klikbaar, breed, cijfer links */}
      <div style={{background:'#fff',borderBottom:'1px solid #E5DEDA',display:'flex',flexWrap:'wrap'}}>
        {statFilters.map(sf=>(
          <button key={sf.key} onClick={()=>setFilterStatus(sf.key)}
            style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',border:'none',borderBottom:`2px solid ${filterStatus===sf.key?sf.tc:'transparent'}`,background:filterStatus===sf.key?'#FAF7F2':'transparent',cursor:'pointer',transition:'all .15s',borderRight:'1px solid #F3F4F6',minWidth:140}}>
            <span style={{fontSize:28,fontWeight:700,color:sf.tc,fontFamily:'DM Sans,sans-serif',lineHeight:1}}>{sf.val}</span>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:11,color:sf.tc,fontWeight:600,lineHeight:1.2}}>{sf.label}</div>
              {filterStatus===sf.key&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:2}}>actief filter</div>}
            </div>
          </button>
        ))}
        {totaalBoete>0&&(
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderRight:'1px solid #F3F4F6',minWidth:160}}>
            <span style={{fontSize:22,fontWeight:700,color:LOD_ROOD,fontFamily:'monospace',lineHeight:1}}>{lodFmt(totaalBoete)}</span>
            <div style={{fontSize:11,color:LOD_ROOD,fontWeight:600,lineHeight:1.2}}>Totaal<br/>boeterisico</div>
          </div>
        )}
      </div>

      {/* Tabs hoofd */}
      <div style={{background:'#fff',borderBottom:'1px solid #E5DEDA',paddingLeft:20,display:'flex'}}>
        {[['lods','LOD overzicht'],['kalender','Deadlinekalender']].map(([key,lbl])=>(
          <button key={key} onClick={()=>setTabHoofd(key)}
            style={{padding:'10px 18px',border:'none',borderBottom:`2px solid ${tabHoofd===key?LOD_ROOD:'transparent'}`,background:'transparent',fontSize:13,fontWeight:tabHoofd===key?600:400,color:tabHoofd===key?LOD_ROOD:'#6B7280',cursor:'pointer'}}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{maxWidth:1200,margin:'0 auto',padding:'24px 20px 80px'}}>
        {tabHoofd==='kalender'?<LodKalender lods={lods}/>:(
          <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:20}}>
            {/* Zijbalk */}
            <div>
              {(overschreden.length>0||urgent.length>0||ofwacht.length>0||vveAfwacht.length>0)&&(
                <div style={{background:'#fff',border:'1.5px solid #E5DEDA',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:LOD_ROOD,marginBottom:10}}>Actie vereist</div>
                  {overschreden.map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:LOD_ROOD_BG,border:`1px solid #fca5a5`,borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:LOD_ROOD}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:LOD_ROOD}}>voorbij</span>
                    </div>
                  ))}
                  {urgent.map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:'#FEF3E2',border:'1px solid #FDE68A',borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:'#92400E'}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:'#92400E'}}>{lodDagenTot(l.deadlineAlgemeen)}d</span>
                    </div>
                  ))}
                  {ofwacht.filter(l=>!overschreden.includes(l)&&!urgent.includes(l)).map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:'#F3EFFD',border:'1px solid #C4B5FD',borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:'#5B3FA6'}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:'#5B3FA6'}}>offerte open</span>
                    </div>
                  ))}
                  {vveAfwacht.filter(l=>!overschreden.includes(l)&&!urgent.includes(l)&&!ofwacht.includes(l)).map(l=>(
                    <div key={l.id} onClick={()=>setOpenId(l.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 8px',background:'#D1FAE5',border:'1px solid #6EE7B7',borderRadius:7,marginBottom:5,cursor:'pointer',fontSize:11}}>
                      <span style={{fontWeight:600,color:'#065F46'}}>{l.vveNaam||'Naamloos'}</span>
                      <span style={{color:'#065F46'}}>wacht VvE</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Verberg afgerond knop */}
              <button onClick={()=>setHideAfgerond(p=>!p)}
                style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 12px',background:hideAfgerond?'#EAF4EE':'#fff',border:`1.5px solid ${hideAfgerond?'#2D6A4F':'#E5DEDA'}`,borderRadius:10,cursor:'pointer',fontFamily:'inherit',marginBottom:10,transition:'all .15s'}}>
                <div style={{width:16,height:16,borderRadius:4,background:hideAfgerond?'#2D6A4F':'transparent',border:`1.5px solid ${hideAfgerond?'#2D6A4F':'#9CA3AF'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {hideAfgerond&&<span style={{color:'#fff',fontSize:10,fontWeight:700,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:12,fontWeight:600,color:hideAfgerond?'#2D6A4F':'#374151'}}>Verberg afgerond</span>
                {hideAfgerond&&<span style={{marginLeft:'auto',fontSize:10,color:'#2D6A4F',fontWeight:600}}>{lods.filter(l=>l.status==='afgerond').length} verborgen</span>}
              </button>

              <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,padding:'14px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#8A7E7B',marginBottom:10}}>Filter op status</div>
                {[['alle',"Alle LOD's"],...filterLijstStatussen.map(([k,v])=>[k,v.label]),['uitstel','Uitstel aangevraagd']].map(([key,lbl])=>(
                  <button key={key} onClick={()=>setFilterStatus(key)}
                    style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',borderRadius:7,border:'none',background:filterStatus===key?LOD_ROOD_BG:'transparent',color:filterStatus===key?LOD_ROOD:'#374151',fontSize:12,fontWeight:filterStatus===key?600:400,cursor:'pointer',marginBottom:2}}>
                    {lbl}
                    <span style={{float:'right',fontSize:11,color:'#9CA3AF'}}>{key==='alle'?lods.length:lods.filter(l=>l.status===key).length}</span>
                  </button>
                ))}
              </div>

              {/* Maandfilter op deadline */}
              <div style={{background:'#fff',border:'1px solid #E5DEDA',borderRadius:12,padding:'14px 16px',marginTop:10}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#8A7E7B',marginBottom:10}}>Filter op deadline maand</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>
                  {['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'].map((m,mi)=>{
                    const aantalInMaand = lods.filter(l=>{
                      if (!l.deadlineAlgemeen) return false;
                      return new Date(l.deadlineAlgemeen).getMonth()===mi && l.status!=='afgerond';
                    }).length;
                    return (
                      <button key={mi} onClick={()=>setFilterMaand(filterMaand===mi?null:mi)}
                        style={{padding:'5px 4px',borderRadius:6,border:`1.5px solid ${filterMaand===mi?LOD_ROOD:'#E5DEDA'}`,background:filterMaand===mi?LOD_ROOD_BG:'transparent',color:filterMaand===mi?LOD_ROOD:'#374151',fontSize:11,fontWeight:filterMaand===mi?700:400,cursor:'pointer',textAlign:'center',transition:'all .15s',position:'relative'}}>
                        {m}
                        {aantalInMaand>0&&<span style={{position:'absolute',top:-4,right:-4,width:14,height:14,borderRadius:'50%',background:LOD_ROOD,color:'#fff',fontSize:8,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{aantalInMaand}</span>}
                      </button>
                    );
                  })}
                </div>
                {filterMaand!==null&&<button onClick={()=>setFilterMaand(null)} style={{marginTop:8,width:'100%',padding:'5px',background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:'#9CA3AF',textDecoration:'underline'}}>Maandfilter wissen</button>}
              </div>
            </div>

            {/* Hoofdpanel */}
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
                <input value={zoek} onChange={e=>setZoek(e.target.value)} placeholder="Zoek op VvE naam of referentie..."
                  className="calc-inp" style={{flex:1,fontSize:13}} />
                {zoek&&<button onClick={()=>setZoek('')} style={{padding:'8px 12px',background:'#fff',border:'1px solid #E5DEDA',borderRadius:8,cursor:'pointer',fontSize:12,color:'#8A7E7B'}}>✕</button>}
                {filterStatus!=='alle'&&<button onClick={()=>setFilterStatus('alle')} style={{padding:'6px 12px',background:LOD_ROOD_BG,border:`1px solid #fca5a5`,borderRadius:8,cursor:'pointer',fontSize:11,color:LOD_ROOD,fontWeight:600,whiteSpace:'nowrap'}}>✕ Wis filter</button>}
              </div>
              {zichtbaar.length===0?(
                <div style={{textAlign:'center',padding:'60px 20px',color:'#9CA3AF'}}>
                  <div style={{fontSize:32,marginBottom:12}}>📋</div>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{lods.length===0?"Nog geen LOD's geregistreerd":"Geen resultaten"}</div>
                  <div style={{fontSize:12}}>{lods.length===0?"Klik op + Nieuwe LOD om te beginnen.":"Probeer een andere zoekterm of filter."}</div>
                </div>
              ):zichtbaar.map(lod=>(
                <LodKaart key={lod.id} lod={lod} onUpdate={updateLod} onDelete={()=>deleteLod(lod.id)} openId={openId} setOpenId={setOpenId} beheerderList={beheerderList} />
              ))}
            </div>
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
  const [screen, setScreen] = useState("login"); // login | portaal | vergaderingen | calculator | admin | lod
  const [beheerder, setBeheerder] = useState("");
  const [userRol, setUserRol] = useState("beheerder"); // beheerder | beheerder_plus | admin
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
  const [statFilter, setStatFilter] = useState(null); // afgerond | uitgenodigd | niet-uitgenodigd | uitnodiging | vakantie
  const [geselecteerdeFilterMaanden, setGeselecteerdeFilterMaanden] = useState(new Set());
// Herstel sessie bij page refresh
useEffect(() => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  _accessToken = token;
  getUserRole().then(rol => {
    if (!rol) { setToken(null); return; }
    if (rol.rol === "admin") {
      setBeheerder("Admin");
      setUserRol("admin");
      setScreen("portaal");
      return;
    }
    setBeheerder(rol.naam);
    setUserRol(rol.rol || "beheerder");
    loadData(rol.naam).then(d => {
      setData(d || defaultData());
      setScreen("portaal");
    });
  }).catch(() => setToken(null));
}, []);
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
        setUserRol("admin");
        setLoading(false);
        setScreen("portaal");
        return;
      }
      setBeheerder(rol.naam);
      setUserRol(rol.rol || "beheerder");
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
    if (screen !== "vergaderingen" || !data.vves || data.vves.length === 0) return;
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

  // Stap 4b: statFilter (klik op stats balk)
  if (statFilter) {
    filtered = filtered.filter(v => {
      const afgr = isAfgerond(v);
      const uitgen = (v.uitgenodigd1 || v.uitgenodigd2) && !afgr;
      if (statFilter === 'afgerond') return afgr;
      if (statFilter === 'uitgenodigd') return uitgen;
      if (statFilter === 'niet-uitgenodigd') return !afgr && !uitgen;
      if (statFilter === 'uitnodiging') {
        const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
        const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
        return (s1 === 'warning' || s1 === 'overdue') || (s2 === 'warning' || s2 === 'overdue');
      }
      if (statFilter === 'vakantie') {
        const d = v.datum1 || v.datum2 || v.datumExtra;
        return d && isInVakantie(d, data.vakanties);
      }
      return true;
    });
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
  if (screen==="lod") return <LodBeheer onTerug={()=>setScreen("portaal")} beheerderList={beheerderList}/>;
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
          <div className="text-center">
            <p className="text-white text-xl font-bold mb-2">Vergaderplanner</p>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">Plan, beheer en monitor alle VvE-vergaderingen</p>
            <div className="w-8 h-px bg-white/20 mx-auto my-4"></div>
            <p className="text-white text-xl font-bold mb-2">VvE Calculator</p>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">Bereken maandelijkse bijdragen en reservefondsen conform art. 5:126 BW</p>
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
    const isAdmin = userRol === "admin";
    const isLodBeheerder = userRol === "beheerder_plus";
    const heeftLodToegang = isAdmin || isLodBeheerder;
    // LOD statistieken voor dashboard
    const lodData = isAdmin ? lodLocalLoad() : [];
    const lodActief = lodData.filter(l=>l.status!=='afgerond');
    const now = new Date();
    const maandEind = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const lodDezesMaand = lodActief.filter(l=>{
      if (!l.deadlineAlgemeen) return false;
      const d = new Date(l.deadlineAlgemeen);
      return d >= now && d <= maandEind;
    }).length;
    const lodUrgent = lodActief.filter(l=>{
      const d = lodDagenTot(l.deadlineAlgemeen);
      return d !== null && d <= 14 && d >= 0;
    }).length;
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
            <button onClick={async ()=>{ await signOut(); setScreen("login"); setLoginNaam(""); setLoginPw(""); setBeheerder(""); setUserRol("beheerder"); setData(defaultData()); }}
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
            <p className="text-sm text-gray-500">{new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — kies een tool om te beginnen</p>
          </div>

          {/* Tool tegels */}
          <div className="grid grid-cols-3 gap-5 mb-8">
            {/* Vergaderplanner */}
            <div
              onClick={()=>setScreen("vergaderingen")}
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

            {/* LOD Beheer — voor admin en beheerder_plus */}
            {heeftLodToegang && (
              <div
                onClick={()=>setScreen("lod")}
                className="bg-white border-2 border-gray-200 hover:border-[#92550A] rounded-2xl p-6 cursor-pointer transition-all hover:shadow-md relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#92550A] rounded-t-2xl" />
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-2xl mb-4">⚠️</div>
                <h3 className="text-base font-bold text-[#2D2D2D] mb-2">LOD Beheer</h3>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">Registreer en monitor LOD's van de gemeente — onderhoudspunten, offertes en deadlines.</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-amber-50 text-[#92550A] px-2 py-1 rounded-full font-semibold border border-amber-200">{isAdmin ? "Admin" : "LOD Beheerder"}</span>
                  <span className="text-[#92550A] font-bold group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            )}

            {/* Toekomstige tool placeholder */}
            {!isAdmin && !isLodBeheerder && (
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

  // Safety: vergaderplanner is de enige resterende screen
  if (screen !== "vergaderingen") return null;

  // LOD koppeling: laad actieve LODs voor vergaderplanner notitie
  const activeLods = lodLocalLoad().filter(l=>l.status!=='afgerond');
  const vveHeeftLod = (vveNaam) => activeLods.some(l =>
    l.vveNaam && vveNaam && l.vveNaam.toLowerCase().includes(vveNaam.toLowerCase().trim().substring(0,8))
  );
  const getVveLodInfo = (vveNaam) => activeLods.filter(l =>
    l.vveNaam && vveNaam && l.vveNaam.toLowerCase().includes(vveNaam.toLowerCase().trim().substring(0,8))
  );

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
          {beheerder === "Admin" && (
            <button onClick={()=>setScreen("portaal")}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#991A21] hover:border-red-200 hover:bg-red-50 transition-colors">
              ← Dashboard
            </button>
          )}
          <button onClick={async ()=>{ await signOut(); setScreen("login"); setLoginNaam(""); setLoginPw(""); setBeheerder(""); setUserRol("beheerder"); setData(defaultData()); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#991A21] hover:border-red-200 hover:bg-red-50 transition-colors">
            Uitloggen
          </button>
        </div>
      </div>

      <div className={`border-b ${t.border} px-6 flex bg-white`}>
        {[
          [data.vves.length, "VvE's", "text-[#2D2D2D]", "bg-[#2D2D2D]", null],
          [afgerond, "Afgerond", "text-emerald-700", "bg-emerald-500", "afgerond"],
          [uitgenodigd, "Uitgenodigd", "text-blue-700", "bg-blue-500", "uitgenodigd"],
          [nietUitgenodigd, "Niet uitgenodigd", "text-gray-500", "bg-gray-400", "niet-uitgenodigd"],
        ].map(([val, label, textClr, dotClr, filterKey]) => (
          <div key={label}
            onClick={() => { if (filterKey) { setStatFilter(f => f === filterKey ? null : filterKey); setTab("vergaderingen"); } }}
            className={`flex items-center gap-2.5 px-5 py-3.5 border-r border-gray-100 ${filterKey ? "cursor-pointer hover:bg-gray-50 transition-colors" : ""}`}>
            <div className={`w-2 h-2 rounded-full ${dotClr}`} />
            <div>
              <div className={`text-lg font-bold ${textClr}`}>{val}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</div>
            </div>
          </div>
        ))}
        {metWaarschuwing>0 && (
          <div
            onClick={() => { setStatFilter(f => f === "uitnodiging" ? null : "uitnodiging"); setTab("vergaderingen"); }}
            className="flex items-center gap-2.5 px-5 py-3.5 border-r border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
            <div className="w-2 h-2 rounded-full bg-[#991A21]" />
            <div>
              <div className="text-lg font-bold text-[#991A21]">{metWaarschuwing}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Uitnodiging!</div>
            </div>
          </div>
        )}
        {inVakantie>0 && (
          <div
            onClick={() => { setStatFilter(f => f === "vakantie" ? null : "vakantie"); setTab("vergaderingen"); }}
            className="flex items-center gap-2.5 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
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
                          {opSchema ? "✓ Je bent op schema" : <span className="text-red-600">⚠ Je loopt achter op schema</span>}
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
                          📅 <span className="text-red-600 font-medium">{NL_MONTHS_FULL[parseInt(maandIdx)]}</span> wordt je drukste maand
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
                {statFilter && (
                  <button
                    onClick={() => setStatFilter(null)}
                    className="px-3 py-2 bg-[#fef2f2] hover:bg-red-100 border border-red-200 text-[#991A21] text-xs rounded-xl transition-colors whitespace-nowrap font-medium"
                  >
                    ✕ Filter: {statFilter === 'afgerond' ? 'Afgerond' : statFilter === 'uitgenodigd' ? 'Uitgenodigd' : statFilter === 'niet-uitgenodigd' ? 'Niet uitgenodigd' : statFilter === 'uitnodiging' ? 'Uitnodiging urgent' : 'In vakantie'}
                  </button>
                )}
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
                        vveHeeftLod={vveHeeftLod}
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
