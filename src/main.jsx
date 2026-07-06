import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Vangt render-crashes op die verder in de boom optreden (bijv. een
// onverwachte fout in een module) en toont een nette fallback in plaats
// van een wit scherm. Vangt GEEN fouten in event handlers of async code —
// dat blijft losstaand afgehandeld (bijv. de bestaande toast-meldingen).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { heeftFout: false };
  }

  static getDerivedStateFromError() {
    return { heeftFout: true };
  }

  componentDidCatch(error, info) {
    // Zichtbaar in de browserconsole voor nu; logging naar Supabase of een
    // externe service is een vervolgstap (zie backlog).
    console.error("Onverwachte fout opgevangen door ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.heeftFout) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            backgroundColor: "#F2EFEC",
            fontFamily: "'DM Sans', sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px" }}>⚠️</div>
          <h1 style={{ color: "#2D2D2D", fontSize: "18px", fontWeight: 700, margin: 0 }}>
            Er is iets misgegaan
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px", maxWidth: "360px", margin: 0 }}>
            Er is een onverwachte fout opgetreden. Je gegevens zijn niet aangetast — herlaad de pagina om verder te gaan.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: "#991A21",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Pagina herladen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
