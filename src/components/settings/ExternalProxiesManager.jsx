import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Network, Pencil, X, Activity, Loader2, Shield, CheckCircle2, XCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const BLANK = { label: "", host: "", port: 8080, protocol: "http", username: "", password: "", region: "", enabled: true };

const HEALTH_STYLES = {
  healthy: { dot: "bg-emerald-400", text: "text-emerald-300", label: "Healthy" },
  degraded: { dot: "bg-amber-400", text: "text-amber-300", label: "Degraded" },
  down: { dot: "bg-rose-400", text: "text-rose-300", label: "Down" },
  untested: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Untested" },
};

export default function ExternalProxiesManager({ proxies = [] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(BLANK);
  const editing = !!draft.id;

  const saveMut = useMutation({
    mutationFn: (d) => d.id ? base44.entities.Proxy.update(d.id, d) : base44.entities.Proxy.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proxies"] }); setDraft(BLANK); toast.success(editing ? "Proxy updated" : "Proxy added"); },
  });
  const delMut = useMutation({
    mutationFn: (id) => base44.entities.Proxy.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proxies"] }); toast.success("Proxy deleted"); },
  });

  // Trigger an on-demand ping of all enabled proxies. The same backend
  // function is also wired to a daily scheduled automation.
  const pingMut = useMutation({
    mutationFn: () => base44.functions.invoke("pingProxies", {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["proxies"] });
      const data = res?.data || res;
      toast.success(`Pinged ${data?.checked ?? 0} prox${(data?.checked ?? 0) === 1 ? "y" : "ies"}`);
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const [wgResult, setWgResult] = React.useState(null); // { id, ok, msg }
  const wgTestMut = useMutation({
    mutationFn: (id) => base44.functions.invoke("testWireguardProxy", { proxy_id: id }),
    onSuccess: (res, id) => {
      const data = res?.data || res;
      qc.invalidateQueries({ queryKey: ["proxies"] });
      if (data?.ok) {
        setWgResult({ id, ok: true, msg: `Endpoint reachable (${data.probe?.latency_ms}ms) · ${data.parsed?.host}:${data.parsed?.port}` });
        toast.success("WireGuard endpoint reachable");
      } else {
        setWgResult({ id, ok: false, msg: data?.error || "Test failed" });
        toast.error(data?.error || "WireGuard test failed");
      }
    },
    onError: (e, id) => {
      const msg = e?.response?.data?.error || e.message;
      setWgResult({ id, ok: false, msg });
      toast.error(msg);
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Network className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">External proxies</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Your own HTTP / HTTPS / SOCKS5 proxies. Used only when <span className="font-mono text-foreground">Proxy mode = External</span> (set above or per run).
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm" variant="outline" className="gap-1.5 h-7"
            onClick={() => pingMut.mutate()}
            disabled={pingMut.isPending || proxies.filter((p) => p.enabled !== false).length === 0}
            title="Test reachability and latency for every enabled proxy"
          >
            {pingMut.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Activity className="h-3 w-3" />}
            Ping all
          </Button>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {proxies.length} saved
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {proxies.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">
            No external proxies yet. Add one below to make the "External" proxy mode selectable.
          </div>
        )}
        {proxies.map((p) => {
          const health = HEALTH_STYLES[p.status] || HEALTH_STYLES.untested;
          return (
          <div key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-md border bg-secondary/20 px-3 py-2",
              draft.id === p.id ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <span
                  className={cn("h-1.5 w-1.5 rounded-full shrink-0", health.dot)}
                  title={`${health.label}${p.last_check ? ` · checked ${formatDistanceToNow(new Date(p.last_check), { addSuffix: true })}` : ""}`}
                />
                {p.label || `${p.host}:${p.port}`}
                {p.enabled === false && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded px-1.5 py-0.5">disabled</span>
                )}
                {p.status && p.status !== "untested" && (
                  <span className={cn("text-[10px] font-mono", health.text)}>
                    {health.label}{p.latency_ms != null ? ` · ${p.latency_ms}ms` : ""}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">
                {p.protocol === "wireguard" ? (
                  <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" /> wireguard · {p.host || "—"}{p.region ? ` · ${p.region}` : ""}</span>
                ) : (
                  <>{p.protocol}://{p.username ? `${p.username}:•••@` : ""}{p.host}:{p.port}{p.region ? ` · ${p.region}` : ""}</>
                )}
              </div>
              {wgResult && wgResult.id === p.id && (
                <div className={cn("text-[10px] font-mono mt-1 flex items-center gap-1", wgResult.ok ? "text-emerald-300" : "text-rose-300")}>
                  {wgResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {wgResult.msg}
                </div>
              )}
            </div>
            {p.protocol === "wireguard" && (
              <Button
                variant="ghost" size="sm" className="gap-1.5"
                onClick={() => wgTestMut.mutate(p.id)}
                disabled={wgTestMut.isPending}
                title="Validate the WireGuard config and probe endpoint reachability"
              >
                {wgTestMut.isPending && wgTestMut.variables === p.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Shield className="h-3 w-3" />}
                Test
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDraft(p)} title="Load this proxy into the form below for editing">
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400"
              onClick={() => delMut.mutate(p.id)} title="Permanently delete this proxy">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          );
        })}
      </div>

      <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> {editing ? "Edit proxy" : "Add proxy"}
          </div>
          {editing && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDraft(BLANK)} title="Discard edits and reset the form">
              <X className="h-3 w-3" /> Cancel
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Label" help="Friendly name you'll see in the dropdown. Optional.">
            <Input value={draft.label || ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="My AU SOCKS5" />
          </F>
          <F label="Region" help="Informational tag (e.g. AU, US-East). Not used for routing.">
            <Input value={draft.region || ""} onChange={(e) => setDraft({ ...draft, region: e.target.value })} placeholder="AU" />
          </F>
          <F label="Protocol" help="Must match what your proxy provider supports. WireGuard entries are tested for endpoint reachability only — Browserless can't terminate WireGuard natively.">
            <Select value={draft.protocol || "http"} onValueChange={(v) => setDraft({ ...draft, protocol: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
                <SelectItem value="socks5">SOCKS5</SelectItem>
                <SelectItem value="wireguard">WireGuard / NordLynx</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Host" help="Proxy hostname or IP address.">
            <Input value={draft.host || ""} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="proxy.example.com" className="font-mono text-xs" />
          </F>
          <F label="Port" help="Port the proxy listens on.">
            <Input type="number" value={draft.port || ""} onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 0 })} />
          </F>
          <F label="Username" help="Leave blank for open proxies.">
            <Input value={draft.username || ""} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="optional" />
          </F>
          <F label="Password" help="Stored as-is; sent to Browserless over HTTPS.">
            <Input type="password" value={draft.password || ""} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="optional" />
          </F>
          {draft.protocol === "wireguard" && (
            <div className="col-span-2">
              <F label="WireGuard config (.conf)" help="Paste the full NordLynx / WireGuard config — including [Interface] PrivateKey, Address, and [Peer] PublicKey, Endpoint, AllowedIPs.">
                <Textarea
                  value={draft.wireguard_config || ""}
                  onChange={(e) => setDraft({ ...draft, wireguard_config: e.target.value })}
                  rows={8}
                  className="font-mono text-[11px]"
                  placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.5.0.2/32\nDNS = 103.86.96.100\n\n[Peer]\nPublicKey = ...\nEndpoint = au123.nordvpn.com:51820\nAllowedIPs = 0.0.0.0/0"}
                />
              </F>
            </div>
          )}
          <div className="flex items-end justify-between gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span>Enabled</span>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={draft.enabled !== false} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                <span className="text-[11px] text-muted-foreground">
                  {draft.enabled !== false ? "Selectable" : "Hidden from dropdowns"}
                </span>
              </div>
            </label>
            <Button
              size="sm"
              onClick={() => saveMut.mutate(draft)}
              disabled={!draft.host || !draft.port || saveMut.isPending}
              title={!draft.host || !draft.port ? "Host and port are required" : editing ? "Save changes" : "Add this proxy"}
            >
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function F({ label, help, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}