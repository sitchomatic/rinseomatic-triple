import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const results = await base44.entities.TestResult.filter({ status: { $in: ['failed', 'error'] } }, '-tested_at', 1000);
    
    const patterns = {};
    for (const r of results) {
      let type = 'Unknown Error';
      const msg = (r.error_message || '').toLowerCase();
      
      if (msg.includes('cloudflare') || msg.includes('captcha') || msg.includes('blocked') || msg.includes('access denied') || msg.includes('403') || msg.includes('401') || msg.includes('security check')) {
        type = 'CAPTCHA/Anti-Bot';
      } else if (msg.includes('selector') || msg.includes('not found') || msg.includes('timeout') || msg.includes('wait_for') || msg.includes('404')) {
        type = 'Structural Changes';
      } else if (msg.includes('429') || msg.includes('rate limit') || msg.includes('reset') || msg.includes('proxy error') || msg.includes('econnreset')) {
        type = 'Proxy Failures';
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
        
        if (type === 'CAPTCHA/Anti-Bot') {
          patterns[key].suggestion = 'Detected CAPTCHA/403: Rotate Session Credentials or Switch to Stealth Proxy.';
        } else if (type === 'Structural Changes') {
          patterns[key].suggestion = 'Detected Selector Timeout/404: Target site updated. Verify DOM in Sandbox.';
        } else if (type === 'Proxy Failures') {
          patterns[key].suggestion = 'Detected 429/Reset: Switch to Residential Proxy or throttle concurrency.';
        } else if (type === 'Invalid Credentials') {
          patterns[key].suggestion = 'Review source list or employ multi-password fallback strategy.';
        } else if (type === 'Account Disabled') {
          patterns[key].suggestion = 'Disable these credentials globally to save requests.';
        } else {
          patterns[key].suggestion = 'Review full activity logs for detailed trace.';
        }
      }
      
      patterns[key].count++;
      if (r.credential_id && !patterns[key].sample_ids.includes(r.credential_id)) {
        patterns[key].sample_ids.push(r.credential_id);
      }
    }

    return Response.json({ patterns: Object.values(patterns).sort((a, b) => b.count - a.count) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});