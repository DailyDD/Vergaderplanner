// Supabase Edge Function: herschrijf-mail
// Herschrijft inkomende e-mailcorrespondentie naar professionele uitgaande mail
// via de Anthropic Claude API

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bouw dynamische stijlinstructies op basis van gekozen opties
function bouwStijlInstructies(stijlInstructies: string): string {
  return stijlInstructies || "Schrijf in een informele, toegankelijke toon. Gebruik een warme, vriendelijke schrijfstijl. Houd de mail beknopt — maximaal 3 alinea's.";
}

Deno.serve(async (req: Request) => {
  // Afhandelen van CORS preflight verzoek
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const {
      correspondentie,
      rauweReactie,
      stijlInstructies,
      beheerderNaam,
      regenereerInstructie,
      vorigeOutput,
    } = await req.json();

    // Haal de Anthropic API key op uit de Supabase secrets
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY niet geconfigureerd" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Fallback voor lege beheerdersnaam
    const naam = beheerderNaam?.trim() || "Totaal VvE Beheer";

    // Systeemprompt met vaste regels en dynamische stijlinstructies
    const systeemPrompt = `Je bent een professionele e-mailassistent voor Totaal VvE Beheer Den Haag en omstreken B.V.

VASTE REGELS — altijd toepassen:
1. Schrijf altijd in het Nederlands
2. Spiegel de aanhef van de afzender: gebruikt de afzender "Beste [naam]" → begin met "Beste [naam]". Gebruikt de afzender "Geachte heer/mevrouw" → begin formeel.
3. Detecteer de naam van de afzender uit de correspondentie en gebruik die in de aanhef
4. Sluit altijd af met "Met vriendelijke groet," gevolgd door de naam van de beheerder op een nieuwe regel
5. Herschrijf de ruwe reactie — vul aan waar nodig, behoud de kern van de boodschap
6. Genereer ALLEEN de herschreven mail — geen uitleg, geen commentaar erbuiten
7. De naam van de beheerder is: ${naam}

SCHRIJFSTIJL:
${bouwStijlInstructies(stijlInstructies)}`;

    // Eerste user-bericht bevat altijd de volledige context
    const eersteUserBericht = `Inkomende correspondentie:\n${correspondentie}\n\nMijn ruwe reactie:\n${rauweReactie}`;

    const messages: Array<{ role: string; content: string }> = [
      {
        role: "user",
        content: eersteUserBericht,
      },
    ];

    // Bij regenereren: voeg vorige output en nieuwe instructie toe als vervolg
    if (vorigeOutput && regenereerInstructie) {
      messages.push({ role: "assistant", content: vorigeOutput });
      messages.push({ role: "user", content: `Pas de mail aan: ${regenereerInstructie}` });
    }

    // Roep de Anthropic API aan
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systeemPrompt,
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const fout = await anthropicResponse.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API fout: ${fout}` }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicResponse.json();
    const resultaat = data.content?.[0]?.text || "";

    return new Response(
      JSON.stringify({ result: resultaat }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (fout) {
    return new Response(
      JSON.stringify({ error: `Onverwachte fout: ${fout}` }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
