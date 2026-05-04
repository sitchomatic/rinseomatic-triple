import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LATENCY_ALERT_MS = 500;

function statusTone(status, latency) {
  if (status === "down") return "text-rose-300 border-rose-500/30 bg-rose-500/10";
  if (status === "degraded") return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  if (latency != null && latency > LATENCY_ALERT_MS) return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  if (status === "healthy") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  return "text-muted-foreground border-border bg-secondary/40";
}

function StatusIcon({ status, latency }) {
  if (status === "down") return <XCircle className="h-3.5 w-3.5 text-rose-300" />;
  if (status === "degraded" || (latency != null && latency > LATENCY_ALERT_MS)) {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />;
  }
  if (status === "healthy") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />;
  return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
}

export default function ProxyHealthMonitor() {
  const qc = useQueryClient();
  const { data: proxies = [], isLoading } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-last_check", 50),
    refetchInterval: 30_000,
  });

  const pingMut = useMutation({
    mutationFn: () => base44.functions.invoke("pingProxies", {}),
    onSuccess: (res) => {
      const n = res?.data?.checked ?? 0;
      toast.success(`Pinged ${n} prox${n === 1 ? "y" : "ies"}`);
      qc.invalidateQueries({ queryKey: ["proxies"] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || e?.message || "Ping failed"),
  });

  const visible = proxies.filter((p) => p.protocol !== "wireguard" && p.host);

  const stats = React.useMemo(() => {
    const s = { healthy: 0, slow: 0, down: 0, untested: 0 };
    for (const p of visible) {
      if (p.status === "down") s.down++;
      else if (p.status === "untested" || !p.status) s.untested++;
      else if (p.latency_ms != null && p.latency_ms > LATENCY_ALERT_MS) s.slow++;
      else if (p.status === "healthy") s.healthy++;
      else s.slow++;
    }
    return s;
  }, [visible]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">Proxy health</div>
          <div className="hidden md:flex items-center gap-2 ml-3 text-[11px] font-mono text-muted-foreground">
            <span className="text-emerald-300">{stats.healthy} healthy</span>
            <span>·</span>
            <span className="text-amber-300">{stats.slow} slow</span>
            <span>·</span>
            <span className="text-rose-300">{stats.down} down</span>
            {stats.untested > 0 && <><span>·</span><span>{stats.untested} untested</span></>}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => pingMut.mutate()}
          disabled={pingMut.isPending || visible.length === 0}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pingMut.isPending && "animate-spin")} />
          {pingMut.isPending ? "Pinging…" : "Ping now"}
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-muted-foreground">
          {isLoading ? "Loading proxies…" : "No external proxies configured."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_90px_90px_110px_140px] gap-3 px-4 py-2 border-b border-border bg-secondary/20 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <div>Proxy</div>
            <div>Status</div>
            <div className="text-right">Latency</div>
            <div>Country</div>
            <div>Last check</div>
          </div>
          <div className="divide-y divide-border/60 max-h-[320px] overflow-y-auto thin-scroll">
            {visible.map((p) => {
              const tone = statusTone(p.status, p.latency_ms);
              const slow = p.latency_ms != null && p.latency_ms > LATENCY_ALERT_MS;
              return (
                <div key={p.id} className="grid grid-cols-[1fr_90px_90px_110px_140px] gap-3 px-4 py-2 items-center text-xs">
                  <div className="min-w-0">
                    <div className="truncate">{p.label || `${p.host}:${p.port}`}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{p.host}:{p.port}</div>
                  </div>
                  <div>
                    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", tone)}>
                      <StatusIcon status={p.status} latency={p.latency_ms} />
                      {p.status || "untested"}
                    </span>
                  </div>
                  <div className={cn("text-right font-mono tabular-nums", slow ? "text-amber-300 font-semibold" : "text-muted-foreground")}>
                    {p.latency_ms != null ? `${p.latency_ms}ms` : "—"}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {p.last_country || "—"}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {p.last_check ? new Date(p.last_check).toLocaleTimeString() : "never"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 text-[10px] font-mono text-muted-foreground border-t border-border bg-secondary/20">
            Threshold · proxies above {LATENCY_ALERT_MS}ms are flagged amber. Auto-refresh every 30s.
          </div>
        </>
      )}
    </div>
  );
}