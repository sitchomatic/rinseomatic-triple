import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Globe, Save } from "lucide-react";
import { toast } from "sonner";

const PROXY_MODES = [
  { value: "classic", label: "Classic (datacenter, 5 credits)", help: "ScrapingBee default datacenter pool. Cheapest. Often blocked by aggressive sites." },
  { value: "premium", label: "Premium (residential, 25 credits)", help: "ScrapingBee premium_proxy=true. Residential IPs. Required for country targeting." },
  { value: "stealth", label: "Stealth (75 credits)", help: "ScrapingBee stealth_proxy=true. Hardest sites. Most expensive." },
  { value: "external", label: "External proxy (own_proxy)", help: "Your own HTTP/SOCKS proxy from the list below. Sent as own_proxy param." },
  { value: "pool", label: "Proxy pool", help: "Automatically picks an enabled proxy from a configured proxy pool." },
  { value: "none", label: "None (direct, no JS)", help: "render_js=false direct fetch. 1 credit. Won't work for JS-heavy logins." },
];

export default function ProxySettingsPanel({ proxies = [], proxyPools = [] }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
    staleTime: 60_000,
  });
  const settings = rows[0];

  const [draft, setDraft] = React.useState(null);
  React.useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      if (d.id) return base44.entities.AppSettings.update(d.id, d);
      return base44.entities.AppSettings.create({ ...d, singleton_key: "global" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">Loading settings…</div>
      </div>
    );
  }

  const mode = draft.proxy_mode || "premium";
  const needsExternal = mode === "external";
  const needsPool = mode === "pool";
  const supportsCountry = mode === "premium" || mode === "stealth";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Globe className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Global ScrapingBee settings</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Applied to every login attempt unless overridden per-run. ScrapingBee credit costs scale with proxy tier.
          </div>
        </div>
        <Button size="sm" className="gap-1.5 h-7" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
          <Save className="h-3 w-3" /> {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Proxy tier" help={PROXY_MODES.find((m) => m.value === mode)?.help}>
          <Select value={mode} onValueChange={(v) => setDraft({ ...draft, proxy_mode: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROXY_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Country code"
          help={supportsCountry ? "ISO-2 (au, us, gb…). Sent as country_code." : "Ignored — only premium / stealth tiers support country targeting."}
        >
          <Input
            value={draft.country_code || ""}
            onChange={(e) => setDraft({ ...draft, country_code: e.target.value.toLowerCase() })}
            disabled={!supportsCountry}
            placeholder="au"
            className="font-mono text-xs"
          />
        </Field>

        {needsExternal && (
          <Field label="External proxy" help="Sent to ScrapingBee as own_proxy=<scheme>://user:pass@host:port.">
            <Select
              value={draft.external_proxy_id || ""}
              onValueChange={(v) => setDraft({ ...draft, external_proxy_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select proxy…" /></SelectTrigger>
              <SelectContent>
                {proxies.filter((p) => p.enabled).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label || `${p.host}:${p.port}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {needsPool && (
          <Field label="Proxy pool" help="Picks a proxy from this enabled pool for each attempt.">
            <Select
              value={draft.proxy_pool_id || ""}
              onValueChange={(v) => setDraft({ ...draft, proxy_pool_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select pool…" /></SelectTrigger>
              <SelectContent>
                {proxyPools.filter((p) => p.enabled !== false).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label="Default login strategy" help="single = try one password. multi_password = try until one works. all_passwords = test every password.">
          <Select
            value={draft.default_login_strategy || "multi_password"}
            onValueChange={(v) => setDraft({ ...draft, default_login_strategy: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">single</SelectItem>
              <SelectItem value="multi_password">multi_password</SelectItem>
              <SelectItem value="all_passwords">all_passwords</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Timeout (ms)" help="Max ScrapingBee request duration. Capped at 140000.">
          <Input
            type="number"
            value={draft.timeout_ms ?? 60000}
            onChange={(e) => setDraft({ ...draft, timeout_ms: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Wait after load (ms)" help="ScrapingBee 'wait' param — extra time after page load before instructions.">
          <Input
            type="number"
            value={draft.wait_after_load_ms ?? 0}
            onChange={(e) => setDraft({ ...draft, wait_after_load_ms: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Viewport width" help="window_width param.">
          <Input
            type="number"
            value={draft.viewport_width ?? 1920}
            onChange={(e) => setDraft({ ...draft, viewport_width: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Viewport height" help="window_height param.">
          <Input
            type="number"
            value={draft.viewport_height ?? 1080}
            onChange={(e) => setDraft({ ...draft, viewport_height: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 pt-2 border-t border-border/60">
        <Toggle
          label="Block ads"
          help="ScrapingBee block_ads param."
          checked={!!draft.block_ads}
          onChange={(v) => setDraft({ ...draft, block_ads: v })}
        />
        <Toggle
          label="Block resources"
          help="Skip images/CSS for faster loads. Default ON."
          checked={draft.block_resources !== false}
          onChange={(v) => setDraft({ ...draft, block_resources: v })}
        />
        <Toggle
          label="Capture screenshots"
          help="screenshot=true (+1 credit per attempt)."
          checked={!!draft.capture_screenshots}
          onChange={(v) => setDraft({ ...draft, capture_screenshots: v })}
        />
      </div>
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs">{label}</div>
        {help && <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{help}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}