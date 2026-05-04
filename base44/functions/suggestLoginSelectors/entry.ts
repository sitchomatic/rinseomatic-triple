// suggestLoginSelectors — fetches a login page via Browserless and runs
// DOM heuristics to recommend selectors for username, password, and submit
// elements. Returns ranked candidates with confidence scores so the wizard
// can auto-fill the site config without manual inspection.
//
// Payload: { login_url, capture_screenshot? }
// Response: {
//   ok, finalUrl, screenshot?,
//   suggestions: {
//     username: [{ selector, score, reason, sample }, ...],
//     password: [...],
//     submit:   [...],
//   },
//   best: { username, password, submit }   // top-1 selector strings
// }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const serveStarted = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { login_url, capture_screenshot } = body || {};
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

    // Heuristic scoring runs entirely inside the browser. Each candidate
    // element gets a score based on attribute keywords, input type, label
    // associations, and visibility. We then build a stable, specific CSS
    // selector for the top candidates.
    const code = `
      export default async ({ page }) => {
        const targetUrl = ${JSON.stringify(login_url)};
        const captureShot = ${JSON.stringify(!!capture_screenshot)};

        let pageError = null;
        try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) { pageError = e.message; }
        await new Promise((r) => setTimeout(r, 1800));

        const result = await page.evaluate(() => {
          // ----- helpers -----
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) return false;
            const style = window.getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
            return true;
          };

          const haystack = (el) => {
            const parts = [
              el.id, el.name, el.placeholder, el.getAttribute('aria-label'),
              el.getAttribute('autocomplete'), el.getAttribute('data-testid'),
              el.getAttribute('data-test'), el.getAttribute('data-qa'),
              el.className, el.type,
            ];
            // Associated <label> via 'for' or wrapping label
            if (el.id) {
              const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
              if (lbl) parts.push(lbl.textContent || '');
            }
            const wrap = el.closest('label');
            if (wrap) parts.push(wrap.textContent || '');
            return parts.filter(Boolean).join(' ').toLowerCase();
          };

          // Build a stable, specific selector for an element.
          // Priority: id → name → data-testid → autocomplete → type+form-context → tag+nth.
          const buildSelector = (el) => {
            if (el.id && /^[a-zA-Z][\\w:-]*$/.test(el.id)) return '#' + CSS.escape(el.id);
            if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
            const dt = el.getAttribute('data-testid');
            if (dt) return '[data-testid="' + dt + '"]';
            const ac = el.getAttribute('autocomplete');
            if (ac) return el.tagName.toLowerCase() + '[autocomplete="' + ac + '"]';
            if (el.tagName === 'INPUT' && el.type) {
              const sameType = document.querySelectorAll('input[type="' + el.type + '"]');
              if (sameType.length === 1) return 'input[type="' + el.type + '"]';
            }
            // Fallback: scoped nth-of-type within a form
            const form = el.closest('form');
            const root = form || document.body;
            const all = root.querySelectorAll(el.tagName.toLowerCase());
            const idx = Array.prototype.indexOf.call(all, el);
            const formSel = form && form.id ? 'form#' + CSS.escape(form.id) + ' ' : (form ? 'form ' : '');
            return formSel + el.tagName.toLowerCase() + ':nth-of-type(' + (idx + 1) + ')';
          };

          // ----- gather candidates -----
          const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(isVisible);
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')).filter(isVisible);

          // Username scoring
          const userKw = ['email', 'username', 'user', 'login', 'account', 'phone', 'mobile', 'identifier'];
          const passKw = ['password', 'passwd', 'pwd', 'passcode'];
          const submitKw = ['log in', 'login', 'sign in', 'signin', 'submit', 'continue', 'next', 'enter'];

          const score = (el, kws, opts = {}) => {
            const hay = haystack(el);
            let s = 0;
            const matched = [];
            for (const kw of kws) {
              if (hay.includes(kw)) { s += 6; matched.push(kw); }
            }
            // Type-based bonuses for inputs
            if (el.tagName === 'INPUT') {
              const t = (el.type || 'text').toLowerCase();
              if (opts.kind === 'username' && (t === 'email' || t === 'text' || t === 'tel')) s += 4;
              if (opts.kind === 'password' && t === 'password') s += 20;
              if (opts.kind === 'username' && t === 'password') s -= 30;
            }
            // Autocomplete is the strongest single signal when present
            const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
            if (opts.kind === 'username' && (ac === 'username' || ac === 'email')) s += 12;
            if (opts.kind === 'password' && ac.includes('password')) s += 12;
            // Form context — prefer elements inside a <form>
            if (el.closest('form')) s += 2;
            // Position — earlier in DOM order generally wins for username
            if (opts.kind === 'username') {
              const all = inputs;
              const i = all.indexOf(el);
              if (i >= 0) s += Math.max(0, 4 - i);
            }
            return { score: s, matched };
          };

          const sample = (el) => {
            const text = (el.innerText || el.value || el.placeholder || '').trim();
            return text.slice(0, 60);
          };

          const rank = (els, kws, kind) => {
            const out = [];
            for (const el of els) {
              const { score: s, matched } = score(el, kws, { kind });
              if (s <= 0) continue;
              out.push({
                selector: buildSelector(el),
                score: s,
                reason: matched.length ? 'matches: ' + matched.join(', ') : 'attribute/type heuristic',
                sample: sample(el),
                tag: el.tagName.toLowerCase(),
                type: el.type || null,
              });
            }
            // De-dup by selector, keep highest score
            const seen = new Map();
            for (const c of out) {
              const prev = seen.get(c.selector);
              if (!prev || prev.score < c.score) seen.set(c.selector, c);
            }
            return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 5);
          };

          const usernameCandidates = rank(inputs, userKw, 'username');
          const passwordCandidates = rank(inputs, passKw, 'password');
          const submitCandidates = rank(buttons, submitKw, 'submit');

          // If submit has nothing keyword-matched, fall back to the first
          // visible button inside the form containing the password field.
          let submitFinal = submitCandidates;
          if (submitFinal.length === 0 && passwordCandidates.length > 0) {
            const passEl = document.querySelector(passwordCandidates[0].selector);
            const form = passEl && passEl.closest('form');
            if (form) {
              const btn = form.querySelector('button[type="submit"], button, input[type="submit"]');
              if (btn && isVisible(btn)) {
                submitFinal = [{
                  selector: buildSelector(btn),
                  score: 5,
                  reason: 'fallback: only visible button in login form',
                  sample: sample(btn),
                  tag: btn.tagName.toLowerCase(),
                  type: btn.type || null,
                }];
              }
            }
          }

          return {
            url: location.href,
            inputCount: inputs.length,
            buttonCount: buttons.length,
            suggestions: {
              username: usernameCandidates,
              password: passwordCandidates,
              submit: submitFinal,
            },
          };
        });

        let screenshot = null;
        if (captureShot) {
          try {
            const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
            screenshot = 'data:image/jpeg;base64,' + buf.toString('base64');
          } catch (_) {}
        }

        return { data: { ...result, finalUrl: page.url(), pageError, screenshot }, type: 'application/json' };
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
    const sg = data.suggestions || {};
    const best = {
      username: sg.username?.[0]?.selector || '',
      password: sg.password?.[0]?.selector || '',
      submit:   sg.submit?.[0]?.selector || '',
    };

    await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'suggestLoginSelectors',
      status: 'success',
      metadata: JSON.stringify({
        login_url,
        best,
        counts: {
          username: sg.username?.length || 0,
          password: sg.password?.length || 0,
          submit:   sg.submit?.length || 0,
        },
      }),
      execution_ms: Date.now() - serveStarted,
    }).catch(() => {});

    return Response.json({
      ok: true,
      finalUrl: data.finalUrl,
      pageError: data.pageError,
      screenshot: data.screenshot,
      inputCount: data.inputCount,
      buttonCount: data.buttonCount,
      suggestions: sg,
      best,
      elapsed_ms: Date.now() - serveStarted,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});