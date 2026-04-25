import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Save, Play, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function MaintenancePanel({ settings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(settings || {});
  const [lastResult, setLastResult] = React.useState(null);

  React.useEffect(() => setDraft(settings || {}), [settings]);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      const payload = {
        worker_max_parallel_runs: Number(d.worker_max_parallel_runs) || 10,
        auto_heal_idle_minutes: Number(d.auto_heal_idle_minutes) || 4,
        auto_heal_reclaim_budget: Number(d.auto_heal_reclaim_budget) || 200,
        auto_heal_error_rate: Number(d.auto_heal_error_rate) || 0.5,
        auto_heal_min_samples: Number(d.auto_heal_min_samples) || 10,
      };
      if (d.id) return base44.entities.AppSettings.update(d.id, payload);
      return base44.entities.AppSettings.create({ ...payload, singleton_key: "global" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Maintenance settings saved");
    },
  });

  const workerMut = useMutation({
    mutationFn: () => base44.functions.invoke("runWorkerScheduled", {}),
    onSuccess: (res) => {
      const data = res?.data || res;
      setLastResult({ label: "Worker cycle", data });
      toast.success(`Worker processed ${data?.processed ?? 0} run${(data?.processed ?? 0) === 1 ? "" : "s"}`);
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const healMut = useMutation({
    mutationFn: () => base44.functions.invoke("autoHealRuns", {}),
    onSuccess: (res) => {
      const data = res?.data || res;
      setLastResult({ label: "Auto-heal", data });
      toast.success(`Auto-heal scanned ${data?.scanned ?? 0} active run${(data?.scanned ?? 0) === 1 ? "" : "s"}`);
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Settings2 className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Worker & auto-heal controls</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Manual controls and thresholds for backend functions that normally run on schedule.
          </div>
        </div>
        <Button size="sm" className="gap-1.5 h-7" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
          <Save className="h-3 w-3" /> {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="grid sm:grid-cols-5 gap-3">
        <Field label="Max worker runs"><Input type="number" value={draft.worker_max_parallel_runs ?? 10} onChange={(e) => setDraft({ ...draft, worker_max_parallel_runs: e.target.value })} /></Field>
        <Field label="Stuck after min"><Input type="number" value={draft.auto_heal_idle_minutes ?? 4} onChange={(e) => setDraft({ ...draft, auto_heal_idle_minutes: e.target.value })} /></Field>
        <Field label="Reclaim budget"><Input type="number" value={draft.auto_heal_reclaim_budget ?? 200} onChange={(e) => setDraft({ ...draft, auto_heal_reclaim_budget: e.target.value })} /></Field>
        <Field label="Error rate"><Input type="number" step="0.05" value={draft.auto_heal_error_rate ?? 0.5} onChange={(e) => setDraft({ ...draft, auto_heal_error_rate: e.target.value })} /></Field>
        <Field label="Min samples"><Input type="number" value={draft.auto_heal_min_samples ?? 10} onChange={(e) => setDraft({ ...draft, auto_heal_min_samples: e.target.value })} /></Field>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => workerMut.mutate()} disabled={workerMut.isPending}>
          {workerMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run worker cycle now
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => healMut.mutate()} disabled={healMut.isPending}>
          {healMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Auto-heal now
        </Button>
      </div>

      {lastResult && (
        <div className="rounded-md border border-border bg-background/50 p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Last result · {lastResult.label}</div>
          <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto thin-scroll">{JSON.stringify(lastResult.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div className="grid gap-1"><Label className="text-xs">{label}</Label>{children}</div>;
}