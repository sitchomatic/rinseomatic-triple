import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch the latest 1000 failed/error results to analyze
    const results = await base44.entities.TestResult.filter({ status: { $in: ['failed', 'error'] } }, '-tested_at', 1000);
    
    const patterns = {};
    for (const r of results) {
      let type = 'Unknown Error';
      const msg = (r.error_message || '').toLowerCase();
      
      if (msg.includes('cloudflare') || msg.includes('captcha') || msg.includes('blocked') || msg.includes('access denied') || msg.includes('security check')) {
        type = 'IP Block / CAPTCHA';
      } else if (msg.includes('selector') || msg.includes('not found') || msg.includes('timeout') || msg.includes('wait_for')) {
        type = 'Site Update / Selector Timeout';
      } else if (msg.includes('disabled')) {
        type = 'Account Disabled';
      } else if (msg.includes('incorrect') || msg.includes('invalid') || msg.includes('wrong')) {
        type = 'Invalid Credentials';
      } else if (msg) {
        type = 'System / API Error';
      } else {
        type = 'Unclassified Failure';
      }

      const key = `${r.site_key}_${type}`;
      if (!patterns[key]) {
        patterns[key] = { site: r.site_key, type, count: 0, sample_ids: [], suggestion: '' };
        
        if (type === 'IP Block / CAPTCHA') {
          patterns[key].suggestion = 'Rotate to a Residential/Stealth proxy, or assign a clean proxy pool.';
        } else if (type === 'Site Update / Selector Timeout') {
          patterns[key].suggestion = 'Verify selectors in Site Sandbox. Target site may have updated its DOM.';
        } else if (type === 'Invalid Credentials') {
          patterns[key].suggestion = 'Review the source list or switch to a multi-password strategy.';
        } else if (type === 'Account Disabled') {
          patterns[key].suggestion = 'Disable these credentials globally to save requests.';
        } else {
          patterns[key].suggestion = 'Review full activity logs to trace this system fault.';
        }
      }
      
      patterns[key].count++;
      if (patterns[key].sample_ids.length < 5 && r.credential_id) {
        patterns[key].sample_ids.push(r.credential_id);
      }
    }

    return Response.json({ patterns: Object.values(patterns).sort((a, b) => b.count - a.count) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});