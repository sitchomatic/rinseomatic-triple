import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};
    
    const bbApiKey = settings.browserbase_api_key || Deno.env.get('BROWSERBASE_API_KEY');
    const bbProjectId = settings.browserbase_project_id || Deno.env.get('BROWSERBASE_PROJECT_ID');
    const blToken = settings.browserless_token || Deno.env.get('BROWSERLESS_TOKEN');
    let blHost = settings.browserless_endpoint || 'chrome.browserless.io';
    if (!blHost.includes('.')) blHost += '.browserless.io';
    if (['production-sfo', 'production-ap', 'production-eu'].includes(blHost)) blHost = 'chrome.browserless.io';

    // 1. Fetch Browserbase sessions via official REST API
    let bbSessions = [];
    if (bbApiKey && bbProjectId) {
      try {
        const res = await fetch(`https://www.browserbase.com/v1/sessions?projectId=${bbProjectId}`, {
          headers: { 'X-BB-API-KEY': bbApiKey }
        });
        if (res.ok) {
          const json = await res.json();
          // The API might wrap in an object or return array directly
          bbSessions = Array.isArray(json) ? json : (json.sessions || []);
        } else {
          console.error('Browserbase fetch failed:', await res.text());
        }
      } catch(e) { console.error('Browserbase err:', e); }
    }

    // 2. Fetch Browserless sessions via official REST API
    let blSessions = [];
    if (blToken) {
      try {
        const res = await fetch(`https://${blHost}/sessions?token=${blToken}`);
        if (res.ok) {
          const json = await res.json();
          blSessions = Array.isArray(json) ? json : [];
        }
      } catch(e) { console.error('Browserless err:', e); }
    }

    // 3. Fetch local static Media/Screenshots (captured natively from all providers)
    const screenshots = await base44.asServiceRole.entities.Screenshot.list('-created_date', 50).catch(()=>[]);

    return Response.json({ 
      browserbase: bbSessions, 
      browserless: { sessions: blSessions, host: blHost, token: blToken }, 
      screenshots 
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});