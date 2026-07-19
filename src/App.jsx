import React, { useState, useEffect, useCallback, useRef } from "react";
import MailConfigurator from './MailConfigurator';
import VerduurzamingBeheer, { vdDashboardStats } from './VerduurzamingBeheer';
import NotulenAssistent from './NotulenAssistent_deel2';
import KennisBank from './KennisBank';
import VveCalculator from './VveCalculator';
import LodBeheer, { lodSupaLoad, lodDashboardStats, initLodDeps } from './LodBeheer';

// ── Huisstijl Totaal VvE Beheer ──────────────────────────────────
// Primair: #991A21 (donkerrood), Antraciet: #2D2D2D, Achtergrond: #F2EFEC
const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }
.calc-inp { width:100%; padding:8px 11px; border:1.5px solid #E5DEDA; border-radius:8px; font-family:monospace !important; font-size:14px; color:#1A1614; background:#FAF7F2; outline:none; box-sizing:border-box; }
.calc-inp:focus { border-color:#991A21 !important; background:#fff !important; }
.calc-inp[type=number]::-webkit-inner-spin-button,
.calc-inp[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
.calc-inp[type=number] { -moz-appearance:textfield; appearance:textfield; }`;

// ── Config ───────────────────────────────────────────────────────
const INVITE_DAYS = 21;
const NL_MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const NL_MONTHS_FULL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
const NL_DAYS = ["Zo","Ma","Di","Wo","Do","Vr","Za"];
const WORK_DAYS_DEFAULT = [false, true, true, true, true, true, false];

// ── Debounce-hook ────────────────────────────────────────────────
// Geeft een gedebouncede versie van `callback` terug, plus flush() en cancel().
// - flush(): voert een eventueel wachtende aanroep NU uit (bv. bij onBlur/unmount)
// - cancel(): annuleert een wachtende aanroep zonder uit te voeren
// De laatste argumenten worden bewaard, zodat flush met de juiste waarde opslaat.
function useDebouncedCallback(callback, delay) {
  const timerRef = useRef(null);
  const lastArgsRef = useRef(null);
  const callbackRef = useRef(callback);

  // Houd de callback-ref actueel zonder de debounce te resetten
  useEffect(() => { callbackRef.current = callback; }, [callback]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (lastArgsRef.current !== null) {
        const args = lastArgsRef.current;
        lastArgsRef.current = null;
        callbackRef.current(...args);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastArgsRef.current = null;
  }, []);

  const debounced = useCallback((...args) => {
    lastArgsRef.current = args;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const a = lastArgsRef.current;
      lastArgsRef.current = null;
      if (a !== null) callbackRef.current(...a);
    }, delay);
  }, [delay]);

  // Flush bij unmount zodat een wachtende save niet verloren gaat
  useEffect(() => {
    return () => { flush(); };
  }, [flush]);

  return [debounced, flush, cancel];
}


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

// ── Password recovery (reset-link uit e-mail) ───────────────────
// Supabase zet bij een recovery-link tokens in de URL-hash:
//   #access_token=...&refresh_token=...&type=recovery
// Bij een verlopen of ongeldige link staat er een error in de hash.
// De hash wordt direct opgeschoond zodat de token niet in de
// adresbalk of browserhistory blijft staan.
function parseRecoveryHash() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(hash.slice(1));
  const type = params.get("type");
  const error = params.get("error_description") || params.get("error");
  const token = params.get("access_token");
  if (type || error) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  if (error) return { error };
  if (type === "recovery" && token) return { token };
  return null;
}

// Stelt een nieuw wachtwoord in met de recovery-token uit de e-maillink.
// Bewust géén setToken(): de gebruiker logt daarna handmatig in, zodat
// meteen bevestigd is dat het nieuwe wachtwoord daadwerkelijk werkt.
async function updatePassword(recoveryToken, nieuwWachtwoord) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${recoveryToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: nieuwWachtwoord }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Wachtwoord instellen mislukt");
  return data;
}

// Eén keer uitlezen bij het laden van de app, vóór React rendert.
// De sessie-herstel-useEffect slaat zichzelf over als dit gezet is,
// zodat een recovery-link nooit per ongeluk naar het portaal leidt.
const RECOVERY = parseRecoveryHash();

function getUid() {
  try { return JSON.parse(atob(_accessToken.split('.')[1])).sub; }
  catch { return null; }
}

async function getUserRole() {
  const uid = getUid();
  const filter = uid ? `&id=eq.${uid}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?select=naam,rol,modules,welkomstscherm_gezien${filter}`, {
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
  if (res.status === 401) {
    setToken(null);
    window._vveSessionVerlopen = true;
    window.location.reload();
    return null;
  }
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
    await sbFetch(`beheerder_data?on_conflict=beheerder`, {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(payload),
    });
  } catch(e) { console.error("saveData", e); showToast("Opslaan mislukt — controleer je verbinding."); }
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

// Beheerderlijst uit Supabase — via SECURITY DEFINER functie zodat
// elke ingelogde gebruiker de volledige namenlijst krijgt zonder dat
// rol/modules lekt via RLS.
async function fetchBeheerderNamen() {
  try {
    const rows = await sbFetch("rpc/beheerder_namen");
    return rows ? rows.map(r => r.naam) : [];
  } catch(e) { console.error("beheerder_namen", e); return []; }
}

// ── Date helpers ─────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso+"T00:00:00");
  return `${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
// Lokale ISO-datum. NIET toISOString() gebruiken voor datum-only waarden:
// die zet om naar UTC, waardoor lokale middernacht een dag terugvalt.
const pad2 = n => String(n).padStart(2, "0");
function isoLokaal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function addDays(iso, n) {
  if (!iso) return "";
  const d = new Date(iso+"T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate()+n);
  return isoLokaal(d);
}
function today() { return isoLokaal(new Date()); }
// LOD module dependencies doorgeven
initLodDeps({ sbFetch, showToast, today });
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
  return (!!vve.vergaderd1 || !!vve.needs2e) && (!vve.needs2e || !!vve.vergaderd2);
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
    const iso = isoLokaal(d);
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
// ── Toast notificaties ───────────────────────────────────────────
let _toastTimeout = null;
let _toastSetter = null;

function showToast(bericht, type = "fout") {
  if (!_toastSetter) return;
  _toastSetter({ bericht, type });
  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => { if (_toastSetter) _toastSetter(null); }, 4000);
}

class ToastBridge extends React.Component {
  constructor(props) {
    super(props);
    this.state = { toast: null };
    _toastSetter = (t) => this.setState({ toast: t });
  }
  componentWillUnmount() { _toastSetter = null; }
  render() {
    const { toast } = this.state;
    if (!toast) return null;
    const bg = toast.type === "succes" ? "#EAF4EE" : "#FDEAEB";
    const border = toast.type === "succes" ? "#2D6A4F" : "#991A21";
    const color = toast.type === "succes" ? "#2D6A4F" : "#991A21";
    const icon = toast.type === "succes" ? "✓" : "⚠";
    return (
      <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:bg,border:`1.5px solid ${border}`,borderRadius:10,padding:"12px 18px",fontSize:13,fontWeight:600,color,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",display:"flex",alignItems:"center",gap:8,maxWidth:340}}>
        <span>{icon}</span>
        <span>{toast.bericht}</span>
        <button onClick={()=>this.setState({toast:null})} style={{marginLeft:8,background:"none",border:"none",cursor:"pointer",fontSize:16,color,lineHeight:1}}>×</button>
      </div>
    );
  }
}
function Toast() { return <ToastBridge />; }
// ── Shared UI ────────────────────────────────────────────────────
function Badge({ color, children }) {
  const c = {
    green:  "bg-[#EAF2EC] text-[#3B7A57] border border-[#CFE0D5]",
    orange: "bg-[#F7EEDD] text-[#B07414] border border-[#E8D5B0]",
    red:    "bg-[#F6ECEC] text-[#991A21] border border-[#E3C9C9]",
    blue:   "bg-[#EAEFF4] text-[#4A6B8A] border border-[#C4D2DE]",
    gray:   "bg-[#FAF8F5] text-[#6B6560] border border-[#E7E2DB]",
  };
  return <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${c[color]||c.gray}`}>{children}</span>;
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
        const color = count===0?"#9B958E":count>=8?"#991A21":count>=5?"#B07414":"#3B7A57";
        return (
          <div key={m} className="flex flex-col items-center gap-1">
            <div className="w-full rounded-sm overflow-hidden bg-gray-100 h-16 flex items-end relative">
              {inVak && <div className="absolute inset-0 opacity-20 bg-amber-400 pointer-events-none"/>}
              <div className="w-full transition-all duration-500 rounded-sm" style={{height:`${Math.max(pct,count>0?8:0)}%`,backgroundColor:color}}/>
            </div>
            <span className="text-[9px] text-gray-400 font-mono uppercase">{m}</span>
            <span className="text-[10px] font-mono" style={{color:count===0?"#9B958E":color}}>{count||"·"}</span>
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
        className={`w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors shrink-0
          ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
          ${checked ? "bg-[#991A21] border-[#991A21]" : "bg-white border-[#C9BEB2] group-hover:border-[#991A21]"}`}
      >
        {checked && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-[11px] h-[11px]"><path d="M20 6 9 17l-5-5"/></svg>}
      </div>
      <span className={`text-[12.5px] transition-colors ${disabled ? "text-[#C9BEB2]" : "text-[#6B6560] group-hover:text-[#2D2D2D]"}`}>{label}</span>
    </label>
  );
}

// ── VvE Row ──────────────────────────────────────────────────────
function VveRow({ vve, vakanties, onUpdate, onDelete, onAdd2nd, forceOpen, onForceOpenHandled, vveHeeftLod }) {
  const [expanded, setExpanded] = useState(false);

  // ── Notitie: lokale state + debounced opslaan ──
  // Het notitieveld leest uit lokale state (vloeiend typen, geen her-render
  // van de hele lijst per toetsaanslag). De propagatie naar boven (onUpdate,
  // die naar Supabase schrijft) is gedebounced. Bij verlaten van het veld
  // (onBlur) of unmount volgt een flush, zodat niets verloren gaat.
  const [notitieLokaal, setNotitieLokaal] = useState(vve.notitie || "");

  // Resync wanneer de VvE van buitenaf wijzigt (andere VvE getoond, of
  // notitie extern aangepast via import/jaarwisseling). We syncen op id én
  // op vve.notitie, maar overschrijven niet terwijl de gebruiker net typt:
  // alleen als de binnenkomende waarde afwijkt van wat we lokaal hebben.
  useEffect(() => {
    setNotitieLokaal(vve.notitie || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vve.id, vve.notitie]);

  const [notitieDebounced, notitieFlush] = useDebouncedCallback((waarde) => {
    onUpdate({ ...vve, notitie: waarde });
  }, 800);

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

  // Een verstreken, niet-afgevinkte vergadering is géén "uitnodiging te laat":
  // uitnodigen kán niet meer. De enige actie is de uitkomst vastleggen. Zelfde
  // regel als in urgentItems en het filter "Actie vereist" in de lijst.
  const vandaagIso = today();
  const open1 = !!vve.datum1     && vve.datum1     < vandaagIso && !vergaderd1 && !vve.needs2e;
  const open2 = !!vve.datum2     && vve.datum2     < vandaagIso && !vergaderd2;
  const invE  = inviteStatus(vve.datumExtra, vve.uitgenodigdExtra);
  const openE = !!vve.datumExtra && vve.datumExtra < vandaagIso && !vve.vergaderdExtra;
  const st1 = open1 ? "open" : inv1;
  const st2 = open2 ? "open" : inv2;
  const stE = openE ? "open" : invE;

  const STIJL = {
    open:      { rand: "border-[#E3C9C9]", vlak: "bg-[#F6ECEC]", tekst: "text-[#991A21]" },
    overdue:   { rand: "border-[#E3C9C9]", vlak: "bg-[#F6ECEC]", tekst: "text-[#991A21]" },
    warning:   { rand: "border-[#E8D5B0]", vlak: "bg-[#F7EEDD]", tekst: "text-[#B07414]" },
    confirmed: { rand: "border-[#CFE0D5]", vlak: "bg-[#EAF2EC]", tekst: "text-[#3B7A57]" },
    ok:        { rand: "border-[#EFEBE4]", vlak: "bg-white",     tekst: "text-[#6B6560]" },
    none:      { rand: "border-[#EFEBE4]", vlak: "bg-white",     tekst: "text-[#6B6560]" },
  };

  const statusTekst = (st, datum) =>
    st === "open"      ? `Vergadering was op ${fmtDate(datum)} — leg de uitkomst vast` :
    st === "confirmed" ? "Uitnodiging verstuurd" :
    st === "overdue"   ? `Uitnodigingstermijn verlopen — uiterlijk ${fmtDate(addDays(datum, -INVITE_DAYS))}` :
    st === "warning"   ? `Uitnodigen vóór ${fmtDate(addDays(datum, -INVITE_DAYS))}` :
                         `Uitnodigen uiterlijk ${fmtDate(addDays(datum, -INVITE_DAYS))}`;

  const statusBadge = (st, which) => {
    if (st === "none") return null;
    if (st === "open")      return <Badge color="red">Uitkomst vastleggen ({which})</Badge>;
    if (st === "confirmed") return <Badge color="green">Uitgenodigd ({which})</Badge>;
    if (st === "overdue")   return <Badge color="red">Uitnodiging te laat ({which})</Badge>;
    if (st === "warning")   return <Badge color="orange">Uitnodigen ({which})</Badge>;
    return null;
  };

  // Eén statuspaneel, drie keer gebruikt (1e / 2e / extra) in plaats van drie
  // keer hetzelfde blok. Gewone functie, geen component: geen remount-risico.
  const statusPaneel = (st, datum, uitgenodigd, onToggle) => {
    const s = STIJL[st] || STIJL.none;
    return (
      <div className={`rounded-lg px-3.5 py-3 border ${s.rand} ${s.vlak}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className={`flex items-center gap-2 text-[12.5px] font-medium ${s.tekst}`}>
            {st === "open" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px] shrink-0">
                <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px] shrink-0">
                <rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            )}
            {statusTekst(st, datum)}
          </span>
          <Checkbox checked={uitgenodigd} disabled={false} onChange={onToggle} label="Uitnodiging verstuurd"/>
        </div>
      </div>
    );
  };

  // Het voorkeursdatumblok stond twee keer identiek in de code (na 1e zonder
  // 2e, en na een afgeronde 2e). Nu één keer.
  const voorkeurBlok = () => (
    <div className="border border-[#CFE0D5] bg-[#EAF2EC] rounded-lg px-3.5 py-3 space-y-2">
      <p className="text-[12.5px] font-semibold text-[#3B7A57]">Voorkeursdatum volgend jaar</p>
      <p className="text-[11.5px] text-[#6B6560]">Optioneel — wordt meegenomen in de auto-planning voor {new Date().getFullYear() + 1}.</p>
      <input type="date" value={vve.voorkeurVolgendjaar || ""}
        onChange={e => onUpdate({ ...vve, voorkeurVolgendjaar: e.target.value })}
        className="w-full bg-white border border-[#CFE0D5] rounded-lg px-3 h-10 text-[13.5px] text-[#2D2D2D] focus:outline-none focus:border-[#3B7A57] transition-colors"/>
      {vve.voorkeurVolgendjaar && (
        <p className="text-[11.5px] font-medium text-[#3B7A57] tabular-nums">Opgeslagen: {fmtDate(vve.voorkeurVolgendjaar)}</p>
      )}
    </div>
  );

  const INP = "w-full bg-white border border-[#E7E2DB] rounded-lg px-3 h-10 text-[13.5px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors";
  const LABEL = "text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E]";

  const stipKleur = afgerond ? "#3B7A57"
    : (open1 || open2 || openE) ? "#991A21"
    : (st1 === "overdue" || st2 === "overdue" || stE === "overdue") ? "#991A21"
    : (st1 === "warning" || st2 === "warning" || stE === "warning") ? "#B07414"
    : vergaderd1 ? "#4A6B8A"
    : vve.datum1 ? "#9B958E"
    : "#C9BEB2";

  const regelMeta = (datum, vergaderd, open, uitgenodigd, nr) => (
    <span className="text-[12px] text-[#9B958E]">
      <span>{nr}</span>{" "}
      <span className={`tabular-nums font-medium ${vergaderd ? "text-[#3B7A57]" : "text-[#3f3d3b]"}`}>{fmtDate(datum)}</span>
      {vergaderd ? <span className="text-[#3B7A57]"> · heeft plaatsgevonden</span>
        : open ? <span className="text-[#991A21] font-medium"> · uitkomst niet vastgelegd</span>
        : uitgenodigd ? <span className="text-[#3B7A57]"> · uitnodiging verstuurd</span>
        : <span> · uitnodigen uiterlijk <span className="tabular-nums">{fmtDate(addDays(datum, -INVITE_DAYS))}</span></span>}
    </span>
  );

  const updateDatum1 = (val) => onUpdate({ ...vve, datum1: val, uitgenodigd1: false });
  const updateDatum2 = (val) => onUpdate({ ...vve, datum2: val, uitgenodigd2: false });

