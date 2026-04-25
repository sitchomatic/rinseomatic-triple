import React from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function TargetSiteOverrides({ sites = [], selectedKeys = [], setSelectedKeys, primarySiteKey }) {
  const selected = new Set(selectedKeys || []);

  const toggle = (key) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedKeys([...next]);
  };

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
      <div>
        <Label className="text-xs">Optional target override</Label>
        <p className="text-[11px] text-muted-foreground leading-snug mt-1">
          Leave empty to use the site’s configured primary/secondary targets. Select targets to force this run to test only those sites.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto thin-scroll">
        {sites.filter((s) => s.enabled !== false && s.key !== primarySiteKey).map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer rounded px-1.5 py-1 hover:bg-secondary/40">
            <Checkbox checked={selected.has(s.key)} onCheckedChange={() => toggle(s.key)} />
            <span className="truncate">{s.label || s.key}</span>
          </label>
        ))}
      </div>
    </div>
  );
}