// telemetry.js — fire-and-forget event logging voor app_events
// ---------------------------------------------------------------
// HARDE REGEL: deze module mag NOOIT een fout teruggooien naar de
// aanroepende code. Faalt het loggen, dan merkt de gebruiker niks
// en gaat de kernactie (offerte, overdracht, import) gewoon door.
//
// Init één keer bij het opstarten van de app:
//   initTelemetryDeps({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
//
// Loggen (nergens awaiten nodig):
//   logEvent('offerte_generated', { module: 'offertes' });
//   logEvent('module_open', { module: 'mjop' });
//   logEvent('supabase_error', { module: 'overdrachten', meta: { op: 'insert', status: 500 } });

let _cfg = null;

export function initTelemetryDeps({ supabaseUrl, anonKey }) {
  _cfg = { supabaseUrl, anonKey };
}

export function logEvent(eventType, opts = {}) {
  try {
    if (!_cfg) return;                                  // niet geïnitialiseerd -> stil stoppen
    if (!eventType) return;                             // geen type -> niks doen

    const token = sessionStorage.getItem('vve_access_token');
    if (!token) return;                                 // niet ingelogd -> niks loggen

    // user_id bewust NIET meesturen: de kolom-default auth.uid() vult 'm
    // server-side, en de RLS-check (user_id = auth.uid()) sluit spoofing uit.
    const body = {
      event_type: eventType,
      module: opts.module ?? null,
      meta: opts.meta ?? {},
    };

    // Vuur af, wacht niet, vang eigen fouten af.
    fetch(`${_cfg.supabaseUrl}/rest/v1/app_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': _cfg.anonKey,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal',                     // geen response-body nodig -> lichter
      },
      body: JSON.stringify(body),
      keepalive: true,                                  // log komt ook door bij navigatie/unload
    }).catch(() => { /* stil: loggen mag de app nooit raken */ });

  } catch {
    /* stil: elke fout in het loggen zelf wordt hier ingeslikt */
  }
}
