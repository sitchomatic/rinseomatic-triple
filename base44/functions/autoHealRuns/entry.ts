// Fully-automatic auto-heal job. Runs on a schedule. For each non-terminal run:
//   1. Detect stuck rows (status='running' for >IDLE_MAX_MS) and re-queue them.
//   2. If error rate on completed rows is high (>HIGH_ERROR_RATE) AND most
//      errors are 'blocked' (IP block / captcha) — rotate the run's proxy
//      (toggles sticky off, switches preset) so subsequent claimed batches
//      get fresh IPs.
//   3. Reset 'queued'/'error' counts when re-queuing so the worker picks
//      them back up.
// All actions are logged to ActionLog with category='system'.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const IDLE_MAX_MS = 4 * 60 * 1000;        // 4 min — a row pinned to 'running' this long is dead
const STUCK_RECLAIM_BUDGET = 200;          // safety cap per run per cycle
const HIGH_ERROR_RATE = 0.5;               // 50%+ errored → rotate proxy
const MIN_SAMPLES_FOR_ROTATION = 10;       // need at least N completed rows to judge

const BLOCKED_KEYWORDS = ['captcha', 'forbidden', 'access.?denied', 'ip.?block', 'cloudflare', 'rate.?limit'];
function isBlockedMsg(msg) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return BLOCKED_KEYWORDS.some((k) => new RegExp(k).test(lower));
}

async function log(base44, message, level = 'info') {
  try {
    await base44.asServiceRole.entities.ActionLog.create({
      category: 'system',
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (_) { /* logging is best-effort */ }
}

async function healOneRun(base44, run, config) {
  const summary = { run_id: run.id, requeued_stuck: 0, rotated_proxy: false, notes: [] };
  const now = Date.now();
  const idleMaxMs = Math.max(1, Number(config.auto_heal_idle_minutes) || 4) * 60 * 1000;
  const reclaimBudget = Math.max(1, Math.min(1000, Number(config.auto_heal_reclaim_budget) || STUCK_RECLAIM_BUDGET));
  const highErrorRate = Math.max(0.05, Math.min(1, Number(config.auto_heal_error_rate) || HIGH_ERROR_RATE));
  const minSamples = Math.max(1, Number(config.auto_heal_min_samples) || MIN_SAMPLES_FOR_ROTATION);

  // ---- 1. Stuck rows ----
  const running = await base44.asServiceRole.entities.TestResult.filter(
    { run_id: run.id, status: 'running' }, '-tested_at', reclaimBudget
  );
  const stuck = running.filter((r) => {
    const t = r.started_at ? new Date(r.started_at).getTime() : (r.tested_at ? new Date(r.tested_at).getTime() : 0);
    return t > 0 && now - t > idleMaxMs;
  });

  if (stuck.length > 0) {
    await Promise.all(stuck.map((r) =>
      base44.asServiceRole.entities.TestResult.update(r.id, {
        status: 'queued',
        live_url: null,
        error_message: '[Auto-heal] Reclaimed from stuck running state',
      })
    ));
    summary.requeued_stuck = stuck.length;
    summary.notes.push(`Reclaimed ${stuck.length} stuck rows`);
    await log(base44, `Auto-heal: reclaimed ${stuck.length} stuck rows for run ${run.id}`, 'warn');
  }

  // ---- 2. High block rate → rotate proxy ----
  // Sample the last 50 errored rows and see if most look "blocked".
  const errored = await base44.asServiceRole.entities.TestResult.filter(
    { run_id: run.id, status: 'error' }, '-tested_at', 50
  );
  const totalCompleted = (run.working_count || 0) + (run.failed_count || 0) + (run.error_count || 0);
  if (totalCompleted >= minSamples && errored.length >= minSamples) {
    const errorRate = (run.error_count || 0) / totalCompleted;
    const blockedCount = errored.filter((r) => isBlockedMsg(r.error_message)).length;
    const blockedRatio = blockedCount / errored.length;

    if (errorRate > highErrorRate && blockedRatio > 0.5) {
      const currentMode = run.proxy_mode || config.proxy_mode || 'premium';
      if (currentMode === 'stealth' || currentMode === 'premium') {
        const nextMode = currentMode === 'stealth' ? 'premium' : 'stealth';
        await base44.asServiceRole.entities.TestRun.update(run.id, { proxy_mode: nextMode });
        summary.rotated_proxy = true;
        summary.notes.push(`Rotated proxy mode: ${currentMode} → ${nextMode}`);
        await log(
          base44,
          `Auto-heal: rotated proxy mode for run ${run.id} (${currentMode} → ${nextMode}, error rate ${(errorRate*100).toFixed(0)}%, blocked ratio ${(blockedRatio*100).toFixed(0)}%)`,
          'warn'
        );
      }
    }
  }

  return summary;
}

Deno.serve(async (req) => {
  const serveStarted = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    // Allow scheduled (system) calls and admins. The platform passes a
    // service-role context for cron triggers — base44.auth.me() returns null
    // in that case, which we treat as authorised.
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const settings = settingsRows[0] || {};

    const active = await base44.asServiceRole.entities.TestRun.filter(
      { status: { $in: ['running', 'queued'] } }, '-created_date', 50
    );

    if (active.length === 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        function_name: 'autoHealRuns',
        status: 'success',
        metadata: JSON.stringify({ scanned: 0, healed: 0, note: 'no active runs' }),
        execution_ms: Date.now() - serveStarted
      }).catch(() => {});
      return Response.json({ ok: true, healed: [], note: 'no active runs' });
    }

    const summaries = [];
    for (const run of active) {
      try {
        const s = await healOneRun(base44, run, settings);
        if (s.requeued_stuck > 0 || s.rotated_proxy) summaries.push(s);
      } catch (e) {
        await log(base44, `Auto-heal failed for run ${run.id}: ${e.message}`, 'error');
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'autoHealRuns',
      status: 'success',
      metadata: JSON.stringify({ scanned: active.length, healed: summaries.length }),
      execution_ms: Date.now() - serveStarted
    }).catch(() => {});

    return Response.json({ ok: true, scanned: active.length, healed: summaries });
  } catch (error) {
    let base44;
    try { base44 = createClientFromRequest(req); } catch (_) {}
    if (base44) {
      await base44.asServiceRole.entities.AuditLog.create({
        function_name: 'autoHealRuns',
        status: 'error',
        metadata: JSON.stringify({ error: error.message }),
        execution_ms: Date.now() - serveStarted
      }).catch(() => {});
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});