// Live network diagnostics for ScrapingBee.
// Fires a tiny request through ScrapingBee with the current (or overridden)
// proxy settings and reports the resolved IP + geo. Mirrors the proxy logic
// in functions/testCredential so what you see here is what real runs use.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = 'https://app.scrapingbee.com/api/v1/';

async function logEvent(base44, f) {
  try {
    await base44.asServiceRole.entities.ActionLog.create({
      level: f.level || 'info',
      category: f.category || 'system',
      message: String(f.message || '').slice(0, 2000),
      delta_ms: f.delta_ms || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (_e) {}
}

function buildProxyUrl(proxy) {
  if (!proxy?.host || !proxy?.port) return null;
  const scheme = proxy.protocol || 'http';
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${proxy.password ? `:${encodeURIComponent(proxy.password)}` : ''}@`
    : '';
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

async function resolveDiagnosticProxy(base44, mode, settings, override) {
  if (mode === 'external') {
    const id = override?.external_proxy_id || settings.external_proxy_id;
    if (!id) return null;
    const rows = await base44.asServiceRole.entities.Proxy.filter({ id });
    return rows[0] || null;
  }
  if (mode === 'pool') {
    const poolId = override?.proxy_pool_id || settings.proxy_pool_id;
    if (!poolId) return null;
    const pools = await base44.asServiceRole.entities.ProxyPool.filter({ id: poolId });
    const ids = pools[0]?.proxy_ids || [];
    const rows = await Promise.all(ids.map((id) => base44.asServiceRole.entities.Proxy.filter({ id })));
    const candidates = rows.map((r) => r[0]).filter((p) => p && p.enabled !== false && p.protocol !== 'wireguard' && p.status !== 'down');
    candidates.sort((a, b) => (a.latency_ms || 999999) - (b.latency_ms || 999999));
    return candidates[0] || null;
  }
  return null;
}

function buildScrapingBeeProbeUrl(apiKey, settings, override, externalProxy) {
  const mode = override?.proxy_mode ?? settings.proxy_mode ?? 'premium';
  const country = (override?.country_code || settings.country_code || 'au').toLowerCase();

  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('url', 'https://ipinfo.io/json');
  // ipinfo returns plain JSON — no JS rendering needed.
  params.set('render_js', 'false');
  params.set('timeout', '30000');

  if (mode === 'premium') {
    params.set('premium_proxy', 'true');
    if (country) params.set('country_code', country);
  } else if (mode === 'stealth') {
    params.set('stealth_proxy', 'true');
    if (country) params.set('country_code', country);
  }
  if ((mode === 'external' || mode === 'pool') && externalProxy) {
    const proxyUrl = buildProxyUrl(externalProxy);
    if (proxyUrl) params.set('own_proxy', proxyUrl);
  }

  return `${API_BASE}?${params.toString()}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const override = body?.override || null;

    const apiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'SCRAPINGBEE_API_KEY not set' }, { status: 500 });
    }

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};

    const mode = override?.proxy_mode ?? settings.proxy_mode ?? 'premium';
    const externalProxy = await resolveDiagnosticProxy(base44, mode, settings, override);
    const url = buildScrapingBeeProbeUrl(apiKey, settings, override, externalProxy);
    const started = Date.now();
    const res = await fetch(url, { method: 'GET' });
    const totalMs = Date.now() - started;

    if (!res.ok) {
      const text = await res.text();
      logEvent(base44, {
        level: 'error', category: 'network', delta_ms: totalMs,
        message: `Diagnostics probe failed · ScrapingBee ${res.status}`,
      });
      return Response.json({
        ok: false,
        provider_reachable: false,
        error: `ScrapingBee ${res.status}: ${text.slice(0, 300)}`,
        elapsed_ms: totalMs,
      });
    }

    // With render_js=false ScrapingBee returns the raw page body. ipinfo.io
    // serves JSON, so res.text() is the JSON payload.
    const text = await res.text();
    let info = {};
    try { info = JSON.parse(text); } catch (_) { /* keep info empty */ }

    logEvent(base44, {
      level: info.ip ? 'success' : 'warn', category: 'network', delta_ms: totalMs,
      message: `Diagnostics probe · IP=${info.ip || '?'} country=${info.country || '?'} city=${info.city || '?'} org=${info.org || '?'}`,
    });

    return Response.json({
      ok: true,
      provider: 'scrapingbee',
      browserless_reachable: true, // backward-compat key for the existing UI panel
      provider_reachable: true,
      proxy_mode: mode,
      proxy_source: externalProxy ? (externalProxy.label || `${externalProxy.host}:${externalProxy.port}`) : null,
      country_requested: (override?.country_code || settings.country_code || 'au').toLowerCase(),
      ip: info.ip || null,
      country: info.country || null,
      country_name: info.country_name || null,
      city: info.city || null,
      org: info.org || null,
      asn: null,
      probe_elapsed_ms: totalMs,
      total_elapsed_ms: totalMs,
      probe_warning: info.ip ? null : 'No IP returned — proxy may have failed',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});