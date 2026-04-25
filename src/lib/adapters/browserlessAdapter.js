import { ProviderAdapter } from '../providerAdapter.js';
import { Buffer } from 'node:buffer';

/**
 * Browserless Adapter - WebSocket-based, interactive provider
 * 
 * Browserless uses WebSocket for browser control (Puppeteer/Playwright).
 * Supports WebM video recording via CDP Browserless.startRecording/stopRecording.
 */
export class BrowserlessAdapter extends ProviderAdapter {
  async createSession(config) {
    // eslint-disable-next-line no-undef
    const token = config.browserless_token || config.token || (typeof Deno !== 'undefined' ? Deno.env.get('BROWSERLESS_TOKEN') : null);
    if (!token) throw new Error('Missing BROWSERLESS_TOKEN');

    const endpoint = config.browserless_endpoint || 'production-sfo';
    const wsEndpoint = `wss://${endpoint}.browserless.io?token=${token}&headless=false&stealth=true&record=true`;

    // Dynamic import of Puppeteer (available in Deno environment)
    const puppeteer = await import('npm:puppeteer-core@latest');

    let browser, page, cdp;
    try {
      browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
      page = await browser.newPage();
      await page.setViewport({
        width: config.viewport_width || 1920,
        height: config.viewport_height || 1080,
      });

      // Start recording before automation begins
      cdp = await page.createCDPSession();
      await cdp.send('Browserless.startRecording');

      return {
        type: 'browserless',
        wsEndpoint,
        browser,
        page,
        cdp,
        recordingBuffer: null,
      };
    } catch (e) {
      if (browser) await browser.close();
      throw new Error(`Browserless session failed: ${e.message}`);
    }
  }

  async test(sessionHandle, site, username, password, options = {}) {
    const { page } = sessionHandle;

    try {
      // Navigate to login URL
      const loginUrl = options.custom_url || site.login_url;
      if (!loginUrl) throw new Error('No login URL');

      await page.goto(loginUrl, { waitUntil: 'networkidle0' });

      // Fill and submit form
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
      const elapsed = options.timeout_ms || 30000;

      // Classify result using same logic as ScrapingBee
      const html = await page.content();
      const result = this._classifyResult(site, finalUrl, html);

      return {
        site_key: site.key,
        status: result.status,
        final_url: finalUrl,
        success_marker_found: result.marker_found,
        elapsed_ms: elapsed,
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
    const { cdp } = sessionHandle;

    try {
      // Stop recording and get WebM buffer
      const response = await cdp.send('Browserless.stopRecording');
      const buffer = Buffer.from(response.value, 'binary');

      return {
        buffer,
        filename: `browserless_${Date.now()}.webm`,
        format: 'webm',
      };
    } catch (e) {
      console.error('Failed to capture WebM:', e.message);
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
          filename: `browserless_${step.step}_${Date.now()}.png`,
        });
      }
    } catch (e) {
      console.error('Failed to capture screenshots:', e.message);
    }

    return screenshots;
  }

  async getLogs() {
    // Browserless doesn't expose structured logs via CDP in a simple way
    return [];
  }

  async closeSession(sessionHandle) {
    const { browser } = sessionHandle;
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Failed to close Browserless session:', e.message);
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

    // Check success selector in HTML
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