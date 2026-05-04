import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Wrench, Loader2, RefreshCw, AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Pulls the most recent failed/error TestResults so the user can pick rows
// to re-run. Triggering re-validation also kicks the autoHealRuns function
// so any stuck/blocked rows in active runs get reclaimed in the same pass.
export default function RemediationPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState(new Set());
  const [healSummary, setHealSummary] = React.useState(null);

  const { data: failures = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["remediation-failures"],
    queryFn: () => base44.entities.TestResult.filter(
      { status: { $in: ["failed", "error"] } }, "-tested_at", 50
    ),
    staleTime: 30_000,
  });

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === failures.length) setSelected(new Set());
    else setSelected(new Set(failures.map((f) => f.id)));
  };

  const remediate = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      // Re-queue the chosen rows so the worker picks them up again.
      const CHUNK = 20;
      for (let i = 0; i < ids.length; i += CHUNK) {
        await Promise.all(ids.slice(i, i + CHUNK).map((id) =>
          base44.entities.TestResult.update(id, {
            status: "queued",
            error_message: "[Remediation] Re-queued from audit panel",
          })
        ));
      }
      // Trigger auto-heal across active runs (covers proxy rotation + stuck reclaim).
      const heal = await base44.functions.invoke("autoHealRuns", {});
      return { requeued: ids.length, heal: heal?.data || heal };
    },
    onSuccess: ({ requeued, heal }) => {
      setHealSummary(heal);
      setSelected(new Set());
      toast.success(`Re-queued ${requeued} test${requeued === 1 ? "" : "s"} for re-validation`);
      qc.invalidateQueries({ queryKey: ["remediation-failures"] });
      qc.invalidateQueries({ queryKey: ["test-runs"] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || e?.message || "Remediation failed"),
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">Remediation</div>
          <div className="hidden md:block text-[11px] font-mono text-muted-foreground ml-2">
            {failures.length} recent failure{failures.length === 1 ? "" : "s"} · {selected.size} selected
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => remediate.mutate()}
            disabled={selected.size === 0 || remediate.isPending}
            title="Re-queues the selected failed tests and runs auto-heal across active runs"
          >
            {remediate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            {remediate.isPending ? "Healing…" : `Re-run ${selected.size || ""}`.trim()}
          </Button>
        </div>
      </div>

      {failures.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-muted-foreground">
          {isLoading ? "Loading failures…" : "No recent failed tests. System is healthy."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[28px_1fr_120px_90px_minmax(0,2fr)_120px] gap-3 px-4 py-2 border-b border-border bg-secondary/20 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <Checkbox
              checked={selected.size === failures.length && failures.length > 0}
              onCheckedChange={toggleAll}
              className="h-3.5 w-3.5"
            />
            <div>Username</div>
            <div>Site</div>
            <div>Status</div>
            <div>Error</div>
            <div>Tested</div>
          </div>
          <div className="divide-y divide-border/60 max-h-[340px] overflow-y-auto thin-scroll">
            {failures.map((f) => (
              <label
                key={f.id}
                className={cn(
                  "grid grid-cols-[28px_1fr_120px_90px_minmax(0,2fr)_120px] gap-3 px-4 py-2 items-center text-xs cursor-pointer hover:bg-secondary/30",
                  selected.has(f.id) && "bg-primary/5"
                )}
              >
                <Checkbox
                  checked={selected.has(f.id)}
                  onCheckedChange={() => toggle(f.id)}
                  className="h-3.5 w-3.5"
                />
                <div className="truncate font-mono">{f.username || "—"}</div>
                <div className="font-mono text-muted-foreground">{f.site_key}</div>
                <div>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                    f.status === "error"
                      ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
                      : "text-amber-300 border-amber-500/30 bg-amber-500/10"
                  )}>
                    {f.status === "error" ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {f.status}
                  </span>
                </div>
                <div className="text-muted-foreground truncate" title={f.error_message || ""}>
                  {f.error_message || f.final_url || "—"}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {f.tested_at ? new Date(f.tested_at).toLocaleString() : "—"}
                </div>
              </label>
            ))}
          </div>
        </>
      )}

      {healSummary && (
        <div className="px-4 py-2 text-[10px] font-mono text-muted-foreground border-t border-border bg-secondary/20">
          Auto-heal · scanned {healSummary.scanned ?? 0} active run{healSummary.scanned === 1 ? "" : "s"}
          {Array.isArray(healSummary.healed) && healSummary.healed.length > 0
            ? ` · ${healSummary.healed.length} healed (${healSummary.healed.reduce((a, h) => a + (h.requeued_stuck || 0), 0)} stuck rows reclaimed)`
            : " · no active runs needed healing"}
        </div>
      )}
    </div>
  );
}