return (
    <div ref={rowRef} className={`rounded-xl overflow-hidden border transition-colors ${
      afgerond ? "border-[#CFE0D5] bg-[#F7FBF8]" : "border-[#E7E2DB] bg-white"
    }`}>

      {/* ── Ingeklapte rij ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#FAF8F5] transition-colors" onClick={()=>setExpanded(e=>!e)}>
        <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{background: stipKleur}} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13.5px] font-semibold truncate ${afgerond ? "text-[#3B7A57]" : "text-[#2D2D2D]"}`}>{vve.naam}</span>
            {vveHeeftLod && vveHeeftLod(vve.naam) && <Badge color="red">LOD</Badge>}
            {afgerond && <Badge color="green">Afgerond</Badge>}
            {afgerond && vve.voorkeurVolgendjaar && <Badge color="blue">{new Date().getFullYear()+1} gepland</Badge>}
            {!afgerond && vergaderd1 && vve.datum2 && !vergaderd2 && <Badge color="blue">1e gedaan · 2e loopt</Badge>}
            {!vve.datum1 && !afgerond && <Badge color="gray">Niet gepland</Badge>}
            {inVak1 && !vergaderd1 && <Badge color="orange">Vakantieperiode</Badge>}
            {inVak2 && !vergaderd2 && <Badge color="orange">2e in vakantie</Badge>}
            {!vergaderd1 && statusBadge(st1, "1e")}
            {!vergaderd2 && vve.datum2 && statusBadge(st2, "2e")}
          </div>
          <div className="flex gap-x-5 gap-y-0.5 mt-1 flex-wrap">
            {vve.datum1 && regelMeta(vve.datum1, vergaderd1, open1, uitgenodigd1, "1e")}
            {vve.datum2 && regelMeta(vve.datum2, vergaderd2, open2, uitgenodigd2, "2e")}
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`w-[16px] h-[16px] shrink-0 text-[#9B958E] transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>

      {/* ── Uitgeklapt ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-[#EFEBE4] px-4 py-5 bg-[#FAF8F5] space-y-5">

          {/* 1e vergadering */}
          <div className="space-y-2.5">
            <p className={LABEL}>1e vergadering</p>
            <input type="date" value={vve.datum1} onChange={e=>updateDatum1(e.target.value)} className={INP}/>
            {vve.datum1 && statusPaneel(st1, vve.datum1, uitgenodigd1, v=>onUpdate({...vve, uitgenodigd1: v}))}
            <div className="flex flex-col gap-2.5 pt-1">
              <Checkbox checked={vergaderd1} disabled={false}
                onChange={v=>onUpdate({...vve, vergaderd1: v})}
                label="Vergadering heeft plaatsgevonden"/>
              <Checkbox checked={!!vve.needs2e} disabled={false}
                onChange={v=>onUpdate({...vve, needs2e: v, datum2: v ? vve.datum2 : "", uitgenodigd2: false, vergaderd2: false})}
                label="2e reglementaire vergadering nodig"/>
            </div>
            {vergaderd1 && !vve.needs2e && voorkeurBlok()}
          </div>

          {/* 2e reglementaire vergadering */}
          {vve.needs2e && (
            <div className="space-y-2.5 border-t border-[#EFEBE4] pt-4">
              <p className={LABEL}>2e reglementaire vergadering</p>
              <div className="flex gap-2">
                <input type="date" value={vve.datum2||""} onChange={e=>updateDatum2(e.target.value)} className={INP + " flex-1"}/>
                {vve.datum1 && !vve.datum2 && (
                  <button onClick={()=>onAdd2nd(vve)}
                    className="shrink-0 px-3 h-10 bg-white hover:bg-[#F2EFEC] text-[#6B6560] border border-[#E7E2DB] text-[12.5px] font-medium rounded-lg transition-colors whitespace-nowrap">
                    +3 weken
                  </button>
                )}
              </div>
              {vve.datum2 && statusPaneel(st2, vve.datum2, uitgenodigd2, v=>onUpdate({...vve, uitgenodigd2: v}))}
              {vve.datum2 && (
                <div className="pt-1">
                  <Checkbox checked={vergaderd2} disabled={false}
                    onChange={v=>onUpdate({...vve, vergaderd2: v})}
                    label="Vergadering heeft plaatsgevonden"/>
                </div>
              )}
              {vergaderd2 && voorkeurBlok()}
            </div>
          )}

          {/* Notitie */}
          <div className="border-t border-[#EFEBE4] pt-4">
            <p className={LABEL + " mb-2"}>Notitie</p>
            <input type="text"
              value={notitieLokaal}
              onChange={e => { setNotitieLokaal(e.target.value); notitieDebounced(e.target.value); }}
              onBlur={notitieFlush}
              placeholder="Bijv. altijd dinsdag…"
              className="w-full bg-white border border-[#E7E2DB] rounded-lg px-3 h-10 text-[13.5px] text-[#2D2D2D] placeholder-[#9B958E] focus:outline-none focus:border-[#991A21] transition-colors"/>
          </div>

          {/* Extra vergadering */}
          <div className="space-y-2.5 border-t border-[#EFEBE4] pt-4">
            <Checkbox checked={!!vve.extraVergadering} disabled={false}
              onChange={v=>onUpdate({...vve, extraVergadering: v, datumExtra: v ? vve.datumExtra : "", uitgenodigdExtra: false, vergaderdExtra: false})}
              label="Extra vergadering"/>
            {vve.extraVergadering && (
              <div className="space-y-2.5 pl-6">
                <input type="date" value={vve.datumExtra||""}
                  onChange={e=>onUpdate({...vve, datumExtra: e.target.value, uitgenodigdExtra: false})}
                  className={INP}/>
                {vve.datumExtra && statusPaneel(stE, vve.datumExtra, !!vve.uitgenodigdExtra, v=>onUpdate({...vve, uitgenodigdExtra: v}))}
                <div className="pt-1">
                  <Checkbox checked={!!vve.vergaderdExtra} disabled={false}
                    onChange={v=>onUpdate({...vve, vergaderdExtra: v})}
                    label="Vergadering heeft plaatsgevonden"/>
                </div>
              </div>
            )}
          </div>

          {/* Kostenherinnering */}
          {(vve.needs2e || vve.extraVergadering) && (
            <div className="border-t border-[#EFEBE4] pt-4 flex items-start gap-2.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px] text-[#B07414] shrink-0 mt-px">
                <circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>
              </svg>
              <p className="text-[12px] text-[#6B6560]">
                Vergeet niet de kosten in rekening te brengen
                {vve.needs2e && vve.extraVergadering ? " voor de 2e reglementaire vergadering en de extra vergadering." :
                 vve.needs2e ? " voor de 2e reglementaire vergadering." :
                 " voor de extra vergadering."}
              </p>
            </div>
          )}

          <div className="flex justify-end border-t border-[#EFEBE4] pt-4">
            <button onClick={()=>onDelete(vve.id)}
              className="text-[12.5px] font-medium text-[#9B958E] hover:text-[#991A21] transition-colors">
              Verwijder VvE
            </button>
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
// ── Werktoestand per VvE ─────────────────────────────────────────
// Vier elkaar uitsluitende toestanden; de som is altijd het totaal.
//
//   afgerond     → isAfgerond()
//   achterstand  → beslissende vergaderdatum verstreken, niet afgerond
//   tekomen      → beslissende vergaderdatum ligt nog in de toekomst
//   nietGepland  → er staat geen vergaderdatum
//
// De beslissende datum is datum2 zodra een 2e reglementaire nodig is: dan
// bepaalt de 2e de afronding. Is die 2e nog niet gepland, dan valt de VvE
// terug op datum1 — die is verstreken, en het plannen van de 2e ís het werk.
function beslissendeDatum(v) {
  if (v.needs2e) return v.datum2 || v.datum1 || "";
  return v.datum1 || "";
}

// Uitnodigen is alleen een uitvoerbare actie zolang de vergadering nog moet
// plaatsvinden. inviteStatus() geeft ook "overdue" wanneer de vergaderDATUM
// zelf al verstreken is — uitnodigen is dan geen actie meer maar geschiedenis.
// Zelfde regel als urgentItems op het portaal, zodat beide schermen hetzelfde
// getal tonen in plaats van elkaar tegen te spreken.
function heeftUitnodigingActie(v, t) {
  const nodig = (datum, uitgenodigd, gehouden) => {
    if (!datum || datum < t || uitgenodigd || gehouden) return false;
    const s = inviteStatus(datum, uitgenodigd);
    return s === "warning" || s === "overdue";
  };
  return nodig(v.datum1, v.uitgenodigd1, v.vergaderd1)
      || (!!v.needs2e && nodig(v.datum2, v.uitgenodigd2, v.vergaderd2))
      || (!!v.extraVergadering && nodig(v.datumExtra, v.uitgenodigdExtra, v.vergaderdExtra));
}

function calcStats(data) {
  if (!data) return null;
  const vves = data.vves || [];
  const vakanties = data.vakanties || [];
  const t = today();
  const total = vves.length;

  let afgerond = 0, achterstand = 0, tekomen = 0, nietGepland = 0;
  for (const v of vves) {
    if (isAfgerond(v)) { afgerond++; continue; }
    const d = beslissendeDatum(v);
    if (!d) nietGepland++;
    else if (d < t) achterstand++;
    else tekomen++;
  }

  // Verwerkingsgraad: van de vergaderingen waarvan de datum al is verstreken,
  // hoeveel zijn er afgerond? Dit is onafhankelijk van hoe het jaar is
  // ingedeeld — een vergelijking met "% van het kalenderjaar verstreken"
  // veronderstelt dat vergaderingen gelijkmatig over het jaar liggen, en dat
  // doen ze niet (het zwaartepunt ligt in de eerste jaarhelft).
  const verstreken = afgerond + achterstand;
  const pctVerwerkt = verstreken === 0 ? null : Math.round((afgerond / verstreken) * 100);

  const uitnodigingUrgent = vves.filter(v => heeftUitnodigingActie(v, t)).length;
  const inVakantie = vves.filter(v =>
    (v.datum1 && isInVakantie(v.datum1, vakanties)) ||
    (v.datum2 && isInVakantie(v.datum2, vakanties))
  ).length;
  const year = new Date().getFullYear();
  const q4 = vves.filter(v => { const k = monthKey(v.datum1); return k && k >= `${year}-10`; }).length;

  return { total, afgerond, achterstand, tekomen, nietGepland, verstreken, pctVerwerkt, uitnodigingUrgent, inVakantie, q4 };
}

// Kleuraccent per beheerder — één streepje links, geen ingekleurde kaart.
// Achterstand weegt het zwaarst: dat is werk dat al te laat is.
function riskLevel(stats) {
  if (!stats || stats.total === 0) return "leeg";
  if (stats.achterstand > 0) return "achterstand";
  if (stats.uitnodigingUrgent > 0) return "urgent";
  if (stats.nietGepland > 0) return "ongepland";
  return "bij";
}

const RISK_KLEUR = {
  achterstand: "#991A21",
  urgent:      "#B07414",
  ongepland:   "#4A6B8A",
  bij:         "#3B7A57",
  leeg:        "#E7E2DB",
};
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


// ── Gedeelde calculator-constanten (ook gebruikt door LOD-module) ──
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




// ── LOD Beheer — geëxtraheerd naar LodBeheer.jsx ──


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
  html += `<p class="sub">Gegenereerd op ${fmtDate(today())}</p>`;
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
  if (!win) { alert('Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.'); return }
  win.document.write(html);
  win.document.close();
  win.print();
}

// Lijnicoon-helper — zelfde vormtaal als de sidebar (1.75 stroke, 24×24).
function AdmIco({ path, className = "w-[15px] h-[15px]" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {path}
    </svg>
  );
}

const ICO_DOWNLOAD = <><path d="M12 3v11"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>;
const ICO_ALERT    = <><path d="m10.3 3.2-8.5 14.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3.2L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>;
const ICO_MAIL     = <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>;
const ICO_CAL      = <><rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/></>;
const ICO_CHECK    = <path d="M20 6 9 17l-5-5"/>;
const ICO_CHEVRON  = <path d="m6 9 6 6 6-6"/>;
const ICO_SWAP     = <><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></>;

// Paneelkop — het 3px-streepje draagt de betekenis, niet de kaart.
function AdmKop({ kleur = "#991A21", children, sub }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5">
        <span className="w-[3px] h-[14px] rounded-sm shrink-0" style={{ backgroundColor: kleur }} />
        <h2 className="text-[10.5px] uppercase tracking-[0.05em] text-[#9B958E] font-semibold">{children}</h2>
      </div>
      {sub && <p className="text-[12.5px] text-[#6B6560] mt-1.5 pl-[11px]">{sub}</p>}
    </div>
  );
}

