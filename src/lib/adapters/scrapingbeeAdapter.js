import { ProviderAdapter } from '../providerAdapter.js';

const API_BASE = 'https://app.scrapingbee.com/api/v1/';
const BLOCK_MARKERS = ['/blocked', '/error', '/access-denied', '/forbidden', '/captcha', '/challenge'];

/**
 * ScrapingBee Adapter - REST-based, stateless provider
 * 
 * ScrapingBee has no persistent sessions; each request is independent.
 * The "session handle" is just a container for metadata.
 */
export class ScrapingBeeAdapter extends ProviderAdapter {
  async createSession(config) {
    // ScrapingBee is stateless; no actual session creation needed.
    // Just validate that we have an API key.
    if (!config.api_key && !config.scrapingbee_api_key) {
      throw new Error('Missing SCRAPINGBEE_API_KEY');
    }
    return {
      type: 'scrapingbee',
      apiKey: config.api_key || config.scrapingbee_api_key,
      config,
    };
  }

  async test(sessionHandle, site, username, password, options = {}) {
    const { apiKey } = sessionHandle;
    const passwords = [password];
    const strategy = options.strategy || 'multi_password';

    return await this._testSite(apiKey, sessionHandle.config, site, username, passwords, strategy, options);
  }

  async captureRecording() {
    // ScrapingBee doesn't support video recording.
    return null;
  }

  async captureScreenshots() {
    // ScrapingBee captures only a final screenshot via the native parameter.
    // Step-by-step screenshots would require custom JS injection (future feature).
    return [];
  }

  async getLogs() {
    // ScrapingBee provides js_scenario_report but not structured logs.
    return [];
  }

  async closeSession() {
    // No resources to cleanup (stateless).
  }

  // --- Private methods ---

  async _testSite(apiKey, settings, site, username, passwords, strategy, options) {
    const list = passwords.slice(0, strategy === 'single' ? 1 : passwords.length);
    let lastFailed = null;
    let lastError = null;
    let totalElapsed = 0;

    for (const pw of list) {
      const r = await this._runOne(apiKey, settings, site, username, pw, options);
      totalElapsed += r.elapsed || 0;

      if (r.status === 'working') {
        return {
          site_key: site.key,
          status: 'working',
          final_url: r.final_url,
          success_marker_found: !!r.marker,
          working_password: pw,
          elapsed_ms: totalElapsed,
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
      };
    }
    return {
      site_key: site.key,
      status: 'error',
      error_message: lastError || 'unknown error',
      elapsed_ms: totalElapsed,
    };
  }

  async _runOne(apiKey, settings, site, username, password, options) {
    const loginUrl = options.custom_url || site.login_url;
    if (!loginUrl) {
      return { status: 'error', error: 'No login URL', elapsed: 0 };
    }

    const url = this._buildScrapingBeeUrl({
      apiKey,
      targetUrl: loginUrl,
      jsScenario: this._buildLoginScenario(site, username, password),
      settings,
      proxy: options.proxy || {},
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

    const verdict = this._classify(site, json);
    return { ...verdict, elapsed, screenshot: json.screenshot || null };
  }

  _buildScrapingBeeUrl({ apiKey, targetUrl, jsScenario, settings, proxy }) {
    const params = new URLSearchParams();
    params.set('api_key', apiKey);
    params.set('url', targetUrl);
    params.set('render_js', 'true');
    params.set('json_response', 'true');
    params.set('js_scenario', JSON.stringify(jsScenario));

    // Proxy tier selection
    if (proxy.mode === 'premium') {
      params.set('premium_proxy', 'true');
      if (proxy.country_code) params.set('country_code', proxy.country_code);
    } else if (proxy.mode === 'stealth') {
      params.set('stealth_proxy', 'true');
      if (proxy.country_code) params.set('country_code', proxy.country_code);
    } else if (proxy.mode === 'external' && proxy.external) {
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

    // Browser knobs
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

    return `${API_BASE}?${params.toString()}`;
  }

  _buildLoginScenario(site, username, password) {
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

  _classify(site, sbJson) {
    const resolvedUrl = sbJson.resolved_url || sbJson.initial_status_code_url || '';
    const body = sbJson.body || '';
    const report = sbJson.js_scenario_report || {};
    const tasks = Array.isArray(report.tasks) ? report.tasks : [];

    // 1. Check for pre-submit errors (selector issues)
    const preSubmitFail = tasks.find(
      (t) => t.status && t.status !== 'success' && (t.action === 'wait_for' || t.action === 'fill')
    );
    if (preSubmitFail) {
      const which = preSubmitFail.action === 'wait_for' ? 'username field not found' : 'fill failed';
      return { status: 'error', error: `${which}: ${preSubmitFail.task || ''}`.trim() };
    }

    // 2. URL-based detection
    const lower = (resolvedUrl || '').toLowerCase();
    const blocked = BLOCK_MARKERS.some((m) => lower.includes(m));
    const loginMarker = (site.login_url_marker || '/login').toLowerCase();
    const stayedLogin = loginMarker ? lower.includes(loginMarker) : false;
    const successUrl = site.success_url_contains
      ? lower.includes(site.success_url_contains.toLowerCase())
      : false;

    // 3. Success-selector detection
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
}