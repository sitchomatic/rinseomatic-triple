import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Pings each enabled external Proxy through Browserless to measure
// reachability + latency. Updates Proxy.status / latency_ms / last_check.
// Designed to be called either manually (from the Settings UI) or on a
// daily schedule.

async function pingOne(token, host, proxy) {
  // D3 fix: route the request through the actual proxy by passing
  // externalProxyServer as a Browserless query param (matches testCredential).
  // Previously this was passed in `context` and silently ignored, so the ping
  // was measuring Browserless→ipify on the default datacenter IP.
  const scheme = proxy.protocol || 'http';
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${proxy.password ? `:${encodeURIComponent(proxy.password)}` : ''}@`
    : '';
  const externalProxyServer = `${scheme}://${auth}${proxy.host}:${proxy.port}`;

  const params = new URLSearchParams({ token });
  params.set('externalProxyServer', externalProxyServer);
  const url = `https://${host}/function?${params.toString()}`;

  const code = `
    export default async ({ page }) => {
      const started = Date.now();
      try {
        const res = await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const ok = res && res.ok();
        let text = null;
        if (ok) {
          text = await page.evaluate(() => document.body.innerText);
        }
        const elapsed = Date.now() - started;
        return { data: { ok, elapsed, text }, type: 'application/json' };
      } catch (e) {
        return { data: { ok: false, error: e.message, elapsed: Date.now() - started }, type: 'application/json' };
      }
    };
  `;

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const elapsed = Date.now() - started;
    if (!res.ok) return { ok: false, latency: elapsed, error: `Browserless ${res.status}` };
    const json = await res.json();
    const data = json?.data || json;
    
    let ip = null, country = null;
    let isBlocked = false;
    if (data.text) {
      const lower = data.text.toLowerCase();
      if (lower.includes('cloudflare') || lower.includes('just a moment') || lower.includes('access denied') || lower.includes('security check')) {
         isBlocked = true;
      }
      try {
        const info = JSON.parse(data.text);
        ip = info.ip;
        country = info.country;
      } catch (_) {}
    }
    
    return { ok: !!data.ok && !isBlocked, latency: data.elapsed ?? elapsed, error: data.error || (isBlocked ? 'Blocked by Cloudflare/Access Denied' : null), ip, country, isBlocked };
  } catch (e) {
    return { ok: false, latency: Date.now() - started, error: e.message };
  }
}

function classify(ok, latency) {
  if (!ok) return 'down';
  if (latency > 1500) return 'degraded';
  return 'healthy';
}

Deno.serve(async (req) => {
  const serveStarted = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Allow scheduled invocation (no user) and authenticated UI invocation
    if (req.headers.get('x-base44-trigger') !== 'scheduled' && !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = (await base44.asServiceRole.entities.AppSettings.list('-created_date', 1))[0] || {};
    
    const token = settings.browserless_token || Deno.env.get('BROWSERLESS_TOKEN');
    if (!token) return Response.json({ error: 'Browserless Token not set' }, { status: 500 });
    let host = settings.browserless_endpoint || 'chrome.browserless.io';
    if (['production-sfo', 'production-ap', 'production-eu'].includes(host)) {
      host = 'chrome.browserless.io';
    } else if (!host.includes('.')) {
      host = `${host}.browserless.io`;
    }

    const proxies = await base44.asServiceRole.entities.Proxy.list('-created_date', 200);
    const targets = proxies.filter((p) => p.enabled !== false && p.host && p.port && p.protocol !== 'wireguard');

    // L15 fix: use allSettled so a single timed-out ping no longer holds up
    // results for healthy proxies. Persist updates fire-and-forget in the
    // same wave (we already await the ping itself).
    const results = await Promise.allSettled(targets.map(async (p) => {
      const r = await pingOne(token, host, p);
      const status = classify(r.ok, r.latency);
      
      const totalPings = (p.total_pings || 0) + 1;
      const failedPings = (p.failed_pings || 0) + (r.ok ? 0 : 1);
      const consecutiveFailures = r.ok ? 0 : (p.consecutive_failures || 0) + 1;
      const errorRate = failedPings / totalPings;
      
      let enabled = p.enabled !== false;
      let disabledReason = null;
      if (r.isBlocked) {
        enabled = false;
        disabledReason = 'Blocked by Cloudflare / Access Denied';
      } else if (r.latency > 5000) {
        enabled = false;
        disabledReason = `High latency (${r.latency}ms)`;
      } else if (consecutiveFailures >= 3 || (totalPings >= 5 && errorRate > 0.6)) {
        enabled = false;
        disabledReason = `High error rate / Consecutive failures (${consecutiveFailures})`;
      }

      if (!enabled && p.enabled !== false) {
        try {
          const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }, undefined, 1);
          if (admins.length > 0) {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: admins[0].email,
              subject: `Proxy Auto-Disabled: ${p.label || p.host}`,
              body: `The proxy ${p.label || p.host}:${p.port} has been automatically disabled by the health monitor.\n\nReason: ${disabledReason}\nLatency: ${r.latency}ms\nLast IP: ${r.ip || p.last_ip || 'Unknown'}`
            });
          }
        } catch (_) {}
      }
      
      await base44.asServiceRole.entities.Proxy.update(p.id, {
        status,
        latency_ms: r.latency,
        last_check: new Date().toISOString(),
        total_pings: totalPings,
        failed_pings: failedPings,
        consecutive_failures: consecutiveFailures,
        enabled,
        last_ip: r.ip || p.last_ip,
        last_country: r.country || p.last_country,
      });
      return { id: p.id, label: p.label || `${p.host}:${p.port}`, status, latency_ms: r.latency, error: r.error, disabled_now: !enabled && p.enabled !== false };
    })).then((settled) => settled.map((s, i) => s.status === 'fulfilled'
      ? s.value
      : { id: targets[i].id, label: targets[i].label || `${targets[i].host}:${targets[i].port}`, status: 'down', error: s.reason?.message }
    ));

    await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'pingProxies',
      status: 'success',
      metadata: JSON.stringify({ checked: results.length }),
      execution_ms: Date.now() - serveStarted
    }).catch(() => {});

    return Response.json({ checked: results.length, results });
  } catch (error) {
    let base44;
    try { base44 = createClientFromRequest(req); } catch (_) {}
    if (base44) {
      await base44.asServiceRole.entities.AuditLog.create({
        function_name: 'pingProxies',
        status: 'error',
        metadata: JSON.stringify({ error: error.message }),
        execution_ms: Date.now() - serveStarted
      }).catch(() => {});
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});