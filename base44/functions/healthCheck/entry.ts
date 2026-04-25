import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const appSettings = settings[0] || { provider: 'scrapingbee' };

    const health = {
      ok: true,
      provider: appSettings.provider,
      credentials: {
        scrapingbee: !!Deno.env.get('SCRAPINGBEE_API_KEY'),
        browserbase: !!(Deno.env.get('BROWSERBASE_PROJECT_ID') && Deno.env.get('BROWSERBASE_API_KEY')),
        browserless: !!Deno.env.get('BROWSERLESS_TOKEN'),
      },
      timestamp: new Date().toISOString(),
    };

    return Response.json(health);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});