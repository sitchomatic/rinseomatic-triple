import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const format = body.format || 'csv';

    const logs = await base44.entities.ActionLog.list('-timestamp', 3000);
    
    if (format === 'json') {
      const failedResults = await base44.entities.TestResult.filter({ status: { $in: ['failed', 'error'] } }, '-tested_at', 2000);
      const appSettings = await base44.entities.AppSettings.list();
      const sites = await base44.entities.Site.list();
      const proxies = await base44.entities.Proxy.list();

      const exportData = {
        metadata: {
          exported_at: new Date().toISOString(),
          description: "Base44 System Diagnostic Export (Logs, Configurations, and Failed Run Results)"
        },
        app_settings: appSettings[0] || {},
        sites: sites,
        proxies: proxies.map(p => ({ ...p, password: '***', wireguard_config: '***' })), // Mask sensitive fields
        action_logs: logs,
        failed_tests: failedResults.map(r => ({
          run_id: r.run_id,
          site_key: r.site_key,
          username: r.username,
          status: r.status,
          error_message: r.error_message,
          final_url: r.final_url,
          attempts: r.attempts,
          elapsed_ms: r.elapsed_ms,
          tested_at: r.tested_at,
          screenshots: r.screenshots,
          recording_url: r.recording_url,
        }))
      };

      return Response.json({ data: JSON.stringify(exportData, null, 2), type: 'application/json' });
    }

    const header = ['timestamp', 'level', 'category', 'site', 'message', 'delta_ms'].join(',');
    
    if (!logs.length) {
      return Response.json({ data: `${header}\n`, type: 'text/csv' });
    }

    const rows = logs.map(l => [
      l.timestamp || '',
      l.level || '',
      l.category || '',
      l.site || '',
      `"${(l.message || '').replace(/"/g, '""')}"`, // Escape quotes for CSV
      l.delta_ms || 0
    ].join(','));

    const csv = [header, ...rows].join('\n');
    return Response.json({ data: csv, type: 'text/csv' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});