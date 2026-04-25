// Server-side cron that progresses ALL active runs without needing an open tab.
// Called by a scheduled automation every 5 minutes.
//
// Strategy:
//   1. Find every TestRun in 'queued' or 'running' state.
//   2. Invoke runWorker for each one (in parallel waves).
//   3. runWorker itself handles claiming, executing, retrying, completing,
//      and stuck-recovery — we just keep the wheel turning.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// MAX_PARALLEL_RUNS: hard ceiling on Browserless fan-out per cron tick.
// Beyond this, queued runs simply wait until the next tick. Keeps us from
// stampeding our Browserless quota when 50 runs are simultaneously in flight.
const MAX_PARALLEL_RUNS = 10;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow either a logged-in admin (manual kick from UI) or service-role
    // invocation (the scheduled automation, which has no end-user token).
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* unauth = scheduled */ }
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
    const maxParallelRuns = Math.max(1, Math.min(50, Number(settingsRows[0]?.worker_max_parallel_runs) || MAX_PARALLEL_RUNS));

    const queued = await base44.asServiceRole.entities.TestRun.filter({ status: 'queued' }, '-created_date', 50);
    const running = await base44.asServiceRole.entities.TestRun.filter({ status: 'running' }, '-created_date', 50);
    const active = [...queued, ...running];

    if (active.length === 0) {
      return Response.json({ done: true, ran: 0 });
    }

    // C3: Fire all up to the ceiling in parallel — no wave structure.
    // Previous code waited for the slowest run in each wave before starting
    // the next, blocking fast runs behind slow ones. With the ceiling, we
    // simply truncate to the top N most-recent active runs; the rest get
    // picked up on the next 5-minute tick.
    const slice = active.slice(0, maxParallelRuns);
    const results = await Promise.allSettled(slice.map((run) =>
      base44.asServiceRole.functions.invoke('runWorker', { run_id: run.id })
    ));
    const processed = results.filter((r) => r.status === 'fulfilled').length;
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`runWorker failed for ${slice[i].id}:`, r.reason?.message);
    });

    return Response.json({ done: true, total: active.length, processed, deferred: Math.max(0, active.length - slice.length) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});