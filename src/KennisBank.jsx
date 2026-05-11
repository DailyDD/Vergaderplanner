import React, { useState, useRef, useEffect } from "react";
import { KENNISBANK } from "./kennisbank_data";

const CSS_FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
* { font-family: 'DM Sans', sans-serif !important; }`;

// Nederlandse stopwoorden die we negeren bij matching
const STOPWOORDEN = new Set([
  "de","het","een","en","of","maar","want","dus","noch","is","zijn","was","werd",
  "heeft","hebben","had","hadden","kan","kunnen","mag","mogen","moet","moeten",
  "zal","zullen","zou","zouden","wordt","worden","dat","dit","die","deze","er",
  "op","in","aan","bij","van","voor","met","uit","als","naar","om","door","over",
  "onder","boven","na","voor","tot","te","niet","ook","al","wel","geen","nog",
  "al","dan","toch","zo","meer","meer","veel","weinig","hoe","wat","wie","waar",
  "wanneer","waarom","welke","welk","eigen","ik","je","jij","hij","zij","we","ze",
  "u","uw","mijn","jouw","zijn","haar","ons","hun","mij","hem","hen","per",
]);

// Normaliseer een string: lowercase, verwijder leestekens, splits in woorden
function normaliseer(tekst) {
  return tekst
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWOORDEN.has(w));
}

// Bereken score: hoeveel zoekwoorden zitten in vraag+antwoord
function berekenScore(zoekWoorden, item) {
  if (zoekWoorden.length === 0) return 0;
  const vraagWoorden = normaliseer(item.v);
  const antwoordWoorden = normaliseer(item.a);

  let score = 0;
  for (const zw of zoekWoorden) {
    // Exacte match in vraag = hoogste score
    if (vraagWoorden.some(w => w === zw)) score += 3;
    // Gedeeltelijke match in vraag (zw zit in woord of woord zit in zw)
    else if (vraagWoorden.some(w => w.includes(zw) || zw.includes(w))) score += 2;
    // Match in antwoord
    else if (antwoordWoorden.some(w => w === zw)) score += 1;
    else if (antwoordWoorden.some(w => w.includes(zw) || zw.includes(w))) score += 0.5;
  }
  return score;
}

function zoek(vraag) {
  const woorden = normaliseer(vraag);
  if (woorden.length === 0) return [];

  const gescoord = KENNISBANK.map(item => ({
    item,
    score: berekenScore(woorden, item),
  })).filter(r => r.score > 0);

  gescoord.sort((a, b) => b.score - a.score);
  return gescoord.slice(0, 8).map(r => r.item);
}

// Highlight zoekwoorden in tekst
function Highlight({ tekst, zoekWoorden }) {
  if (!zoekWoorden || zoekWoorden.length === 0) return <span>{tekst}</span>;
  const regex = new RegExp(`(${zoekWoorden.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const delen = tekst.split(regex);
  return (
    <span>
      {delen.map((deel, i) =>
        regex.test(deel)
          ? <mark key={i} style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 2, padding: "0 2px" }}>{deel}</mark>
          : <span key={i}>{deel}</span>
      )}
    </span>
  );
}

