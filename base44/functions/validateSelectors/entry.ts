// Validates CSS selectors for a target login page using Browserless.
// Returns per-selector found/count results plus an optional screenshot
// for the wizard to preview.
//
// Payload:
//   { login_url, username_selector, password_selector,
//     submit_selector, success_selector?, capture_screenshot? }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const serveStarted = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      login_url,
      username_selector,
      password_selector,
      submit_selector,
      success_selector,
      capture_screenshot,
    } = body || {};

    if (!login_url) return Response.json({ error: 'login_url is required' }, { status: 400 });

    const settings = (await base44.asServiceRole.entities.AppSettings.list('-created_date', 1))[0] || {};
    const token = settings.browserless_token || Deno.env.get('BROWSERLESS_TOKEN');
    if (!token) return Response.json({ error: 'Browserless token not set' }, { status: 500 });

    let host = settings.browserless_endpoint || 'chrome.browserless.io';
    if (['production-sfo', 'production-ap', 'production-eu'].includes(host)) {
      host = 'chrome.browserless.io';
    } else if (!host.includes('.')) {
      host = `${host}.browserless.io`;
    }

    const params = new URLSearchParams({ token });
    if (settings.browserless_stealth_proxy) params.set('stealth', 'true');
    const url = `https://${host}/function?${params.toString()}`;

    const code = `
      export default async ({ page }) => {
        const targetUrl = ${JSON.stringify(login_url)};
        const sels = {
          username: ${JSON.stringify(username_selector || '')},
          password: ${JSON.stringify(password_selector || '')},
          submit: ${JSON.stringify(submit_selector || '')},
          success: ${JSON.stringify(success_selector || '')},
        };
        const captureShot = ${JSON.stringify(!!capture_screenshot)};

        let pageError = null;
        try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) { pageError = e.message; }

        // Give SPA forms a moment to render.
        await new Promise((r) => setTimeout(r, 1500));

        const checks = await page.evaluate((sels) => {
          const out = {};
          for (const k of Object.keys(sels)) {
            const sel = sels[k];
            if (!sel) { out[k] = { selector: '', count: 0, found: false, visible: false }; continue; }
            try {
              const els = document.querySelectorAll(sel);
              let visible = false;
              if (els.length > 0) {
                const rect = els[0].getBoundingClientRect();
                visible = rect.width > 0 && rect.height > 0;
              }
              out[k] = { selector: sel, count: els.length, found: els.length > 0, visible };
            } catch (e) {
              out[k] = { selector: sel, count: 0, found: false, visible: false, error: e.message };
            }
          }
          return out;
        }, sels);

        let screenshot = null;
        if (captureShot) {
          try {
            const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
            screenshot = 'data:image/jpeg;base64,' + buf.toString('base64');
          } catch (_) {}
        }

        const finalUrl = page.url();
        return { data: { checks, finalUrl, pageError, screenshot }, type: 'application/json' };
      };
    `;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return Response.json({ error: `Browserless ${res.status}: ${txt.slice(0, 300)}` }, { status: 502 });
    }
    const json = await res.json();
    if (json.error) return Response.json({ error: json.error }, { status: 502 });

    const data = json.data || json;

    await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'validateSelectors',
      status: 'success',
      metadata: JSON.stringify({
        login_url,
        found: Object.fromEntries(Object.entries(data.checks || {}).map(([k, v]) => [k, !!v.found])),
      }),
      execution_ms: Date.now() - serveStarted,
    }).catch(() => {});

    return Response.json({ ok: true, ...data, elapsed_ms: Date.now() - serveStarted });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});