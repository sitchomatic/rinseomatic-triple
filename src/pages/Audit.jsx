import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import AuditFilters from "@/components/audit/AuditFilters";
import LogRow from "@/components/audit/LogRow";
import { useLiveLogs } from "@/lib/useLiveLogs";
import { Button } from "@/components/ui/button";
import { Trash2, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import RemediationPanel from "@/components/audit/RemediationPanel";

export default function Audit() {
  const [search, setSearch] = React.useState("");
  const [level, setLevel] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [paused, setPaused] = React.useState(false);
  const [autoscroll, setAutoscroll] = React.useState(true);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const scrollRef = React.useRef(null);

  const { logs, newIds } = useLiveLogs({ paused });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (level !== "all" && l.level !== level) return false;
      if (category !== "all" && l.category !== category) return false;
      if (q && !(l.message || "").toLowerCase().includes(q) && !(l.site || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, level, category, search]);

  // Auto-scroll: keep the newest row in view (newest is at the TOP since list
  // is sorted newest-first), so we scroll the container to top when new events arrive.
  React.useEffect(() => {
    if (!autoscroll || paused) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filtered.length, autoscroll, paused]);

  const clearAll = async () => {
    try {
      // Chunked delete to keep within the connection pool (mirrors Credentials).
      const all = await base44.entities.ActionLog.list("-created_date", 5000);
      const CHUNK = 25;
      for (let i = 0; i < all.length; i += CHUNK) {
        await Promise.all(all.slice(i, i + CHUNK).map((r) => base44.entities.ActionLog.delete(r.id)));
      }
      toast.success(`Cleared ${all.length} log entr${all.length === 1 ? "y" : "ies"}`);
    } catch (e) {
      toast.error(e?.message || "Couldn't clear logs");
    }
  };

  const counts = React.useMemo(() => {
    const c = { success: 0, info: 0, warn: 0, error: 0, debug: 0 };
    for (const l of logs) c[l.level || "info"] = (c[l.level || "info"] || 0) + 1;
    return c;
  }, [logs]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Radio className={`h-3 w-3 ${paused ? "text-muted-foreground" : "text-emerald-300 live-dot"}`} />
            04 · audit · {paused ? "paused" : "live stream"}
          </span>
        }
        title="Audit Log"
        description="Every event as it happens — credential tests, run lifecycle, network probes, cancellations. Streamed in real time."
        actions={
          <Button
            variant="outline" size="sm"
            className="gap-2 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 border-rose-500/30"
            onClick={() => setConfirmClear(true)}
            disabled={logs.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear log
          </Button>
        }
      />

      <RemediationPanel />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Stat label="Total" value={logs.length} />
        <Stat label="Success" value={counts.success} accent="text-emerald-300" />
        <Stat label="Info" value={counts.info} accent="text-sky-300" />
        <Stat label="Warn" value={counts.warn} accent="text-amber-300" />
        <Stat label="Error" value={counts.error} accent="text-rose-300" />
      </div>

      <AuditFilters
        search={search} onSearch={setSearch}
        level={level} onLevel={setLevel}
        category={category} onCategory={setCategory}
        autoscroll={autoscroll} onAutoscroll={setAutoscroll}
        paused={paused} onPause={setPaused}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[88px_24px_72px_64px_1fr] gap-3 px-3 py-2 border-b border-border bg-secondary/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <div>Time</div>
          <div></div>
          <div>Category</div>
          <div>Level</div>
          <div>Event</div>
        </div>
        <div ref={scrollRef} className="max-h-[640px] overflow-y-auto thin-scroll divide-y divide-border/60">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-muted-foreground">
              {logs.length === 0
                ? "Waiting for events… start a run or fire diagnostics to see logs stream in."
                : `No logs match the current filters (${logs.length} hidden).`}
            </div>
          ) : (
            filtered.map((l) => <LogRow key={l.id} log={l} isNew={newIds.has(l.id)} />)
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-3 font-mono">
        Showing {filtered.length} of {logs.length} buffered events · max buffer 500 · oldest events scroll off automatically.
      </p>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the audit log?"
        description="All buffered events will be permanently deleted. New events will continue to stream in."
        confirmLabel="Clear all"
        destructive
        onConfirm={clearAll}
      />
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accent || ""}`}>{value}</div>
    </div>
  );
}