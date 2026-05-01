import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function SmartRetryDialog({ pattern }) {
  const [open, setOpen] = useState(false);
  const [proxyMode, setProxyMode] = useState("stealth");
  const [proxyPoolId, setProxyPoolId] = useState("");
  const [strategy, setStrategy] = useState("multi_password");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: proxyPools } = useQuery({
    queryKey: ["proxyPools"],
    queryFn: () => base44.entities.ProxyPool.list(),
  });

  const runMut = useMutation({
    mutationFn: async () => {
      if (!pattern.sample_ids || pattern.sample_ids.length === 0) {
        throw new Error("No unique credential IDs captured for this pattern.");
      }

      const run = await base44.entities.TestRun.create({
        label: `Smart Retry: ${pattern.type} on ${pattern.site}`,
        site_key: pattern.site,
        proxy_mode: proxyMode,
        proxy_pool_id: proxyMode === 'pool' ? proxyPoolId : undefined,
        login_strategy: strategy,
        status: 'queued',
        concurrency: 2,
        total_count: pattern.sample_ids.length,
        pending_count: pattern.sample_ids.length,
      });
      
      const creds = [];
      for (let i = 0; i < pattern.sample_ids.length; i += 50) {
        const chunk = pattern.sample_ids.slice(i, i + 50);
        const res = await base44.entities.Credential.filter({ id: { $in: chunk } });
        creds.push(...res);
      }

      if (creds.length === 0) {
        throw new Error("Credentials might have been deleted.");
      }

      const results = creds.map(c => ({
        run_id: run.id,
        credential_id: c.id,
        site_key: pattern.site,
        username: c.username,
        status: 'queued',
      }));

      for (let i = 0; i < results.length; i += 100) {
         await base44.entities.TestResult.bulkCreate(results.slice(i, i + 100));
      }

      await base44.functions.invoke("runWorker", {});
      return run;
    },
    onSuccess: (run) => {
      toast.success("Smart Retry initiated.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["runs"] });
      navigate(`/runs/${run.id}`);
    },
    onError: (e) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="w-full text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
          <RotateCw className="h-3 w-3" /> Smart Retry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <div className="space-y-4">
          <div>
            <DialogTitle>Smart Retry: {pattern.site}</DialogTitle>
            <DialogDescription className="mt-1">
              Re-queue {pattern.sample_ids.length} affected credentials with new settings to overcome the {pattern.type} issue.
            </DialogDescription>
          </div>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Proxy Strategy</label>
              <Select value={proxyMode} onValueChange={setProxyMode}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stealth">Stealth (Highest Success)</SelectItem>
                  <SelectItem value="premium">Premium (Residential)</SelectItem>
                  <SelectItem value="pool">Proxy Pool</SelectItem>
                  <SelectItem value="classic">Classic (Datacenter)</SelectItem>
                </SelectContent>
              </Select>
              {(pattern.type === 'CAPTCHA/Anti-Bot' || pattern.type === 'Proxy Failures') && (
                <p className="text-[10px] text-muted-foreground text-primary font-medium">Suggestion: Use Stealth or a clean Proxy Pool.</p>
              )}
            </div>

            {proxyMode === 'pool' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Select Proxy Pool</label>
                <Select value={proxyPoolId} onValueChange={setProxyPoolId}>
                  <SelectTrigger><SelectValue placeholder="Choose a pool..." /></SelectTrigger>
                  <SelectContent>
                    {(proxyPools || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Login Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="multi_password">Multi-Password (Stop on success)</SelectItem>
                  <SelectItem value="all_passwords">All Passwords (Test everything)</SelectItem>
                  <SelectItem value="single">Single Password (Fastest)</SelectItem>
                </SelectContent>
              </Select>
              {pattern.type === 'Invalid Credentials' && (
                <p className="text-[10px] text-muted-foreground text-primary font-medium">Suggestion: Use Multi-Password to test fallbacks.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending || (proxyMode === 'pool' && !proxyPoolId)} className="gap-2">
              <Play className="h-4 w-4" /> {runMut.isPending ? "Starting..." : "Launch Retry Run"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}