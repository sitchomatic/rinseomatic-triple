import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK = {
  name: "",
  flow_id: "",
  flow_name: "",
  site: "joe",
  interval_unit: "hours",
  interval_value: 1,
  mode: "simple",
  enabled: true,
};

export default function Schedule() {
  const qc = useQueryClient();
  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => base44.entities.Schedule.list("-created_date", 100),
    staleTime: 60_000,
  });
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState(BLANK);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      if (d.id) return base44.entities.Schedule.update(d.id, d);
      return base44.entities.Schedule.create(d);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setDraft(BLANK);
      toast.success("Schedule saved");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Schedule.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Schedule deleted");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.Schedule.update(id, { enabled: !enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const editing = !!draft.id;

  const getNextRun = (schedule) => {
    if (!schedule.next_run_at) return "Not scheduled";
    const date = new Date(schedule.next_run_at);
    return date.toLocaleString();
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="04 · automation"
        title="Scheduled Runs"
        description="Set up automated testing runs on a schedule. Tests execute in the background and results are saved."
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-3">
          {schedules.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
              No schedules yet. Create one on the right.
            </div>
          )}
          {schedules.map((s) => (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border bg-card p-4 transition-colors",
                draft.id === s.id ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium">{s.name}</div>
                    <StatusPill status={s.last_run_status || "idle"} />
                    {!s.enabled && <span className="text-[10px] font-mono uppercase text-amber-300">disabled</span>}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground mb-2">
                    {s.interval_unit === "cron" ? s.cron_expression : `Every ${s.interval_value} ${s.interval_unit}`}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>Site: <span className="font-mono">{s.site}</span></div>
                    <div>Next run: {getNextRun(s)}</div>
                    {s.run_count > 0 && <div>Runs completed: <span className="font-mono">{s.run_count}</span></div>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setDraft(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleMut.mutate({ id: s.id, enabled: s.enabled })}
                  >
                    {s.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                    onClick={() => setConfirmDelete(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3 h-fit sticky top-6">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">{editing ? "Edit schedule" : "New schedule"}</div>
          </div>

          <Field
            label="Name"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
            help="Human-friendly label (e.g. 'Daily Joe tests')"
          />

          <Field
            label="Site"
            value={draft.site}
            onChange={(v) => setDraft({ ...draft, site: v })}
            as="select"
            options={sites.map((s) => ({ value: s.key, label: s.label }))}
          />

          <Field
            label="Schedule mode"
            value={draft.mode}
            onChange={(v) => setDraft({ ...draft, mode: v })}
            as="select"
            options={[
              { value: "simple", label: "Simple interval" },
              { value: "cron", label: "Cron expression" },
            ]}
            help="Simple = every N hours/days. Cron = custom pattern."
          />

          {draft.mode === "simple" && (
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Every"
                type="number"
                value={draft.interval_value}
                onChange={(v) => setDraft({ ...draft, interval_value: Number(v) || 1 })}
              />
              <Field
                label="Unit"
                value={draft.interval_unit}
                onChange={(v) => setDraft({ ...draft, interval_unit: v })}
                as="select"
                options={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours", label: "Hours" },
                  { value: "days", label: "Days" },
                ]}
              />
            </div>
          )}

          {draft.mode === "cron" && (
            <Field
              label="Cron expression"
              value={draft.cron_expression || ""}
              onChange={(v) => setDraft({ ...draft, cron_expression: v })}
              mono
              help="e.g. '0 9 * * 1-5' = 9am weekdays"
            />
          )}

          <label className="flex items-center justify-between gap-2 cursor-pointer rounded-md border border-border bg-background/40 px-3 py-2">
            <div className="text-xs">
              <div>Enabled</div>
              <div className="text-[10px] text-muted-foreground">{draft.enabled ? "Active" : "Paused"}</div>
            </div>
            <Switch checked={!!draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
          </label>

          <div className="flex gap-2 pt-2 border-t border-border/60">
            {editing && <Button variant="outline" size="sm" onClick={() => setDraft(BLANK)}>Cancel</Button>}
            <Button
              size="sm"
              onClick={() => saveMut.mutate(draft)}
              disabled={!draft.name || !draft.site || saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete schedule?"
        description={confirmDelete ? `${confirmDelete.name} will be removed.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) deleteMut.mutate(confirmDelete.id); setConfirmDelete(null); }}
      />
    </div>
  );
}

function Field({ label, value, onChange, help, type = "text", mono, as, options }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      {as === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={mono ? "font-mono text-xs" : ""} />
      )}
      {help && <p className="text-[10px] text-muted-foreground">{help}</p>}
    </div>
  );
}