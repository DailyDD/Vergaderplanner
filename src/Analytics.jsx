import React from "react";

export function initAnalyticsDeps({ sbFetch }) {
  console.log("initAnalyticsDeps aangeroepen, sbFetch =", typeof sbFetch);
}

export default function Analytics({ onTerug }) {
  console.log("Analytics component rendert");
  return (
    <div style={{ padding: 40, background: "#F2EFEC", minHeight: "100vh" }}>
      <button onClick={onTerug}>Terug</button>
      <h1>TESTPAGINA — als je dit ziet werkt de routing.</h1>
    </div>
  );
}
