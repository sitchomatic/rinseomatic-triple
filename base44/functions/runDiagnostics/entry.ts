// Live network diagnostics for all providers.
// Fires a tiny request with the current (or overridden)
// proxy settings and reports the resolved IP + geo.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCRAPINGBEE_API_BASE = 'https://app.scrapingbee.com/api/v1/';

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
  let auth = '';
  if (proxy.username) {
    auth = encodeURIComponent(proxy.username);
    if (proxy.password) auth += ":" + encodeURIComponent(proxy.password);
    auth += "@";
  }
  return scheme + "://" + auth + proxy.host + ":" + proxy.port;
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

async function runScrapingBeeProbe(settings, override, externalProxy) {
  const apiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
  if (!apiKey) throw new Error('SCRAPINGBEE_API_KEY not set');

  const mode = override?.proxy_mode ?? settings.proxy_mode ?? 'premium';
  const country = (override?.country_code || settings.country_code || 'au').toLowerCase();

  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('url', 'https://ipinfo.io/json');
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

  const started = Date.now();
  const res = await fetch(SCRAPINGBEE_API_BASE + "?" + params.toString(), { method: 'GET' });
  const totalMs = Date.now() - started;

  if (!res.ok) throw new Error("ScrapingBee " + res.status + ": " + await res.text().then(t => t.slice(0, 300)));
  return { text: await res.text(), totalMs };
}

async function runBrowserlessProbe(settings, override, externalProxy) {
  const token = Deno.env.get('BROWSERLESS_TOKEN');
  if (!token) throw new Error('BROWSERLESS_TOKEN not set');

  let host = settings.browserless_endpoint || 'chrome.browserless.io';
  if (['production-sfo', 'production-ap', 'production-eu'].includes(host)) {
    host = 'chrome.browserless.io';
  } else if (!host.includes('.')) {
    host = host + '.browserless.io';
  }
  const mode = override?.proxy_mode ?? settings.proxy_mode ?? 'premium';

  const params = new URLSearchParams({ token });
  if ((mode === 'external' || mode === 'pool') && externalProxy) {
    const proxyUrl = buildProxyUrl(externalProxy);
    if (proxyUrl) params.set('externalProxyServer', proxyUrl);
  }
  if (settings.browserless_stealth_proxy) params.set('stealth', 'true');

  const code = "export default async ({ page }) => { await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); const text = await page.evaluate(() => document.body.innerText); return { data: text, type: 'application/json' }; };";

  const started = Date.now();
  const res = await fetch("https://" + host + "/function?" + params.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const totalMs = Date.now() - started;

  if (!res.ok) throw new Error("Browserless " + res.status + ": " + await res.text());
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return { text: json.data, totalMs };
}

async function runBrowserbaseProbe(settings, override, externalProxy) {
  const bbApiKey = Deno.env.get('BROWSERBASE_API_KEY');
  const bbProjectId = Deno.env.get('BROWSERBASE_PROJECT_ID');
  if (!bbApiKey || !bbProjectId) throw new Error('Browserbase credentials not set');

  const puppeteer = (await import('npm:puppeteer-core@22.7.1')).default;
  const started = Date.now();
  
  const sessionRes = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: { 'X-BB-API-KEY': bbApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: bbProjectId })
  });
  if (!sessionRes.ok) throw new Error("Browserbase session failed: " + await sessionRes.text());
  const sessionData = await sessionRes.json();
  
  let text = '';
  const browser = await puppeteer.connect({
    browserWSEndpoint: "wss://connect.browserbase.com?apiKey=" + bbApiKey + "&sessionId=" + sessionData.id,
  });
  try {
    const page = await browser.newPage();
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 15000 });
    text = await page.evaluate(() => document.body.innerText);
  } finally {
    await browser.close().catch(() => {});
  }
  return { text, totalMs: Date.now() - started };
}

Deno.serve(async (req) => {
  const serveStarted = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const override = body?.override || null;

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};

    const provider = settings.provider || 'scrapingbee';
    const mode = override?.proxy_mode ?? settings.proxy_mode ?? 'premium';
    const externalProxy = await resolveDiagnosticProxy(base44, mode, settings, override);

    let text = '';
    let totalMs = 0;

    try {
      let result;
      if (provider === 'browserbase') {
        result = await runBrowserbaseProbe(settings, override, externalProxy);
      } else if (provider === 'browserless') {
        result = await runBrowserlessProbe(settings, override, externalProxy);
      } else {
        result = await runScrapingBeeProbe(settings, override, externalProxy);
      }
      text = result.text;
      totalMs = result.totalMs;
    } catch (e) {
      await base44.asServiceRole.entities.AuditLog.create({
        function_name: 'runDiagnostics',
        status: 'error',
        metadata: JSON.stringify({ provider, error: e.message }),
        execution_ms: Date.now() - serveStarted
      }).catch(() => {});
      logEvent(base44, {
        level: 'error', category: 'network', delta_ms: totalMs,
        message: "Diagnostics probe failed. " + provider + " Error: " + e.message,
      });
      return Response.json({
        ok: false,
        provider_reachable: false,
        error: e.message,
        elapsed_ms: totalMs,
      });
    }

    let info = {};
    try { info = JSON.parse(text); } catch (_) { /* keep info empty */ }

    logEvent(base44, {
      level: info.ip ? 'success' : 'warn', category: 'network', delta_ms: totalMs,
      message: "Diagnostics probe. IP=" + (info.ip || '?') + " country=" + (info.country || '?') + " city=" + (info.city || '?') + " org=" + (info.org || '?'),
    });

    await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'runDiagnostics',
      status: 'success',
      metadata: JSON.stringify({ provider, mode, ip: info.ip || null }),
      execution_ms: Date.now() - serveStarted
    }).catch(() => {});

    return Response.json({
      ok: true,
      provider,
      browserless_reachable: true,
      provider_reachable: true,
      proxy_mode: mode,
      proxy_source: externalProxy ? (externalProxy.label || externalProxy.host + ":" + externalProxy.port) : null,
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