function ResultaatKaart({ item, index, zoekWoorden, open, onToggle }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1.5px solid ${open ? "#991A21" : "#E5E0DB"}`,
        borderRadius: 12,
        marginBottom: 8,
        overflow: "hidden",
        transition: "border-color .15s",
        boxShadow: open ? "0 2px 12px rgba(153,26,33,.08)" : "none",
      }}
    >
      {/* Vraag — klikbaar */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Nummer badge */}
        <span style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: open ? "#991A21" : "#F2EFEC",
          color: open ? "#fff" : "#8A7E7B",
          fontSize: 10,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
          transition: "all .15s",
        }}>
          {index + 1}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#2D2D2D", lineHeight: 1.5 }}>
          <Highlight tekst={item.v} zoekWoorden={zoekWoorden} />
        </span>
        <span style={{
          flexShrink: 0,
          fontSize: 14,
          color: open ? "#991A21" : "#8A7E7B",
          fontWeight: 700,
          marginTop: 1,
          transition: "transform .15s",
          transform: open ? "rotate(180deg)" : "none",
        }}>▾</span>
      </button>

      {/* Antwoord — uitklapbaar */}
      {open && (
        <div style={{
          padding: "0 16px 16px 50px",
          borderTop: "1px solid #F2EFEC",
          paddingTop: 12,
        }}>
          <p style={{ fontSize: 13, color: "#4B4541", lineHeight: 1.65 }}>
            <Highlight tekst={item.a} zoekWoorden={zoekWoorden} />
          </p>
        </div>
      )}
    </div>
  );
}

export default function KennisBank({ onTerug }) {
  const [invoer, setInvoer] = useState("");
  const [resultaten, setResultaten] = useState([]);
  const [gezochtNaar, setGezochtNaar] = useState("");
  const [gezocht, setGezocht] = useState(false);
  const [openIndex, setOpenIndex] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const voerZoekUit = () => {
    if (!invoer.trim()) return;
    const res = zoek(invoer.trim());
    setResultaten(res);
    setGezochtNaar(invoer.trim());
    setGezocht(true);
    setOpenIndex(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") voerZoekUit();
  };

  const reset = () => {
    setInvoer("");
    setResultaten([]);
    setGezocht(false);
    setGezochtNaar("");
    setOpenIndex(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const zoekWoorden = normaliseer(gezochtNaar);
  const geenResultaten = gezocht && resultaten.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F2EFEC" }}>
      <style>{CSS_FONT}</style>

      {/* Topbar */}
      <div style={{
        borderBottom: "1px solid #E5E0DB",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <div style={{ width: 28, height: 28, background: "#991A21", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13 }}>💡</span>
            </div>
            <div style={{ width: 28, height: 28, background: "#2D2D2D", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13 }}>📚</span>
            </div>
          </div>
          <div style={{ width: 1, height: 20, background: "#E5E0DB" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#2D2D2D" }}>Kennisbank VvE Beheer</span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            background: "#F2EFEC",
            color: "#8A7E7B",
            border: "1px solid #E5E0DB",
          }}>{KENNISBANK.length} vragen</span>
        </div>
        <button
          onClick={onTerug}
          style={{
            fontSize: 12,
            padding: "6px 14px",
            background: "#fff",
            border: "1px solid #E5E0DB",
            borderRadius: 8,
            color: "#6B6662",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ← Terug naar portaal
        </button>
      </div>

      {/* Hoofdinhoud */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Begroeting + zoekveld */}
        <div style={{
          background: "#fff",
          border: "1.5px solid #E5E0DB",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 2px 12px rgba(0,0,0,.05)",
          marginBottom: 28,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44,
              height: 44,
              background: "#991A21",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}>💡</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "#2D2D2D", margin: 0 }}>Hoi, wat is je vraag?</h1>
              <p style={{ fontSize: 12, color: "#8A7E7B", margin: "3px 0 0" }}>
                Typ één of meer woorden — ik zoek de best passende vragen en antwoorden.
              </p>
            </div>
          </div>

          {/* Zoekinput + knop */}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              ref={inputRef}
              type="text"
              value={invoer}
              onChange={e => setInvoer(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="bijv. opstalverzekering, ALV vergadering, splitsingsakte…"
              style={{
                flex: 1,
                padding: "11px 16px",
                border: "1.5px solid #E5E0DB",
                borderRadius: 10,
                fontSize: 14,
                color: "#2D2D2D",
                background: "#FAF7F2",
                outline: "none",
                transition: "border-color .15s",
              }}
              onFocus={e => e.target.style.borderColor = "#991A21"}
              onBlur={e => e.target.style.borderColor = "#E5E0DB"}
            />
            <button
              onClick={voerZoekUit}
              disabled={!invoer.trim()}
              style={{
                padding: "11px 22px",
                background: invoer.trim() ? "#991A21" : "#E5E0DB",
                color: invoer.trim() ? "#fff" : "#8A7E7B",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: invoer.trim() ? "pointer" : "not-allowed",
                transition: "all .15s",
                whiteSpace: "nowrap",
              }}
            >
              Zoeken →
            </button>
          </div>

          {/* Tip */}
          {!gezocht && (
            <p style={{ fontSize: 11, color: "#8A7E7B", marginTop: 10, marginBottom: 0 }}>
              💡 Tip: begin met één woord, voeg daarna meer woorden toe om de resultaten te verfijnen.
            </p>
          )}

          {/* Reset knop na zoekopdracht */}
          {gezocht && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#8A7E7B" }}>
                Gezocht op: <strong style={{ color: "#2D2D2D" }}>"{gezochtNaar}"</strong>
              </span>
              <button
                onClick={reset}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  background: "#F2EFEC",
                  border: "1px solid #E5E0DB",
                  borderRadius: 6,
                  color: "#6B6662",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                ✕ Wissen
              </button>
            </div>
          )}
        </div>

        {/* Resultaten */}
        {gezocht && resultaten.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#8A7E7B", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                {resultaten.length} resultaten gevonden
              </p>
              <p style={{ fontSize: 11, color: "#8A7E7B", margin: 0 }}>Klik op een vraag om het antwoord te zien</p>
            </div>
            {resultaten.map((item, i) => (
              <ResultaatKaart
                key={i}
                item={item}
                index={i}
                zoekWoorden={zoekWoorden}
                open={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        )}

        {/* Geen resultaten */}
        {geenResultaten && (
          <div style={{
            background: "#fff",
            border: "1.5px solid #E5E0DB",
            borderRadius: 16,
            padding: "36px 28px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,.04)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#2D2D2D", marginBottom: 8 }}>
              Geen resultaat gevonden
            </h2>
            <p style={{ fontSize: 13, color: "#8A7E7B", lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px" }}>
              We hebben geen passend antwoord gevonden op <strong>"{gezochtNaar}"</strong>.
              Geef het door aan de beheerder, dan zal dit antwoord worden uitgewerkt en toegevoegd aan de kennisbank.
            </p>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              background: "#FEF3C7",
              border: "1px solid #FDE68A",
              borderRadius: 10,
              fontSize: 12,
              color: "#92400E",
              fontWeight: 600,
            }}>
              <span>📌</span>
              Vraag wordt uitgewerkt en toegevoegd aan de kennisbank
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                onClick={reset}
                style={{
                  fontSize: 12,
                  padding: "8px 18px",
                  background: "#F2EFEC",
                  border: "1px solid #E5E0DB",
                  borderRadius: 8,
                  color: "#6B6662",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Andere vraag stellen
              </button>
            </div>
          </div>
        )}

        {/* Lege staat — geen zoekopdracht */}
        {!gezocht && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { emoji: "🏗️", label: "Verzekeringen", voorbeeld: "opstalverzekering" },
              { emoji: "📋", label: "Vergadering & ALV", voorbeeld: "ALV vergadering" },
              { emoji: "💶", label: "Financiën & bijdragen", voorbeeld: "servicekosten bijdrage" },
              { emoji: "📄", label: "Splitsingsakte", voorbeeld: "splitsingsakte reglement" },
            ].map(({ emoji, label, voorbeeld }) => (
              <button
                key={label}
                onClick={() => { setInvoer(voorbeeld); setTimeout(() => { const res = zoek(voorbeeld); setResultaten(res); setGezochtNaar(voorbeeld); setGezocht(true); setOpenIndex(null); }, 10); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  background: "#fff",
                  border: "1.5px solid #E5E0DB",
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color .15s",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#991A21"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#E5E0DB"}
              >
                <span style={{ fontSize: 22 }}>{emoji}</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#2D2D2D", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 10, color: "#8A7E7B", margin: "2px 0 0" }}>bijv. "{voorbeeld}"</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
