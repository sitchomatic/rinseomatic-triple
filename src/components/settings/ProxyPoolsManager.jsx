import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Layers3, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK = {
  name: "",
  description: "",
  proxy_ids: [],
  rotation_strategy: "round_robin",
  latency_threshold_ms: 500,
  failure_threshold: 3,
  auto_ban_enabled: true,
  auto_ban_triggers: ["captcha", "ip_block", "rate_limit", "403"],
  enabled: true,
};

export default function ProxyPoolsManager({ proxies = [] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(BLANK);
  const editing = !!draft.id;

  const { data: pools = [] } = useQuery({
    queryKey: ["proxy-pools"],
    queryFn: () => base44.entities.ProxyPool.list("-created_date", 100),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (d) => d.id ? base44.entities.ProxyPool.update(d.id, d) : base44.entities.ProxyPool.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxy-pools"] });
      setDraft(BLANK);
      toast.success(editing ? "Proxy pool updated" : "Proxy pool added");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProxyPool.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxy-pools"] });
      toast.success("Proxy pool deleted");
    },
  });

  const selected = new Set(draft.proxy_ids || []);
  const toggleProxy = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setDraft({ ...draft, proxy_ids: [...next] });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Layers3 className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Proxy pools</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Group external proxies and define rotation rules used by global and per-run proxy pool mode.
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{pools.length} pools</span>
      </div>

      <div className="space-y-2">
        {pools.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">
            No proxy pools yet. Create one below from your saved external proxies.
          </div>
        )}
        {pools.map((pool) => (
          <div key={pool.id} className={cn("rounded-md border bg-secondary/20 px-3 py-2", draft.id === pool.id ? "border-primary/60 ring-1 ring-primary/20" : "border-border")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {pool.name}
                  {!pool.enabled && <span className="text-[10px] text-amber-300">disabled</span>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{pool.description || "No description"}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-1">
                  {(pool.proxy_ids || []).length} proxies · {pool.rotation_strategy || "round_robin"} · ban after {pool.failure_threshold || 3} failures
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDraft(pool)}><Pencil className="h-3 w-3" /> Edit</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400" onClick={() => deleteMut.mutate(pool.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium flex items-center gap-1.5"><Plus className="h-3 w-3" /> {editing ? "Edit proxy pool" : "Add proxy pool"}</div>
          {editing && <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDraft(BLANK)}><X className="h-3 w-3" /> Cancel</Button>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Description"><Input value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="Rotation strategy">
            <Select value={draft.rotation_strategy || "round_robin"} onValueChange={(v) => setDraft({ ...draft, rotation_strategy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round robin</SelectItem>
                <SelectItem value="weighted">Weighted</SelectItem>
                <SelectItem value="random">Random</SelectItem>
                <SelectItem value="least_latency">Least latency</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Latency threshold (ms)"><Input type="number" value={draft.latency_threshold_ms ?? 500} onChange={(e) => setDraft({ ...draft, latency_threshold_ms: Number(e.target.value) || 0 })} /></Field>
          <Field label="Failure threshold"><Input type="number" value={draft.failure_threshold ?? 3} onChange={(e) => setDraft({ ...draft, failure_threshold: Number(e.target.value) || 0 })} /></Field>
          <label className="flex items-end gap-2 text-xs pb-2 cursor-pointer">
            <Switch checked={draft.enabled !== false} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} /> Enabled
          </label>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Pool proxies</Label>
          <div className="grid sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto thin-scroll rounded-md border border-border bg-card/30 p-2">
            {proxies.length === 0 ? (
              <div className="sm:col-span-2 text-[10px] text-muted-foreground">Add external proxies first.</div>
            ) : proxies.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer rounded px-1.5 py-1 hover:bg-secondary/40">
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleProxy(p.id)} />
                <span className="truncate">{p.label || `${p.host}:${p.port}`}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 px-3 py-2 cursor-pointer">
          <div>
            <div className="text-xs">Auto-ban unhealthy proxies</div>
            <div className="text-[10px] text-muted-foreground">Uses trigger labels: {(draft.auto_ban_triggers || []).join(", ")}</div>
          </div>
          <Switch checked={draft.auto_ban_enabled !== false} onCheckedChange={(v) => setDraft({ ...draft, auto_ban_enabled: v })} />
        </label>

        <Button size="sm" onClick={() => saveMut.mutate(draft)} disabled={!draft.name || saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : editing ? "Save pool" : "Add pool"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="grid gap-1"><Label className="text-xs">{label}</Label>{children}</div>;
}