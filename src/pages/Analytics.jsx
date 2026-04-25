import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { TrendingUp, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

export default function Analytics() {
  const { data: runs = [] } = useQuery({
    queryKey: ["runs-analytics"],
    queryFn: () => base44.entities.TestRun.list("-created_date", 100),
    staleTime: 60_000,
  });

  const { data: results = [] } = useQuery({
    queryKey: ["results-analytics"],
    queryFn: () => base44.entities.TestResult.list("-created_date", 500),
    staleTime: 60_000,
  });

  // Success rate trend (last 30 runs)
  const successTrend = useMemo(() => {
    return runs.slice(0, 30).reverse().map((r) => ({
      date: new Date(r.created_date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }),
      successRate: r.total_count > 0 ? Math.round((r.working_count / r.total_count) * 100) : 0,
      working: r.working_count,
      failed: r.failed_count,
      error: r.error_count,
    }));
  }, [runs]);

  // Results breakdown (latest 200 results)
  const breakdown = useMemo(() => {
    const stats = { working: 0, failed: 0, error: 0 };
    results.slice(0, 200).forEach((r) => {
      if (r.status === 'working') stats.working++;
      else if (r.status === 'failed') stats.failed++;
      else stats.error++;
    });
    return [
      { name: 'Working', value: stats.working, fill: '#4ade80' },
      { name: 'Failed', value: stats.failed, fill: '#fb923c' },
      { name: 'Error', value: stats.error, fill: '#ef4444' },
    ];
  }, [results]);

  // Slowest sites (avg elapsed time)
  const slowestSites = useMemo(() => {
    const siteStats = {};
    results.slice(0, 200).forEach((r) => {
      if (!siteStats[r.site_key]) siteStats[r.site_key] = { total: 0, count: 0 };
      siteStats[r.site_key].total += r.elapsed_ms || 0;
      siteStats[r.site_key].count++;
    });
    return Object.entries(siteStats)
      .map(([site, stats]) => ({
        site,
        avgTime: Math.round(stats.total / stats.count),
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 8);
  }, [results]);

  // Most failing credentials
  const failingCredentials = useMemo(() => {
    const credStats = {};
    results.slice(0, 200).forEach((r) => {
      const key = r.username;
      if (!credStats[key]) credStats[key] = { total: 0, failed: 0, error: 0 };
      credStats[key].total++;
      if (r.status === 'failed') credStats[key].failed++;
      else if (r.status === 'error') credStats[key].error++;
    });
    return Object.entries(credStats)
      .map(([cred, stats]) => ({
        username: cred,
        failureRate: Math.round(((stats.failed + stats.error) / stats.total) * 100),
        total: stats.total,
      }))
      .filter((c) => c.failureRate > 0)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);
  }, [results]);

  const overallStats = useMemo(() => {
    let totalWorking = 0, totalFailed = 0, totalError = 0, totalElapsed = 0;
    results.slice(0, 200).forEach((r) => {
      if (r.status === 'working') totalWorking++;
      else if (r.status === 'failed') totalFailed++;
      else totalError++;
      totalElapsed += r.elapsed_ms || 0;
    });
    const total = totalWorking + totalFailed + totalError;
    return {
      total,
      working: totalWorking,
      failed: totalFailed,
      error: totalError,
      successRate: total > 0 ? Math.round((totalWorking / total) * 100) : 0,
      avgTime: total > 0 ? Math.round(totalElapsed / total) : 0,
    };
  }, [results]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="05 · insights"
        title="Performance Analytics"
        description="Trends, success rates, and site health across all test runs."
      />

      {/* Key metrics */}
      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        <StatCard icon={CheckCircle2} label="Success rate" value={`${overallStats.successRate}%`} color="emerald" />
        <StatCard icon={XCircle} label="Avg failure" value={`${overallStats.failed}`} color="amber" />
        <StatCard icon={AlertCircle} label="Errors" value={`${overallStats.error}`} color="rose" />
        <StatCard icon={TrendingUp} label="Avg time" value={`${overallStats.avgTime}ms`} color="cyan" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Success rate trend */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4">Success rate trend (last 30 runs)</div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={successTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Line type="monotone" dataKey="successRate" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Results breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4">Results breakdown (recent 200)</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={breakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name} (${value})`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {breakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Slowest sites */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4">Slowest sites (avg response time)</div>
          {slowestSites.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={slowestSites}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="site" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="avgTime" fill="hsl(var(--chart-3))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Most failing credentials */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4">Top failing credentials</div>
          {failingCredentials.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">All credentials healthy!</div>
          ) : (
            <div className="space-y-2 max-h-[250px] overflow-y-auto thin-scroll">
              {failingCredentials.map((c) => (
                <div key={c.username} className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-3 py-2 text-xs">
                  <div className="truncate font-mono">{c.username}</div>
                  <div className="text-right shrink-0">
                    <div className="font-medium text-rose-300">{c.failureRate}%</div>
                    <div className="text-muted-foreground">{c.total} tests</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    rose: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300',
  };

  return (
    <div className={cn('rounded-xl border p-4', colors[color])}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4" />
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}