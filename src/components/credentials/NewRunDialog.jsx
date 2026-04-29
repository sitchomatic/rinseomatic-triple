import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import RunAdvancedSettings from "@/components/credentials/RunAdvancedSettings";
import TargetSiteOverrides from "@/components/credentials/TargetSiteOverrides";

// Launches a TestRun against the selected target site for the chosen credentials.
// Creates the TestRun record, then bulkCreates one queued TestResult per credential.
// The scheduled runWorker picks them up from there.
export default function NewRunDialog({ open, onOpenChange, credentialIds, onLaunched }) {
  const qc = useQueryClient();
  const [siteKey, setSiteKey] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [concurrency, setConcurrency] = React.useState(2);
  const [maxRetries, setMaxRetries] = React.useState(1);
  const [strategy, setStrategy] = React.useState("multi_password");
  const [customUrl, setCustomUrl] = React.useState("");
  const [proxyMode, setProxyMode] = React.useState("default");
  const [countryCode, setCountryCode] = React.useState("");
  const [externalProxyId, setExternalProxyId] = React.useState("");
  const [proxyPoolId, setProxyPoolId] = React.useState("");
  const [targetSiteKeys, setTargetSiteKeys] = React.useState([]);

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
    staleTime: 5 * 60_000,
  });

  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
    staleTime: 60_000,
  });
  const { data: proxyPools = [] } = useQuery({
    queryKey: ["proxy-pools"],
    queryFn: () => base44.entities.ProxyPool.list("-created_date", 100),
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (open) {
      setLabel(`Run · ${format(new Date(), "MMM d HH:mm")}`);
      setCustomUrl("");
      setProxyMode("default");
      setCountryCode("");
      setExternalProxyId("");
      setProxyPoolId("");
      setTargetSiteKeys([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (!siteKey && sites.length > 0) {
      const first = sites.find((s) => s.enabled !== false) || sites[0];
      if (first) setSiteKey(first.key);
    }
  }, [sites, siteKey]);

  const launchMut = useMutation({
    mutationFn: async () => {
      if (!siteKey) throw new Error("Pick a target site");
      if (!credentialIds || credentialIds.length === 0) throw new Error("No credentials selected");

      // Pull the selected credentials so we can stamp username on each result.
      // Filter in chunks (entity filter $in cap unknown — keep batches small).
      const CHUNK = 100;
      const creds = [];
      for (let i = 0; i < credentialIds.length; i += CHUNK) {
        const batch = credentialIds.slice(i, i + CHUNK);
        const found = await base44.entities.Credential.filter({ id: { $in: batch } }, "-created_date", CHUNK);
        creds.push(...found);
      }

      const run = await base44.entities.TestRun.create({
        label,
        site_key: siteKey,
        custom_url: customUrl.trim() || undefined,
        target_site_keys: targetSiteKeys.length > 0 ? targetSiteKeys : undefined,
        status: "queued",
        concurrency: Math.max(1, Math.min(5, Number(concurrency) || 2)),
        max_retries: Math.max(0, Math.min(5, Number(maxRetries) || 1)),
        login_strategy: strategy,
        proxy_mode: proxyMode === "default" ? undefined : proxyMode,
        country_code: countryCode.trim() || undefined,
        external_proxy_id: proxyMode === "external" ? externalProxyId || undefined : undefined,
        proxy_pool_id: proxyMode === "pool" ? proxyPoolId || undefined : undefined,
        total_count: creds.length,
        pending_count: creds.length,
        working_count: 0,
        failed_count: 0,
        error_count: 0,
      });

      // Create TestResult rows in chunks to avoid oversized payloads.
      const ROW_CHUNK = 100;
      const rows = creds.map((c) => ({
        run_id: run.id,
        credential_id: c.id,
        site_key: siteKey,
        username: c.username,
        status: "queued",
        attempts: 0,
        elapsed_ms: 0,
      }));
      for (let i = 0; i < rows.length; i += ROW_CHUNK) {
        await base44.entities.TestResult.bulkCreate(rows.slice(i, i + ROW_CHUNK));
      }

      // Kick the worker once so the user sees immediate progress (the cron
      // will continue from there).
      base44.functions.invoke("runWorker", { run_id: run.id }).catch(() => {});

      return run;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      toast.success(`Run launched · ${run.total_count} credentials queued`);
      onLaunched?.(run.id);
    },
    onError: (e) => toast.error(e?.message || "Couldn't launch run"),
  });

  const enabledSites = sites.filter((s) => s.enabled !== false);
  const count = credentialIds?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New run · {count} credential{count === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Target site" help="The selected credentials will be tested against this site's login URL & selectors.">
            {enabledSites.length === 0 ? (
              <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md p-2">
                No sites configured. Go to Settings to add or seed default sites first.
              </div>
            ) : (
              <Select value={siteKey} onValueChange={setSiteKey}>
                <SelectTrigger><SelectValue placeholder="Pick a site…" /></SelectTrigger>
                <SelectContent>
                  {enabledSites.map((s) => (
                    <SelectItem key={s.id} value={s.key}>{s.label} · {s.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Custom login URL (optional)" help="Overrides the site's login URL for this run only.">
            <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="leave blank to use the site's URL" className="font-mono text-xs" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Concurrency" help="1–5. Higher = more parallel browser sessions.">
              <Input type="number" min={1} max={5} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} />
            </Field>
            <Field label="Max retries" help="Per credential, on transient errors only.">
              <Input type="number" min={0} max={5} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} />
            </Field>
            <Field label="Strategy" help="How extra passwords are used.">
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="multi_password">Multi · stop on first match</SelectItem>
                  <SelectItem value="all_passwords">All · try every password</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <TargetSiteOverrides
            sites={sites}
            selectedKeys={targetSiteKeys}
            setSelectedKeys={setTargetSiteKeys}
            primarySiteKey={siteKey}
          />

          <RunAdvancedSettings
            proxyMode={proxyMode}
            setProxyMode={setProxyMode}
            countryCode={countryCode}
            setCountryCode={setCountryCode}
            externalProxyId={externalProxyId}
            setExternalProxyId={setExternalProxyId}
            proxyPoolId={proxyPoolId}
            setProxyPoolId={setProxyPoolId}
            proxies={proxies}
            proxyPools={proxyPools}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => launchMut.mutate()} disabled={!siteKey || count === 0 || launchMut.isPending}>
            {launchMut.isPending ? "Launching…" : `Launch run`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, help, children }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && <p className="text-[11px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}