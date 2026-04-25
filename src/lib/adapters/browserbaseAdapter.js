import { ProviderAdapter } from '../providerAdapter.js';
import { Buffer } from 'node:buffer';

/**
 * Browserbase Adapter - REST + WebSocket, managed sessions
 * 
 * Browserbase creates managed browser sessions via REST API.
 * Sessions have automatic video recording that can be downloaded after close.
 */
export class BrowserbaseAdapter extends ProviderAdapter {
  async createSession(config) {
    // eslint-disable-next-line no-undef
    const apiKey = config.browserbase_api_key || (typeof Deno !== 'undefined' ? Deno.env.get('BROWSERBASE_API_KEY') : null);
    // eslint-disable-next-line no-undef
    const projectId = config.browserbase_project_id || (typeof Deno !== 'undefined' ? Deno.env.get('BROWSERBASE_PROJECT_ID') : null);

    if (!apiKey || !projectId) {
      throw new Error('Missing BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID');
    }

    try {
      // Create session via REST API
      const res = await fetch('https://api.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BB-API-Key': apiKey,
        },
        body: JSON.stringify({
          projectId,
          browserSettings: {
            viewport: {
              width: config.viewport_width || 1920,
              height: config.viewport_height || 1080,
            },
          },
          region: config.browserbase_region || 'us-west-2',
          keepAlive: config.browserbase_keep_alive || false,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Browserbase API error ${res.status}: ${text}`);
      }

      const session = await res.json();

      // Connect to session via Puppeteer
      const puppeteer = await import('npm:puppeteer-core@latest');
      const browser = await puppeteer.connect({
        browserWSEndpoint: session.connectUrl,
      });

      const page = await browser.newPage();
      await page.setViewport({
        width: config.viewport_width || 1920,
        height: config.viewport_height || 1080,
      });

      return {
        type: 'browserbase',
        sessionId: session.id,
        connectUrl: session.connectUrl,
        apiKey,
        browser,
        page,
      };
    } catch (e) {
      throw new Error(`Browserbase session creation failed: ${e.message}`);
    }
  }

  async test(sessionHandle, site, username, password, options = {}) {
    const { page } = sessionHandle;

    try {
      const loginUrl = options.custom_url || site.login_url;
      if (!loginUrl) throw new Error('No login URL');

      await page.goto(loginUrl, { waitUntil: 'networkidle0' });

      const userSel = site.username_selector || "input[type='email'], input[name='username']";
      const passSel = site.password_selector || "input[type='password']";
      const submitSel = site.submit_selector || "button[type='submit']";
      const waitMs = Math.min(20000, Math.max(0, site.wait_after_submit_ms || 3500));

      await page.waitForSelector(userSel, { timeout: 5000 });
      await page.type(userSel, username);
      await page.type(passSel, password);
      await page.click(submitSel);
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: waitMs }).catch(() => {});

      const finalUrl = page.url();
      const html = await page.content();
      const result = this._classifyResult(site, finalUrl, html);

      return {
        site_key: site.key,
        status: result.status,
        final_url: finalUrl,
        success_marker_found: result.marker_found,
        elapsed_ms: options.timeout_ms || 30000,
        error_message: result.error,
      };
    } catch (e) {
      return {
        site_key: site.key,
        status: 'error',
        error_message: e.message,
        elapsed_ms: 0,
      };
    }
  }

  async captureRecording(sessionHandle) {
    const { sessionId, apiKey } = sessionHandle;

    try {
      // Download recording via API
      const res = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/recording`, {
        headers: { 'X-BB-API-Key': apiKey },
      });

      if (!res.ok) {
        console.error(`Failed to download recording: ${res.status}`);
        return null;
      }

      const buffer = await res.arrayBuffer();

      return {
        buffer: Buffer.from(buffer),
        filename: `browserbase_${sessionId}.webm`,
        format: 'webm', // Browserbase returns WebM; MP4 transcode may be available server-side
      };
    } catch (e) {
      console.error('Failed to capture recording:', e.message);
      return null;
    }
  }

  async captureScreenshots(sessionHandle, steps = []) {
    const { page } = sessionHandle;
    const screenshots = [];

    try {
      for (const step of steps) {
        const screenshot = await page.screenshot({ encoding: 'binary' });
        screenshots.push({
          step: step.step || 'unknown',
          buffer: Buffer.from(screenshot),
          filename: `browserbase_${step.step}_${Date.now()}.png`,
        });
      }
    } catch (e) {
      console.error('Failed to capture screenshots:', e.message);
    }

    return screenshots;
  }

  async getLogs(sessionHandle) {
    const { sessionId, apiKey } = sessionHandle;

    try {
      const res = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/logs`, {
        headers: { 'X-BB-API-Key': apiKey },
      });

      if (!res.ok) {
        console.warn(`Failed to fetch logs: ${res.status}`);
        return [];
      }

      return await res.json();
    } catch (e) {
      console.error('Failed to fetch logs:', e.message);
      return [];
    }
  }

  async closeSession(sessionHandle) {
    const { browser } = sessionHandle;
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Failed to close Browserbase session:', e.message);
      }
    }
  }

  // --- Private helper ---

  _classifyResult(site, finalUrl, html) {
    const lower = (finalUrl || '').toLowerCase();
    const blockMarkers = ['/blocked', '/error', '/access-denied', '/forbidden', '/captcha', '/challenge'];
    const blocked = blockMarkers.some((m) => lower.includes(m));

    const loginMarker = (site.login_url_marker || '/login').toLowerCase();
    const stayedLogin = loginMarker ? lower.includes(loginMarker) : false;

    const successUrl = site.success_url_contains
      ? lower.includes(site.success_url_contains.toLowerCase())
      : false;

    let markerFound = false;
    const successSel = site.success_selector || '';
    if (successSel && html) {
      const tokens = [];
      successSel.split(/[\s,>+~]+/).forEach((part) => {
        const idMatch = part.match(/#([\w-]+)/);
        if (idMatch) tokens.push({ kind: 'id', val: idMatch[1] });
        const classMatches = part.match(/\.([\w-]+)/g) || [];
        classMatches.forEach((c) => tokens.push({ kind: 'class', val: c.slice(1) }));
      });
      if (tokens.length > 0) {
        markerFound = tokens.every((t) => {
          if (t.kind === 'id') return html.includes(`id="${t.val}"`) || html.includes(`id='${t.val}'`);
          return new RegExp(`class=["'][^"']*\\b${t.val}\\b`, 'i').test(html);
        });
      }
    }

    if (markerFound || successUrl) {
      return { status: 'working', marker_found: true };
    }
    if (site.lenient_success && !stayedLogin && !blocked) {
      return { status: 'working', marker_found: false };
    }
    if (stayedLogin) {
      return { status: 'failed', marker_found: false, error: 'Stayed on login page' };
    }
    if (blocked) {
      return { status: 'failed', marker_found: false, error: 'Access blocked' };
    }
    return { status: 'failed', marker_found: false };
  }
}