function AdminDashboard({ beheerderList }) {
  const [allData, setAllData] = useState({});
  const [allRoles, setAllRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [herindelenVan, setHerindelenVan] = useState(null);
  const [herindelenVve, setHerindelenVve] = useState(null);
  const [herindelenNaar, setHerindelenNaar] = useState("");
  const [herindelenMsg, setHerindelenMsg] = useState("");

  const herindelen = async (vve, vanNaam, naarNaam) => {
    if (!naarNaam || naarNaam === vanNaam) return;
    const vanData = allData[vanNaam];
    if (!vanData) return;
    try {
      // Atomaire transfer via database-functie: verwijderen bij bron en
      // toevoegen bij bestemming gebeurt in één transactie. Als een van
      // beide stappen faalt, draait Postgres alles terug — de VvE kan
      // dus niet verdwijnen tussen de twee stappen.
      await sbFetch(`rpc/herindeel_vve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          van_naam: vanNaam,
          naar_naam: naarNaam,
          vve_id: String(vve.id),
          vve_object: vve,
        }),
      });
      // Lokale state pas bijwerken NA bevestigd succes in de database
      const updatedVan = { ...vanData, vves: vanData.vves.filter(v => v.id !== vve.id) };
      const naarData = allData[naarNaam] || defaultData();
      const updatedNaar = { ...naarData, vves: [...(naarData.vves||[]), vve] };
      setAllData(prev => ({ ...prev, [vanNaam]: updatedVan, [naarNaam]: updatedNaar }));
      setHerindelenVve(null); setHerindelenVan(null); setHerindelenNaar("");
      setHerindelenMsg(`${vve.naam} verplaatst naar ${naarNaam}.`);
      setTimeout(() => setHerindelenMsg(""), 3000);
    } catch (e) {
      console.error("herindelen mislukt", e);
      setHerindelenMsg(`Fout: verplaatsen van ${vve.naam} is mislukt. Er is niets gewijzigd.`);
      setTimeout(() => setHerindelenMsg(""), 5000);
    }
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

  const t = today();
  const jaar = new Date().getFullYear();

  // Eén keer rekenen, overal hergebruiken
  const rijen = beheerderList.map(naam => ({ naam, stats: calcStats(allData[naam]) }));
  const metData  = rijen.filter(r => r.stats && r.stats.total > 0);
  const zonderData = rijen.filter(r => !r.stats || r.stats.total === 0);

  // Sortering = triage. Wie de meeste achterstand heeft staat bovenaan.
  const gesorteerd = [...metData].sort((a, b) =>
    (b.stats.achterstand - a.stats.achterstand) ||
    (b.stats.uitnodigingUrgent - a.stats.uitnodigingUrgent) ||
    (b.stats.total - a.stats.total)
  );

  const som = (veld) => metData.reduce((s, r) => s + r.stats[veld], 0);
  const totaal        = som("total");
  const totAfgerond   = som("afgerond");
  const totAchterstand= som("achterstand");
  const totUitnodiging= som("uitnodigingUrgent");
  const totNietGepland= som("nietGepland");
  const totTekomen    = som("tekomen");
  const totVerstreken = totAfgerond + totAchterstand;
  const pctVerwerkt   = totVerstreken === 0 ? null : Math.round((totAfgerond / totVerstreken) * 100);

  const globalCounts = spreadScore(Object.values(allData).flatMap(d => d?.vves || []));

  // Accountstatus — met 24 accounts waarvan de meeste nooit hebben ingelogd
  // is dít het cijfer dat vóór livegang telt.
  const nu = new Date();
  const nooitIngelogd = allRoles.filter(r => !r.laatste_login);
  const inactief = allRoles
    .filter(r => r.laatste_login && (nu - new Date(r.laatste_login)) / 86400000 >= 10)
    .sort((a, b) => new Date(a.laatste_login) - new Date(b.laatste_login));

  const kpis = [
    { val: totaal,         label: "VvE's totaal",       kleur: "#2D2D2D", alarm: false },
    { val: totAfgerond,    label: "Afgerond",           kleur: "#3B7A57", alarm: false },
    { val: totAchterstand, label: "Achterstand",        kleur: "#991A21", alarm: totAchterstand > 0, tint: "#F6ECEC", rand: "#E3C9C9" },
    { val: totTekomen,     label: "Aankomend",          kleur: "#6B6560", alarm: false },
    { val: totNietGepland, label: "Niet gepland",       kleur: "#9B958E", alarm: false },
  ];

  // Verdeling voor de gesegmenteerde balk — moet exact optellen tot totaal.
  //
  // ── Balkpalet ──────────────────────────────────────────────────────────
  // Vlakken in een voortgangsbalk gebruiken lichtere kleuren dan tekst. Tekst
  // heeft contrast nodig om leesbaar te zijn, een gevuld vlak niet — bordeaux
  // #991A21 is als vlak zo donker dat het naast het groen als een gat oogt.
  // Daarom:
  //   achterstand → #C4565C  (lichter rood, zelfde tint als de huisstijl)
  //   aankomend   → #9B958E  (warm grijs i.p.v. blauw; blauw droeg geen
  //                           betekenis en botste met het bordeaux-groen-paar)
  //   niet gepland→ #E7E2DB  (lichtst — ongewijzigd, blijft onderscheidbaar
  //                           van het grijs hierboven)
  // Legendablokjes volgen altijd de balk, anders klopt de legenda niet meer.
  const verdeling = [
    { label: "Afgerond",    val: totAfgerond,    kleur: "#3B7A57" },
    { label: "Achterstand", val: totAchterstand, kleur: "#C4565C" },
    { label: "Aankomend",   val: totTekomen,     kleur: "#9B958E" },
    { label: "Niet gepland",val: totNietGepland, kleur: "#E7E2DB" },
  ];

  const knopStijl = "flex items-center gap-1.5 text-[12.5px] font-medium px-3 h-8 rounded-lg border border-[#E7E2DB] text-[#6B6560] hover:text-[#991A21] hover:border-[#C9BEB2] transition-colors";

  return (
    <div className="min-h-screen bg-[#F2EFEC] text-[#2D2D2D]">

      {/* ── Modulekop ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E7E2DB] px-7 h-16 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-[3px] h-[16px] rounded-sm bg-[#991A21] shrink-0" />
          <h1 className="text-[15px] font-semibold text-[#2D2D2D] shrink-0">Admin Dashboard</h1>
          <span className="text-[12.5px] text-[#9B958E] truncate">
            {loading
              ? "laden…"
              : `${totaal} VvE's · ${metData.length} van ${beheerderList.length} beheerders met data · planjaar ${jaar}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => exportTotaalExcel(allData, beheerderList)} className={knopStijl}>
            <AdmIco path={ICO_DOWNLOAD} /> Excel
          </button>
          <button onClick={() => exportAdminPDF(allData, beheerderList)} className={knopStijl}>
            <AdmIco path={ICO_DOWNLOAD} /> PDF
          </button>
        </div>
      </div>

      <div className="px-7 py-6 max-w-[1180px] mx-auto space-y-5">

        {loading ? (
          <div className="bg-white border border-[#E7E2DB] rounded-xl p-8 text-center">
            <p className="text-[13px] text-[#6B6560]">Gegevens van {beheerderList.length} beheerders ophalen…</p>
          </div>
        ) : (
        <>

        {herindelenMsg && (
          <div className="bg-[#EAF2EC] border border-[#CFE0D5] rounded-xl px-4 py-2.5 text-[12.5px] text-[#3B7A57] font-medium">
            {herindelenMsg}
          </div>
        )}

        {/* ── Uitnodiging urgent — los signaal, telt NIET op bij de kaarten hieronder ── */}
        {totUitnodiging > 0 && (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ backgroundColor: "#FBF3E7", borderColor: "#E8D3AC" }}>
            <span className="w-[3px] h-[28px] rounded-sm shrink-0" style={{ backgroundColor: "#B07414" }} />
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] leading-none font-semibold tabular-nums" style={{ color: "#B07414" }}>{totUitnodiging}</span>
              <span className="text-[13px] font-semibold text-[#2D2D2D]">VvE{totUitnodiging === 1 ? "" : "'s"} met uitnodiging urgent</span>
            </div>
            <span className="text-[11.5px] text-[#9B958E] ml-1">
              — overlapt met achterstand/aankomend hieronder, telt niet apart op bij het totaal
            </span>
          </div>
        )}

        {/* ── KPI's ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3">
          {kpis.map(k => (
            <div
              key={k.label}
              className="rounded-xl border px-4 py-3.5"
              style={{
                backgroundColor: k.alarm ? k.tint : "#FFFFFF",
                borderColor:     k.alarm ? k.rand : "#E7E2DB",
              }}
            >
              <div className="text-[26px] leading-none font-semibold tabular-nums" style={{ color: k.kleur }}>
                {k.val}
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#9B958E] font-semibold mt-1.5">
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Verdeling — gesegmenteerde balk die optelt tot het totaal ── */}
        <div className="bg-white border border-[#E7E2DB] rounded-xl p-5">
          <AdmKop>Verdeling — {totaal} VvE's totaal</AdmKop>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-[#EFEBE4] mt-1">
            {verdeling.map(seg => (
              <div key={seg.label} className="h-full" style={{ width: `${totaal === 0 ? 0 : (seg.val / totaal) * 100}%`, backgroundColor: seg.kleur }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2.5">
            {verdeling.map(seg => (
              <span key={seg.label} className="text-[11.5px] text-[#6B6560] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.kleur }} />
                <span className="font-semibold text-[#2D2D2D] tabular-nums">{seg.val}</span> {seg.label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        {/* ── Verwerkingsgraad ────────────────────────────────────── */}
        <div className="bg-white border border-[#E7E2DB] rounded-xl p-5">
          <AdmKop>Verwerkingsgraad</AdmKop>
          {pctVerwerkt === null ? (
            <p className="text-[13px] text-[#6B6560]">
              Er zijn nog geen vergaderingen waarvan de datum is verstreken.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-4 mb-3.5">
                <span className="text-[34px] leading-none font-semibold tabular-nums text-[#2D2D2D] shrink-0">
                  {pctVerwerkt}%
                </span>
                <p className="text-[13px] text-[#6B6560] pb-1">
                  Van de <span className="font-semibold text-[#2D2D2D] tabular-nums">{totVerstreken}</span> vergaderingen
                  waarvan de datum is verstreken, zijn er{" "}
                  <span className="font-semibold text-[#2D2D2D] tabular-nums">{totAfgerond}</span> afgerond.
                </p>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex bg-[#EFEBE4]">
                <div className="h-full bg-[#3B7A57]" style={{ width: `${pctVerwerkt}%` }} />
                <div className="h-full bg-[#C4565C]" style={{ width: `${100 - pctVerwerkt}%` }} />
              </div>
              <div className="flex items-center gap-5 mt-2.5">
                <span className="text-[11.5px] text-[#6B6560] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#3B7A57]" />
                  <span className="tabular-nums">{totAfgerond}</span> afgerond
                </span>
                <span className="text-[11.5px] text-[#6B6560] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#C4565C]" />
                  <span className="tabular-nums">{totAchterstand}</span> nog te verwerken
                </span>
                <span className="text-[11.5px] text-[#9B958E] ml-auto">
                  Los van het kalenderjaar — vergaderingen liggen niet gelijkmatig verdeeld.
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Spreiding ───────────────────────────────────────────── */}
        <div className="bg-white border border-[#E7E2DB] rounded-xl p-5">
          <AdmKop>Spreiding over {jaar} — alle beheerders</AdmKop>
          <MonthBar counts={globalCounts} vakanties={[]} />
        </div>

        {/* ── Beheerders, gesorteerd op openstaand werk ───────────── */}
        <div>
          <AdmKop sub="Gesorteerd op achterstand — bovenaan staat waar het werk ligt.">
            Beheerders met portefeuille — {metData.length}
          </AdmKop>

          <div className="space-y-2">
            {gesorteerd.map(({ naam, stats }) => {
              const isOpen = expanded === naam;
              const streep = RISK_KLEUR[riskLevel(stats)];
              const pct = n => (stats.total === 0 ? 0 : (n / stats.total) * 100);
              const vves = allData[naam]?.vves || [];

              return (
                <div
                  key={naam}
                  className="bg-white border border-[#E7E2DB] rounded-xl overflow-hidden"
                  style={{ borderLeft: `3px solid ${streep}` }}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : naam)}
                    className="w-full text-left px-5 py-4 hover:bg-[#FAF8F5] transition-colors"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-[120px] shrink-0">
                        <p className="text-[13.5px] font-semibold text-[#2D2D2D]">{naam}</p>
                        <p className="text-[11px] text-[#9B958E] tabular-nums">{stats.total} VvE's</p>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="h-2 rounded-full overflow-hidden flex bg-[#EFEBE4]">
                          <div className="h-full bg-[#3B7A57]" style={{ width: `${pct(stats.afgerond)}%` }} />
                          <div className="h-full bg-[#C4565C]" style={{ width: `${pct(stats.achterstand)}%` }} />
                          <div className="h-full bg-[#9B958E]" style={{ width: `${pct(stats.tekomen)}%` }} />
                        </div>
                        <div className="flex items-center gap-3.5 mt-1.5">
                          <span className="text-[10.5px] text-[#6B6560] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-sm bg-[#3B7A57]" />
                            <span className="tabular-nums">{stats.afgerond}</span> afgerond
                          </span>
                          {stats.achterstand > 0 && (
                            <span className="text-[10.5px] text-[#6B6560] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-sm bg-[#C4565C]" />
                              <span className="tabular-nums">{stats.achterstand}</span> achterstand
                            </span>
                          )}
                          <span className="text-[10.5px] text-[#6B6560] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-sm bg-[#9B958E]" />
                            <span className="tabular-nums">{stats.tekomen}</span> te komen
                          </span>
                          {stats.nietGepland > 0 && (
                            <span className="text-[10.5px] text-[#6B6560] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-sm bg-[#EFEBE4] border border-[#E7E2DB]" />
                              <span className="tabular-nums">{stats.nietGepland}</span> niet gepland
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-[180px] shrink-0 flex flex-wrap gap-1.5 justify-end">
                        {stats.achterstand > 0     && <Badge color="red">{stats.achterstand} achterstand</Badge>}
                        {stats.uitnodigingUrgent > 0 && <Badge color="orange">{stats.uitnodigingUrgent} uitnodiging</Badge>}
                        {stats.nietGepland > 0     && <Badge color="blue">{stats.nietGepland} niet gepland</Badge>}
                        {riskLevel(stats) === "bij" && <Badge color="green">Bij</Badge>}
                      </div>

                      <span className={`text-[#9B958E] shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                        <AdmIco path={ICO_CHEVRON} />
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-[#EFEBE4] bg-[#FAF8F5] px-5 py-5 space-y-5">

                      <div>
                        <AdmKop kleur="#E7E2DB">Spreiding {naam}</AdmKop>
                        <MonthBar counts={spreadScore(vves)} vakanties={allData[naam]?.vakanties || []} />
                      </div>

                      {(() => {
                        const achter = vves.filter(v => !isAfgerond(v) && beslissendeDatum(v) && beslissendeDatum(v) < t);
                        const uitn   = vves.filter(v => heeftUitnodigingActie(v, t));
                        const ongepl = vves.filter(v => !isAfgerond(v) && !beslissendeDatum(v));

                        if (!achter.length && !uitn.length && !ongepl.length) {
                          return (
                            <div className="flex items-center gap-2 text-[13px] text-[#3B7A57] font-medium">
                              <AdmIco path={ICO_CHECK} />
                              Alles bij. Geen openstaand werk.
                            </div>
                          );
                        }

                        const reden = (v) => {
                          if (v.needs2e && !v.datum2)      return "2e reglementaire nog plannen";
                          if (v.needs2e && !v.vergaderd2)  return "uitkomst 2e vastleggen";
                          return "uitkomst 1e vastleggen";
                        };

                        return (
                          <div className="space-y-4">
                            {achter.length > 0 && (
                              <div>
                                <AdmKop kleur="#991A21">Achterstand — {achter.length}</AdmKop>
                                <div className="space-y-1.5">
                                  {achter.slice(0, 6).map(v => (
                                    <div key={v.id} className="flex items-center gap-2.5 text-[12.5px] bg-[#F6ECEC] border border-[#E3C9C9] rounded-lg px-3 py-2">
                                      <span className="text-[#991A21] shrink-0"><AdmIco path={ICO_ALERT} /></span>
                                      <span className="font-medium text-[#2D2D2D] truncate">{v.naam}</span>
                                      <span className="text-[#991A21] ml-auto shrink-0 tabular-nums">
                                        {reden(v)} · {fmtDate(beslissendeDatum(v))}
                                      </span>
                                    </div>
                                  ))}
                                  {achter.length > 6 && (
                                    <p className="text-[11px] text-[#9B958E] pl-1">… en {achter.length - 6} andere</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {uitn.length > 0 && (
                              <div>
                                <AdmKop kleur="#B07414">Uitnodiging urgent — {uitn.length}</AdmKop>
                                <div className="space-y-1.5">
                                  {uitn.slice(0, 6).map(v => (
                                    <div key={v.id} className="flex items-center gap-2.5 text-[12.5px] bg-[#F7EEDD] border border-[#E8D5B0] rounded-lg px-3 py-2">
                                      <span className="text-[#B07414] shrink-0"><AdmIco path={ICO_MAIL} /></span>
                                      <span className="font-medium text-[#2D2D2D] truncate">{v.naam}</span>
                                      <span className="text-[#B07414] ml-auto shrink-0 tabular-nums">
                                        uitnodigen vóór {fmtDate(addDays(v.datum1, -INVITE_DAYS))}
                                      </span>
                                    </div>
                                  ))}
                                  {uitn.length > 6 && (
                                    <p className="text-[11px] text-[#9B958E] pl-1">… en {uitn.length - 6} andere</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {ongepl.length > 0 && (
                              <div>
                                <AdmKop kleur="#4A6B8A">Niet gepland — {ongepl.length}</AdmKop>
                                <div className="flex flex-wrap gap-1.5">
                                  {ongepl.slice(0, 12).map(v => (
                                    <span key={v.id} className="text-[12px] px-2.5 py-1 rounded-lg bg-[#EAEFF4] text-[#4A6B8A] border border-[#C4D2DE]">
                                      {v.naam}
                                    </span>
                                  ))}
                                  {ongepl.length > 12 && (
                                    <span className="text-[11px] text-[#9B958E] self-center">… en {ongepl.length - 12} andere</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Herindelen */}
                      <div className="border-t border-[#EFEBE4] pt-4">
                        <AdmKop kleur="#E7E2DB">VvE herindelen</AdmKop>
                        {herindelenVan === naam && herindelenVve ? (
                          <div className="flex gap-2 items-center flex-wrap">
                            <span className="text-[12.5px] text-[#6B6560] shrink-0 flex items-center gap-1.5">
                              <AdmIco path={ICO_SWAP} className="w-[14px] h-[14px] text-[#9B958E]" />
                              {herindelenVve.naam} →
                            </span>
                            <select
                              value={herindelenNaar}
                              onChange={e => setHerindelenNaar(e.target.value)}
                              className="flex-1 min-w-[160px] bg-white border border-[#E7E2DB] rounded-lg px-2.5 h-8 text-[12.5px] text-[#2D2D2D] focus:outline-none focus:border-[#991A21] transition-colors"
                            >
                              <option value="">Kies beheerder…</option>
                              {beheerderList.filter(n => n !== naam).map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <button
                              onClick={() => herindelen(herindelenVve, naam, herindelenNaar)}
                              disabled={!herindelenNaar}
                              className="px-3 h-8 bg-[#991A21] hover:bg-[#7A1419] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12.5px] font-medium rounded-lg transition-colors"
                            >
                              Verplaats
                            </button>
                            <button
                              onClick={() => { setHerindelenVve(null); setHerindelenVan(null); }}
                              className="text-[12.5px] text-[#9B958E] hover:text-[#2D2D2D] px-2 transition-colors"
                            >
                              Annuleer
                            </button>
                          </div>
                        ) : (
                          <select
                            value=""
                            onChange={e => {
                              const vve = vves.find(v => v.id === e.target.value);
                              if (vve) { setHerindelenVve(vve); setHerindelenVan(naam); setHerindelenNaar(""); }
                            }}
                            className="bg-white border border-[#E7E2DB] rounded-lg px-2.5 h-8 text-[12.5px] text-[#6B6560] focus:outline-none focus:border-[#991A21] transition-colors"
                          >
                            <option value="">Selecteer VvE om te herindelen…</option>
                            {vves.map(v => <option key={v.id} value={v.id}>{v.naam}</option>)}
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

        {/* ── Beheerders zonder portefeuille ──────────────────────── */}
        {zonderData.length > 0 && (
          <div className="bg-white border border-[#E7E2DB] rounded-xl p-5">
            <AdmKop
              kleur="#4A6B8A"
              sub="Deze accounts bestaan, maar hebben nog geen VvE's in het systeem. Zij openen een leeg scherm."
            >
              Nog geen portefeuille — {zonderData.length}
            </AdmKop>
            <div className="flex flex-wrap gap-1.5 pl-[11px]">
              {zonderData.map(({ naam }) => (
                <span key={naam} className="text-[12px] px-2.5 py-1 rounded-lg bg-[#EAEFF4] text-[#4A6B8A] border border-[#C4D2DE]">
                  {naam}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Accountstatus ───────────────────────────────────────── */}
        {(nooitIngelogd.length > 0 || inactief.length > 0) && (
          <div className="bg-white border border-[#E7E2DB] rounded-xl p-5 space-y-5">
            <AdmKop kleur="#B07414">Accountstatus</AdmKop>

            {nooitIngelogd.length > 0 && (
              <div className="pl-[11px]">
                <p className="text-[12.5px] text-[#6B6560] mb-2">
                  <span className="font-semibold text-[#2D2D2D] tabular-nums">{nooitIngelogd.length}</span>{" "}
                  {nooitIngelogd.length === 1 ? "account heeft" : "accounts hebben"} nog nooit ingelogd.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {nooitIngelogd.map(r => (
                    <span key={r.naam} className="text-[12px] px-2.5 py-1 rounded-lg bg-[#F7EEDD] text-[#B07414] border border-[#E8D5B0]">
                      {r.naam}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {inactief.length > 0 && (
              <div className="pl-[11px]">
                <p className="text-[10.5px] uppercase tracking-[0.05em] text-[#9B958E] font-semibold mb-2">
                  Inactief ≥ 10 dagen
                </p>
                <div>
                  {inactief.map(r => {
                    const dagen = Math.floor((nu - new Date(r.laatste_login)) / 86400000);
                    return (
                      <div key={r.naam} className="flex items-center justify-between text-[12.5px] border-b border-[#EFEBE4] py-2 last:border-0">
                        <span className="text-[#2D2D2D] font-medium">{r.naam}</span>
                        <span className="text-[#B07414] tabular-nums">{dagen} dagen geleden</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        </>
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState(RECOVERY && RECOVERY.token ? "wachtwoord-instellen" : "login"); // login | wachtwoord-instellen | portaal | vergaderingen | calculator | admin | lod
  const [beheerder, setBeheerder] = useState("");
  const [userRol, setUserRol] = useState("beheerder");
  const [userModules, setUserModules] = useState([]);
  const [showWelkomst, setShowWelkomst] = useState(false);
  // true zodra bekend is dat deze gebruiker het welkomstscherm nog nooit heeft
  // gezien; wordt pas naar showWelkomst omgezet bij de eerste klik op
  // Vergaderplanner, niet meteen bij login (zie useEffect verderop).
  const [welkomstPending, setWelkomstPending] = useState(false);
  const [eigenNaam, setEigenNaam] = useState("");
  const [beheerderList, setBeheerderList] = useState([]);
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
  // Wachtwoord-instellen (recovery-flow)
  const [nieuwPw, setNieuwPw] = useState("");
  const [nieuwPw2, setNieuwPw2] = useState("");
  const [pwError, setPwError] = useState("");
  // Melding op het loginscherm: succes na wachtwoord instellen, of
  // een fout als de recovery-link verlopen/ongeldig was.
  const [resetMelding, setResetMelding] = useState(
    RECOVERY && RECOVERY.error
      ? { type: "fout", tekst: "De wachtwoord-link is verlopen of ongeldig. Vraag een nieuwe reset-mail aan bij de beheerder." }
      : null
  );
  const [planningPreview, setPlanningPreview] = useState(null);
  // LOD data voor vergaderplanner koppeling (geen localStorage meer)
  const [appLods, setAppLods] = useState([]);
  useEffect(() => { lodSupaLoad().then(d => setAppLods(d || [])).catch(() => {}); }, [screen]);
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
  // Recovery-flow heeft voorrang: als de gebruiker via een reset-link
  // binnenkomt, geen sessie herstellen — anders schiet de app door naar
  // het portaal terwijl het wachtwoord-instellen-scherm getoond moet worden.
  if (RECOVERY) return;
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  _accessToken = token;
  getUserRole().then(async rol => {
    if (!rol) { setToken(null); return; }
    setBeheerderList(await fetchBeheerderNamen());
    if (rol.welkomstscherm_gezien === false) setWelkomstPending(true);
    setEigenNaam(rol.naam);
    if (rol.rol === "admin") {
      setBeheerder("Admin");
      setUserRol("admin");
      setScreen("portaal");
      return;
    }
    setBeheerder(rol.naam);
    setUserRol(rol.rol || "beheerder");
    setUserModules(rol.modules || []);
    loadData(rol.naam).then(d => {
      setData(d || defaultData());
      setScreen("portaal");
    });
  }).catch(() => setToken(null));
}, []);
  // Welkomstscherm: pas tonen bij de eerste keer dat de gebruiker na
  // inloggen daadwerkelijk de Vergaderplanner opent — niet bij login zelf.
  // Vangt alle ingangen (sidebar, mobiele nav, portaal-snelkoppelingen) omdat
  // die allemaal via setScreen("vergaderingen") lopen.
  useEffect(() => {
    if (screen === "vergaderingen" && welkomstPending) {
      setShowWelkomst(true);
      setWelkomstPending(false);
    }
  }, [screen, welkomstPending]);

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

  // Welkomstscherm sluiten: markeert in de database dat de gebruiker 'm heeft
  // gezien (zodat 'ie niet elke login opnieuw verschijnt), en verbergt 'm lokaal.
  // Als de database-update faalt (netwerkhik), sluit het scherm alsnog lokaal —
  // de gebruiker mag niet vastzitten in het welkomstscherm door een netwerkfout.
  const sluitWelkomst = async () => {
    setShowWelkomst(false);
    try {
      const encodedNaam = encodeURIComponent(eigenNaam);
      await fetch(`${SUPABASE_URL}/rest/v1/user_roles?naam=eq.${encodedNaam}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Prefer": "" },
        body: JSON.stringify({ welkomstscherm_gezien: true }),
      });
    } catch (e) { console.error("welkomstscherm_gezien opslaan mislukt", e); }
  };

  const handleLogin = async () => {
    if (!loginNaam.trim() || !loginPw.trim()) { setLoginError("Vul je e-mail en wachtwoord in."); return; }
    setLoading(true);
    setLoginError("");
    try {
      await signIn(loginNaam.trim(), loginPw.trim());
      const rol = await getUserRole();
      if (!rol) throw new Error("Geen rol gevonden voor dit account.");
      setBeheerderList(await fetchBeheerderNamen());
      if (rol.welkomstscherm_gezien === false) setWelkomstPending(true);
      setEigenNaam(rol.naam);
      if (rol.rol === "admin") {
        setBeheerder("Admin");
        setUserRol("admin");
        setLoading(false);
        setScreen("portaal");
        return;
      }
      setBeheerder(rol.naam);
      setUserRol(rol.rol || "beheerder");
      setUserModules(rol.modules || []);
      const d = await loadData(rol.naam);
      setData(d || defaultData());
      setScreen("portaal");
    } catch(e) {
      setLoginError(e.message === "Invalid login credentials" ? "E-mail of wachtwoord onjuist." : e.message);
    }
    setLoading(false);
  };

  // Client-side spiegeling van de Supabase-wachtwoordpolicy
  // (min. 12 tekens, hoofdletter, cijfer, speciaal teken) zodat de
  // gebruiker een nette Nederlandse melding krijgt in plaats van een
  // kale Engelse API-fout. De server blijft de echte handhaving.
  const valideerWachtwoord = (pw) => {
    if (pw.length < 12) return "Het wachtwoord moet minimaal 12 tekens lang zijn.";
    if (!/[A-Z]/.test(pw)) return "Het wachtwoord moet minimaal één hoofdletter bevatten.";
    if (!/[a-z]/.test(pw)) return "Het wachtwoord moet minimaal één kleine letter bevatten.";
    if (!/[0-9]/.test(pw)) return "Het wachtwoord moet minimaal één cijfer bevatten.";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Het wachtwoord moet minimaal één speciaal teken bevatten (bijv. ! of #).";
    return null;
  };

  const handleWachtwoordInstellen = async () => {
    const fout = valideerWachtwoord(nieuwPw);
    if (fout) { setPwError(fout); return; }
    if (nieuwPw !== nieuwPw2) { setPwError("De twee wachtwoorden komen niet overeen."); return; }
    setLoading(true);
    setPwError("");
    try {
      await updatePassword(RECOVERY.token, nieuwPw);
      setNieuwPw("");
      setNieuwPw2("");
      setResetMelding({ type: "succes", tekst: "Je wachtwoord is ingesteld. Log nu in met je e-mailadres en je nieuwe wachtwoord." });
      setScreen("login");
    } catch (e) {
      setPwError(e.message || "Wachtwoord instellen mislukt. Probeer het opnieuw.");
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
    html += `<h1>VvE Vergaderplanning ${year} — ${beheerder}</h1><p class="sub">Gegenereerd op ${fmtDate(today())}</p>`;
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
    const win = window.open("","_blank");
    if (!win) { alert('Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.'); return }
    win.document.write(html); win.document.close(); win.print();
  };

  const werkdagen = data.werkdagen || WORK_DAYS_DEFAULT;
  const counts = spreadScore(planningPreview || data.vves);
  const ongepland = data.vves.filter(v=>!v.datum1).length;
  // FIX 4: gebruik isAfgerond
  const uitgenodigd = data.vves.filter(v=> (v.uitgenodigd1 || v.uitgenodigd2) && !isAfgerond(v)).length;
  const afgerond = data.vves.filter(v=> isAfgerond(v)).length;
  const nietUitgenodigd = data.vves.length - uitgenodigd - afgerond;
  const inVakantie = data.vves.filter(v=>(v.datum1&&isInVakantie(v.datum1,data.vakanties))||(v.datum2&&isInVakantie(v.datum2,data.vakanties))).length;

  // ── Actiepunten ──────────────────────────────────────────────
  // Twee soorten:
  //   "warning" / "overdue"  → uitnodiging moet nog de deur uit
  //   "nietVerwerkt"         → vergadering is geweest, uitkomst niet vastgelegd
  //
  // inviteStatus() geeft ook "overdue" wanneer de vergaderDATUM zelf al is
  // verstreken. Uitnodigen is dan geen uitvoerbare actie meer, dus die items
  // worden alleen aangemaakt zolang de vergadering nog moet plaatsvinden.
  // Een verstreken, niet-afgevinkte vergadering levert in plaats daarvan één
  // "nietVerwerkt"-item op. Dat vervangt het oude "geen2e"-item, dat !needs2e
  // eiste en daardoor VvE's mét een geplande 2e volledig van de radar liet
  // vallen.
  const urgentItems = data.vves.flatMap(v => {
    const items = [];
    const t = today();
    const s1 = inviteStatus(v.datum1, v.uitgenodigd1);
    const s2 = inviteStatus(v.datum2, v.uitgenodigd2);
    const sE = inviteStatus(v.datumExtra, v.uitgenodigdExtra);

    // Nog te versturen uitnodigingen — vergadering ligt in de toekomst
    if (!v.vergaderd1 && v.datum1 && v.datum1 >= t && (s1==="warning"||s1==="overdue"))
      items.push({ id: v.id+"_u1", vveId: v.id, naam: v.naam, type: s1==="overdue"?"overdue":"warning", datum: v.datum1, deadline: addDays(v.datum1,-INVITE_DAYS) });
    if (v.needs2e && v.datum2 && v.datum2 >= t && !v.vergaderd2 && (s2==="warning"||s2==="overdue"))
      items.push({ id: v.id+"_u2", vveId: v.id, naam: v.naam, type: s2==="overdue"?"overdue":"warning", datum: v.datum2, deadline: addDays(v.datum2,-INVITE_DAYS), is2e: true });
    if (v.extraVergadering && v.datumExtra && v.datumExtra >= t && !v.vergaderdExtra && (sE==="warning"||sE==="overdue"))
      items.push({ id: v.id+"_uE", vveId: v.id, naam: v.naam, type: sE==="overdue"?"overdue":"warning", datum: v.datumExtra, deadline: addDays(v.datumExtra,-INVITE_DAYS), isExtra: true });

    // Verstreken vergaderingen waarvan de uitkomst nog niet is vastgelegd
    if (v.datum1 && v.datum1 < t && !v.vergaderd1 && !v.needs2e)
      items.push({ id: v.id+"_open1", vveId: v.id, naam: v.naam, type: "nietVerwerkt", datum: v.datum1 });
    if (v.needs2e && v.datum2 && v.datum2 < t && !v.vergaderd2)
      items.push({ id: v.id+"_open2", vveId: v.id, naam: v.naam, type: "nietVerwerkt", datum: v.datum2, is2e: true });
    if (v.extraVergadering && v.datumExtra && v.datumExtra < t && !v.vergaderdExtra)
      items.push({ id: v.id+"_openE", vveId: v.id, naam: v.naam, type: "nietVerwerkt", datum: v.datumExtra, isExtra: true });

    return items;
  });

  // Eén bron van waarheid voor "vraagt actie". Het dashboard telt hieruit, en
  // het filter in de Vergaderplanner filtert hierop. Vervangt de oude tellers
  // aantalUitTeNodigen en metWaarschuwing, die allebei óók uitnodigingen
  // eisten voor vergaderingen die al waren geweest.
  const urgenteVveIds = new Set(urgentItems.map(i => i.vveId));
  const vvesMetActie = urgenteVveIds.size;

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
      if (statFilter === 'actie') return urgenteVveIds.has(v.id);
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

  // ── Rollen & moduletoegang ───────────────────────────────────
  // Stond eerder binnen het portaalblok. Staat nu hier, omdat de sidebar op
  // ELK ingelogd scherm rendert en dezelfde gates nodig heeft.
  const isAdmin = userRol === "admin";
  const isHoofdAdmin = userRol === "hoofd_admin";
  const isLodBeheerder = userRol === "beheerder_plus";
  const heeftLodToegang = isAdmin || isHoofdAdmin || isLodBeheerder;
  const heeftModule = (m) => userModules.includes(m);
  const heeftVerduurzamingToegang = isHoofdAdmin || isAdmin || heeftModule('verduurzaming');
  const heeftAdminToegang = isAdmin || isHoofdAdmin;
  const rolLabel = isHoofdAdmin ? "Hoofdbeheerder" : isAdmin ? "Administrator" : isLodBeheerder ? "Beheerder +" : "Beheerder";

  // ── Moduledata voor de portaalwidgets ────────────────────────
  // Het portaal toont per module een samenvattingskaart, maar alleen voor
  // modules waar deze gebruiker toegang toe heeft. De rechten komen uit
  // user_roles (rol + modules); er staan geen namen in de code. Wie er een
  // kaart bij moet krijgen, regel je dus in de database, niet hier.
  //
  // Elke fetch heeft een eigen status, zodat een trage of falende module de
  // rest van het dashboard niet blokkeert. LOD hoeft niet apart geladen:
  // `appLods` staat al in state voor de vergaderplannerkoppeling.
  const [vdStats, setVdStats] = useState(null);
  const [vdStatus, setVdStatus] = useState("idle");       // idle | laden | klaar | fout
  const [adminRuw, setAdminRuw] = useState(null);
  const [adminStatus, setAdminStatus] = useState("idle"); // idle | laden | klaar | fout

  useEffect(() => {
    if (screen !== "portaal" || !heeftVerduurzamingToegang) return;
    let afgebroken = false;
    setVdStatus("laden");
    vdDashboardStats(eigenNaam)
      .then(s => { if (!afgebroken) { setVdStats(s); setVdStatus("klaar"); } })
      .catch(() => { if (!afgebroken) setVdStatus("fout"); });
    return () => { afgebroken = true; };
  }, [screen, heeftVerduurzamingToegang, eigenNaam]);

  useEffect(() => {
    if (screen !== "portaal" || !heeftAdminToegang || !beheerderList.length) return;
    let afgebroken = false;
    setAdminStatus("laden");
    Promise.all([loadAllData(beheerderList), loadAllRoles()])
      .then(([alle, rollen]) => {
        if (afgebroken) return;
        setAdminRuw({ alle, rollen });
        setAdminStatus("klaar");
      })
      .catch(() => { if (!afgebroken) setAdminStatus("fout"); });
    return () => { afgebroken = true; };
  }, [screen, heeftAdminToegang, beheerderList]);

  // ── Navigatie ────────────────────────────────────────────────
  // `toon` bepaalt zichtbaarheid per module:
  //   Vergaderplanner / Calculator  → iedereen
  //   Verduurzaming                 → hoofd_admin/admin of modules bevat 'verduurzaming'
  //   LOD Beheer                    → hoofd_admin/admin/beheerder_plus
  //   Notulen / Kennisbank / Mail   → hoofd_admin/admin of modules bevat de key
  //   Admin Dashboard               → admin || hoofd_admin
  const NAV = [
    { key: "portaal", label: "Dashboard", toon: true, icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>) },
    { key: "vergaderingen", label: "Vergaderplanner", toon: true, icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>) },
    { key: "calculator", label: "VvE Calculator", toon: true, icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4"/></svg>) },
    { key: "verduurzaming", label: "Verduurzaming", toon: heeftVerduurzamingToegang, icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>) },
    { key: "lod", label: "LOD Beheer", toon: heeftLodToegang, icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="m10.3 3.2-8.5 14.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3.2L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>) },
    { key: "notulen", label: "Notulen Assistent", toon: isHoofdAdmin || isAdmin || heeftModule('notulen_assistent'), icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M15 13H9M15 17H9M11 9H9"/></svg>) },
    { key: "kennisbank", label: "Kennisbank", toon: isHoofdAdmin || isAdmin || heeftModule('kennisbank'), icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>) },
    { key: "mail", label: "E-mail Configurator", toon: isHoofdAdmin || isAdmin || heeftModule('email_configurator'), icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>) },
    { key: "admin", label: "Admin Dashboard", toon: isAdmin || isHoofdAdmin, icoon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>) },
  ].filter(n => n.toon);

  const uitloggen = async () => {
    await signOut();
    setScreen("login"); setLoginNaam(""); setLoginPw("");
    setBeheerder(""); setUserRol("beheerder"); setData(defaultData());
  };

  // ── Applicatieshell ──────────────────────────────────────────
  // Sidebar links, scherm rechts. Wordt om elk ingelogd scherm gelegd, ook om
  // de modules. Die houden voorlopig hun eigen topbar met "← Terug naar
  // portaal" — die dubbeling verdwijnt bij de restyle van elke module.
  const metShell = (inhoud) => (
    <div className="min-h-screen bg-[#F2EFEC] flex">
      <style>{CSS_FONT}</style>

      {/* Sidebar — vanaf lg */}
      <aside className="hidden lg:flex flex-col w-[248px] shrink-0 bg-white border-r border-[#E7E2DB] sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-[#EFEBE4] shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#991A21] flex items-center justify-center shrink-0">
            <span className="text-white text-[13px] font-bold tracking-wide">VP</span>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[#2D2D2D] leading-tight">VvE Workspace</p>
            <p className="text-[11px] text-[#9B958E] truncate">Totaal VvE Beheer</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map(n => {
            const actief = screen === n.key;
            return (
              <button
                key={n.key}
                onClick={() => setScreen(n.key)}
                title={n.label}
                className={`w-full flex items-center gap-3 px-3 h-10 rounded-lg text-[13.5px] font-medium text-left transition-colors ${
                  actief ? "bg-[#F6ECEC] text-[#991A21]" : "text-[#6B6560] hover:bg-[#FAF8F5] hover:text-[#2D2D2D]"
                }`}
              >
                <span className={`shrink-0 ${actief ? "text-[#991A21]" : "text-[#9B958E]"}`}>{n.icoon}</span>
                <span className="truncate">{n.label}</span>
                {actief && <span className="ml-auto w-[3px] h-[18px] rounded-sm bg-[#991A21] shrink-0" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#EFEBE4] p-3 shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#991A21] flex items-center justify-center shrink-0">
              <span className="text-white text-[12.5px] font-semibold">{beheerder.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#2D2D2D] leading-tight truncate">{beheerder}</p>
            </div>
          </div>
          <button
            onClick={uitloggen}
            className="w-full flex items-center gap-3 px-3 h-9 rounded-lg text-[13px] font-medium text-[#6B6560] hover:bg-[#FAF8F5] hover:text-[#991A21] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[17px] h-[17px] shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>
            </svg>
            Uitloggen
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Navigatie onder lg — daar is de sidebar verborgen */}
        <div className="lg:hidden bg-white border-b border-[#E7E2DB] shrink-0">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <div className="w-8 h-8 rounded-lg bg-[#991A21] flex items-center justify-center shrink-0">
              <span className="text-white text-[12px] font-bold tracking-wide">VP</span>
            </div>
            <span className="text-[13.5px] font-semibold text-[#2D2D2D]">VvE Workspace</span>
            <button onClick={uitloggen} className="ml-auto text-[12px] font-medium px-3 h-8 rounded-lg border border-[#E7E2DB] text-[#6B6560] hover:text-[#991A21] transition-colors">
              Uitloggen
            </button>
          </div>
          <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
            {NAV.map(n => (
              <button
                key={n.key}
                onClick={() => setScreen(n.key)}
                className={`shrink-0 px-3 h-8 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  screen === n.key ? "bg-[#F6ECEC] text-[#991A21]" : "text-[#6B6560] hover:bg-[#FAF8F5]"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">{inhoud}</div>
      </div>
    </div>
  );

  // ── Screens ──────────────────────────────────────────────────
  if (screen==="mail") return metShell(<MailConfigurator onTerug={()=>setScreen("portaal")} beheerder={beheerder}/>);
  if (screen==="verduurzaming") return metShell(<VerduurzamingBeheer onTerug={()=>setScreen("portaal")} beheerder={beheerder} beheerderList={beheerderList}/>);
  if (screen==="notulen") return metShell(<NotulenAssistent onTerug={()=>setScreen("portaal")} />);
  if (screen==="kennisbank") return metShell(<KennisBank onTerug={()=>setScreen("portaal")} />);
  if (screen==="admin") return metShell(<AdminDashboard beheerderList={beheerderList}/>);
  if (screen==="lod") return metShell(<LodBeheer onTerug={()=>setScreen("portaal")} beheerderList={beheerderList}/>);
  if (screen==="calculator") return metShell(<VveCalculator onTerug={()=>setScreen("portaal")}/>);

  if (screen==="wachtwoord-instellen") return (
    <div className="min-h-screen grid grid-cols-2">
      <style>{CSS_FONT}</style>
      {/* Links — merkpaneel (identiek aan loginscherm) */}
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
            <p className="text-white text-xl font-bold mb-2">Wachtwoord instellen</p>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">Kies een nieuw wachtwoord om toegang te krijgen tot het portaal</p>
          </div>
        </div>
      </div>
      {/* Rechts — wachtwoordformulier */}
      <div className="bg-[#F2EFEC] flex flex-col justify-center px-16 py-12">
        <div className="max-w-sm w-full mx-auto">
          <h1 className="text-2xl font-bold text-[#2D2D2D] mb-1">Nieuw wachtwoord</h1>
          <p className="text-sm text-gray-500 mb-2">Stel het wachtwoord voor je account in.</p>
          <p className="text-xs text-gray-400 mb-8">Minimaal 12 tekens, met een hoofdletter, kleine letter, cijfer en speciaal teken.</p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Nieuw wachtwoord</label>
              <input autoFocus type="password" value={nieuwPw} onChange={e=>{ setNieuwPw(e.target.value); setPwError(""); }} placeholder="••••••••••••"
                className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none transition-colors ${pwError?"border-[#991A21]":"border-gray-200 focus:border-[#991A21]"}`}/>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Herhaal wachtwoord</label>
              <input type="password" value={nieuwPw2} onChange={e=>{ setNieuwPw2(e.target.value); setPwError(""); }} onKeyDown={e=>e.key==="Enter"&&handleWachtwoordInstellen()} placeholder="••••••••••••"
                className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm text-[#2D2D2D] placeholder-gray-400 focus:outline-none transition-colors ${pwError?"border-[#991A21]":"border-gray-200 focus:border-[#991A21]"}`}/>
            </div>
            {pwError && <p className="text-xs text-[#991A21] font-medium">{pwError}</p>}
            <button onClick={handleWachtwoordInstellen} disabled={loading}
              className="w-full py-3 bg-[#991A21] hover:bg-[#7a1419] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-red-900/20 mt-2">
              {loading ? "Opslaan…" : "Wachtwoord instellen →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen==="login") return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-[#F2EFEC]">
      <style>{CSS_FONT}</style>

      {/* ── Links — merkpaneel ─────────────────────────────────── */}
      <div className="relative hidden md:flex flex-col justify-between bg-[#2D2D2D] p-12 overflow-hidden">
        {/* Fijn bouwkundig raster i.p.v. decoratieve cirkels */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.05,
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />

        {/* Merk */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#991A21] flex items-center justify-center">
            <span className="text-white text-base font-bold tracking-wide">VP</span>
          </div>
          <div>
            <p className="text-white text-[15px] font-semibold leading-tight">VvE Workspace</p>
            <p className="text-[11px] text-white/45 tracking-wide">Totaal VvE Beheer</p>
          </div>
        </div>

        {/* Propositie */}
        <div className="relative z-10 max-w-sm">
          <div className="w-10 h-[3px] bg-[#991A21] rounded-full mb-6" />
          <h2 className="text-white text-[26px] font-semibold leading-snug tracking-tight">
            Alle VvE-vergaderingen,<br />op één plek gepland.
          </h2>
          <p className="text-white/50 text-sm leading-relaxed mt-4">
            Vergaderplanning, calculaties en verduurzaming — het interne portaal voor de beheerders van Totaal VvE Beheer.
          </p>
        </div>

        {/* Voet */}
        <div className="relative z-10 text-[11px] text-white/35 leading-relaxed">
          Totaal VvE Beheer Den Haag en omstreken B.V.<br />
          Volmerlaan 5, 2288 GC Rijswijk
        </div>
      </div>

      {/* ── Rechts — loginformulier ────────────────────────────── */}
      <div className="flex flex-col justify-center px-8 sm:px-16 py-12">
        <div className="max-w-[380px] w-full mx-auto">

          {/* Merk op smalle schermen, waar het linkerpaneel verborgen is */}
          <div className="flex md:hidden items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-[#991A21] flex items-center justify-center">
              <span className="text-white text-sm font-bold tracking-wide">VP</span>
            </div>
            <div>
              <p className="text-[#2D2D2D] text-sm font-semibold leading-tight">VvE Workspace</p>
              <p className="text-[11px] text-[#9B958E]">Totaal VvE Beheer</p>
            </div>
          </div>

          <h1 className="text-[26px] font-semibold text-[#2D2D2D] tracking-tight leading-tight">Inloggen</h1>
          <p className="text-sm text-[#6B6560] mt-1.5 mb-8">Gebruik je Totaal VvE Beheer-account.</p>

          {resetMelding && (
            <div className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${
              resetMelding.type === "succes"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-[#F6ECEC] border-[#E3C9C9] text-[#991A21]"
            }`}>
              {resetMelding.tekst}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[11px] font-semibold text-[#9B958E] uppercase tracking-[0.06em] mb-2">
                E-mailadres
              </label>
              <input
                autoFocus
                type="email"
                autoComplete="username"
                value={loginNaam}
                onChange={e=>{ setLoginNaam(e.target.value); setLoginError(""); }}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="naam@totaalvve.nl"
                className={`w-full h-12 bg-white rounded-xl px-4 text-sm text-[#2D2D2D] placeholder-gray-400 border transition-colors focus:outline-none ${
                  loginError ? "border-[#991A21]" : "border-[#E7E2DB] focus:border-[#991A21]"
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#9B958E] uppercase tracking-[0.06em] mb-2">
                Wachtwoord
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={loginPw}
                onChange={e=>{ setLoginPw(e.target.value); setLoginError(""); }}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                className={`w-full h-12 bg-white rounded-xl px-4 text-sm text-[#2D2D2D] placeholder-gray-400 border transition-colors focus:outline-none ${
                  loginError ? "border-[#991A21]" : "border-[#E7E2DB] focus:border-[#991A21]"
                }`}
              />
            </div>

            {loginError && (
              <p className="text-xs text-[#991A21] font-medium -mt-1">{loginError}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full h-12 bg-[#991A21] hover:bg-[#7A1419] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Bezig met inloggen…" : "Inloggen"}
            </button>
          </div>

          <p className="text-[11px] text-[#9B958E] mt-8 leading-relaxed">
            Problemen met inloggen? Neem contact op met de beheerder van het portaal.
          </p>
        </div>
      </div>
    </div>
  );

  // ── Welkomstscherm bij eerste login ─────────────────────────
  // Verschijnt vóór het portaal als welkomstscherm_gezien false is voor deze
  // gebruiker. Onafhankelijk van laatste_login, zodat dit veld los te resetten
  // is zonder de "dagen sinds login"-weergave in Admin Dashboard te verstoren.
  if (showWelkomst) return (
    <div className="min-h-screen bg-[#F2EFEC] flex items-center justify-center p-6">
      <style>{CSS_FONT}</style>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-lg w-full p-8 space-y-5 text-center">
        <div className="w-14 h-14 bg-[#991A21] rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-white text-2xl">👋</span>
        </div>
        <h2 className="text-xl font-bold text-[#2D2D2D]">Welkom bij de Vergaderplanner{eigenNaam ? `, ${eigenNaam}` : ""}!</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Hier plan je vergaderingen, houd je uitnodigingen bij en beheer je
          je VvE-data — allemaal op één plek.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed">
          Zie je bij een VvE een achterstand staan? Dat is geen fout van het
          systeem — het is bestaand werk uit de oude planning dat nog
          bijgewerkt moet worden. Werk dit rustig op je eigen tempo bij.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed">
          Heb je vragen over hoe iets werkt? Neem gerust contact op met Daley.
        </p>
        <button onClick={sluitWelkomst}
          className="w-full py-3 bg-[#991A21] hover:bg-[#7a1419] text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-red-900/20">
          Aan de slag →
        </button>
      </div>
    </div>
  );

  // ── Portaal screen ──────────────────────────────────────────
  if (screen==="portaal") {
    // ── Afgeleide weergavewaarden (puur, alleen voor presentatie) ──────────
    // Geen state, geen handlers, geen fetches. urgentItems/afgerond/yearPct e.d.
    // worden hierboven in de App-component al berekend; hier worden ze alleen
    // gesorteerd en gegroepeerd voor weergave.
    const vandaag = today();
    const dagenTot = (iso) => iso
      ? Math.round((new Date(iso + "T00:00:00") - new Date(vandaag + "T00:00:00")) / 86400000)
      : null;
    const opDatum = (a, b) => (a.datum || "").localeCompare(b.datum || "");
    const actieNietVerwerkt = urgentItems.filter(i => i.type === "nietVerwerkt").sort(opDatum);
    const actieTeLaat = urgentItems.filter(i => i.type === "overdue").sort(opDatum);
    const actieNadert = urgentItems.filter(i => i.type === "warning").sort(opDatum);

    // Eerstvolgende vergaderingen. Vervangt het oude "Recente activiteit"-blok:
    // dat deed .slice(-3) op data.vves — arrayvolgorde, geen tijdvolgorde. Er
    // staat geen tijdstempel in de VvE-data, dus "recent" is niet te berekenen.
    // "Wat komt eraan" wel.
    const komendeVergaderingen = data.vves
      .flatMap(v => [
        v.datum1 && !v.vergaderd1
          ? { vveId: v.id, naam: v.naam, datum: v.datum1, soort: "1e vergadering", uitgenodigd: !!v.uitgenodigd1 } : null,
        v.needs2e && v.datum2 && !v.vergaderd2
          ? { vveId: v.id, naam: v.naam, datum: v.datum2, soort: "2e vergadering", uitgenodigd: !!v.uitgenodigd2 } : null,
        v.extraVergadering && v.datumExtra && !v.vergaderdExtra
          ? { vveId: v.id, naam: v.naam, datum: v.datumExtra, soort: "Extra vergadering", uitgenodigd: !!v.uitgenodigdExtra } : null,
      ])
      .filter(x => x && x.datum >= vandaag)
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .slice(0, 4);

    // Opent de VvE-kaart in de Vergaderplanner. Zelfde mechaniek als het
    // notificatiepaneel daar (FIX 3): forceOpenId zetten en de filters uitzetten
    // die de kaart zouden verbergen.
    const openVveKaart = (vveId) => {
      setForceOpenId(vveId);
      const vve = data.vves.find(v => v.id === vveId);
      if (vve && isAfgerond(vve) && hideAfgerond) setHideAfgerond(false);
      if (geselecteerdeFilterMaanden.size > 0) setGeselecteerdeFilterMaanden(new Set());
      if (statFilter) setStatFilter(null);
      setScreen("vergaderingen");
    };

    const dagTekst = (d) => d === null ? "" : d > 0 ? `over ${d} ${d === 1 ? "dag" : "dagen"}` : d === 0 ? "vandaag" : `${-d} ${-d === 1 ? "dag" : "dagen"} geleden`;
    const deadlineTekst = (d) => d === null ? "" : d < 0 ? `${-d} ${-d === 1 ? "dag" : "dagen"} te laat` : d === 0 ? "vandaag" : `nog ${d} ${d === 1 ? "dag" : "dagen"}`;

    // ── Moduledata voor de widgets ────────────────────────────────────────
    // LOD rekent op `appLods`, dat al in state staat. Verduurzaming en de
    // organisatiecijfers komen uit de effects hierboven.
    const lodStats = heeftLodToegang ? lodDashboardStats(appLods) : null;

    // Organisatiebreed overzicht — dezelfde optelling als het Admin Dashboard,
    // zodat beide schermen niet uit elkaar kunnen lopen.
    const orgStats = (() => {
      if (!adminRuw) return null;
      const rijen = beheerderList.map(naam => ({ naam, stats: calcStats(adminRuw.alle[naam]) }));
      const metData = rijen.filter(r => r.stats && r.stats.total > 0);
      const som = (veld) => metData.reduce((s, r) => s + r.stats[veld], 0);
      const totAfgerond = som("afgerond");
      const totAchterstand = som("achterstand");
      const nuDt = new Date();
      return {
        beheerdersMetData: metData.length,
        beheerdersTotaal: beheerderList.length,
        totaal: som("total"),
        afgerond: totAfgerond,
        achterstand: totAchterstand,
        tekomen: som("tekomen"),
        nietGepland: som("nietGepland"),
        uitnodigingUrgent: som("uitnodigingUrgent"),
        pctVerwerkt: (totAfgerond + totAchterstand) === 0 ? null : Math.round((totAfgerond / (totAfgerond + totAchterstand)) * 100),
        nooitIngelogd: (adminRuw.rollen || []).filter(r => !r.laatste_login).length,
        inactief: (adminRuw.rollen || []).filter(r => r.laatste_login && (nuDt - new Date(r.laatste_login)) / 86400000 >= 10).length,
        drukste: [...metData].sort((a, b) => (b.stats.achterstand - a.stats.achterstand) || (b.stats.uitnodigingUrgent - a.stats.uitnodigingUrgent)).slice(0, 3),
      };
    })();

    const toonModuleWidgets = heeftLodToegang || heeftVerduurzamingToegang || heeftAdminToegang;

    // ── Gedeelde widget-onderdelen ────────────────────────────────────────
    const WidgetKaart = ({ titel, sub, naar, knopTekst, children }) => (
      <div className="bg-white border border-[#E7E2DB] rounded-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#EFEBE4]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-[3px] h-[15px] rounded-sm bg-[#991A21] shrink-0" />
            <p className="text-[14px] font-semibold text-[#2D2D2D] truncate">{titel}</p>
            {sub && <span className="text-[12px] text-[#9B958E] truncate hidden sm:inline">· {sub}</span>}
          </div>
          <button
            onClick={() => setScreen(naar)}
            className="group shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B6560] hover:text-[#991A21] transition-colors"
          >
            {knopTekst}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px] group-hover:translate-x-0.5 transition-transform">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
        <div className="p-5 flex-1">{children}</div>
      </div>
    );

    const MiniKpi = ({ val, label, kleur = "#2D2D2D", tint, rand }) => (
      <div
        className="rounded-lg px-3 py-2.5 border"
        style={{ backgroundColor: tint || "#FAF8F5", borderColor: rand || "#EFEBE4" }}
      >
        <p className="text-[19px] leading-none font-semibold tabular-nums" style={{ color: kleur }}>{val}</p>
        <p className="text-[11.5px] text-[#6B6560] mt-1.5 leading-tight">{label}</p>
      </div>
    );

    const WidgetLaden = ({ tekst }) => (
      <div className="flex items-center gap-2.5 text-[12.5px] text-[#9B958E] py-1">
        <span className="w-[6px] h-[6px] rounded-full bg-[#C9BEB2] animate-pulse shrink-0" />
        {tekst}
      </div>
    );

    const WidgetFout = ({ tekst }) => (
      <div className="flex items-start gap-2.5 rounded-lg bg-[#F6ECEC] px-3 py-2.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 mt-0.5 text-[#991A21]">
          <path d="m10.3 3.2-8.5 14.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3.2L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>
        </svg>
        <p className="text-[12.5px] text-[#991A21] leading-snug">{tekst}</p>
      </div>
    );

    const ArrowIcon = (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#C9BEB2] group-hover:text-[#991A21] group-hover:translate-x-0.5 transition-all">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    );

    // Eén rij in de actie-wachtrij. Klik opent de betreffende VvE-kaart.
    // Datum en relatieve tekst staan onder elkaar: "15 juni 2026 · 27 dagen
    // geleden" past niet op één regel binnen de kolom.
    const ActieRij = ({ item, ernst }) => {
      const dMeeting = dagenTot(item.datum);
      const dDeadline = item.deadline ? dagenTot(item.deadline) : null;
      const streep = ernst === 3 ? "#991A21" : ernst === 2 ? "#C97A70" : "#B07414";
      const soort = item.is2e ? "2e vergadering" : item.isExtra ? "Extra vergadering" : "1e vergadering";
      const teLaat = dDeadline !== null && dDeadline < 0;
      return (
        <div
          onClick={() => openVveKaart(item.vveId)}
          className="relative grid grid-cols-1 sm:grid-cols-[1fr_170px_170px] gap-2 sm:gap-3 items-start px-5 py-3 border-b border-[#EFEBE4] last:border-b-0 cursor-pointer hover:bg-[#FAF8F5] transition-colors"
        >
          <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{background: streep}} />
          <div className="min-w-0 sm:self-center">
            <p className="text-[13.5px] font-semibold text-[#2D2D2D] truncate">{item.naam}</p>
            <p className="text-[11.5px] text-[#9B958E] mt-0.5">{soort}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E]">Vergadering</p>
            <p className={`text-[12.5px] mt-0.5 tabular-nums ${dMeeting !== null && dMeeting <= 7 ? "font-semibold text-[#991A21]" : "text-[#3f3d3b]"}`}>
              {fmtDate(item.datum)}
            </p>
            <p className="text-[11.5px] text-[#9B958E]">{dagTekst(dMeeting)}</p>
          </div>
          <div>
            {item.type === "nietVerwerkt" ? (
              <>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E]">Actie</p>
                <p className="text-[12.5px] mt-0.5 font-semibold text-[#991A21]">Uitkomst vastleggen</p>
                <p className="text-[11.5px] text-[#9B958E]">afvinken of 2e plannen</p>
              </>
            ) : (
              <>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E]">Uitnodigen vóór</p>
                <p className={`text-[12.5px] mt-0.5 font-semibold tabular-nums ${teLaat ? "text-[#991A21]" : "text-[#B07414]"}`}>
                  {fmtDate(item.deadline)}
                </p>
                <p className={`text-[11.5px] ${teLaat ? "text-[#991A21]" : "text-[#9B958E]"}`}>{deadlineTekst(dDeadline)}</p>
              </>
            )}
          </div>
        </div>
      );
    };

    return metShell(
        <div className="px-7 py-9 max-w-[1440px] mx-auto">

          {/* ── Begroeting ───────────────────────────────────────── */}
          <div className="mb-7">
            <h1 className="text-[26px] font-semibold text-[#2D2D2D] tracking-tight leading-tight">
              {(() => { const h = new Date().getHours(); return h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond"; })()} {beheerder}
            </h1>
            <p className="text-[13.5px] text-[#6B6560] mt-1.5">
              {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {data.vves.length === 0 ? (

            /* ── Lege staat — nog geen VvE's ──────────────────────
               Twee varianten. Wie alleen de Vergaderplanner heeft, moet daar
               beginnen: grote kaart met een duidelijke volgende stap. Wie ook
               andere modules heeft (Marcel bijvoorbeeld, die niet vergadert)
               krijgt een regel in plaats van een paginavullende oproep — voor
               hem is een leeg vergaderoverzicht geen probleem dat opgelost
               moet worden, en zijn echte werk staat in de kaarten eronder. */
            toonModuleWidgets ? (
              <div className="flex items-start gap-3 bg-white border border-[#E7E2DB] rounded-xl px-5 py-4 mb-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0 mt-0.5 text-[#9B958E]">
                  <rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-[#2D2D2D]">Geen VvE's in de Vergaderplanner</p>
                  <p className="text-[12.5px] text-[#6B6560] mt-0.5 leading-snug">
                    Er staan geen vergaderingen op jouw naam. Hieronder zie je de modules waar je wél toegang toe hebt.
                  </p>
                </div>
                <button
                  onClick={()=>setScreen("vergaderingen")}
                  className="group shrink-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B6560] hover:text-[#991A21] transition-colors self-center"
                >
                  Openen
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px] group-hover:translate-x-0.5 transition-transform">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="bg-white border border-[#E7E2DB] rounded-xl px-8 py-10 mb-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#F6ECEC] text-[#991A21] flex items-center justify-center mx-auto mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
                    <rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
                  </svg>
                </div>
                <h2 className="text-[17px] font-semibold text-[#2D2D2D] mb-2">Je hebt nog geen VvE's</h2>
                <p className="text-[13.5px] text-[#6B6560] max-w-md mx-auto mb-6 leading-relaxed">
                  Voeg je VvE's toe in de Vergaderplanner — één voor één of via een bulkimport.
                  Zodra ze erin staan, zie je hier je actiepunten en je voortgang over het jaar.
                </p>
                <button
                  onClick={()=>setScreen("vergaderingen")}
                  className="inline-flex items-center gap-2 h-11 px-5 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13.5px] font-semibold rounded-xl transition-colors"
                >
                  Naar de Vergaderplanner
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            )

          ) : (
            <>
              {/* ── Statusbalk ─────────────────────────────────────── */}
              <div className="bg-white border border-[#E7E2DB] rounded-xl p-5 mb-4">
                <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-2">
                  <p className="text-[13px] font-semibold text-[#2D2D2D]">
                    Status van je {data.vves.length} VvE's <span className="text-[#9B958E] font-normal">· planjaar {new Date().getFullYear()}</span>
                  </p>
                  {vvesMetActie > 0 && (
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#991A21]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                        <path d="m10.3 3.2-8.5 14.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3.2L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>
                      </svg>
                      {vvesMetActie} {vvesMetActie === 1 ? "VvE vraagt" : "VvE's vragen"} nu actie
                    </span>
                  )}
                </div>
                <div className="flex h-3 gap-[3px]">
                  {afgerond > 0 && <span className="rounded-[3px] bg-[#3B7A57]" style={{flex: afgerond}} />}
                  {uitgenodigd > 0 && <span className="rounded-[3px] bg-[#9B958E]" style={{flex: uitgenodigd}} />}
                  {nietUitgenodigd > 0 && <span className="rounded-[3px] bg-[#E7E2DB]" style={{flex: nietUitgenodigd}} />}
                </div>
                <div className="flex gap-5 mt-3 flex-wrap">
                  <span className="flex items-center gap-2 text-[12.5px] text-[#6B6560]"><span className="w-2 h-2 rounded-sm bg-[#3B7A57]" /><b className="text-[#2D2D2D] font-semibold">{afgerond}</b> afgerond</span>
                  <span className="flex items-center gap-2 text-[12.5px] text-[#6B6560]"><span className="w-2 h-2 rounded-sm bg-[#9B958E]" /><b className="text-[#2D2D2D] font-semibold">{uitgenodigd}</b> uitgenodigd</span>
                  <span className="flex items-center gap-2 text-[12.5px] text-[#6B6560]"><span className="w-2 h-2 rounded-sm bg-[#E7E2DB]" /><b className="text-[#2D2D2D] font-semibold">{nietUitgenodigd}</b> nog niet uitgenodigd</span>
                  {ongepland > 0 && (
                    <span className="flex items-center gap-2 text-[12.5px] text-[#6B6560]"><span className="w-2 h-2 rounded-sm border border-[#C9BEB2]" /><b className="text-[#2D2D2D] font-semibold">{ongepland}</b> zonder datum</span>
                  )}
                </div>
              </div>

              {/* ── Voortgang + Eerstvolgende | Actie vereist ──────── */}
              <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-5 mb-8 items-start">

                {/* ── Linkerkolom: Voortgang + Eerstvolgende ── */}
                <div className="flex flex-col gap-4">

                {/* Voortgang */}
                <div className="bg-white border border-[#E7E2DB] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#EFEBE4]">
                    <span className="w-[3px] h-[15px] rounded-sm bg-[#991A21]" />
                    <p className="text-[14px] font-semibold text-[#2D2D2D]">Voortgang {new Date().getFullYear()}</p>
                  </div>
                  <div className="p-5">
                    <div className="mb-3.5">
                      <div className="flex justify-between text-[12.5px] mb-1.5">
                        <span className="text-[#6B6560]">Jaar verstreken</span>
                        <b className="font-semibold text-[#2D2D2D]">{yearPct}%</b>
                      </div>
                      <div className="h-2 rounded-full bg-[#FAF8F5] overflow-hidden">
                        <span className="block h-full rounded-full bg-[#2D2D2D] opacity-30" style={{width: `${Math.min(yearPct,100)}%`}} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[12.5px] mb-1.5">
                        <span className="text-[#6B6560]">Vergaderingen afgerond</span>
                        <b className="font-semibold text-[#2D2D2D]">{afgerondPct}%</b>
                      </div>
                      <div className="h-2 rounded-full bg-[#FAF8F5] overflow-hidden">
                        <span className="block h-full rounded-full bg-[#3B7A57]" style={{width: `${Math.min(afgerondPct,100)}%`}} />
                      </div>
                    </div>

                    <div className={`mt-4 flex gap-2.5 items-start rounded-lg px-3 py-2.5 ${
                      onTrackDiff >= 0 ? "bg-[#EAF2EC]" : onTrackDiff >= -10 ? "bg-[#F7EEDD]" : "bg-[#F6ECEC]"
                    }`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                        className={`w-4 h-4 shrink-0 mt-0.5 ${onTrackDiff >= 0 ? "text-[#3B7A57]" : onTrackDiff >= -10 ? "text-[#B07414]" : "text-[#991A21]"}`}>
                        {onTrackDiff >= 0
                          ? <path d="M20 6 9 17l-5-5"/>
                          : <><path d="m10.3 3.2-8.5 14.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3.2L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>
                        }
                      </svg>
                      <div>
                        <p className={`text-[13px] font-semibold leading-tight ${onTrackDiff >= 0 ? "text-[#3B7A57]" : onTrackDiff >= -10 ? "text-[#B07414]" : "text-[#991A21]"}`}>
                          {onTrackDiff >= 0 ? "Je loopt voor op schema" : onTrackDiff >= -10 ? "Je loopt licht achter" : "Je loopt achter op schema"}
                        </p>
                        <p className="text-[12px] text-[#3f3d3b] mt-0.5 leading-snug">
                          {afgerond} van {data.vves.length} afgerond, terwijl {yearPct}% van het jaar voorbij is.
                        </p>
                      </div>
                    </div>

                    {ongepland > 0 && (
                      <div className="flex justify-between text-[12.5px] pt-3.5 mt-3.5 border-t border-[#EFEBE4]">
                        <span className="text-[#6B6560]">Nog in te plannen</span>
                        <b className="font-semibold text-[#2D2D2D]">{ongepland} {ongepland === 1 ? "VvE" : "VvE's"}</b>
                      </div>
                    )}
                    {inVakantie > 0 && (
                      <div className="flex justify-between text-[12.5px] pt-2.5 mt-2.5">
                        <span className="text-[#6B6560]">Valt in een vakantie</span>
                        <b className="font-semibold text-[#B07414]">{inVakantie}</b>
                      </div>
                    )}
                  </div>
                </div>

                {/* Eerstvolgende vergaderingen */}
                <div className="bg-white border border-[#E7E2DB] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#EFEBE4]">
                    <span className="w-[3px] h-[15px] rounded-sm bg-[#991A21]" />
                    <p className="text-[14px] font-semibold text-[#2D2D2D]">Eerstvolgende vergaderingen</p>
                  </div>
                  <div className="px-5 py-4">
                    {komendeVergaderingen.length === 0 ? (
                      <p className="text-[13px] text-[#9B958E]">Geen vergaderingen gepland. Open de Vergaderplanner om te beginnen.</p>
                    ) : (
                      <div className="space-y-3">
                        {komendeVergaderingen.map((v, i) => (
                          <div
                            key={i}
                            onClick={() => openVveKaart(v.vveId)}
                            className="flex items-center gap-3 text-[13px] -mx-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                          >
                            <span
                              className="w-[9px] h-[9px] rounded-full shrink-0 border-2 bg-white"
                              style={{ borderColor: v.uitgenodigd ? "#9B958E" : "#C9BEB2" }}
                              title={v.uitgenodigd ? "Uitnodiging verstuurd" : "Nog niet uitgenodigd"}
                            />
                            <span className="font-semibold text-[#2D2D2D] truncate">{v.naam}</span>
                            <span className="text-[#9B958E] shrink-0 hidden sm:inline">— {v.soort}</span>
                            <span className="ml-auto shrink-0 text-right whitespace-nowrap">
                              <span className="text-[#3f3d3b] tabular-nums">{fmtDate(v.datum)}</span>
                              <span className="text-[#9B958E]"> · {dagTekst(dagenTot(v.datum))}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                </div>{/* einde linkerkolom */}

                {/* Actie vereist */}
                <div className="bg-white border border-[#E7E2DB] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFEBE4]">
                    <div className="flex items-center gap-2.5">
                      <span className="w-[3px] h-[15px] rounded-sm bg-[#991A21]" />
                      <p className="text-[14px] font-semibold text-[#2D2D2D]">Actie vereist</p>
                    </div>
                    {urgentItems.length > 0 && (
                      <span className="text-[12px] font-semibold text-[#9B958E]">{urgentItems.length} openstaand · op urgentie</span>
                    )}
                  </div>

                  {urgentItems.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <div className="w-10 h-10 rounded-lg bg-[#EAF2EC] text-[#3B7A57] flex items-center justify-center mx-auto mb-3">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px]">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      </div>
                      <p className="text-[13.5px] font-semibold text-[#2D2D2D]">Geen actiepunten</p>
                      <p className="text-[12.5px] text-[#6B6560] mt-1">Alle uitnodigingen staan op tijd uit en elke verstreken vergadering is verwerkt.</p>
                    </div>
                  ) : (
                    <>
                      {actieNietVerwerkt.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2.5 px-5 py-2.5 bg-[#FAF8F5] border-b border-[#EFEBE4] text-[#991A21]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                              <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
                            </svg>
                            <span className="text-[12px] font-semibold uppercase tracking-[0.04em]">Vergadering geweest — uitkomst niet vastgelegd</span>
                            <span className="ml-auto text-[11.5px] font-semibold bg-[#991A21] text-white px-2 py-0.5 rounded-full">{actieNietVerwerkt.length}</span>
                          </div>
                          {actieNietVerwerkt.map(item => <ActieRij key={item.id} item={item} ernst={3} />)}
                        </div>
                      )}

                      {actieTeLaat.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2.5 px-5 py-2.5 bg-[#FAF8F5] border-b border-t border-[#EFEBE4] text-[#991A21]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                              <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
                            </svg>
                            <span className="text-[12px] font-semibold uppercase tracking-[0.04em]">Uitnodiging te laat</span>
                            <span className="ml-auto text-[11.5px] font-semibold bg-[#F6ECEC] text-[#991A21] px-2 py-0.5 rounded-full">{actieTeLaat.length}</span>
                          </div>
                          {actieTeLaat.map(item => <ActieRij key={item.id} item={item} ernst={2} />)}
                        </div>
                      )}

                      {actieNadert.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2.5 px-5 py-2.5 bg-[#FAF8F5] border-b border-t border-[#EFEBE4] text-[#B07414]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                            </svg>
                            <span className="text-[12px] font-semibold uppercase tracking-[0.04em]">Deadline nadert</span>
                            <span className="ml-auto text-[11.5px] font-semibold bg-[#F7EEDD] text-[#B07414] px-2 py-0.5 rounded-full">{actieNadert.length}</span>
                          </div>
                          {actieNadert.map(item => <ActieRij key={item.id} item={item} ernst={1} />)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Modulewidgets ──────────────────────────────────────
              Zichtbaarheid volgt exact de navigatie: heb je toegang tot een
              module, dan staat de kaart er. Geen namen, geen uitzonderingen —
              rechten komen uit user_roles. */}
          {toonModuleWidgets && (
            <div className="space-y-5">

              {/* ── Organisatie-overzicht (admin / hoofd_admin) ── */}
              {heeftAdminToegang && (
                <WidgetKaart
                  titel="Organisatie-overzicht"
                  sub={orgStats ? `${orgStats.beheerdersMetData} van ${orgStats.beheerdersTotaal} beheerders met data` : null}
                  naar="admin"
                  knopTekst="Admin Dashboard"
                >
                  {adminStatus === "laden" && <WidgetLaden tekst={`Gegevens van ${beheerderList.length} beheerders ophalen…`} />}
                  {adminStatus === "fout" && <WidgetFout tekst="De organisatiecijfers konden niet worden opgehaald. Open het Admin Dashboard om het opnieuw te proberen." />}
                  {adminStatus === "klaar" && orgStats && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-4">
                        <MiniKpi val={orgStats.totaal} label="VvE's totaal" />
                        <MiniKpi val={orgStats.afgerond} label="Afgerond" kleur="#3B7A57" />
                        <MiniKpi val={orgStats.achterstand} label="Achterstand" kleur="#991A21" tint={orgStats.achterstand > 0 ? "#F6ECEC" : undefined} rand={orgStats.achterstand > 0 ? "#E3C9C9" : undefined} />
                        <MiniKpi val={orgStats.tekomen} label="Aankomend" kleur="#6B6560" />
                        <MiniKpi val={orgStats.nietGepland} label="Niet gepland" kleur="#9B958E" />
                      </div>

                      {/* Gesegmenteerde balk — telt exact op tot het totaal */}
                      {orgStats.totaal > 0 && (
                        <>
                          <div className="flex h-3 gap-[3px] mb-2.5">
                            {orgStats.afgerond > 0 && <span className="rounded-[3px] bg-[#3B7A57]" style={{flex: orgStats.afgerond}} />}
                            {orgStats.achterstand > 0 && <span className="rounded-[3px] bg-[#C4565C]" style={{flex: orgStats.achterstand}} />}
                            {orgStats.tekomen > 0 && <span className="rounded-[3px] bg-[#9B958E]" style={{flex: orgStats.tekomen}} />}
                            {orgStats.nietGepland > 0 && <span className="rounded-[3px] bg-[#E7E2DB]" style={{flex: orgStats.nietGepland}} />}
                          </div>
                          {orgStats.pctVerwerkt !== null && (
                            <p className="text-[12.5px] text-[#6B6560]">
                              <b className="font-semibold text-[#2D2D2D]">{orgStats.pctVerwerkt}%</b> van de verstreken vergaderingen is verwerkt
                            </p>
                          )}
                        </>
                      )}

                      {/* Signalen die actie vragen — apart, tellen niet op bij de KPI's */}
                      {(orgStats.uitnodigingUrgent > 0 || orgStats.nooitIngelogd > 0 || orgStats.inactief > 0) && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#EFEBE4]">
                          {orgStats.uitnodigingUrgent > 0 && (
                            <span className="text-[12px] font-semibold px-2.5 py-1 rounded-lg" style={{backgroundColor:"#FBF3E7", color:"#B07414"}}>
                              {orgStats.uitnodigingUrgent} uitnodiging{orgStats.uitnodigingUrgent === 1 ? "" : "en"} urgent
                            </span>
                          )}
                          {orgStats.nooitIngelogd > 0 && (
                            <span className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-[#F6ECEC] text-[#991A21]">
                              {orgStats.nooitIngelogd} nooit ingelogd
                            </span>
                          )}
                          {orgStats.inactief > 0 && (
                            <span className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-[#FAF8F5] text-[#6B6560]">
                              {orgStats.inactief} inactief (10+ dagen)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Wie de meeste achterstand heeft — zelfde triagevolgorde als het Admin Dashboard */}
                      {orgStats.drukste.some(r => r.stats.achterstand > 0) && (
                        <div className="mt-4 pt-4 border-t border-[#EFEBE4]">
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E] mb-2.5">Meeste achterstand</p>
                          <div className="space-y-1.5">
                            {orgStats.drukste.filter(r => r.stats.achterstand > 0).map(r => (
                              <div key={r.naam} className="flex items-center gap-3 text-[12.5px]">
                                <span className="font-semibold text-[#2D2D2D] truncate">{r.naam}</span>
                                <span className="ml-auto shrink-0 tabular-nums text-[#991A21] font-semibold">{r.stats.achterstand}</span>
                                <span className="shrink-0 text-[#9B958E]">van {r.stats.total}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </WidgetKaart>
              )}

              {/* ── LOD Beheer ── */}
              {heeftLodToegang && lodStats && (
                <WidgetKaart
                  titel="LOD Beheer"
                  sub={lodStats.totaal > 0 ? `${lodStats.actief} van ${lodStats.totaal} actief` : null}
                  naar="lod"
                  knopTekst="Naar LOD"
                >
                  {lodStats.totaal === 0 ? (
                    <p className="text-[13px] text-[#9B958E]">Geen LOD-dossiers geregistreerd.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                        <MiniKpi val={lodStats.actief} label="Actief" />
                        <MiniKpi val={lodStats.overschreden} label="Deadline verstreken" kleur="#991A21" tint={lodStats.overschreden > 0 ? "#F6ECEC" : undefined} rand={lodStats.overschreden > 0 ? "#E3C9C9" : undefined} />
                        <MiniKpi val={lodStats.urgent} label="Binnen 14 dagen" kleur="#B07414" tint={lodStats.urgent > 0 ? "#FBF3E7" : undefined} rand={lodStats.urgent > 0 ? "#E8D3AC" : undefined} />
                        <MiniKpi val={lodStats.wachtVve} label="Wacht op VvE" kleur="#6B6560" />
                      </div>

                      {lodStats.komend.length > 0 && (
                        <div className="pt-4 border-t border-[#EFEBE4]">
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E] mb-2.5">Eerstvolgende deadlines</p>
                          <div className="space-y-2">
                            {lodStats.komend.slice(0, 4).map(l => (
                              <div key={l.id} className="flex items-center gap-3 text-[12.5px]">
                                <span
                                  className="w-[9px] h-[9px] rounded-full shrink-0 border-2 bg-white"
                                  style={{ borderColor: l.dagen < 0 ? "#991A21" : l.dagen <= 14 ? "#B07414" : "#C9BEB2" }}
                                />
                                <span className="font-semibold text-[#2D2D2D] truncate">{l.vveNaam}</span>
                                <span className="text-[#9B958E] shrink-0 hidden md:inline truncate">— {l.statusLabel}</span>
                                {l.uitstel && (
                                  <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{backgroundColor:"#FBF3E7", color:"#B07414"}}>uitstel</span>
                                )}
                                <span className="ml-auto shrink-0 text-right whitespace-nowrap">
                                  <span className="text-[#3f3d3b] tabular-nums">{fmtDate(l.deadline)}</span>
                                  <span className={l.dagen < 0 ? "text-[#991A21] font-semibold" : "text-[#9B958E]"}> · {deadlineTekst(l.dagen)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {lodStats.boeteRisico > 0 && (
                        <div className="flex justify-between text-[12.5px] pt-3.5 mt-3.5 border-t border-[#EFEBE4]">
                          <span className="text-[#6B6560]">Maximale dwangsom op actieve dossiers</span>
                          <b className="font-semibold text-[#2D2D2D] tabular-nums">
                            € {lodStats.boeteRisico.toLocaleString('nl-NL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </b>
                        </div>
                      )}
                    </>
                  )}
                </WidgetKaart>
              )}

              {/* ── Verduurzaming & Subsidies ── */}
              {heeftVerduurzamingToegang && (
                <WidgetKaart
                  titel="Verduurzaming & Subsidies"
                  sub={vdStats ? `${vdStats.actief} van ${vdStats.totaal} dossiers actief` : null}
                  naar="verduurzaming"
                  knopTekst="Naar Verduurzaming"
                >
                  {vdStatus === "laden" && <WidgetLaden tekst="Dossiers ophalen…" />}
                  {vdStatus === "fout" && <WidgetFout tekst="De dossiers konden niet worden opgehaald. Open de module om het opnieuw te proberen." />}
                  {vdStatus === "klaar" && vdStats && (
                    vdStats.totaal === 0 ? (
                      <p className="text-[13px] text-[#9B958E]">Geen dossiers geregistreerd.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                          <MiniKpi val={vdStats.actief} label="Actieve dossiers" />
                          <MiniKpi val={vdStats.acties} label="Openstaande acties" kleur={vdStats.acties > 0 ? "#991A21" : "#2D2D2D"} tint={vdStats.acties > 0 ? "#F6ECEC" : undefined} rand={vdStats.acties > 0 ? "#E3C9C9" : undefined} />
                          <MiniKpi val={vdStats.opvolgenNu} label="Opvolgen vandaag" kleur="#B07414" tint={vdStats.opvolgenNu > 0 ? "#FBF3E7" : undefined} rand={vdStats.opvolgenNu > 0 ? "#E8D3AC" : undefined} />
                          <MiniKpi val={vdStats.afgerond} label="Afgerond" kleur="#3B7A57" />
                        </div>

                        <div className="pt-4 border-t border-[#EFEBE4]">
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E] mb-2.5">Actieve trajecten</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-[12.5px] px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#EFEBE4] text-[#6B6560]">
                              <b className="font-semibold text-[#2D2D2D]">{vdStats.perTraject.procesbegeleiding}</b> Lening
                            </span>
                            <span className="text-[12.5px] px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#EFEBE4] text-[#6B6560]">
                              <b className="font-semibold text-[#2D2D2D]">{vdStats.perTraject.subsidie}</b> Subsidie
                            </span>
                            <span className="text-[12.5px] px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#EFEBE4] text-[#6B6560]">
                              <b className="font-semibold text-[#2D2D2D]">{vdStats.perTraject.isolatie}</b> Isolatie
                            </span>
                            {vdStats.deadlineNabij > 0 && (
                              <span className="text-[12.5px] px-2.5 py-1 rounded-lg font-semibold" style={{backgroundColor:"#FBF3E7", color:"#B07414"}}>
                                {vdStats.deadlineNabij} subsidiedeadline{vdStats.deadlineNabij === 1 ? "" : "s"} binnen 14 dagen
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Eigen dossiers — alleen tonen als de naam ergens als beheerder staat */}
                        {vdStats.eigen !== null && vdStats.eigen > 0 && (
                          <div className="flex justify-between text-[12.5px] pt-3.5 mt-3.5 border-t border-[#EFEBE4]">
                            <span className="text-[#6B6560]">Op jouw naam</span>
                            <span className="text-[#2D2D2D]">
                              <b className="font-semibold">{vdStats.eigen}</b> {vdStats.eigen === 1 ? "dossier" : "dossiers"}
                              {vdStats.eigenActies > 0 && <span className="text-[#991A21] font-semibold"> · {vdStats.eigenActies} {vdStats.eigenActies === 1 ? "actie" : "acties"}</span>}
                            </span>
                          </div>
                        )}
                      </>
                    )
                  )}
                </WidgetKaart>
              )}

            </div>
          )}

        </div>
    );
  }

  // Safety: vergaderplanner is de enige resterende screen
  if (screen !== "vergaderingen") return null;

  // LOD koppeling: actieve LODs voor vergaderplanner notitie
  const activeLods = appLods.filter(l=>l.status!=='afgerond');
  const vveHeeftLod = (vveNaam) => activeLods.some(l =>
    l.vveNaam && vveNaam && l.vveNaam.toLowerCase().includes(vveNaam.toLowerCase().trim().substring(0,8))
  );
  const getVveLodInfo = (vveNaam) => activeLods.filter(l =>
    l.vveNaam && vveNaam && l.vveNaam.toLowerCase().includes(vveNaam.toLowerCase().trim().substring(0,8))
  );

  // Main screen
  return metShell(
    <div className={`min-h-screen ${t.bg} ${t.text}`}>
      <Toast />
      <style>{CSS_FONT}</style>
<div className="sticky top-0 z-40">

        {/* ── Modulekop ─────────────────────────────────────────── */}
        <div className="bg-white border-b border-[#E7E2DB] px-7 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-[3px] h-[16px] rounded-sm bg-[#991A21]" />
            <h1 className="text-[15px] font-semibold text-[#2D2D2D]">Vergaderplanner</h1>
            <span className="text-[12.5px] text-[#9B958E] tabular-nums">· {data.vves.length} VvE{data.vves.length === 1 ? "" : "'s"}</span>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1.5 text-[12px] text-[#9B958E] mr-1">
                <span className="w-[6px] h-[6px] rounded-full bg-[#B07414] animate-pulse" />
                Opslaan…
              </span>
            )}
            <button onClick={exportExcel} className="flex items-center gap-2 text-[13px] font-semibold px-5 h-10 rounded-lg border border-[#E7E2DB] text-[#6B6560] hover:text-[#991A21] hover:border-[#C9BEB2] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
              Excel
            </button>
            <button onClick={exportPDF} className="flex items-center gap-2 text-[13px] font-semibold px-5 h-10 rounded-lg border border-[#E7E2DB] text-[#6B6560] hover:text-[#991A21] hover:border-[#C9BEB2] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
              PDF
            </button>
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="bg-white border-b border-[#E7E2DB] px-7 flex gap-1">
          {[["vergaderingen","Vergaderingen"],["overzicht","Spreiding"],["vakantie","Vakantie"],["instellingen","Instellingen"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)}
              className={`px-4 py-3 text-[13.5px] border-b-2 -mb-px transition-colors ${
                tab===key ? "border-[#991A21] text-[#991A21] font-semibold" : "border-transparent text-[#6B6560] font-medium hover:text-[#2D2D2D]"
              }`}>{label}</button>
          ))}
        </div>

      </div>
      <div className="p-6 max-w-[1440px] mx-auto">

{/* Jaarwisseling prompt */}
        {toonJaarwisselingPrompt && (
          <div className="mb-5 bg-white border border-[#E7E2DB] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#EFEBE4]">
              <span className="w-[3px] h-[15px] rounded-sm bg-[#B07414]" />
              <p className="text-[14px] font-semibold text-[#2D2D2D]">Nieuw jaar — planning vernieuwen?</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-[13px] text-[#6B6560] leading-relaxed">
                De planning bevat nog vergaderingen van vorig jaar. Je kunt het overzicht opschonen voor {new Date().getFullYear()}. VvE's met een voorkeursdatum worden automatisch ingepland.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#FAF8F5] border border-[#EFEBE4] rounded-lg px-4 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#991A21] mb-1.5">Wordt gereset</p>
                  <p className="text-[12.5px] text-[#6B6560] leading-relaxed">Vergaderdatums, uitnodigingen, vergaderd-vinkjes, 2e reglementaire en extra vergaderingen.</p>
                </div>
                <div className="bg-[#FAF8F5] border border-[#EFEBE4] rounded-lg px-4 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#3B7A57] mb-1.5">Blijft bewaard</p>
                  <p className="text-[12.5px] text-[#6B6560] leading-relaxed">VvE-namen, notities, vakantieperiodes, werkdagen. Voorkeursdatums worden de nieuwe vergaderdatum.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleJaarwisselingBevestigen}
                  className="px-4 h-10 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13px] font-semibold rounded-lg transition-colors">
                  Vernieuw planning voor {new Date().getFullYear()}
                </button>
                <button onClick={() => setToonJaarwisselingPrompt(false)}
                  className="px-4 h-10 bg-white hover:bg-[#FAF8F5] text-[#6B6560] border border-[#E7E2DB] text-[13px] font-medium rounded-lg transition-colors">
                  Niet nu
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── VERGADERINGEN ── */}
{tab==="vergaderingen" && (
          <div className="space-y-4">

            {/* ── Filters ─────────────────────────────────────────── */}
            {data.vves.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {[
                  [null,               "Alle",             data.vves.length, "#2D2D2D"],
                  ["actie",            "Actie vereist",    vvesMetActie,     "#991A21"],
                  ["niet-uitgenodigd", "Niet uitgenodigd", nietUitgenodigd,  "#C9BEB2"],
                  ["uitgenodigd",      "Uitgenodigd",      uitgenodigd,      "#9B958E"],
                  ["afgerond",         "Afgerond",         afgerond,         "#3B7A57"],
                  ["vakantie",         "In vakantie",      inVakantie,       "#B07414"],
                ].map(([key, label, aantal, kleur]) => {
                  if (key && aantal === 0) return null;
                  const actief = statFilter === key;
                  return (
                    <button
                      key={label}
                      onClick={() => setStatFilter(actief ? null : key)}
                      className={`flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] transition-colors ${
                        actief
                          ? "bg-[#F6ECEC] border-[#991A21] text-[#991A21] font-semibold"
                          : "bg-white border-[#E7E2DB] text-[#6B6560] font-medium hover:border-[#C9BEB2] hover:text-[#2D2D2D]"
                      }`}
                    >
                      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{background: kleur}} />
                      {label}
                      <span className="tabular-nums text-[#9B958E]">{aantal}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-5 items-start">

              {/* ── Linkerkolom ───────────────────────────────────── */}
              {data.vves.length > 0 && (
                <div className="w-full lg:w-[272px] lg:shrink-0 lg:sticky lg:top-[125px] space-y-4">

                  {/* Deze week */}
                  {(() => {
                    const pad = (n) => String(n).padStart(2, "0");
                    const isoLok = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
                    const nu = new Date();
                    const startWeek = new Date(nu);
                    startWeek.setDate(nu.getDate() - ((nu.getDay() + 6) % 7));
                    const eindWeek = new Date(startWeek);
                    eindWeek.setDate(startWeek.getDate() + 6);
                    const isoStart = isoLok(startWeek);
                    const isoEind = isoLok(eindWeek);
                    const dezeWeek = data.vves.flatMap(v => {
                      const items = [];
                      if (v.datum1 && v.datum1 >= isoStart && v.datum1 <= isoEind) items.push({ id: v.id, naam: v.naam, datum: v.datum1, soort: "1e vergadering" });
                      if (v.datum2 && v.datum2 >= isoStart && v.datum2 <= isoEind) items.push({ id: v.id, naam: v.naam, datum: v.datum2, soort: "2e reglementair" });
                      if (v.datumExtra && v.datumExtra >= isoStart && v.datumExtra <= isoEind) items.push({ id: v.id, naam: v.naam, datum: v.datumExtra, soort: "Extra vergadering" });
                      return items;
                    }).sort((a, b) => a.datum.localeCompare(b.datum));
                    return (
                      <div className="bg-white border border-[#E7E2DB] rounded-xl px-4 py-4">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E] mb-3">Deze week</p>
                        {dezeWeek.length === 0 ? (
                          <p className="text-[12.5px] text-[#9B958E]">Geen vergaderingen.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {dezeWeek.map((item, i) => (
                              <button key={i} onClick={() => setForceOpenId(item.id)} className="flex items-start gap-2.5 w-full text-left group">
                                <span className="text-[11px] tabular-nums text-[#9B958E] shrink-0 w-[44px] pt-px">{fmtDate(item.datum).split(" ").slice(0,2).join(" ")}</span>
                                <span className="min-w-0">
                                  <span className="block text-[12.5px] font-medium text-[#2D2D2D] truncate group-hover:text-[#991A21] transition-colors">{item.naam}</span>
                                  <span className="block text-[11px] text-[#9B958E]">{item.soort}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
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
                      <div className="bg-white border border-[#E7E2DB] rounded-xl px-4 py-4">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E] mb-2">Drukste maand</p>
                        <p className="text-[15px] font-semibold text-[#2D2D2D]">{NL_MONTHS_FULL[parseInt(maandIdx)]}</p>
                        <p className="text-[12px] text-[#6B6560] mt-0.5 tabular-nums">{aantal} vergadering{aantal !== 1 ? "en" : ""} gepland</p>
                      </div>
                    );
                  })()}

                  {/* Maandfilter */}
                  {(maandenMetVves2026.length > 0 || maandenMetVves2027.length > 0) && (
                    <div className="bg-white border border-[#E7E2DB] rounded-xl px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E]">Filter op maand</p>
                        {geselecteerdeFilterMaanden.size > 0 && (
                          <button onClick={() => setGeselecteerdeFilterMaanden(new Set())}
                            className="text-[11px] font-semibold text-[#991A21] hover:underline shrink-0">
                            Wis ({geselecteerdeFilterMaanden.size})
                          </button>
                        )}
                      </div>

                      {maandenMetVves2026.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-[#6B6560]">{year}</p>
                          <div className="flex flex-wrap gap-1">
                            {maandenMetVves2026.map(({ key, label, count }) => {
                              const actief = geselecteerdeFilterMaanden.has(key);
                              return (
                                <button key={key} onClick={() => toggleFilterMaand(key)}
                                  className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                                    actief ? "bg-[#F6ECEC] border-[#991A21] text-[#991A21] font-semibold"
                                           : "bg-[#FAF8F5] border-[#EFEBE4] text-[#6B6560] hover:border-[#C9BEB2]"
                                  }`}>
                                  {label} <span className="tabular-nums text-[#9B958E]">{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="pt-3 border-t border-[#EFEBE4] space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                          const next = !filterJaar2027;
                          setFilterJaar2027(next);
                          if (!next) {
                            setGeselecteerdeFilterMaanden(prev => {
                              const updated = new Set(prev);
                              maandenMetVves2027.forEach(m => updated.delete(m.key));
                              return updated;
                            });
                          }
                        }}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${filterJaar2027 ? "bg-[#991A21] border-[#991A21]" : "bg-white border-[#C9BEB2] group-hover:border-[#991A21]"}`}>
                            {filterJaar2027 && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-[10px] h-[10px]"><path d="M20 6 9 17l-5-5"/></svg>}
                          </div>
                          <span className="text-[11.5px] text-[#6B6560] group-hover:text-[#2D2D2D] transition-colors">{nextYear} — voorkeursdatums</span>
                        </label>

                        {filterJaar2027 && (
                          maandenMetVves2027.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pl-6">
                              {maandenMetVves2027.map(({ key, label, count }) => {
                                const actief = geselecteerdeFilterMaanden.has(key);
                                return (
                                  <button key={key} onClick={() => toggleFilterMaand(key)}
                                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                                      actief ? "bg-[#EAF2EC] border-[#3B7A57] text-[#3B7A57] font-semibold"
                                             : "bg-[#FAF8F5] border-[#EFEBE4] text-[#6B6560] hover:border-[#C9BEB2]"
                                    }`}>
                                    {label} <span className="tabular-nums text-[#9B958E]">{count}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11.5px] text-[#9B958E] pl-6">Nog geen voorkeursdatums voor {nextYear}.</p>
                          )
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ── Rechterkolom: de lijst ────────────────────────── */}
              <div className="flex-1 min-w-0 w-full space-y-4">

{/* Voorgestelde planning */}
                {planningPreview && (
                  <div className="bg-white border border-[#4A6B8A] rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#EFEBE4] flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#2D2D2D]">Voorgestelde planning</p>
                        <p className="text-[12.5px] text-[#6B6560] mt-0.5">
                          {planningPreview.filter(v=>v.datum1).length - data.vves.filter(v=>v.datum1).length} VvE's automatisch ingepland. Controleer de datums en bevestig.
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={handleConfirmPlanning} className="px-4 h-9 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13px] font-semibold rounded-lg transition-colors">Bevestigen</button>
                        <button onClick={handleRejectPlanning} className="px-4 h-9 bg-white hover:bg-[#FAF8F5] text-[#6B6560] border border-[#E7E2DB] text-[13px] font-medium rounded-lg transition-colors">Annuleren</button>
                      </div>
                    </div>
                    <div className="px-5 py-4 bg-[#FAF8F5]">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#9B958E] mb-2">Spreiding na planning</p>
                      <MonthBar counts={spreadScore(planningPreview)} vakanties={data.vakanties}/>
                    </div>
                  </div>
                )}

                {/* Toevoegen / importeren / plannen */}
                <div className="flex gap-2 flex-wrap">
                  <input value={newVveName} onChange={e=>setNewVveName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVve()} placeholder="VvE naam toevoegen…"
                    className="flex-1 min-w-48 bg-white border border-[#E7E2DB] rounded-lg px-4 h-10 text-[13.5px] text-[#2D2D2D] placeholder-[#9B958E] focus:outline-none focus:border-[#991A21] transition-colors"/>
                  <button onClick={addVve} className="px-4 h-10 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13px] font-semibold rounded-lg transition-colors">Toevoegen</button>
                  <button onClick={()=>setShowImport(i=>!i)} className="px-4 h-10 bg-white hover:bg-[#FAF8F5] text-[#6B6560] border border-[#E7E2DB] text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap">Bulk import</button>
                  {ongepland > 0 && !planningPreview && (
                    <button onClick={handleGeneratePlanning}
                      className="flex items-center gap-2 px-4 h-10 bg-[#EAEFF4] hover:bg-[#DDE6EE] border border-[#C4D2DE] text-[#4A6B8A] text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                        <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
                      </svg>
                      Stel planning voor ({ongepland} ongepland)
                    </button>
                  )}
                </div>

                {showImport && (
                  <div className="bg-white border border-[#E7E2DB] rounded-xl p-5 space-y-3">
                    <p className="text-[12.5px] text-[#6B6560]">Plak VvE-namen, één per regel. Datum en tijd worden herkend als je ze tab-gescheiden aanlevert (naam ⇥ d-m-jjjj ⇥ tijd).</p>
                    <textarea rows={6} value={importText} onChange={e=>setImportText(e.target.value)}
                      placeholder={"Zwolsestraat 253\t16-4-2026\t15.00\nTak van Poortvlietstraat 9 AB\t1-6-2026\t15:00 uur\n..."}
                      className="w-full bg-[#FAF8F5] border border-[#E7E2DB] rounded-lg px-3 py-2.5 text-[13px] text-[#2D2D2D] placeholder-[#9B958E] focus:outline-none focus:border-[#991A21] resize-none font-mono transition-colors"/>
                    <div className="flex gap-2">
                      <button onClick={handleImport} className="px-4 h-9 bg-[#991A21] hover:bg-[#7A1419] text-white text-[13px] font-semibold rounded-lg transition-colors">Importeer</button>
                      <button onClick={()=>setShowImport(false)} className="px-4 h-9 text-[13px] font-medium text-[#6B6560] hover:text-[#2D2D2D] transition-colors">Annuleer</button>
                    </div>
                  </div>
                )}

                {/* Zoeken / sorteren / verbergen */}
                <div className="flex gap-2 items-center flex-wrap">
                  {data.vves.length>5 && (
                    <div className="relative flex-1 min-w-48">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px] absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9B958E] pointer-events-none">
                        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
                      </svg>
                      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek VvE…"
                        className="w-full bg-white border border-[#E7E2DB] rounded-lg pl-10 pr-4 h-10 text-[13.5px] text-[#2D2D2D] placeholder-[#9B958E] focus:outline-none focus:border-[#991A21] transition-colors"/>
                    </div>
                  )}
                  <button onClick={handleSorteer} title="Sorteer VvE's op vergaderdatum. VvE's met voorkeursdatum volgend jaar komen onderaan."
                    className="flex items-center gap-2 px-3.5 h-10 bg-white hover:bg-[#FAF8F5] border border-[#E7E2DB] text-[#6B6560] hover:text-[#2D2D2D] text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                      <path d="M7 3v18M3 7l4-4 4 4M17 21V3M13 17l4 4 4-4"/>
                    </svg>
                    Sorteer
                  </button>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 group px-1" onClick={()=>setHideAfgerond(h=>!h)}>
                    <div className={`w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors ${hideAfgerond?"bg-[#991A21] border-[#991A21]":"bg-white border-[#C9BEB2] group-hover:border-[#991A21]"}`}>
                      {hideAfgerond && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-[11px] h-[11px]"><path d="M20 6 9 17l-5-5"/></svg>}
                    </div>
                    <span className="text-[12.5px] text-[#6B6560] group-hover:text-[#2D2D2D] transition-colors whitespace-nowrap">
                      Verberg afgerond {afgerond > 0 && <span className="text-[#9B958E] tabular-nums">({afgerond})</span>}
                    </span>
                  </label>
                </div>

                {/* Selectie */}
                {filtered.length > 0 && (
                  <div className="flex items-center gap-3 px-4 h-11 bg-white border border-[#E7E2DB] rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer group" onClick={()=> selectie.size === filtered.length ? deselecteerAlles() : selecteerAlles()}>
                      <div className={`w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors ${
                        selectie.size === filtered.length && filtered.length > 0 ? "bg-[#991A21] border-[#991A21]"
                        : selectie.size > 0 ? "bg-white border-[#991A21]"
                        : "bg-white border-[#C9BEB2] group-hover:border-[#991A21]"}`}>
                        {selectie.size === filtered.length && filtered.length > 0 && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-[11px] h-[11px]"><path d="M20 6 9 17l-5-5"/></svg>}
                        {selectie.size > 0 && selectie.size < filtered.length && <span className="w-[8px] h-[2px] rounded-sm bg-[#991A21]" />}
                      </div>
                      <span className="text-[12.5px] text-[#6B6560] group-hover:text-[#2D2D2D] transition-colors">
                        {selectie.size === 0 ? "Selecteer alles" : selectie.size === filtered.length ? "Alles geselecteerd" : `${selectie.size} geselecteerd`}
                      </span>
                    </label>
                    {selectie.size > 0 && (
                      <button onClick={verwijderSelectie} className="ml-auto px-3 h-8 bg-[#F6ECEC] hover:bg-[#EFDCDC] border border-[#E3C9C9] text-[#991A21] text-[12.5px] font-semibold rounded-lg transition-colors">
                        Verwijder {selectie.size} VvE{selectie.size > 1 ? "'s" : ""}
                      </button>
                    )}
                  </div>
                )}

                {loading && <p className="text-[13px] text-[#9B958E] text-center py-10">Laden…</p>}

                {!loading && filtered.length===0 && (
                  <div className="bg-white border border-[#E7E2DB] rounded-xl px-6 py-12 text-center">
                    <p className="text-[13.5px] font-semibold text-[#2D2D2D]">
                      {data.vves.length===0 ? "Nog geen VvE's"
                        : hideAfgerond && afgerond===data.vves.length ? "Alle VvE's zijn afgerond"
                        : "Geen resultaten"}
                    </p>
                    <p className="text-[12.5px] text-[#6B6560] mt-1">
                      {data.vves.length===0 ? "Voeg er hierboven een toe, of gebruik Bulk import."
                        : hideAfgerond && afgerond===data.vves.length ? "Zet ‘Verberg afgerond’ uit om ze te tonen."
                        : statFilter ? "Geen VvE's in dit filter."
                        : geselecteerdeFilterMaanden.size > 0 ? "Geen VvE's in de geselecteerde maanden."
                        : "Pas je zoekopdracht aan."}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {filtered.map(vve=>(
                    <div key={vve.id} className="flex items-center gap-2">
                      <div
                        onClick={()=>toggleSelectie(vve.id)}
                        className={`w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${selectie.has(vve.id)?"bg-[#991A21] border-[#991A21]":"bg-white border-[#C9BEB2] hover:border-[#991A21]"}`}
                      >
                        {selectie.has(vve.id) && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-[11px] h-[11px]"><path d="M20 6 9 17l-5-5"/></svg>}
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
