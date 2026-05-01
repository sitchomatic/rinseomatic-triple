import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const logs = await base44.entities.ActionLog.list('-timestamp', 3000);
    
    const header = ['timestamp', 'level', 'category', 'site', 'message', 'delta_ms'].join(',');
    
    if (!logs.length) {
      return Response.json({ csv: `${header}\n` });
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
    return Response.json({ csv });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});