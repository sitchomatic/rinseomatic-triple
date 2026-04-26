import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Check, X, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function RepairSuggestionsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState("pending");
  const [notes, setNotes] = React.useState({});
  const [applyFields, setApplyFields] = React.useState({});

  const { data: suggestions = [] } = useQuery({
    queryKey: ["repair-suggestions", status],
    queryFn: () => status === "all"
      ? base44.entities.RepairSuggestion.list("-created_date", 100)
      : base44.entities.RepairSuggestion.filter({ status }, "-created_date", 100),
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, nextStatus }) => base44.entities.RepairSuggestion.update(id, {
      status: nextStatus,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: notes[id] || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repair-suggestions"] });
      toast.success("Repair suggestion updated");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RepairSuggestion.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repair-suggestions"] });
      toast.success("Repair suggestion deleted");
    },
  });

  const applyMut = useMutation({
    mutationFn: async (suggestion) => {
      if (!suggestion.site || !suggestion.suggested_selector) throw new Error("Missing site or suggested selector");
      const sites = await base44.entities.Site.filter({ key: suggestion.site }, "-created_date", 1);
      const site = sites[0];
      if (!site) throw new Error(`Site not found: ${suggestion.site}`);
      const failed = (suggestion.failed_selector || "").toLowerCase();
      const field = applyFields[suggestion.id] || (failed.includes("password") ? "password_selector" : failed.includes("submit") || failed.includes("button") ? "submit_selector" : "username_selector");
      await base44.entities.Site.update(site.id, { [field]: suggestion.suggested_selector });
      await base44.entities.RepairSuggestion.update(suggestion.id, {
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes[suggestion.id] || `Applied to ${field}`,
      });
      return field;
    },
    onSuccess: (field) => {
      qc.invalidateQueries({ queryKey: ["repair-suggestions"] });
      qc.invalidateQueries({ queryKey: ["sites"] });
      toast.success(`Applied selector to ${field.replace("_", " ")}`);
    },
    onError: (e) => toast.error(e?.message || "Couldn't apply suggestion"),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Wrench className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Selector repair suggestions</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Review suggested selector fixes generated from failed runs before applying them manually to a site.
          </div>
        </div>
        <div className="w-36">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {suggestions.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">
            No {status === "all" ? "" : status} repair suggestions yet.
          </div>
        )}
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-md border border-border bg-secondary/20 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.flow_name || s.site || "Selector repair"}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {s.status || "pending"} · confidence {Math.round((s.confidence || 0) * 100)}%
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400" onClick={() => deleteMut.mutate(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="rounded bg-background/50 border border-border p-2 break-all"><span className="text-muted-foreground">failed:</span> {s.failed_selector}</div>
              <div className="rounded bg-background/50 border border-border p-2 break-all"><span className="text-muted-foreground">suggested:</span> {s.suggested_selector || "—"}</div>
            </div>
            {s.failure_reason && <div className="text-xs text-muted-foreground">{s.failure_reason}</div>}
            <div className="grid sm:grid-cols-[220px_1fr] gap-2">
              <div className="grid gap-1">
                <Label className="text-xs">Apply to field</Label>
                <Select value={applyFields[s.id] || "username_selector"} onValueChange={(v) => setApplyFields({ ...applyFields, [s.id]: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="username_selector">Username selector</SelectItem>
                    <SelectItem value="password_selector">Password selector</SelectItem>
                    <SelectItem value="submit_selector">Submit selector</SelectItem>
                    <SelectItem value="success_selector">Success selector</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Reviewer notes</Label>
                <Input value={notes[s.id] ?? s.reviewer_notes ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => applyMut.mutate(s)} disabled={!s.site || !s.suggested_selector}>
                <Wand2 className="h-3 w-3" /> Apply
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => updateMut.mutate({ id: s.id, nextStatus: "approved" })}>
                <Check className="h-3 w-3" /> Approve only
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => updateMut.mutate({ id: s.id, nextStatus: "rejected" })}>
                <X className="h-3 w-3" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}