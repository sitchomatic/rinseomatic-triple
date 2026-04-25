import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

export default function SiteAdvancedSettings({ draft, setDraft, sites = [] }) {
  const otherSites = sites.filter((s) => s.key && s.key !== draft.key);
  const selected = new Set(draft.secondary_site_keys || []);

  const toggleSecondary = (key) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setDraft({ ...draft, secondary_site_keys: [...next] });
  };

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
      <div>
        <div className="text-xs font-medium">Multi-site / aggregator testing</div>
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
          Optional. Test credentials against additional configured sites, or make this site an aggregator that only tests secondary targets.
        </p>
      </div>

      <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-card/40 px-3 py-2">
        <div>
          <div className="text-xs">Skip this site's own login URL</div>
          <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
            Use for aggregator entries like "Double" that only fan out to other sites.
          </div>
        </div>
        <Switch checked={!!draft.skip_primary} onCheckedChange={(v) => setDraft({ ...draft, skip_primary: v })} />
      </label>

      <div className="grid gap-1.5">
        <Label className="text-xs">Secondary target sites</Label>
        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto thin-scroll rounded-md border border-border bg-card/30 p-2">
          {otherSites.length === 0 ? (
            <div className="col-span-2 text-[10px] text-muted-foreground">Create another site first.</div>
          ) : (
            otherSites.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer rounded px-1.5 py-1 hover:bg-secondary/40">
                <Checkbox checked={selected.has(s.key)} onCheckedChange={() => toggleSecondary(s.key)} />
                <span className="truncate">{s.label || s.key}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}