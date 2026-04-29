import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

// Atomically cancel a run server-side. Replaces the previous client-side
// cancel that fetched all results, updated each one in a Promise.all, and
// then recomputed counters from the result list. With 1k+ results that path
// took 30-60s and raced with `runWorkerScheduled`. Doing it server-side keeps
// it fast (single bulk filter) and avoids the race because we set
// status: cancelled before the cron's next tick has a chance to claim more.

Deno.serve(async (req) => {
  const serveStarted = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { run_id } = await req.json();
    if (!run_id) return Response.json({ error: 'Missing run_id' }, { status: 400 });

    const runs = await base44.asServiceRole.entities.TestRun.filter({ id: run_id });
    const run = runs[0];
    if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

    if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') {
      await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'cancelRun',
      status: 'success',
      metadata: JSON.stringify({ run_id, already_terminal: true, status: run.status }),
      execution_ms: Date.now() - serveStarted
    }).catch(() => {});
    return Response.json({ ok: true, already_terminal: true, status: run.status });
    }

    // L28 fix: race-free cancel via incremental counter math.
    // Previous version: 1) write status=cancelled, 2) read all 5k rows,
    // 3) tally everything, 4) overwrite the TestRun with counters. Two
    // sequential TestRun writes plus a full-table read.
    //
    // New approach: only fetch the in-flight rows (the only ones that need
    // changing), trust the existing counters for working/failed/error, and
    // adjust them by the cancel deltas. Single TestRun write, single
    // targeted read. Status flip moves to that one write so cron-readers
    // never see an inconsistent {status: cancelled, pending: 5000} state.
    const inFlight = await base44.asServiceRole.entities.TestResult.filter(
      { run_id, status: 'queued' }, '-created_date', 10000
    );
    const inFlightRunning = await base44.asServiceRole.entities.TestResult.filter(
      { run_id, status: 'running' }, '-created_date', 10000
    );
    const cancelled = [...inFlight, ...inFlightRunning];

    await Promise.all(cancelled.map((r) =>
      base44.asServiceRole.entities.TestResult.update(r.id, {
        status: 'error',
        error_message: 'Cancelled',
        tested_at: new Date().toISOString(),
      })
    ));

    await base44.asServiceRole.entities.TestRun.update(run_id, {
      status: 'cancelled',
      ended_at: new Date().toISOString(),
      elapsed_ms: run.started_at ? Date.now() - new Date(run.started_at).getTime() : (run.elapsed_ms || 0),
      pending_count: 0,
      working_count: run.working_count || 0,
      failed_count: run.failed_count || 0,
      error_count: (run.error_count || 0) + cancelled.length,
    });

    logEvent(base44, {
      level: 'warn', category: 'system', site: run.site_key, session_id: run_id,
      message: `Run cancelled · ${run.label || run_id} · ${cancelled.length} in-flight rows aborted`,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      function_name: 'cancelRun',
      status: 'success',
      metadata: JSON.stringify({ run_id, cancelled: cancelled.length }),
      execution_ms: Date.now() - serveStarted
    }).catch(() => {});

    return Response.json({ ok: true, cancelled: cancelled.length });
  } catch (error) {
    let base44;
    try { base44 = createClientFromRequest(req); } catch (_) {}
    if (base44) {
      await base44.asServiceRole.entities.AuditLog.create({
        function_name: 'cancelRun',
        status: 'error',
        metadata: JSON.stringify({ error: error.message }),
        execution_ms: Date.now() - serveStarted
      }).catch(() => {});
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});