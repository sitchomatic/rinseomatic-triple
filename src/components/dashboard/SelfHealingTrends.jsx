import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wrench, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

// Self-healing trends — aggregates RepairSuggestion records (selectors that
// failed, got an AI/automated suggestion, and were approved/rejected) into
// a 14-day chart plus a top-offenders list. Helps operators spot which sites
// or selectors are drifting and need permanent attention.
export default function SelfHealingTrends() {
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["repair-suggestions-trends"],
    queryFn: () => base44.entities.RepairSuggestion.list("-created_date", 500),
    staleTime: 60_000,
  });

  const { chart, totals, topSelectors } = React.useMemo(
    () => aggregate(suggestions),
    [suggestions]
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-8">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          <Wrench className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              Self-healing trends
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                · last 14 days
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Selectors that failed and got auto-repair suggestions. High-volume
              entries indicate sites that need permanent selector updates.
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <SummaryRow totals={totals} />
          <ChartBlock data={chart} />
          <TopOffenders rows={topSelectors} />
        </>
      )}
    </div>
  );
}

function SummaryRow({ totals }) {
  const items = [
    { label: "Total fixes", value: totals.total, icon: TrendingUp, accent: "text-foreground" },
    { label: "Approved", value: totals.approved, icon: CheckCircle2, accent: "text-emerald-300" },
    { label: "Rejected", value: totals.rejected, icon: XCircle, accent: "text-rose-300" },
    { label: "Pending review", value: totals.pending, icon: Clock, accent: "text-amber-300" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-md border border-border bg-secondary/20 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <it.icon className="h-3 w-3" />
            {it.label}
          </div>
          <div className={cn("text-lg font-semibold tabular-nums mt-0.5", it.accent)}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartBlock({ data }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3 mb-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
        Daily volume
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            />
            <Line type="monotone" dataKey="failed" name="Failed" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="approved" name="Approved" stroke="hsl(var(--success))" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="pending" name="Pending" stroke="hsl(var(--warning))" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TopOffenders({ rows }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
        Top offenders · failed selectors
      </div>
      <div className="rounded-md border border-border bg-secondary/20 divide-y divide-border/60">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3 py-2">
            <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-mono text-foreground/90 truncate">
                {r.selector || "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {r.site || "unknown site"}
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {r.lastSeen}
            </span>
            <span className="text-xs font-semibold tabular-nums text-rose-300">
              ×{r.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/30 py-10 text-center">
      <Wrench className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
      <div className="text-xs text-muted-foreground">
        No self-healing events yet. When a selector fails, the system will record
        a repair suggestion and it will appear here.
      </div>
    </div>
  );
}

// Bucket suggestions into 14 daily slots and compute totals + a top-N
// list of failing selectors. All purely client-side — no extra calls.
function aggregate(list) {
  const totals = { total: list.length, approved: 0, rejected: 0, pending: 0 };
  const days = [];
  const dayMap = new Map();
  for (let i = 13; i >= 0; i--) {
    const d = startOfDay(subDays(new Date(), i));
    const key = format(d, "yyyy-MM-dd");
    const row = { key, day: format(d, "MMM d"), failed: 0, approved: 0, rejected: 0, pending: 0 };
    days.push(row);
    dayMap.set(key, row);
  }

  const selectorMap = new Map();
  const cutoff = startOfDay(subDays(new Date(), 13)).getTime();

  for (const s of list) {
    const status = s.status || "pending";
    if (status === "approved") totals.approved += 1;
    else if (status === "rejected") totals.rejected += 1;
    else totals.pending += 1;

    const created = s.created_date ? new Date(s.created_date) : null;
    if (created && created.getTime() >= cutoff) {
      const key = format(startOfDay(created), "yyyy-MM-dd");
      const row = dayMap.get(key);
      if (row) {
        row.failed += 1;
        if (status === "approved") row.approved += 1;
        else if (status === "rejected") row.rejected += 1;
        else row.pending += 1;
      }
    }

    const sel = s.failed_selector || "—";
    const siteKey = `${sel}::${s.site || ""}`;
    const existing = selectorMap.get(siteKey);
    if (existing) {
      existing.count += 1;
      if (created && (!existing.lastSeenDate || created > existing.lastSeenDate)) {
        existing.lastSeenDate = created;
      }
    } else {
      selectorMap.set(siteKey, {
        selector: sel,
        site: s.site,
        count: 1,
        lastSeenDate: created,
      });
    }
  }

  const topSelectors = [...selectorMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((r) => ({
      ...r,
      lastSeen: r.lastSeenDate ? format(r.lastSeenDate, "MMM d") : "—",
    }));

  return { chart: days, totals, topSelectors };
}