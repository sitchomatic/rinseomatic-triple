import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import RecentRuns from "@/components/dashboard/RecentRuns";
import ProxyHealthMonitor from "@/components/dashboard/ProxyHealthMonitor";
import { Button } from "@/components/ui/button";
import { Key, Play, CheckCircle2, AlertTriangle, Activity } from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 1000),
    staleTime: 60_000,
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["test-runs"],
    queryFn: () => base44.entities.TestRun.list("-created_date", 50),
    staleTime: 30_000,
    refetchInterval: (q) => {
      const list = q.state.data || [];
      return list.some((r) => r.status === "running" || r.status === "queued") ? 3000 : false;
    },
  });
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
    staleTime: 5 * 60_000,
  });

  const totals = React.useMemo(() => {
    let working = 0, failed = 0, errored = 0, active = 0;
    for (const r of runs) {
      working += r.working_count || 0;
      failed += r.failed_count || 0;
      errored += r.error_count || 0;
      if (r.status === "running" || r.status === "queued") active += 1;
    }
    return { working, failed, errored, active };
  }, [runs]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="01 · overview"
        title="Dashboard"
        description="Vault size, run activity, and recent test outcomes at a glance."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate("/credentials")}>
              <Key className="h-3.5 w-3.5" /> Vault
            </Button>
            <Button size="sm" className="gap-2" onClick={() => navigate("/credentials")}>
              <Play className="h-3.5 w-3.5" /> New run
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Credentials" value={credentials.length} icon={Key} sub="in vault" />
        <StatCard label="Working" value={totals.working} icon={CheckCircle2} accent="text-emerald-300" sub="across all runs" />
        <StatCard label="Failed" value={totals.failed} icon={AlertTriangle} accent="text-rose-300" sub="bad password / blocked" />
        <StatCard label="Active runs" value={totals.active} icon={Activity} accent="text-sky-300" sub={totals.errored ? `${totals.errored} errors total` : "queued or running"} />
      </div>

      <ProxyHealthMonitor />

      <RecentRuns runs={runs} sites={sites} />
    </div>
  );
}