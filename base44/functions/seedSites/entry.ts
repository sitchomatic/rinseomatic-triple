import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_SITES = [
  {
    key: 'joe',
    label: 'Joe',
    login_url: 'https://www.joefortune.com/login',
    username_selector: "input[type='email'], input[name='email'], #email, #username, input[name='username']",
    password_selector: "input[type='password'], #login-password, #password",
    submit_selector: "button[type='submit'], #login-submit, .login-submit",
    success_selector: '.balance-container, .user-profile, .icon-profile, .user-balance, .account-balance',
    login_url_marker: '/login',
    wait_after_submit_ms: 5000,
    enabled: true,
  },
  {
    key: 'ignition',
    label: 'Ignition',
    login_url: 'https://www.ignitioncasino.eu/login',
    username_selector: "input[type='email'], input[name='email'], #email, #username, input[name='username']",
    password_selector: "input[type='password'], #login-password, #password",
    submit_selector: "button[type='submit'], #login-submit, .login-submit",
    success_selector: '.balance-container, .user-profile, .icon-profile, .user-balance, .account-balance',
    login_url_marker: '/login',
    wait_after_submit_ms: 5000,
    enabled: true,
  },
  {
    key: 'ppsr',
    label: 'PPSR',
    login_url: 'https://example.com/login',
    username_selector: "input[type='email'], input[name='username']",
    password_selector: "input[type='password']",
    submit_selector: "button[type='submit']",
    success_selector: '.ol-alert__content.ol-alert__content--status_success',
    login_url_marker: '/login',
    wait_after_submit_ms: 3500,
    enabled: true,
  },
  {
    key: 'double',
    label: 'Double (Joe + Ignition)',
    login_url: '',
    username_selector: "input[type='email'], input[name='email'], #email, #username, input[name='username']",
    password_selector: "input[type='password'], #login-password, #password",
    submit_selector: "button[type='submit'], #login-submit, .login-submit",
    success_selector: '.balance-container, .user-profile, .icon-profile, .user-balance, .account-balance',
    login_url_marker: '/login',
    wait_after_submit_ms: 5000,
    enabled: true,
    secondary_site_keys: ['joe', 'ignition'],
    skip_primary: true,
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // L16 fix: only fetch the keys that matter (parallel filters), not the
    // entire site list. Saves a full-table read for a 4-key existence check.
    const checks = await Promise.all(
      DEFAULT_SITES.map((s) => base44.asServiceRole.entities.Site.filter({ key: s.key }))
    );
    const toCreate = DEFAULT_SITES.filter((_, i) => checks[i].length === 0);
    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.Site.bulkCreate(toCreate);
    }
    return Response.json({ created: toCreate.length, existing: DEFAULT_SITES.length - toCreate.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});